import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { CustomRallyVehicle } from '../src/vehicles/CustomRallyVehicle';

interface ClearanceResult {
  condition: string;
  wheelIndex: number;
  wheelName: string;
  steerDeg: number;
  suspTravelMm: number;
  minDistanceToBlisterFlare: number;
  minDistanceToLiner: number;
  minDistanceToLowerBody: number;
  clippingDetected: boolean;
  violations: string[];
}

function pointToTriangleDistanceSq(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  const ap = new THREE.Vector3().subVectors(p, a);

  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) return p.distanceToSquared(a);

  const bp = new THREE.Vector3().subVectors(p, b);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return p.distanceToSquared(b);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const proj = new THREE.Vector3().copy(a).addScaledVector(ab, v);
    return p.distanceToSquared(proj);
  }

  const cp = new THREE.Vector3().subVectors(p, c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return p.distanceToSquared(c);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const proj = new THREE.Vector3().copy(a).addScaledVector(ac, w);
    return p.distanceToSquared(proj);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d2) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d2));
    const bc = new THREE.Vector3().subVectors(c, b);
    const proj = new THREE.Vector3().copy(b).addScaledVector(bc, w);
    return p.distanceToSquared(proj);
  }

  const denom = 1.0 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const proj = new THREE.Vector3().copy(a).addScaledVector(ab, v).addScaledVector(ac, w);
  return p.distanceToSquared(proj);
}

// Check ray-triangle intersection
function rayIntersectsTriangle(
  rayOrigin: THREE.Vector3,
  rayDir: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3
): THREE.Vector3 | null {
  const edge1 = new THREE.Vector3().subVectors(b, a);
  const edge2 = new THREE.Vector3().subVectors(c, a);
  const pvec = new THREE.Vector3().crossVectors(rayDir, edge2);
  const det = edge1.dot(pvec);

  if (Math.abs(det) < 1e-7) return null;
  const invDet = 1.0 / det;

  const tvec = new THREE.Vector3().subVectors(rayOrigin, a);
  const u = tvec.dot(pvec) * invDet;
  if (u < 0.0 || u > 1.0) return null;

  const qvec = new THREE.Vector3().crossVectors(tvec, edge1);
  const v = rayDir.dot(qvec) * invDet;
  if (v < 0.0 || u + v > 1.0) return null;

  const t = edge2.dot(qvec) * invDet;
  if (t < 0.0) return null;

  return new THREE.Vector3().copy(rayOrigin).addScaledVector(rayDir, t);
}

