// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721MetadataUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

import "../interfaces/IERC4907Upgradeable.sol";

/*
 * The RentableWrapperStorage contract contains all of the RentableWrapper's state variables which are then inherited by RentableWrapper.
 * Via this seperation of storage and logic we ensure that RentableWrapper's state variables come first in the storage layout
 * and that RentableWrapper has the ability to change the list of contracts it inherits from in the future via upgradeability.
 */
contract RentableWrapperStorage {
  using SafeMathUpgradeable for uint256;
  using CountersUpgradeable for CountersUpgradeable.Counter;

  /// @notice This emits when an underlying NFT is wrapped.
  event Wrap(
    address indexed asset,
    uint256 indexed underlyingTokenId,
    uint256 indexed wrappedTokenId,
    address tokenDepositor
  );

  /// @notice This emits when an underlying NFT is unwrapped.
  event Unwrap(
    address indexed asset,
    uint256 indexed underlyingTokenId,
    uint256 indexed wrappedTokenId,
    address tokenDepositor
  );

  CountersUpgradeable.Counter internal tokenIdCounter;

  struct Token {
    IERC721MetadataUpgradeable asset;  // the address of the underlying wrapped asset
    uint256 underlyingTokenId;         // the tokenId of the underlying wrapped asset
    address user;                      // address of user role
    uint64 expires;                    // unix timestamp, user expires
  }

  mapping(uint256 => Token) public tokens;
}

contract RentableWrapper is RentableWrapperStorage, ERC721Upgradeable, IERC4907Upgradeable, ERC721HolderUpgradeable, UUPSUpgradeable, OwnableUpgradeable {
  using SafeMathUpgradeable for uint256;
  using CountersUpgradeable for CountersUpgradeable.Counter;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function initialize(string memory name, string memory symbol) external initializer {
    __Ownable_init();
    __ERC721_init(name, symbol);
  }

  /*
   * @notice Authorizes contract upgrades only for the contract owner (contract deployer) via the onlyOwner modifier.
   */
  function _authorizeUpgrade(address) internal override onlyOwner {}

  /**
   * @notice wrap an NFT inside a newly minted wrapper NFT
   * @dev The user must own the NFT that is being wrapped
   * @param asset    The address of the token that we would like to wrap
   * @param underlyingTokenId  The tokenId of the token that we would like to wrap
   * @return newTokenId  The tokenId of the newly generated wrapper token
   */
  function wrap(IERC721MetadataUpgradeable asset, uint256 underlyingTokenId) external returns(uint256 newTokenId) {
    require(asset.ownerOf(underlyingTokenId) == msg.sender, 'asset not owned by msg.sender');
    require(asset.getApproved(underlyingTokenId) == address(this), 'asset not approved');

    Token storage token = tokens[tokenIdCounter.current()];
    token.asset = asset;
    token.underlyingTokenId = underlyingTokenId;

    _safeMint(msg.sender, tokenIdCounter.current());

    asset.safeTransferFrom(
      msg.sender,
      address(this),
      underlyingTokenId
    );

    require(asset.ownerOf(underlyingTokenId) == address(this), 'asset transfer failed');

    tokenIdCounter.increment();

    emit Wrap(
      address(asset),
      underlyingTokenId,
      tokenIdCounter.current() - 1,
      msg.sender
    );

    return tokenIdCounter.current() - 1;
  }

  /**
   * @notice unwrap an NFT to extract it from the wrapper NFT
   * @dev The user must own the wrapped NFT and be the current user ("renter") of the wrapped NFT
   * @param wrappedTokenId  The tokenId of the NFT that we would like to unwrap
   */
  function unwrap(uint256 wrappedTokenId) external {
    require(ownerOf(wrappedTokenId) == msg.sender, 'asset not owned by msg.sender');
    require(userOf(wrappedTokenId) == msg.sender || userOf(wrappedTokenId) == address(0), 'curnt user must be owner or 0x0');

    IERC721MetadataUpgradeable asset = tokens[wrappedTokenId].asset;
    uint256 underlyingTokenId = tokens[wrappedTokenId].underlyingTokenId;
    
    emit Unwrap(
      address(asset),
      underlyingTokenId,
      wrappedTokenId,
      msg.sender
    );

    delete tokens[wrappedTokenId];

    asset.safeTransferFrom(
      address(this),
      msg.sender,
      underlyingTokenId
    );

    require(asset.ownerOf(underlyingTokenId) == msg.sender, 'asset transfer failed');
  }

  function isWrapped(uint256 wrappedTokenId) public view returns(bool) {
    return address(tokens[wrappedTokenId].asset) == address(0);
  }

  /**
   * @notice Gets the wrapped Uniform Resource Identifier (URI) for `tokenId` token.
   * @param wrappedTokenId  The tokenId for the desired tokenURI
   */
  function tokenURI(uint256 wrappedTokenId) public view virtual override returns (string memory) {
    require(isWrapped(wrappedTokenId), 'token not wrapped');

    return tokens[wrappedTokenId].asset.tokenURI(tokens[wrappedTokenId].underlyingTokenId);
  }

  /**
   * @notice set the user and expires of a NFT
   * @dev The zero address indicates there is no user 
   * @param tokenId  The tokenId that's user is being changed
   * Throws if `tokenId` is not valid NFT
   * @param user     The new user of the NFT
   * @param expires  UNIX timestamp, The new user could use the NFT before expires
   */
  function setUser(uint256 tokenId, address user, uint64 expires) external override virtual {
    require(_isApprovedOrOwner(msg.sender, tokenId),"caller not owner nor approved");
    require(expires > block.timestamp, "expires should be in future");
    
    Token storage token = tokens[tokenId];
    token.user = user;
    token.expires = expires;
    emit UpdateUser(tokenId, user, expires);
  }

  /**
   * @notice Get the user address of an NFT
   * @dev The zero address indicates that there is no user or the user is expired
   * @param tokenId The NFT to get the user address for
   * @return The user address for this NFT
   */
  function userOf(uint256 tokenId) public view override virtual returns(address) {
    if(uint256(tokens[tokenId].expires) >= block.timestamp){
      return tokens[tokenId].user;
    }
    return address(0);
  }

  /**
   * @notice Get the user expires of an NFT
   * @dev The zero value indicates that there is no user 
   * @param tokenId The NFT to get the user expires for
   * @return The user expires for this NFT
   */
  function userExpires(uint256 tokenId) external view override virtual returns(uint256) {
    return tokens[tokenId].expires;
  }

  /**
   * @dev See {IERC165-supportsInterface}.
   */
  function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721Upgradeable, IERC165Upgradeable) returns (bool) {
    return interfaceId == type(IERC4907Upgradeable).interfaceId || super.supportsInterface(interfaceId);
  }

  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId
  ) internal virtual override {
    super._beforeTokenTransfer(from, to, tokenId);

    if (
      from != to &&
      tokens[tokenId].user != address(0) &&       //user present
      block.timestamp >= tokens[tokenId].expires  //user expired
    ) {
      delete tokens[tokenId];
      emit UpdateUser(tokenId, address(0), 0);
    }
  }
}
