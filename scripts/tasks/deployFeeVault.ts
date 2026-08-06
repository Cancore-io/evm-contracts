import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TaskArguments } from "hardhat/types";

/** Chains where leaving the vault under the deploying EOA is not acceptable. */
const MAINNET_CHAIN_IDS = new Set<bigint>([1n, 56n, 42161n, 4663n]);

/**
 * Deploys FeeVault — the partner fee-refund vault.
 *
 * The vault's security model assumes a multisig owner: `setSigner`, `pause`,
 * `cancelVoucher` and `sweep` are all owner-only, and `sweep` can drain the
 * accumulated fee balance. The deployer is a single hot key, so ownership is
 * handed over here rather than left where the constructor put it.
 *
 * Ownership is 2-step: this task only nominates `--owner`; the multisig must
 * call `acceptOwnership()` to take over. Until then the deployer still owns it.
 */
export async function deployFeeVaultTask(
  args: TaskArguments,
  hre: HardhatRuntimeEnvironment
) {
  const { ethers } = hre;
  const { owner } = args as { owner?: string };

  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  const isMainnet = MAINNET_CHAIN_IDS.has(chainId);

  // Fail-safe: never leave a mainnet fee vault owned by the deploying hot key.
  if (isMainnet) {
    if (!owner) {
      throw new Error(
        `--owner is required on mainnet (chainId ${chainId}): pass the multisig that will own the vault`
      );
    }
    if (ethers.getAddress(owner) === ethers.getAddress(deployer.address)) {
      throw new Error(
        "--owner must not be the deployer on mainnet: hand the vault to a multisig, not the hot key"
      );
    }
  }
  if (owner && !ethers.isAddress(owner)) {
    throw new Error(`--owner is not a valid address: ${owner}`);
  }

  console.log("Deploying FeeVault with account:", deployer.address);
  console.log("Network:", hre.network.name, `(chainId ${chainId})`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  const FeeVault = await ethers.getContractFactory("FeeVault");
  const vault = await FeeVault.deploy();
  await vault.waitForDeployment();

  const vaultAddress = await vault.getAddress();
  console.log("FeeVault deployed to:", vaultAddress);
  console.log("Owner (deployer, for now):", await vault.owner());

  if (owner) {
    const tx = await vault.transferOwnership(owner);
    console.log("transferOwnership tx sent:", tx.hash);
    await tx.wait();
    console.log("Pending owner:", await vault.pendingOwner());
    console.log(
      `\n⚠  Ownership is NOT transferred until ${owner} calls acceptOwnership() on ${vaultAddress}.`
    );
    console.log(`   Until then the deployer (${deployer.address}) still controls sweep/setSigner.`);
  } else {
    console.log(
      `\n⚠  No --owner given: the vault is owned by the deploying hot key (${deployer.address}).`
    );
    console.log("   Transfer it to a multisig before routing real fees here.");
  }

  console.log("\nNext steps");
  console.log("----------");
  console.log(`1) Accept ownership: multisig calls acceptOwnership() on ${vaultAddress}`);
  console.log(`2) Grant signer:     npx hardhat setFeeVaultSigner --vault ${vaultAddress} --signer <backendSigner> --network ${hre.network.name}`);
  console.log(`3) Route fees here:  npx hardhat setFeeRecipient --htlc <htlc> --recipient ${vaultAddress} --network ${hre.network.name}`);
  console.log(`4) Backend config:   ${hre.network.name.toUpperCase()}_FEE_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`\nVerify:  npx hardhat verify --network ${hre.network.name} ${vaultAddress}`);
}
