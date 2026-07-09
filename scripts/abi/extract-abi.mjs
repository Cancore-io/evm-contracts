#!/usr/bin/env node
// CAN-400 — snapshot canonical ABIs from Hardhat artifacts.
//
// The backend consumes these contract ABIs (typechain). A change to a Solidity
// interface that is not reflected downstream breaks integration silently at
// runtime. This writes a stable, reviewable ABI per production contract to
// abi/<Name>.json so a drift gate can diff code-derived vs committed.
//
// Uses the existing Hardhat artifacts only — no framework change. Run
// `npm run compile` first (or the CI does). Test/mock contracts are excluded.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const ARTIFACTS = join(ROOT, 'artifacts', 'contracts');
const OUT = join(ROOT, 'abi');

// Production surface only — skip test tokens, mocks, echidna harnesses.
const EXCLUDE = /(^|\/)(mocks|test)(\/|$)/;

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith('.json') && !name.endsWith('.dbg.json')) acc.push(p);
  }
  return acc;
}

mkdirSync(OUT, { recursive: true });
const written = [];
for (const file of walk(ARTIFACTS)) {
  const rel = relative(ARTIFACTS, file);
  if (EXCLUDE.test(rel)) continue;
  const art = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(art.abi) || art.abi.length === 0) continue; // libraries w/o ABI
  const name = art.contractName;
  // Stable pretty-print so diffs are meaningful line-by-line.
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(art.abi, null, 2) + '\n');
  written.push(name);
}

written.sort();
console.log(`extracted ${written.length} ABIs -> abi/`);
for (const n of written) console.log(`  ${n}`);
