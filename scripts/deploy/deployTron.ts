import hre from "hardhat";
import * as dotenv from "dotenv";
import { TronWeb } from "tronweb";

dotenv.config();

// Generic TronWeb deploy for a zero-constructor-arg contract, from the Tron (paris)
// artifacts. Set TRON_CONTRACT to the contract name (HTLC, MultiBalanceChecker,
// FeeVault) and run with --config hardhat.tron.config.ts. Hardhat/ethers cannot
// broadcast to Tron (protobuf tx format, not Ethereum RLP), so TronWeb signs + sends.
// The deployer becomes the contract owner where it is Ownable (HTLC, FeeVault). See TRON.md.
const DEFAULT_FULL_HOST = "https://nile.trongrid.io";
const DEFAULT_FEE_LIMIT_SUN = 5_000_000_000; // 5000 TRX ceiling for deploy energy

async function main(): Promise<void> {
  const name = process.env.TRON_CONTRACT;
  if (!name) {
    throw new Error(
      "TRON_CONTRACT is not set — the contract to deploy (HTLC, MultiBalanceChecker, FeeVault)",
    );
  }
  // Resolves by contract name regardless of the source subdir (e.g. contracts/utils/).
  const artifact = await hre.artifacts.readArtifact(name);

  const privateKey = process.env.TRON_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "TRON_PRIVATE_KEY is not set — the deployer becomes the contract owner, use the ops key",
    );
  }
  const fullHost = process.env.TRON_FULL_HOST || DEFAULT_FULL_HOST;
  const feeLimit = Number(process.env.TRON_FEE_LIMIT_SUN) || DEFAULT_FEE_LIMIT_SUN;

  const tronWeb = new TronWeb({ fullHost, privateKey });
  const deployer = tronWeb.address.fromPrivateKey(privateKey);
  console.log(`Deploying ${name} to ${fullHost} as ${deployer} (feeLimit ${feeLimit} SUN)`);

  const contract = (await tronWeb.contract().new({
    abi: artifact.abi,
    bytecode: String(artifact.bytecode).replace(/^0x/, ""),
    feeLimit,
    callValue: 0,
    parameters: [], // HTLC / MultiBalanceChecker / FeeVault all have zero-arg constructors
  })) as { address: string };

  const hex = contract.address;
  console.log(`${name} deployed:`);
  console.log(`  base58: ${tronWeb.address.fromHex(hex)}`);
  console.log(`  hex:    ${hex}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
