import RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS_CONFIG } from '../core/Constants';

export class PhysicsWorld {
  public rapier!: typeof RAPIER;
  public world!: RAPIER.World;
  private timeAccumulator = 0;
  private isReady = false;

  public async init(): Promise<void> {
    await RAPIER.init();
    this.rapier = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: PHYSICS_CONFIG.GRAVITY, z: 0 });
    this.isReady = true;
  }

  public get ready(): boolean {
    return this.isReady;
  }

  /**
   * Run 120 Hz substepping decoupled from variable render frame time dt.
   * Calls onSubstep callback on each 120 Hz step so vehicle controllers can apply forces/updates.
   */
  public step(frameDt: number, onSubstep: (substepDt: number) => void): void {
    if (!this.isReady) return;

    // Clamp frameDt to avoid huge lag spike spiral
    const clampedFrameDt = Math.min(frameDt, 0.1);
    this.timeAccumulator += clampedFrameDt;

    const dt = PHYSICS_CONFIG.SUBSTEP_DT; // 1/120s = ~0.00833s
    let substeps = 0;

    while (this.timeAccumulator >= dt && substeps < PHYSICS_CONFIG.MAX_SUBSTEPS_PER_FRAME) {
      onSubstep(dt);
      this.world.step();
      this.timeAccumulator -= dt;
      substeps++;
    }

    // Prevent death spiral if tab was in background or frozen for > 150ms
    if (this.timeAccumulator > 0.15) {
      this.timeAccumulator = dt;
    }
  }
}
