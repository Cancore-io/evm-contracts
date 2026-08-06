// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @title Migrations
 * @notice Standard TronBox migration-state contract (deployment bookkeeping only).
 */
contract Migrations {
    address public owner = msg.sender;
    uint256 public last_completed_migration;

    modifier restricted() {
        require(msg.sender == owner, "restricted to owner");
        _;
    }

    function setCompleted(uint256 completed) public restricted {
        last_completed_migration = completed;
    }
}
