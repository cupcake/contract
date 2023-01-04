// SPDX-License-Identifier: MIT

/*
 * Original credit to: @sidarth16 (https://github.com/sidarth16)
 * From: https://github.com/sidarth16/Rentable-NFTs/blob/main/contracts/RentableNft.sol
 */

pragma solidity ^0.8.7;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

contract ExampleERC20Mintable is ERC20Upgradeable {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  function initialize(string memory name_, string memory symbol_) external initializer {
    __ERC20_init(name_, symbol_);
  }

  function mint(address account, uint256 amount) external {
    _mint(account, amount);
  }
}
