// SPDX-License-Identifier: MIT

/*
 * Original credit to: @sidarth16 (https://github.com/sidarth16)
 * From: https://github.com/sidarth16/Rentable-NFTs/blob/main/contracts/RentableNft.sol
 */

pragma solidity ^0.8.7;

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";

contract ExampleERC721Mintable is ERC721URIStorageUpgradeable {

  function initialize(string memory name, string memory symbol) external initializer {
    __ERC721_init(name, symbol);
  }

  function mint(address to, uint256 tokenId) external {
    _safeMint(to, tokenId);
  }

  function setTokenURI(uint256 tokenId, string memory tokenURI) external {
    _setTokenURI(tokenId, tokenURI);
  }
}
