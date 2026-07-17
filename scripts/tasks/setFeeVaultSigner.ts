import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TaskArguments } from "hardhat/types";

/**
 * Grants or revokes a FeeVault voucher signer (the backend key).
 *
 * Rotation without a gap: grant the new signer first, then revoke the old one.
 * Revoking is the kill-switch for a leaked key — it invalidates every voucher
 * that signer ever produced, redeemed or not.
 */
export async function setFeeVaultSignerTask(
  args: TaskArguments,
  hre: HardhatRuntimeEnvironment
) {
  const { ethers } = hre;
  const { vault, signer, revoke } = args as { vault: string; signer: string; revoke: boolean };
  const allowed = !revoke;

  const [deployer] = await ethers.getSigners();

  console.log("Using deployer:", deployer.address);
  console.log("FeeVault address:", vault);
  console.log("Signer:", signer);
  console.log("Action:", allowed ? "GRANT" : "REVOKE");

  const vaultContract = await ethers.getContractAt("FeeVault", vault);

  const before = await vaultContract.isSigner(signer);
  console.log("Currently granted:", before);

  const tx = await vaultContract.connect(deployer).setSigner(signer, allowed);
  console.log("setSigner tx sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("setSigner tx mined in block:", receipt?.blockNumber);

  console.log("Now granted:", await vaultContract.isSigner(signer));
}