async function runWheelClearanceStress() {
  console.log('================================================================');
  console.log('   EMPIRICAL CHALLENGER: WHEEL CLEARANCE & KINEMATIC STRESS     ');
  console.log('================================================================\n');

  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const vehicle = new CustomRallyVehicle(scene, physics);

  // Wheel names
  const wheelNames = ['Front-Left (FL)', 'Front-Right (FR)', 'Rear-Left (RL)', 'Rear-Right (RR)'];

  // Identify blister arches, liners, and lower body meshes
  interface TriMesh {
    name: string;
    triangles: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; normal: THREE.Vector3 }[];
  }

  const blisterFlares: TriMesh[] = [];
  const wheelLiners: TriMesh[] = [];
  let lowerBodyMesh: TriMesh | null = null;

  vehicle.chassisMainGroup.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const geom = child.geometry;
      const pos = geom.getAttribute('position');
      const idx = geom.getIndex();
      if (!pos) return;

      const triangles: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; normal: THREE.Vector3 }[] = [];
      const getV = (i: number) => {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i);
        child.localToWorld(v); // converts relative to chassisMesh at origin
        return v;
      };

      if (idx) {
        for (let i = 0; i < idx.count; i += 3) {
          const a = getV(idx.getX(i));
          const b = getV(idx.getX(i + 1));
          const c = getV(idx.getX(i + 2));
          const normal = new THREE.Vector3().crossVectors(
            new THREE.Vector3().subVectors(b, a),
            new THREE.Vector3().subVectors(c, a)
          ).normalize();
          triangles.push({ a, b, c, normal });
        }
      } else {
        for (let i = 0; i < pos.count; i += 3) {
          const a = getV(i);
          const b = getV(i + 1);
          const c = getV(i + 2);
          const normal = new THREE.Vector3().crossVectors(
            new THREE.Vector3().subVectors(b, a),
            new THREE.Vector3().subVectors(c, a)
          ).normalize();
          triangles.push({ a, b, c, normal });
        }
      }

      // Check if this is lower body, flare, or liner
      if (child.material) {
        const mat = child.material as THREE.MeshStandardMaterial;
        // Liner uses trimMat (color 0x222225), flare uses bodyMat
        // Lower body has 21 stations (pos.count ~ 168)
        if (triangles.length > 50 && pos.count > 100 && triangles[0].a.z < -1.8 && triangles[triangles.length - 1].a.z > 1.8) {
          lowerBodyMesh = { name: 'LowerBody', triangles };
        } else if (triangles.length > 0) {
          // Check if arch flare or liner based on Y / Z range
          const sample = triangles[0].a;
          if (Math.abs(Math.abs(sample.z) - 1.35) < 0.6) {
            if (mat.roughness > 0.5) {
              wheelLiners.push({ name: `Liner_${sample.z > 0 ? 'F' : 'R'}_${sample.x > 0 ? 'R' : 'L'}`, triangles });
            } else {
              blisterFlares.push({ name: `Flare_${sample.z > 0 ? 'F' : 'R'}_${sample.x > 0 ? 'R' : 'L'}`, triangles });
            }
          }
        }
      }
    }
  });

  console.log(`Discovered chassis geometry:`);
  console.log(`  Blister flares: ${blisterFlares.length}`);
  console.log(`  Wheel liners  : ${wheelLiners.length}`);
  console.log(`  Lower body    : ${lowerBodyMesh ? `${lowerBodyMesh.triangles.length} triangles` : 'NOT FOUND'}`);

  // Extract wheel local vertices for each wheel
  const wheelGeomVertices: THREE.Vector3[][] = [];
  for (let w = 0; w < 4; w++) {
    const wGroup = vehicle.wheelMeshes[w];
    const wVerts: THREE.Vector3[] = [];
    wGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        const pos = child.geometry.getAttribute('position');
        if (pos) {
          for (let i = 0; i < pos.count; i++) {
            const v = new THREE.Vector3().fromBufferAttribute(pos, i);
            child.localToWorld(v); // converts to wheelGroup local space (when wheelGroup at origin)
            wVerts.push(v);
          }
        }
      }
    });
    wheelGeomVertices.push(wVerts);
    console.log(`  Wheel ${w} (${wheelNames[w]}): ${wVerts.length} vertices`);
  }

  // Kinematic test matrix
  const steerAnglesDeg = [-32.0, -20.0, -10.0, 0.0, 10.0, 20.0, 32.0];
  const suspensionTravels = [
    { name: '120mm Bump (Max compression)', travelMm: -120, suspLen: 0.2593 - 0.120 },
    { name: '80mm Bump', travelMm: -80, suspLen: 0.2593 - 0.080 },
    { name: '40mm Bump', travelMm: -40, suspLen: 0.2593 - 0.040 },
    { name: 'Static Rest', travelMm: 0, suspLen: 0.2593 },
    { name: '80mm Rebound Droop (Crest)', travelMm: 80, suspLen: 0.2593 + 0.080 },
    { name: '140mm Full Hang Droop', travelMm: 140, suspLen: 0.400 },
  ];

  const results: ClearanceResult[] = [];
  let totalTests = 0;
  let clippingCount = 0;

  // Wheel anchors from vehicle:
  // FL: (-0.82, -0.05, 1.35)
  // FR: ( 0.82, -0.05, 1.35)
  // RL: (-0.82, -0.05, -1.35)
  // RR: ( 0.82, -0.05, -1.35)
  const anchors = [
    new THREE.Vector3(-0.82, -0.05, 1.35),
    new THREE.Vector3(0.82, -0.05, 1.35),
    new THREE.Vector3(-0.82, -0.05, -1.35),
    new THREE.Vector3(0.82, -0.05, -1.35),
  ];

  for (const st of suspensionTravels) {
    console.log(`\n--- Testing ${st.name} (suspLen = ${st.suspLen.toFixed(4)}m) ---`);

    for (const steerDeg of steerAnglesDeg) {
      const steerRad = THREE.MathUtils.degToRad(steerDeg);

      for (let w = 0; w < 4; w++) {
        const isFront = w < 2;
        const currentSteerRad = isFront ? steerRad : 0;
        const currentSteerDeg = isFront ? steerDeg : 0;

        // Skip redundant rear steer angles (rear wheels don't steer)
        if (!isFront && steerDeg !== 0.0) continue;

        totalTests++;
        const anchor = anchors[w];
        const wheelPos = new THREE.Vector3(anchor.x, anchor.y - st.suspLen, anchor.z);
        const steerQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), currentSteerRad);

        // Transform wheel vertices to chassis local space
        const transformedVerts: THREE.Vector3[] = [];
        for (const localV of wheelGeomVertices[w]) {
          const v = localV.clone().applyQuaternion(steerQuat).add(wheelPos);
          transformedVerts.push(v);
        }

        // Relevant blister flare and liner for this corner
        const sgnX = anchor.x > 0 ? 1 : -1;
        const sgnZ = anchor.z > 0 ? 1 : -1;

        // Find matching flare & liner
        const cornerFlares = blisterFlares.filter(f => {
          const c = f.triangles[0].a;
          return (c.x * sgnX > 0) && (c.z * sgnZ > 0);
        });
        const cornerLiners = wheelLiners.filter(l => {
          const c = l.triangles[0].a;
          return (c.x * sgnX > 0) && (c.z * sgnZ > 0);
        });

        // Test clipping against flare, liner, and lower body
        let minFlareDistSq = Infinity;
        let minLinerDistSq = Infinity;
        let minBodyDistSq = Infinity;
        const violations: string[] = [];

        // Arch cutout check:
        // Arch cutout has R = 0.395m at center (yCenter = 0.05, zAxle = anchor.z).
        // For vertices whose X is at or outside the inner lip (|X| >= 0.82):
        // Radial distance from (anchor.z, 0.05) must not exceed 0.395m when Y > 0.05!
        for (const v of transformedVerts) {
          const rFromAxle = Math.hypot(v.z - anchor.z, v.y - 0.05);
          // If vertex is in the arch sector (Y >= 0.05) and extending outwards (|X| >= 0.85):
          if (v.y >= 0.05 && Math.abs(v.x) >= 0.85) {
            if (rFromAxle > 0.395) {
              const penetration = (rFromAxle - 0.395) * 1000;
              violations.push(
                `Arch cutout boundary breach: r=${rFromAxle.toFixed(3)}m > 0.395m (+${penetration.toFixed(1)}mm) at [X=${v.x.toFixed(3)}, Y=${v.y.toFixed(3)}, Z=${v.z.toFixed(3)}]`
              );
            }
          }

          // Inner wheelhouse tub check:
          // The inner tub sits at |X| = 0.70m at Z = anchor.z.
          // If a wheel vertex penetrates inside |X| < 0.70m in the wheel bay:
          if (Math.abs(v.z - anchor.z) < 0.35 && v.y > -0.15) {
            if (Math.abs(v.x) < 0.70) {
              const penetration = (0.70 - Math.abs(v.x)) * 1000;
              violations.push(
                `Inner wheelhouse tub breach: |X|=${Math.abs(v.x).toFixed(3)}m < 0.70m (-${penetration.toFixed(1)}mm) at [X=${v.x.toFixed(3)}, Y=${v.y.toFixed(3)}, Z=${v.z.toFixed(3)}]`
              );
            }
          }

          // Blister flare outer wall check:
          // Blister peak is at |X| = 0.94m (front) / 0.95m (rear).
          // If a wheel vertex protrudes outside the blister flare peak:
          const xMax = isFront ? 0.940 : 0.950;
          if (Math.abs(v.x) > xMax && v.y > 0.0) {
            const protrusion = (Math.abs(v.x) - xMax) * 1000;
            violations.push(
              `Blister flare outer wall poke-through: |X|=${Math.abs(v.x).toFixed(3)}m > ${xMax}m (+${protrusion.toFixed(1)}mm)`
            );
          }
        }

        const isClipping = violations.length > 0;
        if (isClipping) {
          clippingCount++;
          console.log(`  [CLIPPING] ${wheelNames[w]} at steer=${currentSteerDeg}°, travel=${st.travelMm}mm: ${violations[0]} (total ${violations.length} violations)`);
        } else {
          // Report clearance margin
          let minRMargin = Infinity;
          let minXInnerMargin = Infinity;
          let minXOuterMargin = Infinity;
          for (const v of transformedVerts) {
            if (v.y >= 0.05 && Math.abs(v.x) >= 0.85) {
              const rFromAxle = Math.hypot(v.z - anchor.z, v.y - 0.05);
              const margin = (0.395 - rFromAxle) * 1000;
              if (margin < minRMargin) minRMargin = margin;
            }
            if (Math.abs(v.z - anchor.z) < 0.35 && v.y > -0.15) {
              const innerMargin = (Math.abs(v.x) - 0.70) * 1000;
              if (innerMargin < minXInnerMargin) minXInnerMargin = innerMargin;
            }
            const xMax = isFront ? 0.940 : 0.950;
            if (v.y > 0.0) {
              const outerMargin = (xMax - Math.abs(v.x)) * 1000;
              if (outerMargin < minXOuterMargin) minXOuterMargin = outerMargin;
            }
          }
          console.log(`  [CLEAR] ${wheelNames[w]} steer=${currentSteerDeg.toFixed(1)}° | Arch margin: ${minRMargin.toFixed(1)}mm | Tub margin: ${minXInnerMargin.toFixed(1)}mm | Outer margin: ${minXOuterMargin.toFixed(1)}mm`);
        }

        results.push({
          condition: st.name,
          wheelIndex: w,
          wheelName: wheelNames[w],
          steerDeg: currentSteerDeg,
          suspTravelMm: st.travelMm,
          minDistanceToBlisterFlare: Math.sqrt(minFlareDistSq),
          minDistanceToLiner: Math.sqrt(minLinerDistSq),
          minDistanceToLowerBody: Math.sqrt(minBodyDistSq),
          clippingDetected: isClipping,
          violations,
        });
      }
    }
  }

  console.log('\n================================================================');
  console.log(`TOTAL CONFIGURATIONS TESTED: ${totalTests}`);
  console.log(`CLIPPING DETECTED           : ${clippingCount}`);
  console.log(`SUCCESSFUL (ZERO CLIPPING)  : ${totalTests - clippingCount}`);
  console.log('================================================================');
}

runWheelClearanceStress().catch(console.error);
