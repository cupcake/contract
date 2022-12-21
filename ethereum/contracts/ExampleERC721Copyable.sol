// SPDX-License-Identifier: MIT

/*
 * Original credit to: @sidarth16 (https://github.com/sidarth16)
 * From: https://github.com/sidarth16/Rentable-NFTs/blob/main/contracts/RentableNft.sol
 */

pragma solidity ^0.8.7;

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";

import "../interfaces/IERC721CopyableUpgradeable.sol";

contract ExampleERC721Copyable is ERC721URIStorageUpgradeable, IERC721CopyableUpgradeable {

  function initialize() external initializer {
    __ERC721_init("TestCopyableNFT721","TCN");
  }

  function mintCopy(address to, uint256 tokenIdMaster, uint256 tokenIdCopy) override external {
    _safeMint(to, tokenIdCopy);
    _setTokenURI(tokenIdCopy, tokenURI(tokenIdMaster));
  }

  function mint(address to, uint256 tokenId) external {
    _safeMint(to, tokenId);
  }

  function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721Upgradeable, IERC165Upgradeable) returns (bool) {
    return interfaceId == type(IERC721CopyableUpgradeable).interfaceId || super.supportsInterface(interfaceId);
  }
}
