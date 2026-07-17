import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

const XRESERVE_CONTRACT = "0x8888888199b2Df864bf678259607d6D5EBb4e3Ce";
const USDC_MAINNET = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const CANTON_DOMAIN = 10001;

/**
 * Canton party-ID shape: `<hint>::<fingerprint-hex>` (e.g. `alice::1220ab…`).
 * `remoteRecipient` is a one-way keccak of this string with no checksum, so a
 * typo, a stray space or a stale value mints USDCx to a party that does not
 * exist — with the USDC already burnt into xReserve. Validate before hashing.
 */
const CANTON_PARTY_ID = /^[A-Za-z0-9_\-.]+::[0-9a-fA-F]{16,}$/;

const XRESERVE_ABI = [
  "function depositToRemote(uint256 value, uint32 remoteDomain, bytes32 remoteRecipient, address localToken, uint256 maxFee, bytes calldata hookData) external",
  "event DepositToRemote(uint64 indexed nonce, uint32 indexed remoteDomain, bytes32 indexed remoteRecipient, address localToken, uint256 value, uint256 fee, bytes32 depositMessageHash)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
];

async function main() {
  const rawRecipient = process.env.CANTON_RECIPIENT;
  const depositAmount = process.env.DEPOSIT_AMOUNT;
  const maxFeeRaw = process.env.MAX_FEE ?? "0";

  if (!rawRecipient) {
    throw new Error("CANTON_RECIPIENT not set in .env (Canton party ID, e.g. alice::1220ab…)");
  }
  // No default amount: this moves real money — the caller must state it.
  if (!depositAmount) {
    throw new Error("DEPOSIT_AMOUNT not set in .env (amount of USDC to deposit, e.g. 10)");
  }

  const cantonRecipient = rawRecipient.trim();
  if (cantonRecipient !== rawRecipient) {
    console.warn("⚠  CANTON_RECIPIENT had surrounding whitespace — trimmed before hashing.");
  }
  if (!CANTON_PARTY_ID.test(cantonRecipient)) {
    throw new Error(
      `CANTON_RECIPIENT is not a valid Canton party ID: "${cantonRecipient}"\n` +
        "Expected <hint>::<fingerprint-hex>, e.g. alice::1220ab34…\n" +
        "It is hashed with keccak256 and has no checksum — a wrong value burns the USDC " +
        "and mints USDCx to a party that does not exist. Aborting."
    );
  }

  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error("No signer configured — set MAINNET_PRIVATE_KEY (or PRIVATE_KEY) in .env");
  }
  console.log("Signer:", signer.address);

  const { chainId } = await ethers.provider.getNetwork();
  console.log("Network chainId:", chainId.toString());

  // Fail-safe on Ethereum mainnet: this is irreversible, so require an explicit
  // out-of-band confirmation rather than letting `npm run` fire it silently.
  if (chainId === 1n && process.env.CONFIRM_DEPOSIT !== "yes") {
    throw new Error(
      "Refusing to move real USDC on Ethereum mainnet without CONFIRM_DEPOSIT=yes.\n" +
        `  recipient: ${cantonRecipient}\n` +
        `  amount:    ${depositAmount} USDC\n` +
        "Re-check the party ID against the Canton wallet, then re-run with CONFIRM_DEPOSIT=yes."
    );
  }

  const usdc = new ethers.Contract(USDC_MAINNET, ERC20_ABI, signer);
  const xreserve = new ethers.Contract(XRESERVE_CONTRACT, XRESERVE_ABI, signer);

  const decimals = await usdc.decimals();
  const value = ethers.parseUnits(depositAmount, decimals);

  // Check USDC balance
  const balance = await usdc.balanceOf(signer.address);
  console.log(`USDC balance: ${ethers.formatUnits(balance, decimals)}`);
  if (balance < value) {
    throw new Error(
      `Insufficient USDC. Have ${ethers.formatUnits(balance, decimals)}, need ${depositAmount}`
    );
  }

  // Encode Canton recipient: keccak256(UTF-8 bytes) for remoteRecipient,
  // raw hex-encoded UTF-8 bytes for hookData
  const recipientBytes = ethers.toUtf8Bytes(cantonRecipient);
  const remoteRecipient = ethers.keccak256(recipientBytes);
  const hookData = ("0x" + Buffer.from(recipientBytes).toString("hex")) as `0x${string}`;

  const maxFee = ethers.parseUnits(maxFeeRaw, decimals);

  // Print both the party ID and its hash so the operator can eyeball the exact
  // string being committed to — the hash itself is unreadable and irreversible.
  console.log("\n--- Verify before signing ---");
  console.log(`Canton recipient: "${cantonRecipient}"`);
  console.log(`Remote recipient (keccak256): ${remoteRecipient}`);
  console.log(`Hook data (hex-encoded party ID): ${hookData}`);
  console.log(`Deposit amount: ${depositAmount} USDC`);
  console.log(`Max fee: ${maxFeeRaw} USDC`);
  console.log(`Remote domain: ${CANTON_DOMAIN} (Canton)`);
  console.log("-----------------------------");

  // Step 1: Approve xReserve to spend USDC
  const currentAllowance = await usdc.allowance(signer.address, XRESERVE_CONTRACT);
  if (currentAllowance < value) {
    console.log("\nApproving xReserve to spend USDC...");
    const approveTx = await usdc.approve(XRESERVE_CONTRACT, value);
    console.log(`Approve tx: ${approveTx.hash}`);
    await approveTx.wait();
    console.log("Approved!");
  } else {
    console.log("\nAllowance already sufficient, skipping approve");
  }

  // Step 2: Deposit to remote (Canton)
  console.log("\nDepositing USDC to xReserve for Canton...");
  const depositTx = await xreserve.depositToRemote(
    value,
    CANTON_DOMAIN,
    remoteRecipient,
    USDC_MAINNET,
    maxFee,
    hookData
  );
  console.log(`Deposit tx: ${depositTx.hash}`);

  const receipt = await depositTx.wait();
  console.log(`Confirmed in block ${receipt!.blockNumber}`);

  // Parse DepositToRemote event
  for (const log of receipt!.logs) {
    try {
      const parsed = xreserve.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      if (parsed && parsed.name === "DepositToRemote") {
        console.log("\n--- Deposit Event ---");
        console.log(`Nonce: ${parsed.args.nonce}`);
        console.log(`Remote domain: ${parsed.args.remoteDomain}`);
        console.log(`Value: ${ethers.formatUnits(parsed.args.value, decimals)} USDC`);
        console.log(`Fee: ${ethers.formatUnits(parsed.args.fee, decimals)} USDC`);
        console.log(`Deposit message hash: ${parsed.args.depositMessageHash}`);
        console.log(
          `\nTrack attestation: https://xreserve-api.circle.com/v1/attestations?txHash=${depositTx.hash}`
        );
      }
    } catch {
      // skip non-matching logs
    }
  }

  console.log("\nDone! USDCx will be minted on Canton after attestation is confirmed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
