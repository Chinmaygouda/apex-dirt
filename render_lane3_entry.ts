import * as THREE from 'three';
import { PhysicsWorld } from './src/physics/PhysicsWorld';
import { CurveRoadWorld } from './src/world/CurveRoadWorld';
import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle';
import { ChaseCamera } from './src/core/ChaseCamera';
import { CourseGeometry, totalLength, sectionAt } from './src/world/CourseGeometry';
import { WORLD_CONFIG } from './src/world/worldConfig';
import { THREE_PALETTE } from './src/core/Constants';

const RECEIVER_URL = 'http://localhost:3005';

const SKY_HORIZON = '#8FAEC9';
const FOG_HAZE = '#8FAEC9';
const SKY_ZENITH = '#4B6278';
const ROAD_DIRT_SHADOW = '#4D4742';
const SUN_WARMTH = '#FFF8E7';

interface CsvRow {
  t: number;
  mph: number;
  throttle: number;
  brake: number;
  steer: number;
  hb: boolean;
}

interface FrameJson {
  t: number;
  speed: number;
  slip: number;
  latG: number;
  roll: number;
  pitch: number;
  droop: {
    FL: number;
    FR: number;
    RL: number;
    RR: number;
  };
  cameraOffAxis: number;
  horizon: number;
  cameraPosition: {
    x: number;
    y: number;
    z: number;
  };
  carPosition: {
    x: number;
    y: number;
    z: number;
  };
  carYaw: number;
}

function updateStatus(msg: string) {
  const el = document.getElementById('status-overlay');
  if (el) el.textContent = msg;
  console.log('[Renderer]', msg);
}

