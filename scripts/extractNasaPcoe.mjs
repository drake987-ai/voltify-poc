// Turns the NASA PCoE Li-ion battery aging files (B0005, B0006, B0007, B0018 .mat) into the small JSON
// the Evidence screen uses: per cell, the discharge capacity of every cycle and every impedance
// measurement (Re + Rct) with the capacity at that moment.
//
//   1. Download "5. Battery Data Set.zip" from the NASA Prognostics Data Repository
//      (https://www.nasa.gov/intelligent-systems-division/discovery-and-systems-health/pcoe/pcoe-data-set-repository/)
//      and unpack "1. BatteryAgingARC-FY08Q4.zip" from it.
//   2. In a scratch folder (NOT in this project, mat-for-js is GPL-3.0): npm install mat-for-js
//   3. From that scratch folder: node <project>/scripts/extractNasaPcoe.mjs --in <folder with the .mat files> --out <project>/src/data/nasaPcoe.json
//
// The raw files are about 56 MB; the JSON is about 20 KB. Only these two quantities are kept.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const input = args.in;
const output = args.out ?? 'src/data/nasaPcoe.json';
if (!input) {
  console.error('usage: node scripts/extractNasaPcoe.mjs --in <folder with B0005.mat ...> [--out src/data/nasaPcoe.json]');
  process.exit(1);
}

// mat-for-js is looked up from the folder the script is run in (a scratch folder), not from this project.
let read;
try {
  const here = createRequire(path.join(process.cwd(), 'noop.js'));
  ({ read } = await import(pathToFileURL(here.resolve('mat-for-js')).href));
} catch {
  console.error('mat-for-js was not found from the current folder: run `npm install mat-for-js` in a scratch folder and run this script from there.');
  process.exit(1);
}

const round = (x, dp) => Math.round(x * 10 ** dp) / 10 ** dp;
const out = {};
for (const name of ['B0005', 'B0006', 'B0007', 'B0018']) {
  const buf = fs.readFileSync(path.join(input, `${name}.mat`));
  const mat = read(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const cycles = mat.data[name].cycle;
  const capacity = [];
  const impedance = [];
  let lastCap = null;
  let discharges = 0;
  for (const k of Object.keys(cycles)) {
    const cy = cycles[k];
    if (cy.type === 'discharge') {
      discharges++;
      lastCap = Array.isArray(cy.data.Capacity) ? cy.data.Capacity[0] : cy.data.Capacity;
      capacity.push([discharges, round(lastCap, 4)]);
    } else if (cy.type === 'impedance' && lastCap !== null) {
      const re = cy.data.Re[0];
      const rct = cy.data.Rct[0];
      if (Number.isFinite(re) && Number.isFinite(rct)) impedance.push([discharges, round(lastCap, 4), round(re, 5), round(rct, 5)]);
    }
  }
  out[name] = { capacity, impedance };
  console.log(name, 'discharge cycles', capacity.length, 'impedance measurements', impedance.length);
}
fs.writeFileSync(output, JSON.stringify(out));
console.log('wrote', output, fs.statSync(output).size, 'bytes');
