// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// ERC20 token used for unit testing
contract TestToken is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    /// @notice Mint any amount of tokens to the caller
    /// @dev Accessible by any user, intended only for testing
    /// @param amount The amount of tokens to mint
    function mint(uint256 amount) external {
        _mint(msg.sender, amount);
    }
}

