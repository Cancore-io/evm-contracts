import hre from "hardhat";
import * as dotenv from "dotenv";
import { TronWeb } from "tronweb";

dotenv.config();

// Deploy TestToken TRC20s to a Tron network via TronWeb — TEST ENVIRONMENTS ONLY
// (Nile / Shasta). Mirrors scripts/deploy/deployTokens.ts for TVM: the same
// TestToken.sol (paris-compiled into artifacts-tron via --config hardhat.tron.config.ts),
// which has a (name, symbol) constructor and an open mint(). Unlike deployTron.ts
// (zero-arg only) this passes the constructor args and mints an initial supply.
//
// The symbol set matches the production Tron token list so test envs trade the
// same pairs; on TEST all are plain 18-decimal TestTokens (as on the EVM testnets),
// NOT the real per-token decimals of the mainnet originals.
const DEFAULT_FULL_HOST = "https://nile.trongrid.io";
const DEFAULT_FEE_LIMIT_SUN = 5_000_000_000; // 5000 TRX ceiling per deploy
const INITIAL_SUPPLY = (1_000_000n * 10n ** 18n).toString(); // 1,000,000 tokens, 18 decimals

const TOKENS: ReadonlyArray<{ name: string; symbol: string }> = [
  { name: "Tether USD", symbol: "USDT" },
  { name: "USD Coin", symbol: "USDC" },
  { name: "World Liberty Financial USD", symbol: "USD1" },
  { name: "Wrapped Ether", symbol: "WETH" },
  { name: "Wrapped BTC", symbol: "WBTC" },
  { name: "Wrapped TRX", symbol: "WTRX" },
];

interface TronContractMethod {
  send(options?: Record<string, unknown>): Promise<string>;
}
type TronDeployed = { address: string } & Record<string, (...args: unknown[]) => TronContractMethod>;

async function main(): Promise<void> {
  const privateKey = process.env.TRON_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("TRON_PRIVATE_KEY is not set — the deployer mints + owns the test supply");
  }
  const fullHost = process.env.TRON_FULL_HOST || DEFAULT_FULL_HOST;
  const feeLimit = Number(process.env.TRON_FEE_LIMIT_SUN) || DEFAULT_FEE_LIMIT_SUN;

  const artifact = await hre.artifacts.readArtifact("TestToken");
  const tronWeb = new TronWeb({ fullHost, privateKey });
  const deployer = tronWeb.address.fromPrivateKey(privateKey);
  console.log(`Deploying ${TOKENS.length} TestToken TRC20s to ${fullHost} as ${deployer}`);

  const deployed: Array<{ symbol: string; base58: string; hex: string }> = [];
  for (const token of TOKENS) {
    const contract = (await tronWeb.contract().new({
      abi: artifact.abi,
      bytecode: String(artifact.bytecode).replace(/^0x/, ""),
      feeLimit,
      callValue: 0,
      parameters: [token.name, token.symbol],
    })) as TronDeployed;

    // Open mint() — seed the deployer with the initial supply. `.new()` resolves
    // after the deploy is on-chain, so the freshly deployed contract is callable.
    await contract.mint(INITIAL_SUPPLY).send({ feeLimit });

    const base58 = tronWeb.address.fromHex(contract.address);
    deployed.push({ symbol: token.symbol, base58, hex: contract.address });
    console.log(`  ${token.symbol.padEnd(5)} ${base58}`);
  }

  console.log("\nDeployed Tron test tokens (base58 / hex):");
  for (const d of deployed) console.log(`  ${d.symbol.padEnd(5)} ${d.base58}  ${d.hex}`);
  console.log("\nWire these base58 addresses into the backend Tron token config for this env.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
