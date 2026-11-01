# Lane 3 patch: body motion + camera (base 89aa93a, branch phase6-car-model)

Files touched: `src/vehicles/CustomRallyVehicle.ts` (visual section only), `src/core/ChaseCamera.ts`,
new `lane3_spec.ts` (frozen), new `lane3_frames.ts` (measurement). No physics, tyre, steering, powertrain or test edits.

## Paste to Antigravity
```
Create branch lane3-body-camera from commit 89aa93a. Run `git apply --check lane3.patch`, then apply it.
Run npm run build and ALL suites (replay, test:keyboard, test:v6, test:user-session, test:reverse,
test:browser-sync, measure:v4, measure:v1). Baseline: replay 6 MATCH + 1 REGRESSION (Window 3b), keyboard 14/14,
everything else passing. Then run `npx tsx lane3_frames.ts` and paste its FULL raw output.
Report raw outputs only; do not edit lane3_spec.ts, thresholds or tests, and do not try to make failures pass.
Do not merge to main. Push the branch. No reference-reel material anywhere.
```

## Outside my lane (needs your/Antigravity's decision; not in the patch)
Trees are instanced meshes with no colliders, so the camera cannot raycast them. The patch adds
`ChaseCamera.setTrunkObstacles([{x,z,r}])`. Until it is called, avoidance is off and nothing changes.
Wiring (2 small edits in files Lane 3 does not own):
1. `src/world/RallyStageWorld.ts`, in the tree loop (after `dummy.position.set(x, y, z)`):
   `this.trunkObstacles.push({ x, z, r: (isPine ? 0.52 : 0.68) * scale });`  (declare `private trunkObstacles: {x:number;z:number;r:number}[] = [];`
   and `public getTrunkObstacles() { return this.trunkObstacles; }`; move `isPine` above the push)
2. `src/main.ts`, after `const camera = new ChaseCamera(...)`: `camera.setTrunkObstacles(rallyWorld.getTrunkObstacles());`
Note: tree distances use `Math.random()`, so the forest differs every load; seed it if you want reproducible camera tests.

## What changed
- Droop: was rear-only and scripted by `inputs.handbrake` (+0.65). Now all four wheels, driven only by
  unload = 1 - Fz/2893 N (airborne = 1), smoothstep(0.55, 0.95), max visualDroopExtension*exaggeration. No input flags read.
- Pitch: same 30 deg/s (1 deg/frame at 30 fps) limit roll already had. Roll unchanged (already latG-driven).
- Camera off-axis: was capped near 36 deg (atan 0.72). Now 1.1 x slip angle, cap 45 deg.
- Camera trunk avoidance: shortens follow distance (pull-in <= 1.5 m per 30 fps frame, slow release) + hard push-out, 0.5 m padding.

## Known limits / not done
- Not run: no node_modules/network here. Syntax-checked only; none of the 8 suites or lane3_frames.ts have been executed by me.
- Droop thresholds (0.55/0.95) are first estimates. Old droop had a +0.65 scripted term at handbrake, so without it the
  rear hang at 2.8-3.2 s may be too small. If lane3_frames.ts shows rearDroop FAIL, the fix is in those two constants (or Lane 2 travel).
- Roll/pitch still use smoothedLateralG / smoothedLongitudinalG (permitted inputs) rather than per-wheel Fz, to protect test:keyboard 14/14. Heave not implemented.
- Camera change could affect nothing in physics suites (visual only) but test:keyboard reads currentVisualRoll: pitch limiter does not touch roll.
