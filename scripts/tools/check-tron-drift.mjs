#!/usr/bin/env node
// CAN-599 — TVM port drift gate.
//
// tron-solc tops out at 0.8.26 while the canonical contracts pin 0.8.33, so
// the Tron build compiles COPIES under tron/contracts/. The only tolerated
// divergence is the `pragma solidity` line; any other byte means a Solidity
// change landed without being mirrored into the TVM port (or vice versa).
// Framework-neutral: reads the two source trees, nothing else.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

// canonical path → tron copy path (both relative to repo root)
const MIRRORED = [
  ['contracts/HTLC.sol', 'tron/contracts/HTLC.sol'],
  ['contracts/interfaces/IHTLC.sol', 'tron/contracts/interfaces/IHTLC.sol'],
  ['contracts/interfaces/IPermit2.sol', 'tron/contracts/interfaces/IPermit2.sol'],
];

const PRAGMA_RE = /^pragma solidity .+;$/;

function comparable(path) {
  return readFileSync(join(ROOT, path), 'utf8')
    .split('\n')
    .filter((line) => !PRAGMA_RE.test(line.trim()));
}

let failed = false;
for (const [canonical, tron] of MIRRORED) {
  if (!existsSync(join(ROOT, tron))) {
    console.error(`✗ ${tron} is missing — the TVM port does not mirror ${canonical}`);
    failed = true;
    continue;
  }
  const a = comparable(canonical);
  const b = comparable(tron);
  if (a.length !== b.length || a.some((line, i) => line !== b[i])) {
    const at = a.findIndex((line, i) => line !== b[i]);
    console.error(`✗ ${tron} diverges from ${canonical} beyond the pragma line`);
    console.error(`  first difference at non-pragma line ${at === -1 ? '(length)' : at + 1}:`);
    console.error(`  canonical: ${JSON.stringify(a[at] ?? '<eof>')}`);
    console.error(`  tron:      ${JSON.stringify(b[at] ?? '<eof>')}`);
    failed = true;
  }
}

if (failed) {
  console.error(
    '\n  The Tron copies must be byte-identical to the canonical sources except\n' +
      '  for the pragma line (0.8.26 — the tron-solc ceiling). Re-copy the file,\n' +
      '  restore the pragma, and re-run `npm run tron:drift`.',
  );
  process.exit(1);
}
console.log('✓ tron/contracts mirrors the canonical sources (pragma-only divergence)');