async function postArtifact(filename: string, content: string, isBase64: boolean): Promise<void> {
  await fetch(`${RECEIVER_URL}/save-artifact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, content, isBase64 }),
  });
}

function createDeterministicClouds(scene: THREE.Scene): void {
  const cloudMat = new THREE.MeshStandardMaterial({
    color: THREE_PALETTE.cloudWhite,
    roughness: 0.9,
    metalness: 0.05,
    flatShading: true,
  });
  const cloudGeom = new THREE.IcosahedronGeometry(1, 0);

  // Deterministic positions (no Math.random)
  const cloudOffsets = [
    [-120, 95, 150], [80, 110, 220], [-60, 105, 380], [140, 90, 480],
    [-180, 115, 620], [60, 100, 750], [-90, 110, 890], [130, 95, 1020],
    [-40, 105, 1180], [110, 110, 1310], [-150, 95, 1420], [70, 100, 1550]
  ];

  for (const [cx, cy, cz] of cloudOffsets) {
    const singleCloud = new THREE.Group();
    const puffOffsets = [
      [0, 0, 0, 14], [8, 2, -4, 11], [-7, 1, 5, 10], [4, 5, 3, 9], [-5, 4, -3, 8]
    ];
    for (const [px, py, pz, scale] of puffOffsets) {
      const puff = new THREE.Mesh(cloudGeom, cloudMat);
      puff.position.set(px, py, pz);
      puff.scale.set(scale, scale * 0.65, scale);
      singleCloud.add(puff);
    }
    singleCloud.position.set(cx, cy, cz);
    scene.add(singleCloud);
  }
}

async function runRenderer() {
  updateStatus('Setting up WebGL renderer and scene...');

  const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.setSize(720, 1280, false);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_HORIZON);
  scene.fog = new THREE.FogExp2(new THREE.Color(FOG_HAZE), 0.0018);

  const hemiLight = new THREE.HemisphereLight(new THREE.Color(SKY_ZENITH), new THREE.Color(ROAD_DIRT_SHADOW), 0.85);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(new THREE.Color(SUN_WARMTH), 2.2);
  sunLight.position.set(65, 40, -50);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.bias = -0.0005;

  const shadowCamSize = 45;
  sunLight.shadow.camera.left = -shadowCamSize;
  sunLight.shadow.camera.right = shadowCamSize;
  sunLight.shadow.camera.top = shadowCamSize;
  sunLight.shadow.camera.bottom = -shadowCamSize;
  sunLight.shadow.camera.near = 5;
  sunLight.shadow.camera.far = 240;
  scene.add(sunLight);
  scene.add(sunLight.target);

  createDeterministicClouds(scene);

  updateStatus('Initializing Rapier physics and CurveRoadWorld...');
  const physics = new PhysicsWorld();
  await physics.init();

  const curveRoadWorld = new CurveRoadWorld();
  curveRoadWorld.buildPhysics(physics);
  await curveRoadWorld.buildVisuals(scene);

  const vehicle = new CustomRallyVehicle(scene, physics as any);
  vehicle.tuning.surfaceMode = 'dirt';
  vehicle.worldSurfaceQuery = (x, z) => curveRoadWorld.getSurfaceAt(x, z);

  const camera = new ChaseCamera(9 / 16);

  // Fetch telemetry CSV
  updateStatus('Fetching hardpack_reference_telemetry.csv...');
  const csvRes = await fetch('/hardpack_reference_telemetry.csv');
  const csvText = await csvRes.text();
  const lines = csvText.trim().split('\n');
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',').map(x => x.trim());
    if (p.length < 10) continue;
    rows.push({
      t: parseFloat(p[1]),
      mph: parseFloat(p[3]),
      throttle: parseFloat(p[5]),
      brake: parseFloat(p[6]),
      steer: parseFloat(p[8]),
      hb: parseInt(p[9], 10) === 1
    });
  }

  // PART 3.2: Replay reference scenario
  updateStatus('Replaying scenario for 6 reel-comparison frames...');
  vehicle.resetPosition();
  const v0 = rows[0].mph * 0.44704;
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: v0 }, true);
  (vehicle as any).currentGear = 5;
  for (let i = 0; i < 4; i++) {
    (vehicle as any).wheelAngularVel[i] = v0 / vehicle.wheelRadius;
  }
  const base = { reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };

  // 15 settling substeps of 1/120s
  for (let i = 0; i < 15; i++) {
    physics.step(1 / 120, dt => vehicle.updatePhysicsSubstep(dt, { throttle: rows[0].throttle, brake: 0, steer: 0, handbrake: false, ...base }));
  }
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: v0 }, true);
  for (let i = 0; i < 4; i++) {
    (vehicle as any).wheelAngularVel[i] = v0 / vehicle.wheelRadius;
  }

  const targetTimes = [2.0, 2.5, 2.8, 3.2, 3.8, 4.1];
  const capturedReelImages: { t: number; dataUrl: string }[] = [];

  for (const r of rows) {
    if (r.t > 4.6) break;
    const inputs = { throttle: r.throttle, brake: r.brake, steer: r.steer, handbrake: r.hb, ...base };

    // 4 physics substeps of 1/120s per 1/30s frame
    physics.step(1 / 30, dt => vehicle.updatePhysicsSubstep(dt, inputs));
    vehicle.updateVisuals(inputs, 1 / 30);
    camera.update(vehicle, 1 / 30);

    // Sunlight follow
    if (vehicle.chassisMesh) {
      const carPos = vehicle.chassisMesh.position;
      sunLight.position.set(carPos.x + 40, carPos.y + 60, carPos.z - 30);
      sunLight.target.position.copy(carPos);
    }

    renderer.render(scene, camera.camera);

    // Check if within 0.015s of any target time
    for (const tTarget of targetTimes) {
      if (Math.abs(r.t - tTarget) < 0.016 && !capturedReelImages.some(img => img.t === tTarget)) {
        updateStatus(`Capturing frame at t = ${tTarget.toFixed(1)}s...`);
        const dataUrl = renderer.domElement.toDataURL('image/png');
        capturedReelImages.push({ t: tTarget, dataUrl });

        const q = vehicle.chassisBody.rotation();
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
        fwd.y = 0;
        fwd.normalize();
        const cd = new THREE.Vector3();
        camera.camera.getWorldDirection(cd);
        cd.y = 0;
        cd.normalize();
        const offAxisDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(fwd.dot(cd), -1, 1)));
        const tr = vehicle.chassisBody.translation();
        const carYawDeg = (Math.atan2(fwd.x, fwd.z) * 180) / Math.PI;

        const jsonData: FrameJson = {
          t: tTarget,
          speed: parseFloat(r.mph.toFixed(1)),
          slip: parseFloat(vehicle.driftAngleDeg.toFixed(2)),
          latG: parseFloat(((vehicle as any).smoothedLateralG || 0).toFixed(3)),
          roll: parseFloat(vehicle.getVisualRollDeg().toFixed(2)),
          pitch: parseFloat(vehicle.getVisualPitchDeg().toFixed(2)),
          droop: {
            FL: parseFloat(vehicle.lastVisualDroop[0].toFixed(3)),
            FR: parseFloat(vehicle.lastVisualDroop[1].toFixed(3)),
            RL: parseFloat(vehicle.lastVisualDroop[2].toFixed(3)),
            RR: parseFloat(vehicle.lastVisualDroop[3].toFixed(3)),
          },
          cameraOffAxis: parseFloat(offAxisDeg.toFixed(1)),
          horizon: parseFloat((camera.currentHorizonRollDeg || 0).toFixed(2)),
          cameraPosition: {
            x: parseFloat(camera.camera.position.x.toFixed(3)),
            y: parseFloat(camera.camera.position.y.toFixed(3)),
            z: parseFloat(camera.camera.position.z.toFixed(3)),
          },
          carPosition: {
            x: parseFloat(tr.x.toFixed(3)),
            y: parseFloat(tr.y.toFixed(3)),
            z: parseFloat(tr.z.toFixed(3)),
          },
          carYaw: parseFloat(carYawDeg.toFixed(2)),
        };

        const tStr = tTarget.toFixed(1);
        await postArtifact(`lane3_f_${tStr}.png`, dataUrl, true);
        await postArtifact(`lane3_f_${tStr}.json`, JSON.stringify(jsonData, null, 2), false);
      }
    }
  }

  // 3x2 Contact Sheet
  updateStatus('Generating 3x2 Contact Sheet...');
  const csCanvas = document.createElement('canvas');
  csCanvas.width = 1080;  // 3 columns of 360px
  csCanvas.height = 1280; // 2 rows of 640px
  const ctx = csCanvas.getContext('2d')!;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, csCanvas.width, csCanvas.height);

  for (let i = 0; i < capturedReelImages.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = col * 360;
    const y = row * 640;

    const img = new Image();
    await new Promise<void>((resolve) => {
      img.onload = () => {
        ctx.drawImage(img, x, y, 360, 640);
        // Header pill
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(x + 10, y + 10, 110, 28);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 15px monospace';
        ctx.fillText(`t = ${capturedReelImages[i].t.toFixed(1)}s`, x + 18, y + 30);
        resolve();
      };
      img.src = capturedReelImages[i].dataUrl;
    });
  }
  const csDataUrl = csCanvas.toDataURL('image/png');
  await postArtifact('lane3_contact_sheet.png', csDataUrl, true);

  // PART 3.6: 4 Corner Frames from Fixed Autopilot
  updateStatus('Replaying autopilot for 4 corner frames...');

  // Reset physics and vehicle for autopilot run
  const physicsAuto = new PhysicsWorld();
  await physicsAuto.init();
  physicsAuto.world.integrationParameters.dt = 1 / 120;

  const worldAuto = new CurveRoadWorld();
  worldAuto.buildPhysics(physicsAuto);

  // Clear scene and rebuild
  while (scene.children.length > 0) {
    scene.remove(scene.children[0]);
  }
  scene.add(hemiLight);
  scene.add(sunLight);
  scene.add(sunLight.target);
  createDeterministicClouds(scene);
  await worldAuto.buildVisuals(scene);

  const vehicleAuto = new CustomRallyVehicle(scene, physicsAuto as any);
  vehicleAuto.tuning.surfaceMode = 'dirt';
  vehicleAuto.worldSurfaceQuery = (x, z) => worldAuto.getSurfaceAt(x, z);

  const camAuto = new ChaseCamera(9 / 16);

  vehicleAuto.resetPosition();
  const vInit = 30 * 0.44704;
  vehicleAuto.chassisBody.setLinvel({ x: 0, y: 0, z: vInit }, true);
  (vehicleAuto as any).currentGear = 2;
  for (let i = 0; i < 4; i++) {
    (vehicleAuto as any).wheelAngularVel[i] = vInit / vehicleAuto.wheelRadius;
  }
  for (let i = 0; i < 15; i++) {
    physicsAuto.step(1 / 120, dt => vehicleAuto.updatePhysicsSubstep(dt, { throttle: 0.5, brake: 0, steer: 0, handbrake: false, ...base }));
  }

  function getAutoTargetSpeed(s: number): number {
    const sec = sectionAt(s);
    function getSpd(secId: number): number {
      switch (secId) {
        case 2: return 49.6;
        case 4: return 40.5;
        case 6: return 25.2;
        case 8: return 45.0;
        case 9: return 45.0;
        default: return 80.0;
      }
    }
    if (sec.type !== 'STRAIGHT') return getSpd(sec.id);
    const nextIdx = sec.id;
    if (nextIdx < CourseGeometry.sections.length) {
      const nextSec = CourseGeometry.sections[nextIdx];
      const cMph = getSpd(nextSec.id);
      if (cMph < 80) {
        const dist = nextSec.sStart - s;
        const v0 = 80 * 0.44704, v1 = cMph * 0.44704;
        const bd = ((v0 * v0 - v1 * v1) / 12.0) + 12.0;
        if (dist <= bd) {
          return cMph + Math.max(0, Math.min(1, dist / bd)) * (80 - cMph);
        }
      }
    }
    return 80;
  }

  // Pass 1: Drive and capture Sec 2, Sec 4, Chicane
  let simTime = 0;
  const dt = 1 / 30;
  let capturedR120 = false;
  let capturedR60 = false;
  let capturedChicane = false;

  async function captureCornerFrame(name: string, carS: number) {
    const q = vehicleAuto.chassisBody.rotation();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    fwd.y = 0;
    fwd.normalize();
    const cd = new THREE.Vector3();
    camAuto.camera.getWorldDirection(cd);
    cd.y = 0;
    cd.normalize();
    const offAxis = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(fwd.dot(cd), -1, 1)));
    const tr = vehicleAuto.chassisBody.translation();
    const vel = vehicleAuto.chassisBody.linvel();
    const mph = Math.hypot(vel.x, vel.z) * 2.23694;

    const dataUrl = renderer.domElement.toDataURL('image/png');
    const json: FrameJson = {
      t: parseFloat(simTime.toFixed(3)),
      speed: parseFloat(mph.toFixed(1)),
      slip: parseFloat(vehicleAuto.driftAngleDeg.toFixed(2)),
      latG: parseFloat(((vehicleAuto as any).smoothedLateralG || 0).toFixed(3)),
      roll: parseFloat(vehicleAuto.getVisualRollDeg().toFixed(2)),
      pitch: parseFloat(vehicleAuto.getVisualPitchDeg().toFixed(2)),
      droop: {
        FL: parseFloat(vehicleAuto.lastVisualDroop[0].toFixed(3)),
        FR: parseFloat(vehicleAuto.lastVisualDroop[1].toFixed(3)),
        RL: parseFloat(vehicleAuto.lastVisualDroop[2].toFixed(3)),
        RR: parseFloat(vehicleAuto.lastVisualDroop[3].toFixed(3)),
      },
      cameraOffAxis: parseFloat(offAxis.toFixed(1)),
      horizon: parseFloat((camAuto.currentHorizonRollDeg || 0).toFixed(2)),
      cameraPosition: {
        x: parseFloat(camAuto.camera.position.x.toFixed(3)),
        y: parseFloat(camAuto.camera.position.y.toFixed(3)),
        z: parseFloat(camAuto.camera.position.z.toFixed(3)),
      },
      carPosition: {
        x: parseFloat(tr.x.toFixed(3)),
        y: parseFloat(tr.y.toFixed(3)),
        z: parseFloat(tr.z.toFixed(3)),
      },
      carYaw: parseFloat(((Math.atan2(fwd.x, fwd.z) * 180) / Math.PI).toFixed(2)),
    };

    await postArtifact(`lane3_c_${name}.png`, dataUrl, true);
    await postArtifact(`lane3_c_${name}.json`, JSON.stringify(json, null, 2), false);
    updateStatus(`Captured corner frame: lane3_c_${name}`);
  }

  while (simTime < 120) {
    const tr = vehicleAuto.chassisBody.translation();
    const vel = vehicleAuto.chassisBody.linvel();
    const speedMs = Math.hypot(vel.x, vel.z);
    const speedMph = speedMs * 2.23694;
    const courseX = tr.x - WORLD_CONFIG.rigidTransform.transX;
    const courseZ = tr.z - WORLD_CONFIG.rigidTransform.transZ;
    const { s: carS } = CourseGeometry.distToCentreline(courseX, courseZ);
    if (carS > totalLength - 15) break;

    const currentSec = sectionAt(carS);

    const targetMph = getAutoTargetSpeed(carS);
    const speedErr = targetMph * 0.44704 - speedMs;
    let throttle = 0, brake = 0;
    if (speedErr > 0.4) {
      throttle = Math.min(1.0, speedErr * 0.25 + 0.15);
    } else if (speedErr < -0.4) {
      brake = Math.min(1.0, -speedErr * 0.35);
    } else {
      throttle = 0.12;
    }

    const refPt = CourseGeometry.sample(carS);
    const normX = Math.cos(refPt.heading);
    const normZ = -Math.sin(refPt.heading);
    const crossTrackError = (courseX - refPt.x) * normX + (courseZ - refPt.z) * normZ;

    const q = vehicleAuto.chassisBody.rotation();
    const carQuat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(carQuat);
    fwd.y = 0;
    fwd.normalize();
    const carHeading = Math.atan2(fwd.x, fwd.z);

    const maxSteerRad = THREE.MathUtils.degToRad(31.5);
    const kinSteerRad = (2.70 * 11.27) / (Math.max(1.0, speedMs) * Math.max(1.0, speedMs));
    const cruiseLockRad = THREE.MathUtils.lerp(maxSteerRad, Math.min(maxSteerRad, kinSteerRad + 0.046), THREE.MathUtils.smoothstep(speedMph, 30.0, 60.0));

    const L = Math.min(14.0, Math.max(5.0, 0.35 * speedMs));
    const targetPt = CourseGeometry.sample(Math.min(totalLength, carS + L));
    let lookaheadHeadingError = ((targetPt.heading - carHeading + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (lookaheadHeadingError < -Math.PI) lookaheadHeadingError += 2 * Math.PI;

    const steerHeading = - (lookaheadHeadingError / cruiseLockRad) * 1.0;
    const crossTrackSteerAngle = Math.atan2(0.85 * crossTrackError, speedMs + 1.0);
    const steerCrossTrack = + (crossTrackSteerAngle / cruiseLockRad);
    const yawRate = vehicleAuto.chassisBody.angvel().y;
    const steerDamp = - (yawRate * 0.04);
    let steer = THREE.MathUtils.clamp(steerHeading + steerCrossTrack + steerDamp, -1.0, 1.0);

    const inputs = { throttle, brake, steer, handbrake: false, ...base };
    physicsAuto.step(dt, subDt => vehicleAuto.updatePhysicsSubstep(subDt, inputs));
    vehicleAuto.updateVisuals(inputs, dt);
    camAuto.update(vehicleAuto, dt);

    if (vehicleAuto.chassisMesh) {
      const carPos = vehicleAuto.chassisMesh.position;
      sunLight.position.set(carPos.x + 40, carPos.y + 60, carPos.z - 30);
      sunLight.target.position.copy(carPos);
    }
    renderer.render(scene, camAuto.camera);

    // Capture 1: Middle of Section 2 (R=120 sweeper, s = 400 to 525.66 -> mid ~463m)
    if (!capturedR120 && carS >= 463) {
      capturedR120 = true;
      await captureCornerFrame('r120_sweeper', carS);
    }
    // Capture 2: Middle of Section 4 (R=60 left, s = 675.66 to 769.91 -> mid ~723m)
    if (!capturedR60 && carS >= 723) {
      capturedR60 = true;
      await captureCornerFrame('r60_left', carS);
    }
    // Capture 3: Chicane switch point (between Sec 8 and 9, s ~ 1105m)
    if (!capturedChicane && carS >= 1105) {
      capturedChicane = true;
      await captureCornerFrame('chicane_switch', carS);
    }

    simTime += dt;
  }

  // Pass 2: Hairpin with handbrake at maximum slip
  updateStatus('Replaying Section 6 handbrake hairpin for max slip frame...');
  vehicleAuto.resetPosition();
  vehicleAuto.chassisBody.setLinvel({ x: 0, y: 0, z: vInit }, true);
  for (let i = 0; i < 4; i++) {
    (vehicleAuto as any).wheelAngularVel[i] = vInit / vehicleAuto.wheelRadius;
  }
  for (let i = 0; i < 15; i++) {
    physicsAuto.step(1 / 120, dt => vehicleAuto.updatePhysicsSubstep(dt, { throttle: 0.5, brake: 0, steer: 0, handbrake: false, ...base }));
  }

  simTime = 0;
  let enteredS6 = false;
  let hbRemaining = 0;
  let maxSlipFound = 0;
  let bestHairpinFrame: { dataUrl: string; json: FrameJson } | null = null;

  while (simTime < 90) {
    const tr = vehicleAuto.chassisBody.translation();
    const vel = vehicleAuto.chassisBody.linvel();
    const speedMs = Math.hypot(vel.x, vel.z);
    const speedMph = speedMs * 2.23694;
    const courseX = tr.x - WORLD_CONFIG.rigidTransform.transX;
    const courseZ = tr.z - WORLD_CONFIG.rigidTransform.transZ;
    const { s: carS } = CourseGeometry.distToCentreline(courseX, courseZ);
    if (carS > 950) break;

    const currentSec = sectionAt(carS);
    if (currentSec.id === 6 && !enteredS6) {
      enteredS6 = true;
      hbRemaining = 18; // 0.6s
    }
    const isHb = hbRemaining > 0;
    if (hbRemaining > 0) hbRemaining--;

    const targetMph = getAutoTargetSpeed(carS);
    const speedErr = targetMph * 0.44704 - speedMs;
    let throttle = 0, brake = 0;
    if (isHb) {
      throttle = 0.3;
    } else if (speedErr > 0.4) {
      throttle = Math.min(1.0, speedErr * 0.25 + 0.15);
    } else if (speedErr < -0.4) {
      brake = Math.min(1.0, -speedErr * 0.35);
    } else {
      throttle = 0.12;
    }

    const refPt = CourseGeometry.sample(carS);
    const normX = Math.cos(refPt.heading);
    const normZ = -Math.sin(refPt.heading);
    const crossTrackError = (courseX - refPt.x) * normX + (courseZ - refPt.z) * normZ;

    const q = vehicleAuto.chassisBody.rotation();
    const carQuat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(carQuat);
    fwd.y = 0;
    fwd.normalize();
    const carHeading = Math.atan2(fwd.x, fwd.z);

    const maxSteerRad = THREE.MathUtils.degToRad(31.5);
    const kinSteerRad = (2.70 * 11.27) / (Math.max(1.0, speedMs) * Math.max(1.0, speedMs));
    const cruiseLockRad = THREE.MathUtils.lerp(maxSteerRad, Math.min(maxSteerRad, kinSteerRad + 0.046), THREE.MathUtils.smoothstep(speedMph, 30.0, 60.0));

    const L = Math.min(14.0, Math.max(5.0, 0.35 * speedMs));
    const targetPt = CourseGeometry.sample(Math.min(totalLength, carS + L));
    let lookaheadHeadingError = ((targetPt.heading - carHeading + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (lookaheadHeadingError < -Math.PI) lookaheadHeadingError += 2 * Math.PI;

    const steerHeading = - (lookaheadHeadingError / cruiseLockRad) * 1.0;
    const crossTrackSteerAngle = Math.atan2(0.85 * crossTrackError, speedMs + 1.0);
    const steerCrossTrack = + (crossTrackSteerAngle / cruiseLockRad);
    const yawRate = vehicleAuto.chassisBody.angvel().y;
    const steerDamp = - (yawRate * 0.04);
    let steer = steerHeading + steerCrossTrack + steerDamp;
    if (currentSec.id === 6 && isHb) {
      steer = Math.sign(steer) * Math.min(1.0, Math.abs(steer) * 1.4);
    }
    steer = THREE.MathUtils.clamp(steer, -1.0, 1.0);

    const inputs = { throttle, brake, steer, handbrake: isHb, ...base };
    physicsAuto.step(dt, subDt => vehicleAuto.updatePhysicsSubstep(subDt, inputs));
    vehicleAuto.updateVisuals(inputs, dt);
    camAuto.update(vehicleAuto, dt);

    if (vehicleAuto.chassisMesh) {
      const carPos = vehicleAuto.chassisMesh.position;
      sunLight.position.set(carPos.x + 40, carPos.y + 60, carPos.z - 30);
      sunLight.target.position.copy(carPos);
    }
    renderer.render(scene, camAuto.camera);

    if (currentSec.id === 6) {
      const absSlip = Math.abs(vehicleAuto.driftAngleDeg);
      if (absSlip > maxSlipFound) {
        maxSlipFound = absSlip;
        const cd = new THREE.Vector3();
        camAuto.camera.getWorldDirection(cd);
        cd.y = 0;
        cd.normalize();
        const offAxis = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(fwd.dot(cd), -1, 1)));
        bestHairpinFrame = {
          dataUrl: renderer.domElement.toDataURL('image/png'),
          json: {
            t: parseFloat(simTime.toFixed(3)),
            speed: parseFloat(speedMph.toFixed(1)),
            slip: parseFloat(vehicleAuto.driftAngleDeg.toFixed(2)),
            latG: parseFloat(((vehicleAuto as any).smoothedLateralG || 0).toFixed(3)),
            roll: parseFloat(vehicleAuto.getVisualRollDeg().toFixed(2)),
            pitch: parseFloat(vehicleAuto.getVisualPitchDeg().toFixed(2)),
            droop: {
              FL: parseFloat(vehicleAuto.lastVisualDroop[0].toFixed(3)),
              FR: parseFloat(vehicleAuto.lastVisualDroop[1].toFixed(3)),
              RL: parseFloat(vehicleAuto.lastVisualDroop[2].toFixed(3)),
              RR: parseFloat(vehicleAuto.lastVisualDroop[3].toFixed(3)),
            },
            cameraOffAxis: parseFloat(offAxis.toFixed(1)),
            horizon: parseFloat((camAuto.currentHorizonRollDeg || 0).toFixed(2)),
            cameraPosition: {
              x: parseFloat(camAuto.camera.position.x.toFixed(3)),
              y: parseFloat(camAuto.camera.position.y.toFixed(3)),
              z: parseFloat(camAuto.camera.position.z.toFixed(3)),
            },
            carPosition: {
              x: parseFloat(tr.x.toFixed(3)),
              y: parseFloat(tr.y.toFixed(3)),
              z: parseFloat(tr.z.toFixed(3)),
            },
            carYaw: parseFloat(((Math.atan2(fwd.x, fwd.z) * 180) / Math.PI).toFixed(2)),
          }
        };
      }
    }

    simTime += dt;
  }

  if (bestHairpinFrame) {
    await postArtifact('lane3_c_hairpin_handbrake.png', bestHairpinFrame.dataUrl, true);
    await postArtifact('lane3_c_hairpin_handbrake.json', JSON.stringify(bestHairpinFrame.json, null, 2), false);
    updateStatus('Captured corner frame: lane3_c_hairpin_handbrake');
  }

  // Signal completion
  updateStatus('All renders complete! Sending completion signal...');
  await fetch(`${RECEIVER_URL}/render-complete`, { method: 'POST' });
}

runRenderer().catch((err) => {
  console.error('[Renderer Error]', err);
  updateStatus(`Error: ${err.message}`);
});
