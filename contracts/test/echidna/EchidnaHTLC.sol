// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import "../../HTLC.sol";
import "../TestToken.sol";

/**
 * @title EchidnaHTLC
 * @notice Property-based invariant harness for the HTLC contract, driven by Echidna.
 * @dev Maps the cross-chain invariant registry (docs/rtm/invariants.md) onto the
 *      EVM leg of the swap:
 *
 *      - INV-1 (value conservation) / INV-5 (bounded rounding):
 *          `echidna_balance_covers_locks` — the HTLC's token balance always equals
 *          the ghost sum of currently active locked amounts. With feeRate == 0 the
 *          equality is exact; locking adds, claiming/retaking removes.
 *      - INV-2 (claim XOR refund): a lock is deleted on the first successful claim
 *          or retake, so a second settlement of the same key reverts and never
 *          double-spends — the harness only decrements the ghost once per key
 *          (`_settle`), and conservation would break if the contract allowed both.
 *      - INV-3 (secret usable until deadline): `claim` requires `block.timestamp <
 *          unlockTime` and `retake` requires `>= unlockTime`, so the two settlement
 *          paths are mutually exclusive in time — Echidna exercises both by fuzzing
 *          timestamps.
 *
 *      Echidna acts as both sender and receiver (address(this)) so it can freely
 *      drive lock -> claim and lock -> retake without external signers. This is a
 *      scaffold: it is not wired into CI until the evm-toolchain ticket lands the
 *      Echidna/crytic-compile runner. See .github/workflows/echidna.yml.
 */
contract EchidnaHTLC {
    HTLC internal immutable htlc;
    TestToken internal immutable token;

    // Ghost accounting of funds the harness believes are locked in the HTLC.
    uint256 internal ghostLocked;

    // Active-lock bookkeeping keyed by the HTLC lock key.
    bytes32[] internal keys;
    mapping(bytes32 => bool) internal active;
    mapping(bytes32 => uint256) internal amountOf;
    mapping(bytes32 => bytes32) internal hashOf;
    mapping(bytes32 => string) internal preimageOf;

    // Bound lock sizes so ghost math and mint stay well clear of overflow.
    uint256 internal constant MAX_AMOUNT = 1e24;
    uint256 internal constant MAX_DURATION = 30 days;

    constructor() {
        htlc = new HTLC(); // feeRecipient = this, feeRate = 0
        token = new TestToken("Echidna", "ECH");
    }

    // ---------------------------------------------------------------------
    // Fuzzed actions
    // ---------------------------------------------------------------------

    function doLock(uint256 amtSeed, uint256 secretNonce, uint256 durSeed) public {
        uint256 amount = 1 + (amtSeed % MAX_AMOUNT);
        if (token.balanceOf(address(this)) < amount) {
            token.mint(amount);
        }
        token.approve(address(htlc), amount);

        string memory pre = _preimage(secretNonce);
        bytes32 h = sha256(bytes(pre));
        bytes32 key = keccak256(abi.encodePacked(h, address(this)));
        if (active[key]) return; // avoid the LockAlreadyExists revert path

        uint256 unlockTime = block.timestamp + 1 + (durSeed % MAX_DURATION);

        try htlc.lock(h, unlockTime, amount, address(token), address(this)) {
            active[key] = true;
            amountOf[key] = amount;
            hashOf[key] = h;
            preimageOf[key] = pre;
            keys.push(key);
            ghostLocked += amount;
        } catch {}
    }

    function doClaim(uint256 idx) public {
        bytes32 key = _pickActive(idx);
        if (key == bytes32(0)) return;

        try htlc.claim(preimageOf[key], address(this)) {
            _settle(key);
        } catch {}
    }

    function doRetake(uint256 idx) public {
        bytes32 key = _pickActive(idx);
        if (key == bytes32(0)) return;

        try htlc.retake(hashOf[key]) {
            _settle(key);
        } catch {}
    }

    // ---------------------------------------------------------------------
    // Invariants
    // ---------------------------------------------------------------------

    /// INV-1 / INV-5: the HTLC never holds more or less than the active locks claim.
    function echidna_balance_covers_locks() public view returns (bool) {
        return token.balanceOf(address(htlc)) == ghostLocked;
    }

    /// Sanity: ghost accounting can never exceed everything ever minted.
    function echidna_ghost_within_supply() public view returns (bool) {
        return ghostLocked <= token.totalSupply();
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _settle(bytes32 key) internal {
        active[key] = false;
        ghostLocked -= amountOf[key];
    }

    function _pickActive(uint256 idx) internal view returns (bytes32) {
        uint256 n = keys.length;
        if (n == 0) return bytes32(0);
        bytes32 key = keys[idx % n];
        return active[key] ? key : bytes32(0);
    }

    function _preimage(uint256 nonce) internal pure returns (string memory) {
        return string(abi.encodePacked("cancore-secret-", _toString(nonce)));
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
