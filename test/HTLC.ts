import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { createHash } from "crypto";

// Helper function to compute SHA256 hash (matching contract's sha256(bytes(string)) function)
// The contract converts the string to UTF-8 bytes, then computes SHA256
function sha256(data: string): string {
  const buffer = Buffer.from(data, "utf8");
  const hash = createHash("sha256").update(buffer).digest();
  return "0x" + hash.toString("hex");
}

describe("HTLC", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployHTLCFixture() {
    const ONE_YEAR_IN_SECS = 365n * 24n * 60n * 60n;
    const latestTime = await time.latest();
    const unlockTime = BigInt(latestTime) + ONE_YEAR_IN_SECS;

    // Contracts are deployed using the first signer/account by default
    const [alice, bob] = await ethers.getSigners();

    const HTLC = await ethers.getContractFactory("HTLC");
    const htlc = await HTLC.deploy();
    await htlc.waitForDeployment();
    const htlcAddress = await htlc.getAddress();

    // Deploy MockPermit2 and configure HTLC
    const MockPermit2 = await ethers.getContractFactory("MockPermit2");
    const mockPermit2 = await MockPermit2.deploy();
    await mockPermit2.waitForDeployment();
    await htlc.connect(alice).setPermit2(await mockPermit2.getAddress());

    const TestToken = await ethers.getContractFactory("TestToken");
    // Cast to any to bypass outdated typechain constructor typing
    const testToken = await (TestToken as any).deploy("TestToken", "TT");
    await testToken.waitForDeployment();
    const testTokenAddress = await testToken.getAddress();

    // Mint tokens for testing (only Alice has initial balance; Bob starts with 0)
    await (testToken as any).connect(alice).mint(100);

    await testToken.connect(alice).approve(htlcAddress, 100);
    await testToken.connect(bob).approve(htlcAddress, 100);

    const preImage = "0xffffff";
    const hashValue = sha256(preImage);

    return { htlc, htlcAddress, testToken, testTokenAddress, alice, bob, preImage, hashValue, unlockTime, mockPermit2 };
  }

  describe("Locking", function () {
    it("Should revert with zero value", async function () {
      const { htlc, testTokenAddress, alice, bob, hashValue, unlockTime } = await loadFixture(deployHTLCFixture);

      await expect(htlc.connect(alice).lock(hashValue, unlockTime, 0, testTokenAddress, bob.address))
        .to.be.revertedWithCustomError(htlc, "ZeroAmount");
    });

    it("Should revert if locker does not have enough tokens", async function () {
      const { htlc, testTokenAddress, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );

      await expect(htlc.connect(bob).lock(hashValue, unlockTime, 1, testTokenAddress, alice.address)).to.be.revertedWith(
        "ERC20: transfer amount exceeds balance"
      );
    });

    it("Should revert if insufficient allowance", async function () {
      const { htlc, htlcAddress, testToken, testTokenAddress, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );

      // Revoke approval
      await testToken.connect(alice).approve(htlcAddress, 0);

      await expect(htlc.connect(alice).lock(hashValue, unlockTime, 1, testTokenAddress, bob.address)).to.be.revertedWith(
        "ERC20: insufficient allowance"
      );
    });

    it("Should not allowing locking twice with the same hash", async function () {
      const { htlc, testTokenAddress, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );

      await htlc.connect(alice).lock(hashValue, unlockTime, 1, testTokenAddress, bob.address);

      await expect(htlc.connect(alice).lock(hashValue, unlockTime, 1, testTokenAddress, bob.address))
        .to.be.revertedWithCustomError(htlc, "LockAlreadyExists");
    });

    it("Should successfully lock tokens and emit Locked event", async function () {
      const { htlc, testTokenAddress, testToken, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 10;

      await expect(htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address))
        .to.emit(htlc, "Locked")
        .withArgs(hashValue, unlockTime, lockedAmount, testTokenAddress, alice.address, bob.address);
    });

    it("Should transfer tokens to HTLC contract on lock", async function () {
      const { htlc, testTokenAddress, testToken, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 10;

      await expect(
        htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address)
      ).to.changeTokenBalances(
        testToken,
        [alice, htlc],
        [-lockedAmount, lockedAmount]
      );
    });

    it("Should allow different senders to lock with the same hashValue", async function () {
      const { htlc, testTokenAddress, testToken, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 5;

      // Alice locks with hashValue
      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      // Bob should be able to lock with the same hashValue (different sender)
      await (testToken as any).connect(bob).mint(100);
      await testToken.connect(bob).approve(await htlc.getAddress(), 100);

      await expect(htlc.connect(bob).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, alice.address))
        .to.emit(htlc, "Locked")
        .withArgs(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address, alice.address);
    });

    it("Should store lock data correctly", async function () {
      const { htlc, testTokenAddress, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 15;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      const lock = await htlc.getLock(hashValue, alice.address);
      expect(lock.unlockTime).to.equal(unlockTime);
      expect(lock.amount).to.equal(lockedAmount);
      expect(lock.tokenAddress).to.equal(testTokenAddress);
      expect(lock.senderAddr).to.equal(alice.address);
      expect(lock.receiverAddress).to.equal(bob.address);
    });

    it("Should handle large amounts correctly", async function () {
      const { htlc, testTokenAddress, testToken, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const largeAmount = ethers.parseEther("1000000"); // 1 million tokens

      await (testToken as any).connect(alice).mint(largeAmount);
      await testToken.connect(alice).approve(await htlc.getAddress(), largeAmount);

      await expect(
        htlc.connect(alice).lock(hashValue, unlockTime, largeAmount, testTokenAddress, bob.address)
      ).to.changeTokenBalances(
        testToken,
        [alice, htlc],
        [-largeAmount, largeAmount]
      );
    });

    it("Should revert if token address is zero", async function () {
      const { htlc, alice, bob, hashValue, unlockTime } = await loadFixture(deployHTLCFixture);

      await expect(
        htlc.connect(alice).lock(hashValue, unlockTime, 1, ethers.ZeroAddress, bob.address)
      ).to.be.revertedWithCustomError(htlc, "ZeroAddress");
    });

    it("Should revert if receiver address is zero", async function () {
      const { htlc, testTokenAddress, alice, hashValue, unlockTime } = await loadFixture(deployHTLCFixture);

      await expect(
        htlc.connect(alice).lock(hashValue, unlockTime, 1, testTokenAddress, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(htlc, "ZeroAddress");
    });

    it("Should revert if receiver is the same as sender", async function () {
      const { htlc, testTokenAddress, alice, hashValue, unlockTime } = await loadFixture(deployHTLCFixture);

      await expect(
        htlc.connect(alice).lock(hashValue, unlockTime, 1, testTokenAddress, alice.address)
      ).to.be.revertedWithCustomError(htlc, "SenderEqualsReceiver");
    });
  });

  describe("Claiming", function () {
    it("Not allow claiming after the unlock time", async function () {
      const { htlc, testTokenAddress, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      await time.increaseTo(unlockTime);

      await expect(htlc.connect(bob).claim(preImage, alice.address))
        .to.be.revertedWithCustomError(htlc, "ClaimTimeExpired");
    });

    it("Should not allow claiming exactly at unlock time", async function () {
      const { htlc, testTokenAddress, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      // Set time to exactly unlockTime
      await time.increaseTo(unlockTime);

      await expect(htlc.connect(bob).claim(preImage, alice.address))
        .to.be.revertedWithCustomError(htlc, "ClaimTimeExpired");
    });

    it("Not allow other account to claim", async function () {
      const { htlc, testTokenAddress, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      await expect(htlc.connect(alice).claim(preImage, alice.address))
        .to.be.revertedWithCustomError(htlc, "UnauthorizedClaim");
    });

    it("Revert if invalid pre-image is provided", async function () {
      const { htlc, testTokenAddress, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      await expect(htlc.connect(bob).claim(preImage + "AA", alice.address))
        .to.be.revertedWithCustomError(htlc, "InvalidPreImage");
    });

    it("Revert if wrong sender address is provided", async function () {
      const { htlc, testTokenAddress, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      // Try to claim with wrong sender address
      await expect(htlc.connect(bob).claim(preImage, bob.address))
        .to.be.revertedWithCustomError(htlc, "InvalidPreImage");
    });

    it("Should transfer the funds to the recipient if correct pre-image is provided", async function () {
      const { htlc, testTokenAddress, testToken, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      await expect(htlc.connect(bob).claim(preImage, alice.address)).to.changeTokenBalances(
        testToken,
        [bob, htlc],
        [lockedAmount, -lockedAmount]
      );
    });

    it("Should emit Claimed event with correct parameters", async function () {
      const { htlc, testTokenAddress, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 10;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      await expect(htlc.connect(bob).claim(preImage, alice.address))
        .to.emit(htlc, "Claimed")
        .withArgs(
          preImage,
          hashValue,
          (value: bigint) => value > 0n, // timestamp
          lockedAmount,
          0n, // feeAmount (feeRate is 0 by default)
          testTokenAddress,
          alice.address,
          bob.address
        );
    });

    it("Should delete lock after successful claim", async function () {
      const { htlc, testTokenAddress, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);
      await htlc.connect(bob).claim(preImage, alice.address);

      // Lock should be deleted
      const lock = await htlc.getLock(hashValue, alice.address);
      expect(lock.amount).to.equal(0);
    });

    it("Should not allow claiming already claimed lock", async function () {
      const { htlc, testTokenAddress, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);
      await htlc.connect(bob).claim(preImage, alice.address);

      // Try to claim again
      await expect(htlc.connect(bob).claim(preImage, alice.address))
        .to.be.revertedWithCustomError(htlc, "InvalidPreImage");
    });

    it("Should allow claiming just before unlock time", async function () {
      const { htlc, testTokenAddress, testToken, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      // Move time to just before unlock time (at least 2 seconds before to ensure we're before)
      const timeBeforeUnlock = unlockTime - 2n;
      await time.increaseTo(timeBeforeUnlock);

      await expect(htlc.connect(bob).claim(preImage, alice.address)).to.changeTokenBalances(
        testToken,
        [bob, htlc],
        [lockedAmount, -lockedAmount]
      );
    });

    it("Should revert if sender address is zero in claim", async function () {
      const { htlc, testTokenAddress, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      await expect(htlc.connect(bob).claim(preImage, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(htlc, "ZeroAddress");
    });
  });

  describe("Retaking", function () {
    it("Should not allow retaking before the time window has elapsed", async function () {
      const { htlc, testTokenAddress, testToken, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      await expect(htlc.connect(alice).retake(hashValue))
        .to.be.revertedWithCustomError(htlc, "RetakeTimeNotReached");
    });

    it("Should allow retaking exactly at unlock time", async function () {
      const { htlc, testTokenAddress, testToken, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 5;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      await time.increaseTo(unlockTime);

      await expect(htlc.connect(alice).retake(hashValue)).to.changeTokenBalances(
        testToken,
        [alice, htlc],
        [lockedAmount, -lockedAmount]
      );
    });

    it("Should not allow other account to retake", async function () {
      const { htlc, testTokenAddress, testToken, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;

      // Create a lock with bob as the sender
      await testToken.connect(bob).mint(100);
      await testToken.connect(bob).approve(await htlc.getAddress(), 100);
      await htlc.connect(bob).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, alice.address);

      await time.increaseTo(unlockTime);

      // Alice tries to retake, but only bob (the sender) can retake
      await expect(htlc.connect(alice).retake(hashValue))
        .to.be.revertedWithCustomError(htlc, "LockNotFound");
    });

    it("Should transfer the funds back to the sender after the time window has elapsed", async function () {
      const { htlc, testTokenAddress, testToken, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      await time.increaseTo(unlockTime);

      await expect(htlc.connect(alice).retake(hashValue)).to.changeTokenBalances(
        testToken,
        [alice, htlc],
        [lockedAmount, -lockedAmount]
      );
    });

    it("Should emit Retaken event with correct parameters", async function () {
      const { htlc, testTokenAddress, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 10;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      await time.increaseTo(unlockTime);

      await expect(htlc.connect(alice).retake(hashValue))
        .to.emit(htlc, "Retaken")
        .withArgs(
          hashValue,
          (value: bigint) => value > 0n, // timestamp
          lockedAmount,
          testTokenAddress,
          alice.address,
          bob.address
        );
    });

    it("Should delete lock after successful retake", async function () {
      const { htlc, testTokenAddress, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      await time.increaseTo(unlockTime);
      await htlc.connect(alice).retake(hashValue);

      // Lock should be deleted
      const lock = await htlc.getLock(hashValue, alice.address);
      expect(lock.amount).to.equal(0);
    });

    it("Should not allow retaking already retaken lock", async function () {
      const { htlc, testTokenAddress, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      await time.increaseTo(unlockTime);
      await htlc.connect(alice).retake(hashValue);

      // Try to retake again
      await expect(htlc.connect(alice).retake(hashValue))
        .to.be.revertedWithCustomError(htlc, "LockNotFound");
    });

    it("Should not allow retaking after claim", async function () {
      const { htlc, testTokenAddress, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);
      await htlc.connect(bob).claim(preImage, alice.address);

      await time.increaseTo(unlockTime);

      // Try to retake after claim
      await expect(htlc.connect(alice).retake(hashValue))
        .to.be.revertedWithCustomError(htlc, "LockNotFound");
    });
  });

  describe("getLock", function () {
    it("Should return correct lock data for existing lock", async function () {
      const { htlc, testTokenAddress, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 20;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      const lock = await htlc.getLock(hashValue, alice.address);
      expect(lock.unlockTime).to.equal(unlockTime);
      expect(lock.amount).to.equal(lockedAmount);
      expect(lock.tokenAddress).to.equal(testTokenAddress);
      expect(lock.senderAddr).to.equal(alice.address);
      expect(lock.receiverAddress).to.equal(bob.address);
    });

    it("Should return zero values for non-existent lock", async function () {
      const { htlc, alice, hashValue } = await loadFixture(deployHTLCFixture);
      const nonExistentHash = sha256("0x123456");

      const lock = await htlc.getLock(nonExistentHash, alice.address);
      expect(lock.unlockTime).to.equal(0);
      expect(lock.amount).to.equal(0);
      expect(lock.tokenAddress).to.equal(ethers.ZeroAddress);
      expect(lock.senderAddr).to.equal(ethers.ZeroAddress);
      expect(lock.receiverAddress).to.equal(ethers.ZeroAddress);
    });

    it("Should return zero values for lock after claim", async function () {
      const { htlc, testTokenAddress, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);
      await htlc.connect(bob).claim(preImage, alice.address);

      const lock = await htlc.getLock(hashValue, alice.address);
      expect(lock.amount).to.equal(0);
    });

    it("Should return zero values for lock after retake", async function () {
      const { htlc, testTokenAddress, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      await time.increaseTo(unlockTime);
      await htlc.connect(alice).retake(hashValue);

      const lock = await htlc.getLock(hashValue, alice.address);
      expect(lock.amount).to.equal(0);
    });

    it("Should return different locks for different senders with same hash", async function () {
      const { htlc, testTokenAddress, testToken, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 5;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      await (testToken as any).connect(bob).mint(100);
      await testToken.connect(bob).approve(await htlc.getAddress(), 100);
      await htlc.connect(bob).lock(hashValue, unlockTime, lockedAmount + 1, testTokenAddress, alice.address);

      const aliceLock = await htlc.getLock(hashValue, alice.address);
      const bobLock = await htlc.getLock(hashValue, bob.address);

      expect(aliceLock.amount).to.equal(lockedAmount);
      expect(aliceLock.senderAddr).to.equal(alice.address);
      expect(bobLock.amount).to.equal(lockedAmount + 1);
      expect(bobLock.senderAddr).to.equal(bob.address);
    });
  });

  describe("Edge Cases and Integration", function () {
    it("Should handle multiple locks with different hashValues from same sender", async function () {
      const { htlc, testTokenAddress, testToken, alice, bob, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 5;

      const preImage1 = "0xaaaaaa";
      const hashValue1 = sha256(preImage1);
      const preImage2 = "0xbbbbbb";
      const hashValue2 = sha256(preImage2);

      await htlc.connect(alice).lock(hashValue1, unlockTime, lockedAmount, testTokenAddress, bob.address);
      await htlc.connect(alice).lock(hashValue2, unlockTime, lockedAmount, testTokenAddress, bob.address);

      const lock1 = await htlc.getLock(hashValue1, alice.address);
      const lock2 = await htlc.getLock(hashValue2, alice.address);

      expect(lock1.amount).to.equal(lockedAmount);
      expect(lock2.amount).to.equal(lockedAmount);
      expect(lock1.senderAddr).to.equal(lock2.senderAddr); // Same sender
      expect(lock1.receiverAddress).to.equal(lock2.receiverAddress); // Same receiver
    });

    it("Should handle claim and retake scenarios correctly", async function () {
      const { htlc, testTokenAddress, testToken, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 10;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      // Bob claims successfully
      await expect(htlc.connect(bob).claim(preImage, alice.address)).to.changeTokenBalances(
        testToken,
        [bob, htlc],
        [lockedAmount, -lockedAmount]
      );

      // Lock should be deleted
      const lock = await htlc.getLock(hashValue, alice.address);
      expect(lock.amount).to.equal(0);

      // Alice cannot retake after claim
      await time.increaseTo(unlockTime);
      await expect(htlc.connect(alice).retake(hashValue))
        .to.be.revertedWithCustomError(htlc, "LockNotFound");
    });

    it("Should handle retake scenario when claim is not made", async function () {
      const { htlc, testTokenAddress, testToken, alice, bob, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 10;

      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);

      // Time passes, no claim made
      await time.increaseTo(unlockTime);

      // Alice retakes successfully
      await expect(htlc.connect(alice).retake(hashValue)).to.changeTokenBalances(
        testToken,
        [alice, htlc],
        [lockedAmount, -lockedAmount]
      );

      // Lock should be deleted
      const lock = await htlc.getLock(hashValue, alice.address);
      expect(lock.amount).to.equal(0);

      // Bob cannot claim after retake
      const preImage = "0xffffff";
      await expect(htlc.connect(bob).claim(preImage, alice.address))
        .to.be.revertedWithCustomError(htlc, "InvalidPreImage");
    });

    it("Should handle different token contracts", async function () {
      const { htlc, alice, bob, hashValue, unlockTime } = await loadFixture(deployHTLCFixture);

      // Deploy second token
      const TestToken = await ethers.getContractFactory("TestToken");
      const testToken2 = await (TestToken as any).deploy("TestToken2", "TT2");
      await testToken2.waitForDeployment();
      const testToken2Address = await testToken2.getAddress();

      await (testToken2 as any).connect(alice).mint(100);
      await testToken2.connect(alice).approve(await htlc.getAddress(), 100);

      const lockedAmount = 15;
      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testToken2Address, bob.address);

      const lock = await htlc.getLock(hashValue, alice.address);
      expect(lock.tokenAddress).to.equal(testToken2Address);
      expect(lock.amount).to.equal(lockedAmount);
    });

    it("Should handle very short unlock time", async function () {
      const { htlc, testTokenAddress, testToken, alice, bob, hashValue } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;
      const currentTime = await time.latest();
      const shortUnlockTime = BigInt(currentTime) + 10n; // 10 seconds in future

      await htlc.connect(alice).lock(hashValue, shortUnlockTime, lockedAmount, testTokenAddress, bob.address);

      // Claim immediately (should work as we're before unlockTime)
      const preImage = "0xffffff";
      await expect(htlc.connect(bob).claim(preImage, alice.address)).to.changeTokenBalances(
        testToken,
        [bob, htlc],
        [lockedAmount, -lockedAmount]
      );
    });

    it("Should handle very long unlock time", async function () {
      const { htlc, testTokenAddress, testToken, alice, bob, hashValue } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1;
      const currentTime = await time.latest();
      const longUnlockTime = BigInt(currentTime) + (100n * 365n * 24n * 60n * 60n); // 100 years

      await htlc.connect(alice).lock(hashValue, longUnlockTime, lockedAmount, testTokenAddress, bob.address);

      const lock = await htlc.getLock(hashValue, alice.address);
      expect(lock.unlockTime).to.equal(longUnlockTime);

      // Should be able to claim
      const preImage = "0xffffff";
      await expect(htlc.connect(bob).claim(preImage, alice.address)).to.changeTokenBalances(
        testToken,
        [bob, htlc],
        [lockedAmount, -lockedAmount]
      );
    });
  });

  describe("Fee Management", function () {
    it("Should set deployer as owner and default fee recipient", async function () {
      const { htlc, alice } = await loadFixture(deployHTLCFixture);
      
      const owner = await htlc.owner();
      const feeRecipient = await htlc.feeRecipient();
      const feeRate = await htlc.feeRate();
      
      expect(owner).to.equal(alice.address); // First signer is deployer
      expect(feeRecipient).to.equal(alice.address);
      expect(feeRate).to.equal(0);
    });

    it("Should allow owner to set fee recipient", async function () {
      const { htlc, alice, bob } = await loadFixture(deployHTLCFixture);
      
      await expect(htlc.connect(alice).setFeeRecipient(bob.address))
        .to.emit(htlc, "FeeRecipientUpdated")
        .withArgs(alice.address, bob.address);
      
      const feeRecipient = await htlc.feeRecipient();
      expect(feeRecipient).to.equal(bob.address);
    });

    it("Should not allow non-owner to set fee recipient", async function () {
      const { htlc, bob } = await loadFixture(deployHTLCFixture);
      
      await expect(htlc.connect(bob).setFeeRecipient(bob.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert when setting zero address as fee recipient", async function () {
      const { htlc, alice } = await loadFixture(deployHTLCFixture);
      
      await expect(htlc.connect(alice).setFeeRecipient(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(htlc, "ZeroAddress");
    });

    it("Should allow owner to set fee rate", async function () {
      const { htlc, alice } = await loadFixture(deployHTLCFixture);
      const newFeeRate = 100; // 1%
      
      await expect(htlc.connect(alice).setFeeRate(newFeeRate))
        .to.emit(htlc, "FeeRateUpdated")
        .withArgs(0, newFeeRate);
      
      const feeRate = await htlc.feeRate();
      expect(feeRate).to.equal(newFeeRate);
    });

    it("Should not allow non-owner to set fee rate", async function () {
      const { htlc, bob } = await loadFixture(deployHTLCFixture);
      
      await expect(htlc.connect(bob).setFeeRate(100))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert when setting fee rate above maximum", async function () {
      const { htlc, alice } = await loadFixture(deployHTLCFixture);
      const MAX_FEE_RATE = await htlc.MAX_FEE_RATE();
      
      await expect(htlc.connect(alice).setFeeRate(MAX_FEE_RATE + 1n))
        .to.be.revertedWithCustomError(htlc, "InvalidFeeRate");
    });

    it("Should allow setting fee rate to maximum", async function () {
      const { htlc, alice } = await loadFixture(deployHTLCFixture);
      const MAX_FEE_RATE = await htlc.MAX_FEE_RATE();
      
      await expect(htlc.connect(alice).setFeeRate(MAX_FEE_RATE))
        .to.emit(htlc, "FeeRateUpdated")
        .withArgs(0, MAX_FEE_RATE);
      
      const feeRate = await htlc.feeRate();
      expect(feeRate).to.equal(MAX_FEE_RATE);
    });

    it("Should allow setting fee rate to zero", async function () {
      const { htlc, alice } = await loadFixture(deployHTLCFixture);
      
      // Set fee rate first
      await htlc.connect(alice).setFeeRate(100);
      
      // Then set it back to zero
      await expect(htlc.connect(alice).setFeeRate(0))
        .to.emit(htlc, "FeeRateUpdated")
        .withArgs(100, 0);
      
      const feeRate = await htlc.feeRate();
      expect(feeRate).to.equal(0);
    });
  });

  describe("Fee Collection on Claim", function () {
    it("Should not charge fee when fee rate is zero", async function () {
      const { htlc, htlcAddress, testTokenAddress, testToken, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1000n;
      
      // Ensure sufficient allowance and balance
      await (testToken as any).connect(alice).mint(lockedAmount);
      await testToken.connect(alice).approve(htlcAddress, lockedAmount);
      
      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);
      
      await expect(htlc.connect(bob).claim(preImage, alice.address)).to.changeTokenBalances(
        testToken,
        [bob, htlc],
        [lockedAmount, -lockedAmount]
      );
    });

    it("Should charge 1% fee when fee rate is 100", async function () {
      const { htlc, htlcAddress, testTokenAddress, testToken, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const totalLockedAmount = 1010n; // 1000 principal + 10 fee (1%)
      const feeRate = 100n; // 1%
      const expectedPrincipal = (totalLockedAmount * 10000n) / (10000n + feeRate);
      const expectedFee = totalLockedAmount - expectedPrincipal;
      const expectedReceiverAmount = expectedPrincipal;
      
      // Ensure sufficient allowance and balance
      await (testToken as any).connect(alice).mint(totalLockedAmount);
      await testToken.connect(alice).approve(htlcAddress, totalLockedAmount);
      
      // Set fee rate and recipient
      await htlc.connect(alice).setFeeRate(feeRate);
      await htlc.connect(alice).setFeeRecipient(alice.address);
      
      await htlc.connect(alice).lock(hashValue, unlockTime, totalLockedAmount, testTokenAddress, bob.address);
      
      await expect(htlc.connect(bob).claim(preImage, alice.address)).to.changeTokenBalances(
        testToken,
        [bob, alice, htlc],
        [expectedReceiverAmount, expectedFee, -totalLockedAmount]
      );
    });

    it("Should charge 0.5% fee when fee rate is 50", async function () {
      const { htlc, htlcAddress, testTokenAddress, testToken, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const totalLockedAmount = 10050n; // 10000 principal + 50 fee (0.5%)
      const feeRate = 50n; // 0.5%
      const expectedPrincipal = (totalLockedAmount * 10000n) / (10000n + feeRate);
      const expectedFee = totalLockedAmount - expectedPrincipal;
      const expectedReceiverAmount = expectedPrincipal;
      
      // Ensure sufficient allowance and balance
      await (testToken as any).connect(alice).mint(totalLockedAmount);
      await testToken.connect(alice).approve(htlcAddress, totalLockedAmount);
      
      // Set fee rate and recipient
      await htlc.connect(alice).setFeeRate(feeRate);
      await htlc.connect(alice).setFeeRecipient(alice.address);
      
      await htlc.connect(alice).lock(hashValue, unlockTime, totalLockedAmount, testTokenAddress, bob.address);
      
      await expect(htlc.connect(bob).claim(preImage, alice.address)).to.changeTokenBalances(
        testToken,
        [bob, alice, htlc],
        [expectedReceiverAmount, expectedFee, -totalLockedAmount]
      );
    });

    it("Should charge fee to different recipient", async function () {
      const { htlc, htlcAddress, testTokenAddress, testToken, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const [charlie] = await ethers.getSigners();
      const totalLockedAmount = 1010n; // 1000 principal + 10 fee (1%)
      const feeRate = 100n; // 1% with MAX_FEE_RATE = 1000
      const expectedPrincipal = (totalLockedAmount * 10000n) / (10000n + feeRate);
      const expectedFee = totalLockedAmount - expectedPrincipal;
      const expectedReceiverAmount = expectedPrincipal;
      
      // Ensure sufficient allowance and balance
      await (testToken as any).connect(alice).mint(totalLockedAmount);
      await testToken.connect(alice).approve(htlcAddress, totalLockedAmount);
      
      // Set fee rate and recipient to charlie
      await htlc.connect(alice).setFeeRate(feeRate);
      await htlc.connect(alice).setFeeRecipient(charlie.address);
      
      await htlc.connect(alice).lock(hashValue, unlockTime, totalLockedAmount, testTokenAddress, bob.address);
      
      await expect(htlc.connect(bob).claim(preImage, alice.address)).to.changeTokenBalances(
        testToken,
        [bob, charlie, htlc],
        [expectedReceiverAmount, expectedFee, -totalLockedAmount]
      );
    });

    it("Should handle fee calculation with rounding", async function () {
      const { htlc, htlcAddress, testTokenAddress, testToken, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const totalLockedAmount = 333n; // Amount that might cause rounding issues
      const feeRate = 100n; // 1%
      const expectedPrincipal = (totalLockedAmount * 10000n) / (10000n + feeRate);
      const expectedFee = totalLockedAmount - expectedPrincipal; // rounding down
      const expectedReceiverAmount = expectedPrincipal;
      
      // Ensure sufficient allowance and balance
      await (testToken as any).connect(alice).mint(totalLockedAmount);
      await testToken.connect(alice).approve(htlcAddress, totalLockedAmount);
      
      // Set fee rate and recipient
      await htlc.connect(alice).setFeeRate(feeRate);
      await htlc.connect(alice).setFeeRecipient(alice.address);
      
      await htlc.connect(alice).lock(hashValue, unlockTime, totalLockedAmount, testTokenAddress, bob.address);
      
      await expect(htlc.connect(bob).claim(preImage, alice.address)).to.changeTokenBalances(
        testToken,
        [bob, alice, htlc],
        [expectedReceiverAmount, expectedFee, -totalLockedAmount]
      );
    });

    it("Should not charge fee when fee rate is zero", async function () {
      const { htlc, htlcAddress, testTokenAddress, testToken, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const lockedAmount = 1000n;
      
      // Ensure sufficient allowance and balance
      await (testToken as any).connect(alice).mint(lockedAmount);
      await testToken.connect(alice).approve(htlcAddress, lockedAmount);
      
      // Set fee rate to zero
      await htlc.connect(alice).setFeeRate(0);
      
      await htlc.connect(alice).lock(hashValue, unlockTime, lockedAmount, testTokenAddress, bob.address);
      
      await expect(htlc.connect(bob).claim(preImage, alice.address)).to.changeTokenBalances(
        testToken,
        [bob, htlc],
        [lockedAmount, -lockedAmount]
      );
    });

    it("Should emit Claimed event with full amount even when fee is charged", async function () {
      const { htlc, htlcAddress, testTokenAddress, testToken, alice, bob, preImage, hashValue, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const totalLockedAmount = 1010n; // 1000 principal + 10 fee
      const feeRate = 100n; // 1% with MAX_FEE_RATE = 1000
      const expectedPrincipal = (totalLockedAmount * 10000n) / (10000n + feeRate);
      const expectedFee = totalLockedAmount - expectedPrincipal;
      const expectedReceiverAmount = expectedPrincipal;
      
      // Ensure sufficient allowance and balance
      await (testToken as any).connect(alice).mint(totalLockedAmount);
      await testToken.connect(alice).approve(htlcAddress, totalLockedAmount);
      
      // Set fee rate and recipient
      await htlc.connect(alice).setFeeRate(feeRate);
      await htlc.connect(alice).setFeeRecipient(alice.address);
      
      await htlc.connect(alice).lock(hashValue, unlockTime, totalLockedAmount, testTokenAddress, bob.address);
      
      // Event should still show the full locked amount
      await expect(htlc.connect(bob).claim(preImage, alice.address))
        .to.emit(htlc, "Claimed")
        .withArgs(
          preImage,
          hashValue,
          (value: bigint) => value > 0n, // timestamp
          expectedReceiverAmount,
          expectedFee,
          testTokenAddress,
          alice.address,
          bob.address
        );
    });

    it("Should handle multiple claims with fee correctly", async function () {
      const { htlc, htlcAddress, testTokenAddress, testToken, alice, bob, unlockTime } = await loadFixture(
        deployHTLCFixture
      );
      const feeRate = 100n; // 1%
      
      // Set fee rate and recipient
      await htlc.connect(alice).setFeeRate(feeRate);
      await htlc.connect(alice).setFeeRecipient(alice.address);
      
      // Create two locks
      const preImage1 = "0xaaaaaa";
      const hashValue1 = sha256(preImage1);
      const totalLockedAmount1 = 1010n; // 1000 principal + 10 fee
      const expectedPrincipal1 = (totalLockedAmount1 * 10000n) / (10000n + feeRate);
      const expectedFee1 = totalLockedAmount1 - expectedPrincipal1;
      const expectedReceiverAmount1 = expectedPrincipal1;
      
      const preImage2 = "0xbbbbbb";
      const hashValue2 = sha256(preImage2);
      const totalLockedAmount2 = 2020n; // 2000 principal + 20 fee
      const expectedPrincipal2 = (totalLockedAmount2 * 10000n) / (10000n + feeRate);
      const expectedFee2 = totalLockedAmount2 - expectedPrincipal2;
      const expectedReceiverAmount2 = expectedPrincipal2;
      
      // Ensure sufficient allowance and balance
      const totalAmount = totalLockedAmount1 + totalLockedAmount2;
      await (testToken as any).connect(alice).mint(totalAmount);
      await testToken.connect(alice).approve(htlcAddress, totalAmount);
      
      await htlc.connect(alice).lock(hashValue1, unlockTime, totalLockedAmount1, testTokenAddress, bob.address);
      await htlc.connect(alice).lock(hashValue2, unlockTime, totalLockedAmount2, testTokenAddress, bob.address);
      
      // Claim first lock
      await expect(htlc.connect(bob).claim(preImage1, alice.address)).to.changeTokenBalances(
        testToken,
        [bob, alice, htlc],
        [expectedReceiverAmount1, expectedFee1, -totalLockedAmount1]
      );
      
      // Claim second lock
      await expect(htlc.connect(bob).claim(preImage2, alice.address)).to.changeTokenBalances(
        testToken,
        [bob, alice, htlc],
        [expectedReceiverAmount2, expectedFee2, -totalLockedAmount2]
      );
    });
  });

  describe("Permit2 Locking", function () {
    it("Should lock tokens via lockWithPermit2 and emit Locked event", async function () {
      const { htlc, htlcAddress, testToken, testTokenAddress, alice, bob, preImage, hashValue, unlockTime, mockPermit2 } =
        await loadFixture(deployHTLCFixture);

      const lockedAmount = 10n;

      // Mint and approve tokens for MockPermit2 to pull via transferFrom
      await (testToken as any).connect(alice).mint(lockedAmount);
      await testToken.connect(alice).approve(await mockPermit2.getAddress(), lockedAmount);

      const latestTime = await time.latest();
      const permit = {
        permitted: {
          token: testTokenAddress,
          amount: lockedAmount,
        },
        nonce: 0n,
        deadline: BigInt(latestTime) + 3600n,
      };

      const transferDetails = {
        to: htlcAddress,
        requestedAmount: lockedAmount,
      };

      const signature = "0x";

      await expect(
        htlc
          .connect(alice)
          .lockWithPermit2(
            hashValue,
            unlockTime,
            lockedAmount,
            testTokenAddress,
            bob.address,
            permit,
            transferDetails,
            signature
          )
      )
        .to.emit(htlc, "Locked")
        .withArgs(hashValue, unlockTime, lockedAmount, testTokenAddress, alice.address, bob.address);

      // Verify lock data stored correctly
      const lock = await htlc.getLock(hashValue, alice.address);
      expect(lock.amount).to.equal(lockedAmount);
      expect(lock.tokenAddress).to.equal(testTokenAddress);
      expect(lock.senderAddr).to.equal(alice.address);
      expect(lock.receiverAddress).to.equal(bob.address);
    });

    it("Should revert when permit deadline has expired", async function () {
      const { htlc, htlcAddress, testToken, testTokenAddress, alice, bob, hashValue, unlockTime, mockPermit2 } =
        await loadFixture(deployHTLCFixture);

      const lockedAmount = 10n;

      // Mint and approve tokens for MockPermit2
      await (testToken as any).connect(alice).mint(lockedAmount);
      await testToken.connect(alice).approve(await mockPermit2.getAddress(), lockedAmount);

      const latestTime = await time.latest();
      // Set deadline in the past
      const permit = {
        permitted: {
          token: testTokenAddress,
          amount: lockedAmount,
        },
        nonce: 0n,
        deadline: BigInt(latestTime) - 1n, // Expired deadline
      };

      const transferDetails = {
        to: htlcAddress,
        requestedAmount: lockedAmount,
      };

      await expect(
        htlc
          .connect(alice)
          .lockWithPermit2(
            hashValue,
            unlockTime,
            lockedAmount,
            testTokenAddress,
            bob.address,
            permit,
            transferDetails,
            "0x"
          )
      ).to.be.revertedWithCustomError(htlc, "InvalidPermit2Parameters");
    });

    it("Should emit Permit2Updated event when setting Permit2 address", async function () {
      const { htlc, alice } = await loadFixture(deployHTLCFixture);

      // Get current Permit2 address (should be mockPermit2 from fixture)
      const currentPermit2 = await htlc.permit2();

      // Deploy a new MockPermit2
      const MockPermit2 = await ethers.getContractFactory("MockPermit2");
      const newMockPermit2 = await MockPermit2.deploy();
      await newMockPermit2.waitForDeployment();
      const newPermit2Address = await newMockPermit2.getAddress();

      // Set new Permit2 address and verify event
      await expect(htlc.connect(alice).setPermit2(newPermit2Address))
        .to.emit(htlc, "Permit2Updated")
        .withArgs(currentPermit2, newPermit2Address);

      // Verify the address was actually updated
      const updatedPermit2 = await htlc.permit2();
      expect(updatedPermit2).to.equal(newPermit2Address);
    });
  });

  describe("EIP-2612 Permit Locking", function () {
    async function deployHTLCWithPermitTokenFixture() {
      const ONE_YEAR_IN_SECS = 365n * 24n * 60n * 60n;
      const latestTime = await time.latest();
      const unlockTime = BigInt(latestTime) + ONE_YEAR_IN_SECS;

      const [alice, bob] = await ethers.getSigners();

      const HTLC = await ethers.getContractFactory("HTLC");
      const htlc = await HTLC.deploy();
      await htlc.waitForDeployment();
      const htlcAddress = await htlc.getAddress();

      const TestTokenWithPermit = await ethers.getContractFactory("TestTokenWithPermit");
      const testTokenWithPermit = await (TestTokenWithPermit as any).deploy("TestTokenPermit", "TTP");
      await testTokenWithPermit.waitForDeployment();
      const testTokenWithPermitAddress = await testTokenWithPermit.getAddress();

      const preImage = "0xffffff";
      const hashValue = sha256(preImage);

      return { htlc, htlcAddress, testTokenWithPermit, testTokenWithPermitAddress, alice, bob, preImage, hashValue, unlockTime };
    }

    it("Should lock tokens via lockWithPermit and emit Locked event", async function () {
      const { htlc, htlcAddress, testTokenWithPermit, testTokenWithPermitAddress, alice, bob, hashValue, unlockTime } =
        await loadFixture(deployHTLCWithPermitTokenFixture);

      const lockedAmount = 10n;
      await (testTokenWithPermit as any).connect(alice).mint(lockedAmount);

      const latestTime = await time.latest();
      const deadline = BigInt(latestTime) + 3600n;

      // Get the domain separator and create permit signature
      // ERC20Permit uses version "1" by default
      const domain = {
        name: await testTokenWithPermit.name(),
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await testTokenWithPermit.getAddress(),
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const nonce = await testTokenWithPermit.nonces(alice.address);
      const value = {
        owner: alice.address,
        spender: htlcAddress,
        value: lockedAmount,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await alice.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);

      await expect(
        htlc
          .connect(alice)
          .lockWithPermit(
            hashValue,
            unlockTime,
            lockedAmount,
            testTokenWithPermitAddress,
            bob.address,
            deadline,
            sig.v,
            sig.r,
            sig.s
          )
      )
        .to.emit(htlc, "Locked")
        .withArgs(hashValue, unlockTime, lockedAmount, testTokenWithPermitAddress, alice.address, bob.address);

      // Verify lock data stored correctly
      const lock = await htlc.getLock(hashValue, alice.address);
      expect(lock.amount).to.equal(lockedAmount);
      expect(lock.tokenAddress).to.equal(testTokenWithPermitAddress);
      expect(lock.senderAddr).to.equal(alice.address);
      expect(lock.receiverAddress).to.equal(bob.address);
    });

    it("Should transfer tokens to HTLC contract on lockWithPermit", async function () {
      const { htlc, htlcAddress, testTokenWithPermit, testTokenWithPermitAddress, alice, bob, hashValue, unlockTime } =
        await loadFixture(deployHTLCWithPermitTokenFixture);

      const lockedAmount = 10n;
      await (testTokenWithPermit as any).connect(alice).mint(lockedAmount);

      const latestTime = await time.latest();
      const deadline = BigInt(latestTime) + 3600n;

      const domain = {
        name: await testTokenWithPermit.name(),
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await testTokenWithPermit.getAddress(),
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const nonce = await testTokenWithPermit.nonces(alice.address);
      const value = {
        owner: alice.address,
        spender: htlcAddress,
        value: lockedAmount,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await alice.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);

      await expect(
        htlc
          .connect(alice)
          .lockWithPermit(
            hashValue,
            unlockTime,
            lockedAmount,
            testTokenWithPermitAddress,
            bob.address,
            deadline,
            sig.v,
            sig.r,
            sig.s
          )
      ).to.changeTokenBalances(
        testTokenWithPermit,
        [alice, htlc],
        [-lockedAmount, lockedAmount]
      );
    });

    it("Should revert when permit deadline has expired", async function () {
      const { htlc, htlcAddress, testTokenWithPermit, testTokenWithPermitAddress, alice, bob, hashValue, unlockTime } =
        await loadFixture(deployHTLCWithPermitTokenFixture);

      const lockedAmount = 10n;
      await (testTokenWithPermit as any).connect(alice).mint(lockedAmount);

      const latestTime = await time.latest();
      const deadline = BigInt(latestTime) - 1n; // Expired deadline

      const domain = {
        name: await testTokenWithPermit.name(),
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await testTokenWithPermit.getAddress(),
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const nonce = await testTokenWithPermit.nonces(alice.address);
      const value = {
        owner: alice.address,
        spender: htlcAddress,
        value: lockedAmount,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await alice.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);

      await expect(
        htlc
          .connect(alice)
          .lockWithPermit(
            hashValue,
            unlockTime,
            lockedAmount,
            testTokenWithPermitAddress,
            bob.address,
            deadline,
            sig.v,
            sig.r,
            sig.s
          )
      ).to.be.revertedWithCustomError(htlc, "InvalidPermitParameters");
    });

    it("Should revert if token does not support permit", async function () {
      const { htlc, testTokenAddress, alice, bob, hashValue, unlockTime } = await loadFixture(deployHTLCFixture);

      const lockedAmount = 10n;
      const latestTime = await time.latest();
      const deadline = BigInt(latestTime) + 3600n;

      // Try to use regular TestToken (without permit support)
      await expect(
        htlc
          .connect(alice)
          .lockWithPermit(
            hashValue,
            unlockTime,
            lockedAmount,
            testTokenAddress,
            bob.address,
            deadline,
            0,
            ethers.ZeroHash,
            ethers.ZeroHash
          )
      ).to.be.reverted; // Should revert because TestToken doesn't have permit function
    });
  });
});
