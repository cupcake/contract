// SPDX-License-Identifier: MIT

/*
 * Original credit to: @sidarth16 (https://github.com/sidarth16)
 * From: https://github.com/sidarth16/Rentable-NFTs/blob/main/contracts/RentableNft.sol
 */

pragma solidity ^0.8.7;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";

contract ExampleERC1155Mintable is ERC1155Upgradeable {

  function initialize(string memory uri) external initializer {
    __ERC1155_init(uri);
  }

  function mint(address to, uint256 id, uint256 amount, bytes memory data) external {
    _mint(to, id, amount, data);
  }
}
