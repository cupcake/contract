// SPDX-License-Identifier: MIT

/*
 * Original credit to: @sidarth16 (https://github.com/sidarth16)
 * From: https://github.com/sidarth16/Rentable-NFTs/blob/main/contracts/RentableNft.sol
 */

pragma solidity ^0.8.7;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155URIStorageUpgradeable.sol";

import "../interfaces/IERC1155CopyableUpgradeable.sol";

contract ExampleERC1155Copyable is ERC1155URIStorageUpgradeable, IERC1155CopyableUpgradeable {

  function initialize() external initializer {
  	__ERC1155URIStorage_init();
    __ERC1155_init("http://example.com/json_file_here.json");
  }

  function mintCopy(address to, uint256 tokenIdMaster, uint256 tokenIdCopy) override external {
    _mint(to, tokenIdCopy, 1, "0x00");
    _setURI(tokenIdCopy, uri(tokenIdMaster));
  }
}
