// SPDX-License-Identifier: MIT

/*
 * Original credit to: @sidarth16 (https://github.com/sidarth16)
 * From: https://github.com/sidarth16/Rentable-NFTs/blob/main/contracts/RentableNft.sol
 */

pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155URIStorageUpgradeable.sol";

import "../interfaces/IERC1155CopyableUpgradeable.sol";

contract ExampleERC1155Copyable is ERC1155URIStorageUpgradeable, IERC1155CopyableUpgradeable {

  function initialize() public initializer {
  	__ERC1155URIStorage_init();
    __ERC1155_init("http://example.com/json_file_here.json");
  }

  function mintCopy(address _to, uint256 _tokenIdMaster, uint256 _tokenIdCopy) external {
    _mint(_to, _tokenIdCopy, 1, "0x00");
    _setURI(_tokenIdCopy, uri(_tokenIdMaster));
  }
}
