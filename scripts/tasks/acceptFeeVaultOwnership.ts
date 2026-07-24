import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TaskArguments } from "hardhat/types";

/**
 * Accepts a pending FeeVault ownership transfer (Ownable2Step, step 2 of 2).
 *
 * Must be run by the NOMINATED owner (the vault's `pendingOwner`): set that
 * account's key as the network signer (MAINNET_PRIVATE_KEY / TESTNET_PRIVATE_KEY
 * / PRIVATE_KEY). The task fails early if the connected signer isn't the pending
 * owner, instead of reverting deep in the tx with Ownable2Step's opaque
 * "caller is not the new owner".
 */
export async function acceptFeeVaultOwnershipTask(
  args: TaskArguments,
  hre: HardhatRuntimeEnvironment
) {
  const { ethers } = hre;
  const { vault } = args as { vault: string };

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "no signer configured — set the pending owner's key (MAINNET_PRIVATE_KEY / TESTNET_PRIVATE_KEY / PRIVATE_KEY) for this network"
    );
  }
  const [signer] = signers;
  console.log("Using signer:", signer.address);
  console.log("FeeVault address:", vault);

  const vaultContract = await ethers.getContractAt("FeeVault", vault);

  const [currentOwner, pending] = await Promise.all([
    vaultContract.owner(),
    vaultContract.pendingOwner(),
  ]);
  console.log("Current owner:", currentOwner);
  console.log("Pending owner:", pending);

  if (ethers.getAddress(pending) === ethers.ZeroAddress) {
    throw new Error("no pending ownership transfer on this vault (pendingOwner is zero)");
  }
  if (ethers.getAddress(signer.address) !== ethers.getAddress(pending)) {
    throw new Error(
      `signer ${signer.address} is not the pending owner (${pending}) — only the nominee can accept. ` +
        "Set the pending owner's private key as the network signer and retry."
    );
  }

  const tx = await vaultContract.connect(signer).acceptOwnership();
  console.log("acceptOwnership tx sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("acceptOwnership mined in block:", receipt?.blockNumber);

  console.log("New owner:", await vaultContract.owner());
  console.log("Pending owner (now cleared):", await vaultContract.pendingOwner());
  console.log(`\n✅ ${signer.address} now owns ${vault} — controls setSigner / pause / cancelVoucher / sweep.`);
}
