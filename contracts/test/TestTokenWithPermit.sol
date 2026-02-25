// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title TestTokenWithPermit
 * @notice ERC20 token with EIP-2612 permit support for testing HTLC.lockWithPermit
 * @dev Uses OpenZeppelin's ERC20Permit which implements EIP-2612
 */
contract TestTokenWithPermit is ERC20Permit {
    constructor(string memory name_, string memory symbol_) ERC20Permit(name_) ERC20(name_, symbol_) {}

    /// @notice Mint any amount of tokens to the caller
    /// @dev Accessible by any user, intended only for testing
    /// @param amount The amount of tokens to mint
    function mint(uint256 amount) external {
        _mint(msg.sender, amount);
    }
}

