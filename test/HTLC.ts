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

    return { htlc, htlcAddress, testToken, testTokenAddress, alice, bob, preImage, hashValue, unlockTime };
  }

  describe("Locking", function () {
    it("Should revert with zero value", async function () {
      const { htlc, testTokenAddress, alice, bob, hashValue } = await loadFixture(deployHTLCFixture);

      await expect(htlc.connect(alice).lock(hashValue, 1, 0, testTokenAddress, bob.address))
        .to.be.revertedWithCustomError(htlc, "ZeroAmount");
    });

    it("Should revert if locker does not have enough tokens", async function () {
      const { htlc, testTokenAddress, alice, bob, hashValue } = await loadFixture(
        deployHTLCFixture
      );

      await expect(htlc.connect(bob).lock(hashValue, 1, 1, testTokenAddress, alice.address)).to.be.revertedWith(
        "ERC20: transfer amount exceeds balance"
      );
    });

    it("Should revert if insufficient allowance", async function () {
      const { htlc, htlcAddress, testToken, testTokenAddress, alice, bob, hashValue } = await loadFixture(
        deployHTLCFixture
      );

      // Revoke approval
      await testToken.connect(alice).approve(htlcAddress, 0);

      await expect(htlc.connect(alice).lock(hashValue, 1, 1, testTokenAddress, bob.address)).to.be.revertedWith(
        "ERC20: insufficient allowance"
      );
    });

    it("Should not allowing locking twice with the same hash", async function () {
      const { htlc, testTokenAddress, alice, bob, hashValue } = await loadFixture(
        deployHTLCFixture
      );

      await htlc.connect(alice).lock(hashValue, 1, 1, testTokenAddress, bob.address);

      await expect(htlc.connect(alice).lock(hashValue, 1, 1, testTokenAddress, bob.address))
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
});
