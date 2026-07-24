import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TaskArguments } from "hardhat/types";

/**
 * Nominates a new FeeVault owner (Ownable2Step, step 1 of 2).
 *
 * transferOwnership only NOMINATES: the nominee must then call
 * `acceptOwnership()` to take control. Until then the current owner keeps it,
 * and a fresh call here overwrites any prior pending nominee — so this doubles
 * as "re-point the pending owner" (e.g. from a temporary EOA to the multisig).
 *
 * Only the CURRENT owner can call it; the task fails early if the configured
 * signer isn't the owner, rather than reverting deep in the tx.
 */
export async function transferFeeVaultOwnershipTask(
  args: TaskArguments,
  hre: HardhatRuntimeEnvironment
) {
  const { ethers } = hre;
  const { vault, owner } = args as { vault: string; owner: string };

  if (!ethers.isAddress(owner)) {
    throw new Error(`--owner is not a valid address: ${owner}`);
  }

  const [signer] = await ethers.getSigners();
  console.log("Using signer:", signer.address);
  console.log("FeeVault address:", vault);
  console.log("New owner (nominee):", owner);

  const vaultContract = await ethers.getContractAt("FeeVault", vault);

  const currentOwner = await vaultContract.owner();
  console.log("Current owner:", currentOwner);
  if (ethers.getAddress(currentOwner) !== ethers.getAddress(signer.address)) {
    throw new Error(
      `signer ${signer.address} is not the current owner (${currentOwner}) — only the owner can transfer`
    );
  }
  if (ethers.getAddress(owner) === ethers.getAddress(currentOwner)) {
    throw new Error("new owner equals the current owner — nothing to do");
  }

  const tx = await vaultContract.connect(signer).transferOwnership(owner);
  console.log("transferOwnership tx sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("transferOwnership mined in block:", receipt?.blockNumber);

  console.log("Pending owner:", await vaultContract.pendingOwner());
  console.log(
    `\n⚠  Ownership is NOT transferred until ${owner} calls acceptOwnership() on ${vault}.`
  );
  console.log(`   Until then the current owner (${currentOwner}) still controls sweep/setSigner.`);
}
