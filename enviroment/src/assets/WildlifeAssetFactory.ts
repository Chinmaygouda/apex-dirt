import * as THREE from 'three';
import { WildlifeEntity } from '../types/rally';

/**
 * WildlifeAssetFactory creates articulated 3D models for dairy cows and mountain deer.
 * Each animal is constructed with named articulation pivots:
 * - headPivot: for idle grazing head bobbing and rapid snapping towards approaching car
 * - leftEar / rightEar: for twitching alert reactions
 * - legs[0..3]: for walking, trotting, and panic crossing gaits
 * - tailPivot: for idle tail swishing
 */
export class WildlifeAssetFactory {
  /**
   * Procedural texture for Dairy Cow (Spotted Holstein)
   */
  private static createCowTexture(): THREE.Texture {
    if (typeof document === 'undefined') {
      const size = 16;
      const data = new Uint8Array(size * size * 4);
      data.fill(245);
      const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
      tex.needsUpdate = true;
      return tex;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Cream white base
    ctx.fillStyle = '#f5f4ef';
    ctx.fillRect(0, 0, 256, 256);

    // Black irregular dairy spots
    ctx.fillStyle = '#1c1b18';
    const spots = [
      { x: 50, y: 50, rx: 35, ry: 25 },
      { x: 180, y: 70, rx: 45, ry: 30 },
      { x: 110, y: 160, rx: 50, ry: 35 },
      { x: 210, y: 190, rx: 30, ry: 25 },
      { x: 40, y: 200, rx: 25, ry: 20 }
    ];
    for (const s of spots) {
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.rx, s.ry, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  /**
   * 1. Create Articulated Low-Poly Rustic Dairy Cow
   */
  public static createCow(id: string, initialPos: THREE.Vector3): WildlifeEntity {
    const root = new THREE.Group();
    root.name = `Cow_${id}`;
    root.position.copy(initialPos);

    const cowMat = new THREE.MeshStandardMaterial({
      map: this.createCowTexture(),
      roughness: 0.85
    });

    const pinkMuzzleMat = new THREE.MeshStandardMaterial({
      color: 0xdf9999, // Pink cow snout
      roughness: 0.7
    });

    const hoofMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.9
    });

    // 1. Torso Body (Barrel chest)
    const torsoGeo = new THREE.BoxGeometry(1.2, 1.3, 2.3);
    const torso = new THREE.Mesh(torsoGeo, cowMat);
    torso.position.y = 1.35;
    torso.castShadow = true;
    torso.receiveShadow = true;
    root.add(torso);

    // Udder
    const udderGeo = new THREE.BoxGeometry(0.5, 0.35, 0.6);
    const udder = new THREE.Mesh(udderGeo, pinkMuzzleMat);
    udder.position.set(0, -0.65, -0.3);
    torso.add(udder);

    // 2. Neck & Head Pivot Group (located at front of torso)
    const headPivot = new THREE.Group();
    headPivot.name = 'HeadPivot';
    headPivot.position.set(0, 1.7, 1.1); // Front top shoulder
    root.add(headPivot);

    // Head Skull
    const skullGeo = new THREE.BoxGeometry(0.7, 0.75, 0.9);
    const skull = new THREE.Mesh(skullGeo, cowMat);
    skull.position.set(0, -0.1, 0.45);
    skull.castShadow = true;
    headPivot.add(skull);

    // Snout / Muzzle
    const snoutGeo = new THREE.BoxGeometry(0.55, 0.45, 0.4);
    const snout = new THREE.Mesh(snoutGeo, pinkMuzzleMat);
    snout.position.set(0, -0.22, 0.95);
    headPivot.add(snout);

    // Horns
    const hornGeo = new THREE.ConeGeometry(0.06, 0.32, 5);
    const hornMat = new THREE.MeshStandardMaterial({ color: 0x444438, roughness: 0.6 });
    const hornL = new THREE.Mesh(hornGeo, hornMat);
    hornL.position.set(0.35, 0.35, 0.3);
    hornL.rotation.z = -0.5;
    hornL.rotation.x = -0.3;
    const hornR = new THREE.Mesh(hornGeo, hornMat);
    hornR.position.set(-0.35, 0.35, 0.3);
    hornR.rotation.z = 0.5;
    hornR.rotation.x = -0.3;
    headPivot.add(hornL, hornR);

    // Twitching Ears
    const earGeo = new THREE.BoxGeometry(0.32, 0.12, 0.1);
    const leftEar = new THREE.Group();
    leftEar.position.set(0.38, 0.22, 0.2);
    const earMeshL = new THREE.Mesh(earGeo, cowMat);
    leftEar.add(earMeshL);

    const rightEar = new THREE.Group();
    rightEar.position.set(-0.38, 0.22, 0.2);
    const earMeshR = new THREE.Mesh(earGeo, cowMat);
    rightEar.add(earMeshR);

    headPivot.add(leftEar, rightEar);

    // 3. Tail Pivot
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 1.8, -1.1);
    const tailGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.9, 5);
    const tailMesh = new THREE.Mesh(tailGeo, cowMat);
    tailMesh.position.y = -0.45;
    tailPivot.add(tailMesh);
    root.add(tailPivot);

