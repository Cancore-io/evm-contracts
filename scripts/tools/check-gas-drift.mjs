import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const reportPath = path.join(rootDir, 'reports/gas-report.txt');
const baselinePath = path.join(rootDir, 'reports/gas-baseline.json');

const TOLERANCE_PERCENT = 3.0; // Max allowed gas increase tolerance

function parseGasReport(reportText) {
  const lines = reportText.split('\n');
  const methods = [];
  let inTable = false;
  let currentContract = '';

  for (const line of lines) {
    if (line.includes('Contract') && line.includes('Method')) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;

    // Line format: | Contract · Method · Min · Max · Avg · # calls · usd |
    const parts = line.split(/[·|]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 5 && !parts[0].startsWith('---')) {
      const contract = parts[0] || currentContract;
      const method = parts[1];
      const min = parseInt(parts[2], 10);
      const max = parseInt(parts[3], 10);
      const avg = parseInt(parts[4], 10);

      if (contract && method && method !== '-' && !isNaN(avg) && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(method)) {
        currentContract = contract;
        methods.push({ contract, method, min, max, avg });
      }
    }
  }

  return methods;
}

function run() {
  console.log('=== Checking EVM Gas Regression Gates (CAN-417) ===');

  if (!fs.existsSync(reportPath)) {
    console.warn(`Gas report file not found at ${reportPath}. Run 'REPORT_GAS=true npm test' to generate.`);
    // If no report exists yet, exit gracefully so CI won't fail before test runs
    process.exit(0);
  }

  const reportText = fs.readFileSync(reportPath, 'utf8');
  const currentMethods = parseGasReport(reportText);
  const currentMap = {};
  for (const m of currentMethods) {
    currentMap[`${m.contract}.${m.method}`] = m.avg;
  }

  const isGenerate = process.argv.includes('--generate');

  if (isGenerate || !fs.existsSync(baselinePath)) {
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify(currentMap, null, 2) + '\n');
    console.log(`Saved gas baseline to ${baselinePath} (${Object.keys(currentMap).length} methods monitored).`);
    process.exit(0);
  }

  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  let regressionCount = 0;

  console.log(`Comparing gas usage against baseline (tolerance: ±${TOLERANCE_PERCENT}%)...`);

  for (const [key, avgGas] of Object.entries(currentMap)) {
    const baseGas = baseline[key];
    if (baseGas === undefined) {
      console.log(`  NEW method: ${key} (avg: ${avgGas} gas)`);
      continue;
    }

    const diff = avgGas - baseGas;
    const percent = (diff / baseGas) * 100;

    if (percent > TOLERANCE_PERCENT) {
      console.error(`❌ REGRESSION: ${key} gas increased by +${percent.toFixed(2)}% (${baseGas} -> ${avgGas})`);
      regressionCount++;
    } else if (percent < -TOLERANCE_PERCENT) {
      console.log(`⚡ OPTIMIZATION: ${key} gas decreased by ${percent.toFixed(2)}% (${baseGas} -> ${avgGas})`);
    } else {
      console.log(`✓ ${key}: ${avgGas} gas (${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%)`);
    }
  }

  if (regressionCount > 0) {
    console.error(`Gas regression gate failed: ${regressionCount} method(s) exceeded +${TOLERANCE_PERCENT}% threshold.`);
    process.exit(1);
  }

  console.log('Gas regression gate passed successfully.');
}

run();
