import json
import math
import subprocess

def run_inspector():
    print("==================================================")
    print("   AGENT 2: TOP-DOWN ROAD INSPECTION & AUDIT      ")
    print("==================================================")

    cmd = [
        'node', '--input-type=module', '-e', '''
        import * as THREE from "three";
        import * as BP from "./src/world/BlueprintStageGeometry.ts";

        // Dense 10m knots as updated in RallyStageWorld.ts
        const step = 10;
        const count = Math.floor(BP.stage.len / step);
        const knots = [];
        for (let i = 0; i <= count; i++) {
          const s = i * step;
          const p = BP.at(BP.stage, s);
          const h = BP.heightAt(p.x, p.z);
          knots.push(new THREE.Vector3(p.x, h + 0.35, p.z));
        }

        const spline = new THREE.CatmullRomCurve3(knots, false, "centripetal");
        const totalLen = spline.getLength();

        const samples = [];
        const n = 240;
        let underMountainCount = 0;
        let minH = 999, maxH = -999;

        for (let i = 0; i <= n; i++) {
          const u = i / n;
          const pt = spline.getPointAt(u);
          const rawGround = BP.heightAt(pt.x, pt.z);
          
          if (rawGround > pt.y) {
            underMountainCount++;
          }

          minH = Math.min(minH, pt.y);
          maxH = Math.max(maxH, pt.y);

          const s = u * totalLen;
          const w = BP.roadWidth(s);

          samples.push({
            s: Math.round(s),
            x: Math.round(pt.x * 10) / 10,
            z: Math.round(pt.z * 10) / 10,
            roadY: Math.round(pt.y * 10) / 10,
            rawGroundY: Math.round(rawGround * 10) / 10,
            width: Math.round(w * 10) / 10
          });
        }

        console.log(JSON.stringify({
          totalLength: totalLen,
          minHeight: minH,
          maxHeight: maxH,
          underMountainCount,
          samplesCount: samples.length,
          sampleEvery10m: samples.filter((_, i) => i % 24 === 0)
        }));
        '''
    ]

    res = subprocess.run(cmd, capture_output=True, text=True, cwd='.')
    if res.returncode != 0:
        print("Agent 2 inspection probe error:", res.stderr)
        return False

    data = json.loads(res.stdout)
    print(f"Total Stage 3D Length: {data['totalLength']:.2f} m (Target: 2400 m)")
    print(f"Elevation Profile: min={data['minHeight']:.2f}m, max={data['maxHeight']:.2f}m, relief={data['maxHeight'] - data['minHeight']:.2f}m")
    print(f"Under-Mountain Dip Check: {data['underMountainCount']} points clipping through raw ground")
    print("\nCheckpoint Chainage Samples:")
    for s in data['sampleEvery10m']:
        print(f"  s={s['s']:4d}m | Pos: ({s['x']:6.1f}, {s['z']:6.1f}) | RoadDeck: {s['roadY']:5.1f}m | Width: {s['width']:4.1f}m")

    # Audit assertions
    assert 2380 <= data['totalLength'] <= 2450, f"Stage length must be ~2400m, got {data['totalLength']}"
    assert data['underMountainCount'] == 0, "Road must not dip under mountains!"
    print("\n>>> AGENT 2 AUDIT RESULT: PASSED ALL CLEARANCE & GEOMETRY CRITERIA <<<")
    return True

if __name__ == '__main__':
    run_inspector()
