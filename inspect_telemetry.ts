import fs from 'fs';
const csv = fs.readFileSync('hardpack_reference_telemetry.csv', 'utf8').trim().split('\n');
console.log(csv[0]);
for (let i = 1; i < csv.length; i++) {
  const parts = csv[i].split(',').map(p => p.trim());
  const t = parseFloat(parts[1]);
  if (t >= 0.0 && t <= 2.1) {
    if (t >= 1.6 || i % 10 === 0) {
      console.log(`t=${parts[1].padStart(5)} | refSpd=${parts[3].padStart(5)} | gear=${parts[4]} | thr=${parts[5]} | brk=${parts[6]} | steer=${parts[8]} | hb=${parts[9]}`);
    }
  }
}
