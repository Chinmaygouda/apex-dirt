import * as THREE from 'three';
import { ProceduralTextures } from './ProceduralTextures';

/**
 * PropAssetFactory creates procedural 3D meshes for all roadside furniture,
 * rally infrastructure, rustic architecture, and Mediterranean vegetation.
 */
export class PropAssetFactory {
  // Shared materials for efficient batching
  private static woodMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a3e2b,
    roughness: 0.85,
    metalness: 0.05
  });

  private static stoneMaterial = new THREE.MeshStandardMaterial({
    color: 0x7c7365,
    roughness: 0.9,
    metalness: 0.05
  });

  private static steelMaterial = new THREE.MeshStandardMaterial({
    color: 0x8a9299,
    roughness: 0.4,
    metalness: 0.75
  });

  private static foliageMaterialDark = new THREE.MeshStandardMaterial({
    color: 0x243e26, // Deep cypress green
    roughness: 0.9,
    flatShading: true
  });

  private static foliageMaterialPine = new THREE.MeshStandardMaterial({
    color: 0x3d5a32, // Stone pine umbrella foliage
    roughness: 0.85,
    flatShading: true
  });

  private static terracottaRoofMaterial = new THREE.MeshStandardMaterial({
    color: 0x9b4e33, // Tuscan terracotta clay tiles
    roughness: 0.85
  });

  /**
   * 1. Mediterranean Cypress Tree (Cupressus sempervirens)
   * Slender vertical columnar silhouette.
   */
  public static createCypressTree(height = 11.0, baseRadius = 0.9): THREE.Group {
    const group = new THREE.Group();
    group.name = 'CypressTree';

    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.35, height * 0.22, 6);
    const trunk = new THREE.Mesh(trunkGeo, this.woodMaterial);
    trunk.position.y = (height * 0.22) / 2;
    trunk.castShadow = true;
    group.add(trunk);

    // Foliage tiers
    const tiers = 4;
    const foliageHeight = height * 0.88;
    for (let i = 0; i < tiers; i++) {
      const tierH = foliageHeight / tiers * 1.35;
      const t = i / (tiers - 1);
      const rad = baseRadius * (1.0 - t * 0.45);
      const coneGeo = new THREE.ConeGeometry(rad, tierH, 7);
      const cone = new THREE.Mesh(coneGeo, this.foliageMaterialDark);
      cone.position.y = (height * 0.16) + (i * (foliageHeight / tiers)) + (tierH / 2);
      cone.rotation.y = Math.random() * Math.PI;
      cone.castShadow = true;
      cone.receiveShadow = true;
      group.add(cone);
    }

    return group;
  }

  /**
   * 2. Italian Stone Pine (Pinus pinea)
   * High bare gnarled trunk with a broad, flat-topped umbrella dome canopy.
   */
  public static createStonePineTree(height = 14.0, canopyRadius = 4.8): THREE.Group {
    const group = new THREE.Group();
    group.name = 'StonePineTree';

    // Trunk with natural slight bend
    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.2, height * 0.35, 0.1),
      new THREE.Vector3(-0.3, height * 0.7, -0.2),
      new THREE.Vector3(0, height * 0.9, 0)
    ]);
    const trunkGeo = new THREE.TubeGeometry(trunkCurve, 8, 0.45, 7, false);
    const trunk = new THREE.Mesh(trunkGeo, this.woodMaterial);
    trunk.castShadow = true;
    group.add(trunk);

    // Umbrella Canopy (flattened hemisphere domes)
    const domeGeo = new THREE.CylinderGeometry(canopyRadius * 0.95, canopyRadius, height * 0.22, 10);
    const dome = new THREE.Mesh(domeGeo, this.foliageMaterialPine);
    dome.position.y = height * 0.95;
    dome.scale.set(1.0, 0.6, 1.0);
    dome.castShadow = true;
    dome.receiveShadow = true;
    group.add(dome);

    // Secondary overlapping crown
    const subDomeGeo = new THREE.ConeGeometry(canopyRadius * 0.7, height * 0.18, 9);
    const subDome = new THREE.Mesh(subDomeGeo, this.foliageMaterialPine);
    subDome.position.y = height * 1.05;
    subDome.castShadow = true;
    group.add(subDome);

    return group;
  }

  /**
   * 3. Roadside Sage Scrub / Grass Tuft
   */
  public static createSageScrub(scale = 1.0): THREE.Group {
    const group = new THREE.Group();
    group.name = 'SageScrub';

    const scrubMat = new THREE.MeshStandardMaterial({
      color: 0x5e704a, // Pale Mediterranean sage
      roughness: 0.95,
      flatShading: true
    });

    const blades = 7;
    for (let b = 0; b < blades; b++) {
      const bladeGeo = new THREE.ConeGeometry(0.25 * scale, 0.85 * scale, 4);
      const blade = new THREE.Mesh(bladeGeo, scrubMat);
      const angle = (b / blades) * Math.PI * 2;
      blade.position.set(Math.cos(angle) * 0.25 * scale, 0.4 * scale, Math.sin(angle) * 0.25 * scale);
      blade.rotation.z = (Math.random() - 0.5) * 0.4;
      blade.rotation.x = (Math.random() - 0.5) * 0.4;
      group.add(blade);
    }
    return group;
  }

  /**
   * 4. Riverbed Granite Boulder
   */
  public static createRiverStone(radius = 0.8): THREE.Mesh {
    const geo = new THREE.DodecahedronGeometry(radius, 1);
    // Displace vertices to create faceted rock
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const displace = 1.0 + (Math.sin(vx * 4) + Math.cos(vy * 3) + Math.sin(vz * 5)) * 0.12;
      pos.setXYZ(i, vx * displace, Math.max(0.05, vy * displace), vz * displace);
    }
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, this.stoneMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * 5. Red-and-White Apex Kerb Unit
   */
  public static createApexKerb(length = 2.0, width = 0.65, height = 0.12): THREE.Mesh {
    const geo = new THREE.BoxGeometry(width, height, length);
    const kerbMat = new THREE.MeshStandardMaterial({
      map: ProceduralTextures.getKerbTexture(),
      roughness: 0.6
    });
    const mesh = new THREE.Mesh(geo, kerbMat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    return mesh;
  }

  /**
   * 6. Breakable Wooden Fence Unit (2 posts + 2 horizontal rails)
   */
  public static createBreakableFence(length = 3.0, height = 1.1): THREE.Group {
    const group = new THREE.Group();
    group.name = 'BreakableFence';

    // Left Post
    const postGeo = new THREE.BoxGeometry(0.14, height, 0.14);
    const leftPost = new THREE.Mesh(postGeo, this.woodMaterial);
    leftPost.name = 'post_left';
    leftPost.position.set(-length / 2, height / 2, 0);
    leftPost.castShadow = true;
    group.add(leftPost);

    // Right Post
    const rightPost = new THREE.Mesh(postGeo, this.woodMaterial);
    rightPost.name = 'post_right';
    rightPost.position.set(length / 2, height / 2, 0);
    rightPost.castShadow = true;
    group.add(rightPost);

    // Top Rail
    const railGeo = new THREE.BoxGeometry(length, 0.1, 0.08);
    const topRail = new THREE.Mesh(railGeo, this.woodMaterial);
    topRail.name = 'rail_top';
    topRail.position.set(0, height * 0.82, 0);
    topRail.castShadow = true;
    group.add(topRail);

    // Bottom Rail
    const bottomRail = new THREE.Mesh(railGeo, this.woodMaterial);
    bottomRail.name = 'rail_bottom';
    bottomRail.position.set(0, height * 0.42, 0);
    bottomRail.castShadow = true;
    group.add(bottomRail);

    return group;
  }

  /**
   * 7. Breakable Dry-Stone Wall Unit (modular blocks)
   */
  public static createBreakableDryStoneWall(length = 2.4, height = 0.9, depth = 0.45): THREE.Group {
    const group = new THREE.Group();
    group.name = 'BreakableDryStoneWall';

    const rows = 3;
    const cols = 4;
    const blockH = height / rows;
    const blockW = length / cols;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const jitter = (Math.random() - 0.5) * 0.04;
        const bGeo = new THREE.BoxGeometry(blockW - 0.02, blockH - 0.02, depth + jitter);
        const block = new THREE.Mesh(bGeo, this.stoneMaterial);
        block.name = `stone_block_${r}_${c}`;
        block.position.set(
          -length / 2 + (c + 0.5) * blockW + (r % 2 === 0 ? 0 : 0.05),
          (r + 0.5) * blockH,
          0
        );
        block.castShadow = true;
        block.receiveShadow = true;
        group.add(block);
      }
    }
    return group;
  }

  /**
   * 8. Corner Warning Chevron Signboard
   */
  public static createChevronBoard(height = 1.8): THREE.Group {
    const group = new THREE.Group();
    group.name = 'ChevronBoard';

    // Metal post
    const postGeo = new THREE.CylinderGeometry(0.04, 0.04, height, 8);
    const post = new THREE.Mesh(postGeo, this.steelMaterial);
    post.position.y = height / 2;
    post.castShadow = true;
    group.add(post);

    // Chevron signboard plate
    const boardGeo = new THREE.BoxGeometry(1.2, 0.6, 0.03);
    const chevronMat = new THREE.MeshStandardMaterial({
      map: ProceduralTextures.getChevronTexture(),
      roughness: 0.4
    });
    const board = new THREE.Mesh(boardGeo, chevronMat);
    board.position.set(0, height * 0.85, 0.03);
    board.castShadow = true;
    group.add(board);

    return group;
  }

  /**
   * 9. Highway Steel Guardrail Section
   */
  public static createGuardrail(length = 3.5, height = 0.85): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Guardrail';

    // 2 Support Posts
    const postGeo = new THREE.BoxGeometry(0.08, height, 0.12);
    const p1 = new THREE.Mesh(postGeo, this.steelMaterial);
    p1.position.set(-length / 3, height / 2, 0);
    const p2 = new THREE.Mesh(postGeo, this.steelMaterial);
    p2.position.set(length / 3, height / 2, 0);
    group.add(p1, p2);

    // Corrugated W-beam rail
    const beamGeo = new THREE.BoxGeometry(length, 0.35, 0.06);
    const beam = new THREE.Mesh(beamGeo, this.steelMaterial);
    beam.position.set(0, height * 0.72, 0.04);
    beam.castShadow = true;
    group.add(beam);

    return group;
  }

  /**
   * 10. Truss-Built Inflatable "APEX RALLY" Starting Gantry
   */
  public static createStartGantry(span = 10.0, height = 6.2): THREE.Group {
    const group = new THREE.Group();
    group.name = 'StartGantry';

    // Left and Right inflatable pillars
    const pillarGeo = new THREE.CylinderGeometry(0.55, 0.65, height, 12);
    const gantryMat = new THREE.MeshStandardMaterial({
      color: 0xee5500, // Saturated rally orange
      roughness: 0.35
    });

    const leftPillar = new THREE.Mesh(pillarGeo, gantryMat);
    leftPillar.position.set(-span / 2, height / 2, 0);
    leftPillar.castShadow = true;

    const rightPillar = new THREE.Mesh(pillarGeo, gantryMat);
    rightPillar.position.set(span / 2, height / 2, 0);
    rightPillar.castShadow = true;

    // Cross beam arch
    const archGeo = new THREE.BoxGeometry(span + 1.2, 1.2, 0.85);
    const arch = new THREE.Mesh(archGeo, gantryMat);
    arch.position.set(0, height, 0);
    arch.castShadow = true;

    // Front APEX RALLY Banner
    const bannerGeo = new THREE.PlaneGeometry(span * 0.85, 0.95);
    const bannerMat = new THREE.MeshBasicMaterial({
      map: ProceduralTextures.getGantryBannerTexture(),
      side: THREE.DoubleSide
    });
    const bannerFront = new THREE.Mesh(bannerGeo, bannerMat);
    bannerFront.position.set(0, height, 0.44);

    const bannerBack = bannerFront.clone();
    bannerBack.position.z = -0.44;
    bannerBack.rotation.y = Math.PI;

    group.add(leftPillar, rightPillar, arch, bannerFront, bannerBack);
    return group;
  }

  /**
   * 11. Digital Finish Timing Arch
   */
  public static createFinishArch(span = 9.5, height = 5.8): THREE.Group {
    const group = new THREE.Group();
    group.name = 'FinishArch';

    // Aluminum truss pillars
    const trussMat = new THREE.MeshStandardMaterial({
      color: 0x999999,
      metalness: 0.85,
      roughness: 0.3
    });

    const pillarGeo = new THREE.BoxGeometry(0.6, height, 0.6);
    const leftP = new THREE.Mesh(pillarGeo, trussMat);
    leftP.position.set(-span / 2, height / 2, 0);

    const rightP = new THREE.Mesh(pillarGeo, trussMat);
    rightP.position.set(span / 2, height / 2, 0);

    // Cross truss
    const crossGeo = new THREE.BoxGeometry(span, 0.8, 0.6);
    const cross = new THREE.Mesh(crossGeo, trussMat);
    cross.position.set(0, height, 0);

    // Finish Timing Banner Screen
    const screenGeo = new THREE.PlaneGeometry(span * 0.8, 0.7);
    const screenMat = new THREE.MeshBasicMaterial({
      map: ProceduralTextures.getFinishArchBannerTexture(),
      side: THREE.DoubleSide
    });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, height, 0.32);

    group.add(leftP, rightP, cross, screen);
    return group;
  }

  /**
   * 12. Tuscan Stone Cottage Architecture
   */
  public static createTuscanCottage(width = 8.5, length = 11.0, wallHeight = 4.2): THREE.Group {
    const group = new THREE.Group();
    group.name = 'TuscanCottage';

    // Main Masonry Walls
    const wallGeo = new THREE.BoxGeometry(width, wallHeight, length);
    const cottageWallMat = new THREE.MeshStandardMaterial({
      color: 0xb59b7c, // Sandstone masonry
      roughness: 0.95
    });
    const walls = new THREE.Mesh(wallGeo, cottageWallMat);
    walls.position.y = wallHeight / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);

    // Terracotta Pitched Roof
    const roofGeo = new THREE.ConeGeometry(width * 0.78, 2.5, 4);
    const roof = new THREE.Mesh(roofGeo, this.terracottaRoofMaterial);
    roof.position.y = wallHeight + 1.25;
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.0, 1.0, length / width);
    roof.castShadow = true;
    group.add(roof);

    // Stone Chimney
    const chimneyGeo = new THREE.BoxGeometry(0.9, 2.2, 0.9);
    const chimney = new THREE.Mesh(chimneyGeo, this.stoneMaterial);
    chimney.position.set(width * 0.3, wallHeight + 1.6, length * 0.25);
    chimney.castShadow = true;
    group.add(chimney);

    return group;
  }

  /**
   * 13. Rustic Timber Barn Architecture
   */
  public static createTimberBarn(width = 9.0, length = 13.0, wallHeight = 5.0): THREE.Group {
    const group = new THREE.Group();
    group.name = 'TimberBarn';

    // Slatted timber walls
    const wallGeo = new THREE.BoxGeometry(width, wallHeight, length);
    const barnWallMat = new THREE.MeshStandardMaterial({
      color: 0x543b2b,
      roughness: 0.9
    });
    const walls = new THREE.Mesh(wallGeo, barnWallMat);
    walls.position.y = wallHeight / 2;
    walls.castShadow = true;
    group.add(walls);

    // Corrugated Gable Roof
    const roofGeo = new THREE.ConeGeometry(width * 0.75, 2.8, 4);
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x485055, // Weathered zinc slate
      roughness: 0.6,
      metalness: 0.4
    });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = wallHeight + 1.4;
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.0, 1.0, length / width);
    roof.castShadow = true;
    group.add(roof);

    return group;
  }

  /**
   * 14. Mountain Water Pump Station with Stone Trough
   */
  public static createWaterPump(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'WaterPumpStation';

    // Stone Basin / Trough
    const basinGeo = new THREE.BoxGeometry(1.6, 0.7, 1.1);
    const basin = new THREE.Mesh(basinGeo, this.stoneMaterial);
    basin.position.y = 0.35;
    basin.castShadow = true;
    group.add(basin);

    // Water surface inside trough
    const waterGeo = new THREE.PlaneGeometry(1.4, 0.9);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x225577,
      roughness: 0.1,
      metalness: 0.8
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.62;
    group.add(water);

    // Cast iron hand pump
    const pumpGeo = new THREE.CylinderGeometry(0.08, 0.12, 1.2, 8);
    const pumpMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.9,
      roughness: 0.4
    });
    const pump = new THREE.Mesh(pumpGeo, pumpMat);
    pump.position.set(-0.6, 0.95, 0);
    pump.castShadow = true;
    group.add(pump);

    return group;
  }

  /**
   * 15. Roman Stone Aqueduct / Viaduct Bridge Structure
   * Multi-span stone bridge with masonry arches for mountain gap crossings.
   */
  public static createStoneAqueduct(spans = 4, spanWidth = 14.0, height = 22.0, deckWidth = 7.5): THREE.Group {
    const group = new THREE.Group();
    group.name = 'StoneAqueduct';

    const totalLength = spans * spanWidth;

    // Deck Slab
    const deckGeo = new THREE.BoxGeometry(totalLength, 1.2, deckWidth);
    const deck = new THREE.Mesh(deckGeo, this.stoneMaterial);
    deck.position.set(0, height, 0);
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);

    // Side Parapet Walls
    const parapetGeo = new THREE.BoxGeometry(totalLength, 0.8, 0.45);
    const leftParapet = new THREE.Mesh(parapetGeo, this.stoneMaterial);
    leftParapet.position.set(0, height + 1.0, -deckWidth / 2 + 0.22);
    leftParapet.castShadow = true;

    const rightParapet = new THREE.Mesh(parapetGeo, this.stoneMaterial);
    rightParapet.position.set(0, height + 1.0, deckWidth / 2 - 0.22);
    rightParapet.castShadow = true;
    group.add(leftParapet, rightParapet);

    // Piers and Arches
    for (let s = 0; s <= spans; s++) {
      const pierX = -totalLength / 2 + s * spanWidth;
      const pierGeo = new THREE.BoxGeometry(2.4, height, deckWidth - 0.4);
      const pier = new THREE.Mesh(pierGeo, this.stoneMaterial);
      pier.position.set(pierX, height / 2, 0);
      pier.castShadow = true;
      pier.receiveShadow = true;
      group.add(pier);

      // Arch barrel underside between piers
      if (s < spans) {
        const archCenter = pierX + spanWidth / 2;
        const archGeo = new THREE.CylinderGeometry(
          spanWidth * 0.44,
          spanWidth * 0.44,
          deckWidth - 0.6,
          12,
          1,
          true,
          0,
          Math.PI
        );
        const arch = new THREE.Mesh(archGeo, this.stoneMaterial);
        arch.rotation.z = Math.PI;
        arch.rotation.x = Math.PI / 2;
        arch.position.set(archCenter, height - 1.2, 0);
        arch.castShadow = true;
        group.add(arch);
      }
    }

    return group;
  }
}

