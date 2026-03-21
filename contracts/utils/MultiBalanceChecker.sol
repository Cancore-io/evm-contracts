// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MultiBalanceChecker {
    function balances(address[] calldata users, address[] calldata tokens) external view returns (uint256[] memory) {
        uint256[] memory addrBalances = new uint256[](tokens.length * users.length);

        for (uint256 i = 0; i < users.length; i++) {
            for (uint256 j = 0; j < tokens.length; j++) {
                uint256 addrIdx = j + tokens.length * i;
                if (tokens[j] != address(0)) {
                    addrBalances[addrIdx] = IERC20(tokens[j]).balanceOf(users[i]);
                } else {
                    addrBalances[addrIdx] = users[i].balance;
                }
            }
        }

        return addrBalances;
    }

    receive() external payable {
        revert("This contract does not accept ethers");
    }

    fallback() external payable {
        revert("This contract does not accept ethers");
    }
}