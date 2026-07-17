import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import type { FeeVault, TestToken } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const VAULT_FUNDING = ethers.parseUnits("1000", 18);
const REFUND = ethers.parseUnits("25", 18);

interface Voucher {
  token: string;
  to: string;
  amount: bigint;
  nonce: bigint;
  deadline: number;
}

const VOUCHER_TYPES = {
  FeeClaim: [
    { name: "token", type: "address" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

/** Signs a voucher for a specific vault — mirrors the backend EvmVoucherSignerService. */
async function signVoucher(
  vault: FeeVault,
  signer: HardhatEthersSigner,
  voucher: Voucher,
): Promise<string> {
  const domain = {
    name: "CancoreFeeVault",
    version: "1",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: await vault.getAddress(),
  };
  return signer.signTypedData(domain, VOUCHER_TYPES, voucher);
}

describe("FeeVault", function () {
  async function deployFeeVaultFixture() {
    const [owner, signer, partner, relayer, stranger] = await ethers.getSigners();

    const TestTokenFactory = await ethers.getContractFactory("TestToken");
    const token = (await TestTokenFactory.deploy("Test USD", "TUSD")) as TestToken;
    await token.mint(VAULT_FUNDING);

    const FeeVaultFactory = await ethers.getContractFactory("FeeVault");
    const vault = (await FeeVaultFactory.deploy()) as FeeVault;

    // Fees accrue here in production via HTLC.feeRecipient; fund it directly for tests.
    await token.transfer(await vault.getAddress(), VAULT_FUNDING);
    await vault.setSigner(signer.address, true);

    const deadline = (await time.latest()) + 3600;
    const voucher: Voucher = {
      token: await token.getAddress(),
      to: partner.address,
      amount: REFUND,
      nonce: 12345n,
      deadline,
    };

    return { vault, token, owner, signer, partner, relayer, stranger, voucher };
  }

  describe("redeem", function () {
    it("pays the recipient, consumes the digest and emits FeeClaimed", async function () {
      const { vault, token, signer, partner, voucher } = await loadFixture(deployFeeVaultFixture);
      const sig = await signVoucher(vault, signer, voucher);
      const digest = await vault.hashVoucher(voucher);

      expect(await vault.isRedeemed(voucher)).to.equal(false);

      await expect(vault.connect(partner).redeem(voucher, sig))
        .to.emit(vault, "FeeClaimed")
        .withArgs(voucher.token, partner.address, voucher.nonce, REFUND, digest, partner.address);

      expect(await token.balanceOf(partner.address)).to.equal(REFUND);
      expect(await token.balanceOf(await vault.getAddress())).to.equal(VAULT_FUNDING - REFUND);
      expect(await vault.isRedeemed(voucher)).to.equal(true);
      expect(await vault.usedDigests(digest)).to.equal(true);
    });

    it("hashVoucher matches the digest the signer actually signed", async function () {
      const { vault, signer, voucher } = await loadFixture(deployFeeVaultFixture);
      const sig = await signVoucher(vault, signer, voucher);
      const onChainDigest = await vault.hashVoucher(voucher);

      // The contract's own hash must recover the signer from the backend's signature.
      expect(ethers.recoverAddress(onChainDigest, sig)).to.equal(signer.address);
    });

    it("lets anyone relay, but the funds still go to the signed recipient", async function () {
      const { vault, token, signer, partner, relayer, voucher } =
        await loadFixture(deployFeeVaultFixture);
      const sig = await signVoucher(vault, signer, voucher);

      await vault.connect(relayer).redeem(voucher, sig);

      expect(await token.balanceOf(partner.address)).to.equal(REFUND);
      expect(await token.balanceOf(relayer.address)).to.equal(0n);
    });

    it("rejects a replayed voucher", async function () {
      const { vault, signer, partner, voucher } = await loadFixture(deployFeeVaultFixture);
      const sig = await signVoucher(vault, signer, voucher);

      await vault.connect(partner).redeem(voucher, sig);

      await expect(vault.connect(partner).redeem(voucher, sig)).to.be.revertedWithCustomError(
        vault,
        "VoucherAlreadyUsed",
      );
    });

    it("two signers sharing a nonce do not burn each other's voucher (digest-keyed replay)", async function () {
      const { vault, token, signer, owner, partner, stranger, voucher } =
        await loadFixture(deployFeeVaultFixture);
      // Rotation window: a second signer is granted alongside the first.
      await vault.setSigner(owner.address, true);

      // Same nonce, different recipient — distinct vouchers, distinct digests.
      const a = { ...voucher, to: partner.address };
      const b = { ...voucher, to: stranger.address };

      await vault.connect(partner).redeem(a, await signVoucher(vault, signer, a));
      await vault.connect(partner).redeem(b, await signVoucher(vault, owner, b));

      expect(await token.balanceOf(partner.address)).to.equal(REFUND);
      expect(await token.balanceOf(stranger.address)).to.equal(REFUND);
    });

    it("rejects a voucher past its deadline", async function () {
      const { vault, signer, partner, voucher } = await loadFixture(deployFeeVaultFixture);
      const expired = { ...voucher, deadline: (await time.latest()) - 1 };
      const sig = await signVoucher(vault, signer, expired);

      await expect(vault.connect(partner).redeem(expired, sig)).to.be.revertedWithCustomError(
        vault,
        "VoucherExpired",
      );
    });

    it("rejects a signature from a non-granted signer", async function () {
      const { vault, stranger, partner, voucher } = await loadFixture(deployFeeVaultFixture);
      const sig = await signVoucher(vault, stranger, voucher);

      await expect(vault.connect(partner).redeem(voucher, sig)).to.be.revertedWithCustomError(
        vault,
        "InvalidSigner",
      );
    });

    it("kill-switch: revoking a signer invalidates vouchers it already signed", async function () {
      const { vault, signer, partner, voucher } = await loadFixture(deployFeeVaultFixture);
      const sig = await signVoucher(vault, signer, voucher);

      await vault.setSigner(signer.address, false);

      await expect(vault.connect(partner).redeem(voucher, sig)).to.be.revertedWithCustomError(
        vault,
        "InvalidSigner",
      );
    });

    it("rejects a tampered amount (signature no longer recovers a granted signer)", async function () {
      const { vault, signer, partner, voucher } = await loadFixture(deployFeeVaultFixture);
      const sig = await signVoucher(vault, signer, voucher);
      const tampered = { ...voucher, amount: REFUND * 2n };

      await expect(vault.connect(partner).redeem(tampered, sig)).to.be.revertedWithCustomError(
        vault,
        "InvalidSigner",
      );
    });

    it("rejects a tampered recipient", async function () {
      const { vault, signer, partner, stranger, voucher } = await loadFixture(deployFeeVaultFixture);
      const sig = await signVoucher(vault, signer, voucher);
      const tampered = { ...voucher, to: stranger.address };

      await expect(vault.connect(partner).redeem(tampered, sig)).to.be.revertedWithCustomError(
        vault,
        "InvalidSigner",
      );
    });

    it("rejects a voucher signed for a different vault (EIP-712 domain binding)", async function () {
      const { vault, signer, partner, voucher } = await loadFixture(deployFeeVaultFixture);

      const FeeVaultFactory = await ethers.getContractFactory("FeeVault");
      const otherVault = (await FeeVaultFactory.deploy()) as FeeVault;
      await otherVault.setSigner(signer.address, true);

      // Signed against otherVault's domain, submitted to `vault`.
      const sig = await signVoucher(otherVault, signer, voucher);

      await expect(vault.connect(partner).redeem(voucher, sig)).to.be.revertedWithCustomError(
        vault,
        "InvalidSigner",
      );
    });

    it("rejects a zero recipient", async function () {
      const { vault, signer, partner, voucher } = await loadFixture(deployFeeVaultFixture);
      const bad = { ...voucher, to: ethers.ZeroAddress };
      const sig = await signVoucher(vault, signer, bad);

      await expect(vault.connect(partner).redeem(bad, sig)).to.be.revertedWithCustomError(
        vault,
        "ZeroAddress",
      );
    });

    it("rejects a zero amount", async function () {
      const { vault, signer, partner, voucher } = await loadFixture(deployFeeVaultFixture);
      const bad = { ...voucher, amount: 0n };
      const sig = await signVoucher(vault, signer, bad);

      await expect(vault.connect(partner).redeem(bad, sig)).to.be.revertedWithCustomError(
        vault,
        "ZeroAmount",
      );
    });

    it("is blocked while paused and works again after unpause", async function () {
      const { vault, signer, partner, voucher } = await loadFixture(deployFeeVaultFixture);
      const sig = await signVoucher(vault, signer, voucher);

      await vault.pause();
      await expect(vault.connect(partner).redeem(voucher, sig)).to.be.revertedWith(
        "Pausable: paused",
      );

      await vault.unpause();
      await expect(vault.connect(partner).redeem(voucher, sig)).to.emit(vault, "FeeClaimed");
    });

    it("two distinct vouchers each redeem independently", async function () {
      const { vault, token, signer, partner, stranger, voucher } =
        await loadFixture(deployFeeVaultFixture);
      const second: Voucher = { ...voucher, to: stranger.address, nonce: 999n };

      await vault.connect(partner).redeem(voucher, await signVoucher(vault, signer, voucher));
      await vault.connect(partner).redeem(second, await signVoucher(vault, signer, second));

      expect(await token.balanceOf(partner.address)).to.equal(REFUND);
      expect(await token.balanceOf(stranger.address)).to.equal(REFUND);
    });
  });

  describe("cancelVoucher", function () {
    it("burns a single voucher without touching others", async function () {
      const { vault, signer, partner, stranger, voucher } = await loadFixture(deployFeeVaultFixture);
      const other = { ...voucher, to: stranger.address, nonce: 777n };
      const digest = await vault.hashVoucher(voucher);

      await expect(vault.cancelVoucher(digest))
        .to.emit(vault, "VoucherCancelled")
        .withArgs(digest);

      await expect(
        vault.connect(partner).redeem(voucher, await signVoucher(vault, signer, voucher)),
      ).to.be.revertedWithCustomError(vault, "VoucherAlreadyUsed");

      // The signer's other vouchers still work — this is a scalpel, not a revoke.
      await vault.connect(partner).redeem(other, await signVoucher(vault, signer, other));
    });

    it("reverts for a non-owner", async function () {
      const { vault, stranger, voucher } = await loadFixture(deployFeeVaultFixture);
      const digest = await vault.hashVoucher(voucher);

      await expect(vault.connect(stranger).cancelVoucher(digest)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });
  });

  describe("ownership", function () {
    it("is 2-step: transfer only takes effect on acceptOwnership", async function () {
      const { vault, owner, stranger } = await loadFixture(deployFeeVaultFixture);

      await vault.transferOwnership(stranger.address);
      expect(await vault.owner()).to.equal(owner.address); // still the old owner
      expect(await vault.pendingOwner()).to.equal(stranger.address);

      await vault.connect(stranger).acceptOwnership();
      expect(await vault.owner()).to.equal(stranger.address);
    });

    it("cannot be renounced — the kill-switch must stay reachable", async function () {
      const { vault } = await loadFixture(deployFeeVaultFixture);

      await expect(vault.renounceOwnership()).to.be.revertedWithCustomError(
        vault,
        "RenounceDisabled",
      );
    });
  });

  describe("setSigner", function () {
    it("grants a signer and emits SignerUpdated", async function () {
      const { vault, stranger } = await loadFixture(deployFeeVaultFixture);

      await expect(vault.setSigner(stranger.address, true))
        .to.emit(vault, "SignerUpdated")
        .withArgs(stranger.address, true);

      expect(await vault.isSigner(stranger.address)).to.equal(true);
    });

    it("revocation is permanent — a revoked key can never be re-granted", async function () {
      const { vault, signer, partner, voucher } = await loadFixture(deployFeeVaultFixture);
      const sig = await signVoucher(vault, signer, voucher);

      await vault.setSigner(signer.address, false);
      expect(await vault.revokedSigners(signer.address)).to.equal(true);

      // Re-granting a leaked key would otherwise resurrect its pre-signed vouchers.
      await expect(vault.setSigner(signer.address, true)).to.be.revertedWithCustomError(
        vault,
        "SignerPermanentlyRevoked",
      );
      await expect(vault.connect(partner).redeem(voucher, sig)).to.be.revertedWithCustomError(
        vault,
        "InvalidSigner",
      );
    });

    it("rotation works: grant the new key, then revoke the old", async function () {
      const { vault, token, signer, owner, partner, stranger, voucher } =
        await loadFixture(deployFeeVaultFixture);
      const fresh = { ...voucher, to: stranger.address, nonce: 42n };

      await vault.setSigner(owner.address, true); // new key
      await vault.setSigner(signer.address, false); // retire the old one

      await vault.connect(partner).redeem(fresh, await signVoucher(vault, owner, fresh));
      expect(await token.balanceOf(stranger.address)).to.equal(REFUND);
    });

    it("reverts for a non-owner", async function () {
      const { vault, stranger } = await loadFixture(deployFeeVaultFixture);

      await expect(vault.connect(stranger).setSigner(stranger.address, true)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("rejects the zero address", async function () {
      const { vault } = await loadFixture(deployFeeVaultFixture);

      await expect(vault.setSigner(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(
        vault,
        "ZeroAddress",
      );
    });
  });

  describe("pause", function () {
    it("reverts for a non-owner", async function () {
      const { vault, stranger } = await loadFixture(deployFeeVaultFixture);

      await expect(vault.connect(stranger).pause()).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });
  });

  describe("sweep", function () {
    it("moves fees to the treasury and emits Swept", async function () {
      const { vault, token, owner, stranger } = await loadFixture(deployFeeVaultFixture);

      await expect(vault.sweep(await token.getAddress(), stranger.address, REFUND))
        .to.emit(vault, "Swept")
        .withArgs(await token.getAddress(), stranger.address, REFUND);

      expect(await token.balanceOf(stranger.address)).to.equal(REFUND);
      expect(owner.address).to.equal(await vault.owner());
    });

    it("reverts for a non-owner", async function () {
      const { vault, token, stranger } = await loadFixture(deployFeeVaultFixture);

      await expect(
        vault.connect(stranger).sweep(await token.getAddress(), stranger.address, REFUND),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("rejects zero token / recipient / amount", async function () {
      const { vault, token, stranger } = await loadFixture(deployFeeVaultFixture);

      await expect(
        vault.sweep(ethers.ZeroAddress, stranger.address, REFUND),
      ).to.be.revertedWithCustomError(vault, "ZeroAddress");
      await expect(
        vault.sweep(await token.getAddress(), ethers.ZeroAddress, REFUND),
      ).to.be.revertedWithCustomError(vault, "ZeroAddress");
      await expect(
        vault.sweep(await token.getAddress(), stranger.address, 0n),
      ).to.be.revertedWithCustomError(vault, "ZeroAmount");
    });
  });

  describe("deployment", function () {
    it("starts with no signers and the deployer as owner", async function () {
      const [owner, , , , stranger] = await ethers.getSigners();
      const FeeVaultFactory = await ethers.getContractFactory("FeeVault");
      const fresh = (await FeeVaultFactory.deploy()) as FeeVault;

      expect(await fresh.owner()).to.equal(owner.address);
      expect(await fresh.isSigner(stranger.address)).to.equal(false);
    });
  });
});
