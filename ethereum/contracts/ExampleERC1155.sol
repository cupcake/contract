// SPDX-License-Identifier: MIT

/*
 * Original credit to: @sidarth16 (https://github.com/sidarth16)
 * From: https://github.com/sidarth16/Rentable-NFTs/blob/main/contracts/RentableNft.sol
 */

pragma solidity ^0.8.7;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";

contract ExampleERC1155 is ERC1155Upgradeable {

  function initialize() external initializer {
    __ERC1155_init("http://example.com/json_file_here.json");
  }

  function mintNFT(address to, uint256 tokenId) external {
    _mint(to, tokenId, 1, "0x00");
  }

  function mintFungible(address to, uint256 amount) external {
    _mint(to, 0, amount, "0x00");
  }
}
