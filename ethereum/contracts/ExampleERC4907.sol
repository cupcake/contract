// SPDX-License-Identifier: MIT

/*
 * Original credit to: @sidarth16 (https://github.com/sidarth16)
 * From: https://github.com/sidarth16/Rentable-NFTs/blob/main/contracts/RentableNft.sol
 */

pragma solidity ^0.8.7;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";

import "../interfaces/IERC4907Upgradeable.sol";

contract ExampleERC4907 is ERC721Upgradeable, IERC4907Upgradeable {
  struct UserInfo 
  {
    address user;   // address of user role
    uint64 expires; // unix timestamp, user expires
  }

  // using Strings for uint256;
  using CountersUpgradeable for CountersUpgradeable.Counter;
  CountersUpgradeable.Counter private _tokenIdCounter;

  mapping (uint256  => UserInfo) private _users;

  function initialize() external initializer {
    __ERC721_init("TestRentableNFT","TRN");
  }
  
  /// @notice set the user and expires of a NFT
  /// @dev The zero address indicates there is no user 
  /// Throws if `tokenId` is not valid NFT
  /// @param user  The new user of the NFT
  /// @param expires  UNIX timestamp, The new user could use the NFT before expires
  function setUser(uint256 tokenId, address user, uint64 expires) external override virtual{
    require(_isApprovedOrOwner(msg.sender, tokenId),"ERC721Upgradeable: transfer caller is not owner nor approved");
    // require(userOf(tokenId)==address(0),"User already assigned");
    require(expires > block.timestamp, "expires should be in future");
    UserInfo storage info =  _users[tokenId];
    info.user = user;
    info.expires = expires;
    emit UpdateUser(tokenId,user,expires);
  }

  /// @notice Get the user address of an NFT
  /// @dev The zero address indicates that there is no user or the user is expired
  /// @param tokenId The NFT to get the user address for
  /// @return The user address for this NFT
  function userOf(uint256 tokenId) public view override virtual returns(address){
    if( uint256(_users[tokenId].expires) >=  block.timestamp){
      return _users[tokenId].user; 
    }
    return address(0);
  }

  /// @notice Get the user expires of an NFT
  /// @dev The zero value indicates that there is no user 
  /// @param tokenId The NFT to get the user expires for
  /// @return The user expires for this NFT
  function userExpires(uint256 tokenId) external view override virtual returns(uint256){
    return _users[tokenId].expires;
  }

  /// @dev See {IERC165-supportsInterface}.
  function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721Upgradeable, IERC165Upgradeable) returns (bool) {
    return interfaceId == type(IERC4907Upgradeable).interfaceId || super.supportsInterface(interfaceId);
  }

  function nftMint() external returns (uint256){
    _tokenIdCounter.increment();
    uint256 tokenId = _tokenIdCounter.current();
    _safeMint(msg.sender, tokenId);
    return tokenId;
  }

  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId
  ) internal virtual override{
    super._beforeTokenTransfer(from, to, tokenId);

    if (
      from != to &&
      _users[tokenId].user != address(0) &&       //user present
      block.timestamp >= _users[tokenId].expires  //user expired
    ) {
      delete _users[tokenId];
      emit UpdateUser(tokenId, address(0), 0);
    }
  }
}
