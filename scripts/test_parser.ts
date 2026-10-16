// Standalone parser test - validates surf_ranch_2018_raw.txt parses cleanly
// without needing a DB connection.

import { readFileSync } from 'node:fs';

const RAW_FILE = process.argv[2] || 'data/surf_ranch_2018_raw.txt';
const TOTAL_TOLERANCE = 0.01;

interface ParsedRow {
  rank: number;
  fullName: string;
  waves: number[];
  total: number;
}

function parseLine(line: string, lineNumber: number): ParsedRow {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) throw new Error(`Line ${lineNumber}: missing colon`);
  const rank = parseInt(line.slice(0, colonIdx).trim(), 10);
  const rest = line.slice(colonIdx + 1);
  const parts = rest.split('|').map(s => s.trim());
  if (parts.length !== 8) throw new Error(`Line ${lineNumber}: expected 8 parts, got ${parts.length}`);
  const fullName = parts[0];
  const waves = parts.slice(1, 7).map(s => parseFloat(s));
  const total = parseFloat(parts[7]);

  // Surf Ranch scoring: heat_total = best left score + best right score
  // Wave order is L1 R1 L2 R2 L3 R3 → lefts at indices 0,2,4; rights at 1,3,5
  const bestLeft = Math.max(waves[0], waves[2], waves[4]);
  const bestRight = Math.max(waves[1], waves[3], waves[5]);
  const computed = bestLeft + bestRight;
  if (Math.abs(computed - total) > TOTAL_TOLERANCE) {
    throw new Error(`Line ${lineNumber} (${fullName}): best-left+best-right ${computed.toFixed(2)} != total ${total.toFixed(2)}`);
  }

  return { rank, fullName, waves, total };
}

const text = readFileSync(RAW_FILE, 'utf-8');
let section: 'qualifying' | 'final' | null = null;
const qualifying: ParsedRow[] = [];
const final: ParsedRow[] = [];
const errors: string[] = [];

text.split('\n').forEach((raw, i) => {
  const line = raw.trim();
  if (!line || line.startsWith('#')) return;
  if (line === '=== FINAL ===') { section = 'final'; return; }
  if (line === '=== QUALIFYING ===') { section = 'qualifying'; return; }
  try {
    const row = parseLine(line, i + 1);
    if (section === 'qualifying') qualifying.push(row);
    else if (section === 'final') final.push(row);
  } catch (e) {
    errors.push((e as Error).message);
  }
});

console.log(`Qualifying: ${qualifying.length} rows`);
console.log(`Final: ${final.length} rows`);
if (errors.length > 0) {
  console.log(`\n${errors.length} errors:`);
  errors.forEach(e => console.log(`  ${e}`));
  process.exit(1);
} else {
  console.log('\n✓ All lines parsed cleanly, all wave totals validated.');
}

console.log('\nFirst 3 qualifying rows:');
qualifying.slice(0, 3).forEach(r => console.log(`  ${r.rank}. ${r.fullName} - waves [${r.waves.join(', ')}] total ${r.total}`));
console.log('\nFinal:');
final.forEach(r => console.log(`  ${r.rank}. ${r.fullName} - waves [${r.waves.join(', ')}] total ${r.total}`));