    // 4. Four Articulated Legs (Pivoted at hip / shoulder)
    const legGeo = new THREE.BoxGeometry(0.24, 0.85, 0.26);
    const hoofGeo = new THREE.BoxGeometry(0.25, 0.15, 0.28);

    const createLeg = (name: string, px: number, py: number, pz: number) => {
      const pivot = new THREE.Group();
      pivot.name = name;
      pivot.position.set(px, py, pz);

      const leg = new THREE.Mesh(legGeo, cowMat);
      leg.position.y = -0.42;
      leg.castShadow = true;
      pivot.add(leg);

      const hoof = new THREE.Mesh(hoofGeo, hoofMat);
      hoof.position.y = -0.85;
      pivot.add(hoof);

      root.add(pivot);
      return pivot;
    };

    const legFL = createLeg('leg_FL', 0.42, 0.95, 0.75);
    const legFR = createLeg('leg_FR', -0.42, 0.95, 0.75);
    const legRL = createLeg('leg_RL', 0.42, 0.95, -0.75);
    const legRR = createLeg('leg_RR', -0.42, 0.95, -0.75);

    return {
      id,
      type: 'cow',
      mesh: root,
      currentPosition: initialPos.clone(),
      homePosition: initialPos.clone(),
      targetPosition: initialPos.clone(),
      state: 'GRAZING',
      stateTimer: 0,
      crossingProgress: 0,
      alertHeadSnap: 0,
      velocity: new THREE.Vector3(),
      headPivot,
      leftEar,
      rightEar,
      tailPivot,
      legs: [legFL, legFR, legRL, legRR]
    };
  }

  /**
   * 2. Create Articulated Wild Mountain Deer (Buck with Antlers)
   */
  public static createDeer(id: string, initialPos: THREE.Vector3): WildlifeEntity {
    const root = new THREE.Group();
    root.name = `Deer_${id}`;
    root.position.copy(initialPos);

    const deerMat = new THREE.MeshStandardMaterial({
      color: 0x936643, // Rich tawny buck fur
      roughness: 0.8
    });

    const deerBellyMat = new THREE.MeshStandardMaterial({
      color: 0xdfd3c4, // Pale cream underbelly
      roughness: 0.85
    });

    const antlerMat = new THREE.MeshStandardMaterial({
      color: 0xd4c2a5, // Bone antlers
      roughness: 0.6
    });

    const hoofMat = new THREE.MeshStandardMaterial({
      color: 0x1f1f1f,
      roughness: 0.9
    });

    // 1. Sleek Torso Body
    const torsoGeo = new THREE.BoxGeometry(0.7, 0.85, 1.7);
    const torso = new THREE.Mesh(torsoGeo, deerMat);
    torso.position.y = 1.35;
    torso.castShadow = true;
    torso.receiveShadow = true;
    root.add(torso);

    // Pale Underbelly
    const bellyGeo = new THREE.BoxGeometry(0.55, 0.2, 1.3);
    const belly = new THREE.Mesh(bellyGeo, deerBellyMat);
    belly.position.set(0, -0.42, 0);
    torso.add(belly);

    // 2. Slender Neck & Head Pivot
    const headPivot = new THREE.Group();
    headPivot.name = 'DeerHeadPivot';
    headPivot.position.set(0, 1.75, 0.75);
    root.add(headPivot);

    // Neck
    const neckGeo = new THREE.BoxGeometry(0.35, 0.75, 0.45);
    const neck = new THREE.Mesh(neckGeo, deerMat);
    neck.position.set(0, 0.35, 0.18);
    neck.rotation.x = -0.3;
    neck.castShadow = true;
    headPivot.add(neck);

    // Head Skull & Muzzle
    const skullGeo = new THREE.BoxGeometry(0.38, 0.42, 0.65);
    const skull = new THREE.Mesh(skullGeo, deerMat);
    skull.position.set(0, 0.75, 0.42);
    skull.castShadow = true;
    headPivot.add(skull);

    // Antlers (Multi-point branch)
    const createAntler = (isRight: boolean) => {
      const g = new THREE.Group();
      const mainBeam = new THREE.CylinderGeometry(0.035, 0.05, 0.8, 5);
      const mMesh = new THREE.Mesh(mainBeam, antlerMat);
      mMesh.position.y = 0.4;
      g.add(mMesh);

      // Tine 1
      const tineGeo = new THREE.CylinderGeometry(0.02, 0.035, 0.35, 4);
      const tine1 = new THREE.Mesh(tineGeo, antlerMat);
      tine1.position.set(0.08, 0.3, 0.1);
      tine1.rotation.x = 0.5;
      g.add(tine1);

      g.position.set(isRight ? -0.15 : 0.15, 0.95, 0.35);
      g.rotation.z = isRight ? -0.35 : 0.35;
      g.rotation.x = -0.25;
      return g;
    };
    headPivot.add(createAntler(false), createAntler(true));

    // Twitching Ears
    const earGeo = new THREE.BoxGeometry(0.12, 0.35, 0.08);
    const leftEar = new THREE.Group();
    leftEar.position.set(0.22, 0.92, 0.28);
    const earMeshL = new THREE.Mesh(earGeo, deerMat);
    leftEar.add(earMeshL);

    const rightEar = new THREE.Group();
    rightEar.position.set(-0.22, 0.92, 0.28);
    const earMeshR = new THREE.Mesh(earGeo, deerMat);
    rightEar.add(earMeshR);

    headPivot.add(leftEar, rightEar);

    // 3. Four Long Running Legs
    const legGeo = new THREE.BoxGeometry(0.14, 1.1, 0.15);
    const hoofGeo = new THREE.BoxGeometry(0.15, 0.12, 0.16);

    const createLeg = (name: string, px: number, py: number, pz: number) => {
      const pivot = new THREE.Group();
      pivot.name = name;
      pivot.position.set(px, py, pz);

      const leg = new THREE.Mesh(legGeo, deerMat);
      leg.position.y = -0.55;
      leg.castShadow = true;
      pivot.add(leg);

      const hoof = new THREE.Mesh(hoofGeo, hoofMat);
      hoof.position.y = -1.1;
      pivot.add(hoof);

      root.add(pivot);
      return pivot;
    };

    const legFL = createLeg('deer_FL', 0.25, 1.15, 0.6);
    const legFR = createLeg('deer_FR', -0.25, 1.15, 0.6);
    const legRL = createLeg('deer_RL', 0.25, 1.15, -0.6);
    const legRR = createLeg('deer_RR', -0.25, 1.15, -0.6);

    return {
      id,
      type: 'deer',
      mesh: root,
      currentPosition: initialPos.clone(),
      homePosition: initialPos.clone(),
      targetPosition: initialPos.clone(),
      state: 'GRAZING',
      stateTimer: 0,
      crossingProgress: 0,
      alertHeadSnap: 0,
      velocity: new THREE.Vector3(),
      headPivot,
      leftEar,
      rightEar,
      legs: [legFL, legFR, legRL, legRR]
    };
  }
}

