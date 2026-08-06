import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { TronWeb } from "tronweb";

dotenv.config();

// Deploy the paris-compiled (TVM-safe) HTLC.sol to a Tron network via TronWeb.
// Hardhat/ethers cannot deploy to Tron — Tron txns use a protobuf format, not
// Ethereum RLP — so TronWeb signs and broadcasts. The deployer becomes the HTLC
// owner + feeRecipient (same as on EVM). Compile first with `npm run compile:tron`.
const ARTIFACT = path.join(
  __dirname,
  "..",
  "..",
  "artifacts-tron",
  "contracts",
  "HTLC.sol",
  "HTLC.json",
);
const DEFAULT_FULL_HOST = "https://nile.trongrid.io";
const DEFAULT_FEE_LIMIT_SUN = 5_000_000_000; // 5000 TRX ceiling for deploy energy

async function main(): Promise<void> {
  const fullHost = process.env.TRON_FULL_HOST || DEFAULT_FULL_HOST;
  const privateKey = process.env.TRON_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "TRON_PRIVATE_KEY is not set — the deployer becomes the HTLC owner + feeRecipient, use the intended ops key",
    );
  }
  const feeLimit = Number(process.env.TRON_FEE_LIMIT_SUN) || DEFAULT_FEE_LIMIT_SUN;

  if (!fs.existsSync(ARTIFACT)) {
    throw new Error(`HTLC artifact missing at ${ARTIFACT} — run \`npm run compile:tron\` first`);
  }
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT, "utf8"));

  const tronWeb = new TronWeb({ fullHost, privateKey });
  const deployer = tronWeb.address.fromPrivateKey(privateKey);
  console.log(`Deploying HTLC to ${fullHost} as ${deployer} (feeLimit ${feeLimit} SUN)`);

  const contract = (await tronWeb.contract().new({
    abi: artifact.abi,
    bytecode: String(artifact.bytecode).replace(/^0x/, ""),
    feeLimit,
    callValue: 0,
    parameters: [], // HTLC() takes no constructor args
  })) as { address: string };

  const hex = contract.address;
  const base58 = tronWeb.address.fromHex(hex);
  console.log("HTLC deployed:");
  console.log(`  base58: ${base58}`);
  console.log(`  hex:    ${hex}`);
  console.log(
    "Deployer is owner + feeRecipient. Mirror the EVM fee setup (setFeeRecipient -> FeeVault, setFeeRate) if fees are enabled.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
