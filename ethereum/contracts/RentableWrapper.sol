// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

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
    address indexed _asset,
    uint256 indexed _underlyingTokenId,
    uint256 indexed _wrappedTokenId,
    address _tokenDepositor
  );

  /// @notice This emits when an underlying NFT is unwrapped.
  event Unwrap(
    address indexed _asset,
    uint256 indexed _underlyingTokenId,
    uint256 indexed _wrappedTokenId,
    address _tokenDepositor
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

  function initialize(string memory name_, string memory symbol_) public initializer {
    __Ownable_init();
    __ERC721_init(name_, symbol_);
  }

  /*
   * @notice Authorizes contract upgrades only for the contract owner (contract deployer) via the onlyOwner modifier.
   */
  function _authorizeUpgrade(address) internal override onlyOwner {}

  /**
   * @notice wrap an NFT inside a newly minted wrapper NFT
   * @dev The user must own the NFT that is being wrapped
   * @param _asset    The address of the token that we would like to wrap
   * @param _underlyingTokenId  The tokenId of the token that we would like to wrap
   * @return _newTokenId  The tokenId of the newly generated wrapper token
   */
  function wrap(IERC721MetadataUpgradeable _asset, uint256 _underlyingTokenId) external returns(uint256 _newTokenId) {
    require(_asset.ownerOf(_underlyingTokenId) == msg.sender, 'asset not owned by msg.sender');

    _asset.safeTransferFrom(
      msg.sender,
      address(this),
      _underlyingTokenId
    );

    require(_asset.ownerOf(_underlyingTokenId) == address(this), 'asset transfer failed');

    _safeMint(msg.sender, tokenIdCounter.current());

    Token storage token = tokens[tokenIdCounter.current()];
    token.asset = _asset;
    token.underlyingTokenId = _underlyingTokenId;

    tokenIdCounter.increment();

    emit Wrap(
      address(_asset),
      _underlyingTokenId,
      tokenIdCounter.current() - 1,
      msg.sender
    );

    return tokenIdCounter.current() - 1;
  }

  /**
   * @notice unwrap an NFT to extract it from the wrapper NFT
   * @dev The user must own the wrapped NFT and be the current user ("renter") of the wrapped NFT
   * @param _wrappedTokenId  The tokenId of the NFT that we would like to unwrap
   */
  function unwrap(uint256 _wrappedTokenId) external {
    require(ownerOf(_wrappedTokenId) == msg.sender, 'asset not owned by msg.sender');
    require(userOf(_wrappedTokenId) == msg.sender || userOf(_wrappedTokenId) == address(0), 'curnt user must be owner or 0x0');

    tokens[_wrappedTokenId].asset.safeTransferFrom(
      address(this),
      msg.sender,
      tokens[_wrappedTokenId].underlyingTokenId
    );

    require(tokens[_wrappedTokenId].asset.ownerOf(tokens[_wrappedTokenId].underlyingTokenId) == msg.sender, 'asset transfer failed');

    delete tokens[_wrappedTokenId];

    emit Unwrap(
      address(tokens[_wrappedTokenId].asset),
      tokens[_wrappedTokenId].underlyingTokenId,
      _wrappedTokenId,
      msg.sender
    );
  }

  function isWrapped(uint256 _wrappedTokenId) public view returns(bool) {
    return address(tokens[_wrappedTokenId].asset) == address(0);
  }

  /**
   * @notice Gets the wrapped Uniform Resource Identifier (URI) for `tokenId` token.
   * @param _wrappedTokenId  The tokenId for the desired tokenURI
   */
  function tokenURI(uint256 _wrappedTokenId) public view virtual override returns (string memory) {
    require(isWrapped(_wrappedTokenId), 'token not wrapped');

    return tokens[_wrappedTokenId].asset.tokenURI(tokens[_wrappedTokenId].underlyingTokenId);
  }

  /**
   * @notice set the _user and _expires of a NFT
   * @dev The zero address indicates there is no user 
   * @param _tokenId  The tokenId that's user is being changed
   * Throws if `tokenId` is not valid NFT
   * @param _user     The new user of the NFT
   * @param _expires  UNIX timestamp, The new user could use the NFT before expires
   */
  function setUser(uint256 _tokenId, address _user, uint64 _expires) public override virtual {
    require(_isApprovedOrOwner(msg.sender, _tokenId),"caller not owner nor approved");
    require(_expires > block.timestamp, "_expires should be in future");
    
    Token storage token = tokens[_tokenId];
    token.user = _user;
    token.expires = _expires;
    emit UpdateUser(_tokenId, _user, _expires);
  }

  /**
   * @notice Get the user address of an NFT
   * @dev The zero address indicates that there is no user or the user is expired
   * @param _tokenId The NFT to get the user address for
   * @return The user address for this NFT
   */
  function userOf(uint256 _tokenId) public view override virtual returns(address) {
    if(uint256(tokens[_tokenId].expires) >= block.timestamp){
      return tokens[_tokenId].user;
    }
    return address(0);
  }

  /**
   * @notice Get the user expires of an NFT
   * @dev The zero value indicates that there is no user 
   * @param _tokenId The NFT to get the user expires for
   * @return The user expires for this NFT
   */
  function userExpires(uint256 _tokenId) public view override virtual returns(uint256) {
    return tokens[_tokenId].expires;
  }

  /**
   * @dev See {IERC165-supportsInterface}.
   */
  function supportsInterface(bytes4 _interfaceId) public view virtual override(ERC721Upgradeable, IERC165Upgradeable) returns (bool) {
    return _interfaceId == type(IERC4907Upgradeable).interfaceId || super.supportsInterface(_interfaceId);
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
