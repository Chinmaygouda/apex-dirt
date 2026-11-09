import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { CustomRallyVehicle } from '../src/vehicles/CustomRallyVehicle';

// Triangle-triangle intersection test (Möller's algorithm)
function linePlaneIntersection(p1: THREE.Vector3, p2: THREE.Vector3, planePoint: THREE.Vector3, planeNormal: THREE.Vector3): THREE.Vector3 | null {
  const lineDir = new THREE.Vector3().subVectors(p2, p1);
  const dot = planeNormal.dot(lineDir);
  if (Math.abs(dot) < 1e-6) return null;
  const t = planeNormal.dot(new THREE.Vector3().subVectors(planePoint, p1)) / dot;
  if (t < 0 || t > 1) return null;
  return new THREE.Vector3().copy(p1).addScaledVector(lineDir, t);
}

function pointInTriangle2D(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2): boolean {
  const v0 = new THREE.Vector2().subVectors(c, a);
  const v1 = new THREE.Vector2().subVectors(b, a);
  const v2 = new THREE.Vector2().subVectors(p, a);

  const dot00 = v0.dot(v0);
  const dot01 = v0.dot(v1);
  const dot02 = v0.dot(v2);
  const dot11 = v1.dot(v1);
  const dot12 = v1.dot(v2);

  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

  return (u >= -1e-4) && (v >= -1e-4) && (u + v <= 1.0001);
}

function triangleIntersectsTriangle(
  t1: [THREE.Vector3, THREE.Vector3, THREE.Vector3],
  t2: [THREE.Vector3, THREE.Vector3, THREE.Vector3]
): boolean {
  // Check bounding boxes first
  const min1 = new THREE.Vector3(
    Math.min(t1[0].x, t1[1].x, t1[2].x),
    Math.min(t1[0].y, t1[1].y, t1[2].y),
    Math.min(t1[0].z, t1[1].z, t1[2].z)
  );
  const max1 = new THREE.Vector3(
    Math.max(t1[0].x, t1[1].x, t1[2].x),
    Math.max(t1[0].y, t1[1].y, t1[2].y),
    Math.max(t1[0].z, t1[1].z, t1[2].z)
  );
  const min2 = new THREE.Vector3(
    Math.min(t2[0].x, t2[1].x, t2[2].x),
    Math.min(t2[0].y, t2[1].y, t2[2].y),
    Math.min(t2[0].z, t2[1].z, t2[2].z)
  );
  const max2 = new THREE.Vector3(
    Math.max(t2[0].x, t2[1].x, t2[2].x),
    Math.max(t2[0].y, t2[1].y, t2[2].y),
    Math.max(t2[0].z, t2[1].z, t2[2].z)
  );

  if (max1.x < min2.x || min1.x > max2.x) return false;
  if (max1.y < min2.y || min1.y > max2.y) return false;
  if (max1.z < min2.z || min1.z > max2.z) return false;

  // Plane equation for t2
  const n2 = new THREE.Vector3().crossVectors(
    new THREE.Vector3().subVectors(t2[1], t2[0]),
    new THREE.Vector3().subVectors(t2[2], t2[0])
  ).normalize();

  // Test edges of t1 against plane of t2
  const edges1: [THREE.Vector3, THREE.Vector3][] = [
    [t1[0], t1[1]],
    [t1[1], t1[2]],
    [t1[2], t1[0]],
  ];

  // Find dominant axis to project 3D triangle to 2D
  const absN2 = new THREE.Vector3(Math.abs(n2.x), Math.abs(n2.y), Math.abs(n2.z));
  const proj2D = (p: THREE.Vector3): THREE.Vector2 => {
    if (absN2.x >= absN2.y && absN2.x >= absN2.z) return new THREE.Vector2(p.y, p.z);
    if (absN2.y >= absN2.x && absN2.y >= absN2.z) return new THREE.Vector2(p.x, p.z);
    return new THREE.Vector2(p.x, p.y);
  };

  const a2 = proj2D(t2[0]);
  const b2 = proj2D(t2[1]);
  const c2 = proj2D(t2[2]);

  for (const edge of edges1) {
    const pt = linePlaneIntersection(edge[0], edge[1], t2[0], n2);
    if (pt) {
      if (pointInTriangle2D(proj2D(pt), a2, b2, c2)) {
        return true;
      }
    }
  }

  // Plane equation for t1
  const n1 = new THREE.Vector3().crossVectors(
    new THREE.Vector3().subVectors(t1[1], t1[0]),
    new THREE.Vector3().subVectors(t1[2], t1[0])
  ).normalize();

  const absN1 = new THREE.Vector3(Math.abs(n1.x), Math.abs(n1.y), Math.abs(n1.z));
  const proj2D1 = (p: THREE.Vector3): THREE.Vector2 => {
    if (absN1.x >= absN1.y && absN1.x >= absN1.z) return new THREE.Vector2(p.y, p.z);
    if (absN1.y >= absN1.x && absN1.y >= absN1.z) return new THREE.Vector2(p.x, p.z);
    return new THREE.Vector2(p.x, p.y);
  };

  const a1 = proj2D1(t1[0]);
  const b1 = proj2D1(t1[1]);
  const c1 = proj2D1(t1[2]);

  const edges2: [THREE.Vector3, THREE.Vector3][] = [
    [t2[0], t2[1]],
    [t2[1], t2[2]],
    [t2[2], t2[0]],
  ];

  for (const edge of edges2) {
    const pt = linePlaneIntersection(edge[0], edge[1], t1[0], n1);
    if (pt) {
      if (pointInTriangle2D(proj2D1(pt), a1, b1, c1)) {
        return true;
      }
    }
  }

  return false;
}

