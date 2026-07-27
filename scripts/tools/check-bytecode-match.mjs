import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const artifactsDir = path.join(rootDir, 'artifacts/contracts');
const baselineFile = path.join(rootDir, 'abi/bytecode-hashes.json');

const targetContracts = [
  { contract: 'HTLC', file: 'HTLC.sol/HTLC.json' },
  { contract: 'FeeVault', file: 'FeeVault.sol/FeeVault.json' },
  { contract: 'MultiBalanceChecker', file: 'utils/MultiBalanceChecker.sol/MultiBalanceChecker.json' },
];

function hashString(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function run() {
  console.log('=== Checking EVM Bytecode Reproduction & Matching (CAN-417) ===');

  const currentHashes = {};

  for (const item of targetContracts) {
    const artifactPath = path.join(artifactsDir, item.file);
    if (!fs.existsSync(artifactPath)) {
      console.error(`Artifact not found at ${artifactPath}. Please run 'npm run compile' first.`);
      process.exit(1);
    }
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const bytecode = artifact.bytecode || '';
    const deployedBytecode = artifact.deployedBytecode || '';

    currentHashes[item.contract] = {
      bytecodeHash: hashString(bytecode),
      deployedBytecodeHash: hashString(deployedBytecode),
      bytecodeLength: bytecode.length,
      deployedBytecodeLength: deployedBytecode.length,
    };
  }

  const isGenerate = process.argv.includes('--generate');

  if (isGenerate || !fs.existsSync(baselineFile)) {
    fs.writeFileSync(baselineFile, JSON.stringify(currentHashes, null, 2) + '\n');
    console.log(`Generated new bytecode hash baseline at ${baselineFile}`);
    console.dir(currentHashes);
    process.exit(0);
  }

  const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  let mismatchCount = 0;

  for (const contract of Object.keys(currentHashes)) {
    const expected = baseline[contract];
    const actual = currentHashes[contract];

    if (!expected) {
      console.warn(`WARNING: Contract ${contract} not found in baseline.`);
      mismatchCount++;
      continue;
    }

    if (expected.bytecodeHash !== actual.bytecodeHash || expected.deployedBytecodeHash !== actual.deployedBytecodeHash) {
      console.error(`ERROR: Bytecode mismatch for contract ${contract}!`);
      console.error(`  Expected deployed hash: ${expected.deployedBytecodeHash}`);
      console.error(`  Actual deployed hash:   ${actual.deployedBytecodeHash}`);
      mismatchCount++;
    } else {
      console.log(`✓ ${contract}: Bytecode matches baseline exactly.`);
    }
  }

  if (mismatchCount > 0) {
    console.error(`Bytecode match failed with ${mismatchCount} mismatch(es). Run with --generate if intentional.`);
    process.exit(1);
  }

  console.log('All bytecode matches baseline successfully.');
}

run();
