#!/usr/bin/env node
// CAN-400 — ABI drift gate.
//
// Re-extracts the canonical ABIs from the freshly-compiled artifacts and fails
// if they differ from the committed abi/ snapshot. Drift = a Solidity change
// landed without refreshing the ABI the backend integrates against.
//
// Assumes `npm run compile` already ran (CI does it first). Framework-neutral:
// it only reads Hardhat artifacts and git, nothing else.
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

execSync('node scripts/abi/extract-abi.mjs', { cwd: ROOT, stdio: 'inherit' });

// `git diff` only sees tracked files, so a brand-new contract's ABI would land
// as untracked and the gate would pass while the snapshot is missing it
// entirely. `git status --porcelain` covers modified AND untracked.
const dirty = execSync('git status --porcelain -- abi/', { cwd: ROOT, encoding: 'utf8' }).trim();

if (dirty) {
  console.error('\n✗ committed abi/ is out of sync with the compiled contracts:\n');
  console.error(dirty);
  const untracked = dirty
    .split('\n')
    .filter((l) => l.startsWith('??'))
    .map((l) => l.slice(3));
  if (untracked.length > 0) {
    console.error(`\n  Never committed: ${untracked.join(', ')}`);
  }
  console.error(
    '\n  Run `npm run abi:extract`, review the diff, commit abi/, and update the\n' +
      '  backend typechain bindings that consume it.',
  );
  process.exit(1);
}
console.log('✓ abi/ is in sync with the compiled contracts');