interface MeshTriangles {
  meshName: string;
  triangles: [THREE.Vector3, THREE.Vector3, THREE.Vector3][];
}

function extractTriangles(root: THREE.Object3D): MeshTriangles[] {
  const result: MeshTriangles[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const geom = child.geometry;
      const pos = geom.getAttribute('position');
      const idx = geom.getIndex();
      if (!pos) return;

      const tris: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
      const getV = (i: number) => {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i);
        child.localToWorld(v);
        return v;
      };

      if (idx) {
        for (let i = 0; i < idx.count; i += 3) {
          tris.push([getV(idx.getX(i)), getV(idx.getX(i + 1)), getV(idx.getX(i + 2))]);
        }
      } else {
        for (let i = 0; i < pos.count; i += 3) {
          tris.push([getV(i), getV(i + 1), getV(i + 2)]);
        }
      }
      const geomType = geom.type;
      const parentName = child.parent?.name || 'group';
      const b = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
      const desc = `${child.name || geomType} [Parent: ${parentName}, Z: ${b.min.z.toFixed(2)}..${b.max.z.toFixed(2)}, Y: ${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)}]`;
      result.push({ meshName: desc, triangles: tris });
    }
  });
  return result;
}

async function runExactTriangleClippingTest() {
  console.log('========================================================================');
  console.log('   EMPIRICAL RIGOROUS TRIANGLE-TO-TRIANGLE MESH INTERSECTION TEST       ');
  console.log('========================================================================\n');

  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const vehicle = new CustomRallyVehicle(scene, physics);

  // Chassis mesh at origin
  vehicle.chassisMesh.position.set(0, 0, 0);
  vehicle.chassisMesh.quaternion.identity();
  vehicle.chassisMesh.updateMatrixWorld(true);

  // Extract all triangles from chassisMesh
  const chassisMeshes = extractTriangles(vehicle.chassisMesh);
  let totalChassisTris = 0;
  for (const m of chassisMeshes) totalChassisTris += m.triangles.length;
  console.log(`Extracted ${totalChassisTris} triangles across ${chassisMeshes.length} meshes in chassisMesh.`);

  // Test conditions
  const conditions = [
    { name: 'Static Rest, 0° Steer', suspLen: 0.2593, steerDeg: 0 },
    { name: '120mm Bump, 0° Steer', suspLen: 0.2593 - 0.120, steerDeg: 0 },
    { name: '120mm Bump, +32° Full Lock Steer', suspLen: 0.2593 - 0.120, steerDeg: 32 },
    { name: '120mm Bump, -32° Full Lock Steer', suspLen: 0.2593 - 0.120, steerDeg: -32 },
    { name: '80mm Droop, 0° Steer', suspLen: 0.2593 + 0.080, steerDeg: 0 },
    { name: '80mm Droop, +32° Full Lock Steer', suspLen: 0.2593 + 0.080, steerDeg: 32 },
    { name: '80mm Droop, -32° Full Lock Steer', suspLen: 0.2593 + 0.080, steerDeg: -32 },
  ];

  const wheelNames = ['FL', 'FR', 'RL', 'RR'];
  const anchors = [
    new THREE.Vector3(-0.82, -0.05, 1.35),
    new THREE.Vector3(0.82, -0.05, 1.35),
    new THREE.Vector3(-0.82, -0.05, -1.35),
    new THREE.Vector3(0.82, -0.05, -1.35),
  ];

  for (const cond of conditions) {
    console.log(`\n--- Condition: ${cond.name} (suspLen = ${cond.suspLen.toFixed(4)}m, steer = ${cond.steerDeg}°) ---`);

    for (let w = 0; w < 4; w++) {
      const isFront = w < 2;
      const steerRad = isFront ? THREE.MathUtils.degToRad(cond.steerDeg) : 0;
      const anchor = anchors[w];

      const wGroup = vehicle.wheelMeshes[w];
      wGroup.position.set(anchor.x, anchor.y - cond.suspLen, anchor.z);
      wGroup.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), steerRad);
      wGroup.updateMatrixWorld(true);

      const wheelMeshes = extractTriangles(wGroup);

      // Filter chassis triangles within proximity of this wheel
      const wheelBox = new THREE.Box3().setFromObject(wGroup);
      wheelBox.expandByScalar(0.05);

      const proximateChassisTris: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
      for (const cm of chassisMeshes) {
        for (const tri of cm.triangles) {
          if (
            wheelBox.containsPoint(tri[0]) ||
            wheelBox.containsPoint(tri[1]) ||
            wheelBox.containsPoint(tri[2])
          ) {
            proximateChassisTris.push(tri);
          }
        }
      }

      // Check intersections
      let intersectionCount = 0;
      let lowerBodyIntersections = 0;
      let flareIntersections = 0;
      let linerIntersections = 0;
      let otherIntersections = 0;
      const intersectingMeshes = new Set<string>();

      for (const wm of wheelMeshes) {
        for (const wTri of wm.triangles) {
          for (const cm of chassisMeshes) {
            for (const cTri of cm.triangles) {
              if (
                wheelBox.containsPoint(cTri[0]) ||
                wheelBox.containsPoint(cTri[1]) ||
                wheelBox.containsPoint(cTri[2])
              ) {
                if (triangleIntersectsTriangle(wTri, cTri)) {
                  intersectionCount++;
                  if (cm.meshName.includes('-1.95..1.95')) {
                    lowerBodyIntersections++;
                  } else if (cm.meshName.includes('Cylinder') || cm.meshName.includes('Arch') || cm.meshName.includes('Flare')) {
                    flareIntersections++;
                  } else {
                    otherIntersections++;
                  }
                  intersectingMeshes.add(cm.meshName);
                }
              }
            }
          }
        }
      }

      if (intersectionCount > 0) {
        console.log(`  ❌ Wheel ${wheelNames[w]}: ${intersectionCount} TRIANGLE INTERSECTIONS DETECTED with chassis!`);
        console.log(`     LowerBody: ${lowerBodyIntersections}, Flare/Liner: ${flareIntersections}, Other: ${otherIntersections}`);
        console.log(`     Intersecting meshes: ${Array.from(intersectingMeshes).join('; ')}`);
      } else {
        console.log(`  ✅ Wheel ${wheelNames[w]}: ZERO intersections (clean clearance)`);
      }
    }
  }
}

runExactTriangleClippingTest().catch(console.error);
