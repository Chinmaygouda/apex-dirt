import json
import math
import subprocess

def test_corrected_spline():
    cmd = [
        'node', '--input-type=module', '-e', '''
        import * as THREE from "three";
        import * as BP from "./src/world/BlueprintStageGeometry.ts";

        // Sample dense spline points from BP.stage (every 10m)
        const step = 10;
        const count = Math.floor(BP.stage.len / step);
        const knots = [];

        for (let i = 0; i <= count; i++) {
          const s = i * step;
          const p = BP.at(BP.stage, s);
          // Sample terrain height at exact curve position
          const rawH = BP.heightAt(p.x, p.z);
          // Road deck is 0.35m above terrain
          knots.push(new THREE.Vector3(p.x, rawH + 0.35, p.z));
        }

        const spline = new THREE.CatmullRomCurve3(knots, false, "centripetal");
        const totalLen = spline.getLength();

        let clippingCount = 0;
        const n = 240;
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          const pt = spline.getPointAt(u);
          const rawH = BP.heightAt(pt.x, pt.z);
          // Clearance check: road deck must be strictly above ground
          if (rawH > pt.y) {
            clippingCount++;
          }
        }

        console.log(JSON.stringify({
          totalLen,
          clippingCount
        }));
        '''
    ]

    res = subprocess.run(cmd, capture_output=True, text=True, cwd='.')
    if res.returncode != 0:
        print("Error:", res.stderr)
        return False
    data = json.loads(res.stdout)
    print("Corrected spline total length:", data['totalLen'], "m")
    print("Clipping count with dense sampling:", data['clippingCount'])
    return data['clippingCount'] == 0

test_corrected_spline()

