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

try {
  execSync('git diff --exit-code -- abi/', { cwd: ROOT, stdio: 'inherit' });
} catch {
  console.error(
    '\n✗ committed abi/ is stale — a contract ABI changed.\n' +
      '  Run `npm run abi:extract`, review the diff, commit abi/, and update the\n' +
      '  backend typechain bindings that consume it.',
  );
  process.exit(1);
}
console.log('✓ abi/ is in sync with the compiled contracts');
