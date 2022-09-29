//SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

import "../interfaces/IERC4907Upgradeable.sol";

/*
 * The ContractStorage contract contains all of the Contract's state variables which are then inherited by Contract.
 * Via this seperation of storage and logic we ensure that Contract's state variables come first in the storage layout
 * and that Contract has the ability to change the list of contracts it inherits from in the future via upgradeability.
 */
contract ContractStorage {
  using SafeMathUpgradeable for uint256;

  uint64 constant internal MAX_UINT64 = (2 ** 64) - 1; // Represents the largest possible Unix timestamp

  enum TagType {
    // Each claimable NFT is a copy of the master NFT, up to the preset total supply
    LimitedOrOpenEdition,
    // Only one claimable NFT, always with a supply of 1
    SingleUse1Of1,
    // One claimable NFT, that can be continually refilled (unrestricted by the preset total supply)
    Refillable1Of1,
    // Claimable fungible tokens (claimed based on an amount per user), up to the preset total supply
    WalletRestrictedFungible,
    // Only one NFT that is temporarily held by the claimer, possession is transferred after each subsequent claim
    HotPotato,
    // Each claimable NFT is randomly selected from a predefined set (NFTs may be from multiple collections),
    // up to the preset total supply
    // TODO: Architect using contract factory
    CandyMachineDrop
  }

  struct Tag {
    // The enum type of the tag
    TagType tagType;
    // The address of the ERC-1155, ERC-721 or ERC-20 compliant claimable token
    address tokenAddress;
    // The token ID of the NFT claimable token (Only used for non-fungible claims)
    uint256 erc721TokenId;
    // The address that must have signed for a claim transaction to be valid
    address tagAuthority;
    // Indicates the total claimable supply of the token available
    uint256 totalSupply;
    // Indicates the total claimable supply of the token available per user
    uint256 perUser;
    // Indicates the amount of fungible token to make claimable per claim (only for fungible claims)
    uint256 fungiblePerClaim;
    // The uid string from the NFC tag
    uint256 uid; // uint64 used
    // Indicates the total number of token claims made so far
    uint256 numClaimed;
    // Indicates the number of token claims made by address so far
    mapping (
      address => uint256 // uint8 used
    ) claimsMade;
  }

  mapping (
    // tag's unique address
    bytes32 => Tag
  ) public tags;

  // The total number of tags in existance
  uint256 public numTags;
}

contract Contract is ContractStorage, UUPSUpgradeable, OwnableUpgradeable, ERC721HolderUpgradeable, ERC1155HolderUpgradeable {

  ////////////////////////////////////////////////
  //////// I N I T I A L I Z E R

  /*
   * Initalizes the state variables.
   */
  function initialize() public initializer {
    numTags = 0;
    __Ownable_init();
  }

  ////////////////////////////////////////////////
  //////// F U N C T I O N S

  /*
   * @notice Authorizes contract upgrades only for the contract owner (contract deployer) via the onlyOwner modifier.
   */
  function _authorizeUpgrade(address) internal override onlyOwner {}

  /*
   * @notice The hash function used to identify unique tags
   */
  function hashUniqueTag(address bakeryPubkey, uint256 tagUid) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(bakeryPubkey, tagUid));
  }

  /*
   * @notice Add or refill ERC-1155 assets that can be claimed for a specified tag
   * @returns uint256 representing the total claimable supply now available for this tag
   */
  function addOrRefillTag(
    TagType tagType,
    address tokenAddress,
    uint256 erc721TokenId,
    address tagAuthority, // The address that must have signed for a claim transaction to be valid
    uint256 totalSupply,
    uint256 perUser,
    uint256 fungiblePerClaim,
    uint256 uid,
    // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
    // NOTE: Only relevent when `tagType` is one of the following: LimitedOrOpenEdition, SingleUse1Of1, Refillable1Of1
    bool isNotErc1155
  ) external returns(uint256) {
    // The following checks are only required when the tagType is not HotPotato
    require (tagType == TagType.HotPotato || totalSupply > 0, 'zero totalSupply');
    require (tagType == TagType.HotPotato || perUser > 0, 'zero perUser');
    require (tagType == TagType.HotPotato || perUser <= totalSupply, 'perUser > totalSupply');

    bytes32 tagHash = hashUniqueTag(msg.sender, uid);

    bool isNewTag = tags[tagHash].totalSupply == 0;

    require (isNewTag || msg.sender == tags[tagHash].tagAuthority, 'old tag and tagAuth not signer');
    require (isNewTag || tagType == tags[tagHash].tagType, 'old tag and different tagType');

    if (tagType == TagType.LimitedOrOpenEdition) {
      // Verify that either this tag has never existed before or the supply has been completely drained
      require (isNewTag || tags[tagHash].numClaimed >= tags[tagHash].totalSupply, 'existing tag undrained');

      require(false, 'not implemented');
      // TODO: Use custom Copyable type...

    } else if (tagType == TagType.SingleUse1Of1 || tagType == TagType.Refillable1Of1) {
      // Verify that either this tag has never existed before or (if tagType is Refillable1Of1) the (fixed) supply of 1 has been completely depleated
      require (isNewTag || (tagType == TagType.Refillable1Of1 && tags[tagHash].numClaimed >= 1), 'existing tag either not a Refillable1Of1 or undrained');

      Tag storage tag = tags[tagHash];
      tag.tagType = tagType;
      tag.tokenAddress = tokenAddress;
      tag.erc721TokenId = erc721TokenId;
      tag.tagAuthority = tagAuthority;
      tag.totalSupply = ((tagType == TagType.SingleUse1Of1) ? 1 : totalSupply);
      tag.perUser = ((tagType == TagType.SingleUse1Of1) ? 1 : perUser);
      tag.fungiblePerClaim = 0;
      tag.uid = uid;
      if (isNotErc1155) {
        IERC721Upgradeable token = IERC721Upgradeable(tokenAddress);
        token.safeTransferFrom(msg.sender, address(this), erc721TokenId);
      } else {
        IERC1155Upgradeable token = IERC1155Upgradeable(tokenAddress);
        token.safeTransferFrom(msg.sender, address(this), erc721TokenId, 0, "0x00");
      }
    } else if (tagType == TagType.WalletRestrictedFungible) {
      // Verify that either this tag has never existed before or the supply has been completely drained
      require (isNewTag || tags[tagHash].numClaimed >= tags[tagHash].totalSupply, 'existing fungible tag undrained');
      require (fungiblePerClaim <= perUser, 'fungiblePerClaim > perUser');

      Tag storage tag = tags[tagHash];
      tag.tagType = tagType;
      tag.tokenAddress = tokenAddress;
      tag.erc721TokenId = 0;
      tag.tagAuthority = tagAuthority;
      tag.totalSupply = totalSupply;
      tag.perUser = perUser;
      tag.fungiblePerClaim = fungiblePerClaim;
      tag.uid = uid;
      if (isNotErc1155) {
        IERC20Upgradeable token = IERC20Upgradeable(tokenAddress);
        token.transferFrom(msg.sender, address(this), totalSupply);
      } else {
        IERC1155Upgradeable token = IERC1155Upgradeable(tokenAddress);
        token.safeTransferFrom(msg.sender, address(this), 0, totalSupply, "0x00");
      }
    } else if (tagType == TagType.HotPotato) {
      // Verify that either this tag has never existed before
      require (isNewTag, 'existing tag');

      Tag storage tag = tags[tagHash];
      tag.tagType = tagType;
      tag.tokenAddress = tokenAddress;
      tag.erc721TokenId = erc721TokenId;
      tag.tagAuthority = tagAuthority;
      tag.totalSupply = 1;
      tag.perUser = 0;
      tag.fungiblePerClaim = 0;
      tag.uid = uid;
      IERC4907Upgradeable token = IERC4907Upgradeable(tokenAddress);
      token.safeTransferFrom(msg.sender, address(this), erc721TokenId);
    } else if (tagType == TagType.CandyMachineDrop) {
      require(false, 'not implemented');
      // TODO: Implement
    }
    if (isNewTag) {
      numTags += 1;
    }
    return totalSupply; // TODO: Verify that this should be the same for all paths
  }

  /*
   * @notice Claim an asset for a specified tag
   * @returns address representing the address of the newly claimed token
   * @returns uint256 representing the tokenId of the newly claimed token (if non-fungible)
   * @returns uint256 representing the amount of the newly claimed token (if fungible)
   */
  function claimTag(
    address receiver,
    uint256 uid,
    // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
    // NOTE: Only relevent when `tagType` is one of the following: LimitedOrOpenEdition, SingleUse1Of1, Refillable1Of1
    bool isNotErc1155
  ) external returns(address, uint256, uint256) {
    bytes32 tagHash = hashUniqueTag(msg.sender, uid);

    require (tags[tagHash].totalSupply > 0, 'tag does not exist');
    require (msg.sender == tags[tagHash].tagAuthority, 'signer must be tagAuthority');

    require ((tags[tagHash].tagType == TagType.HotPotato) || tags[tagHash].numClaimed < tags[tagHash].totalSupply, 'not HotPotato and total drained');
    require ((tags[tagHash].tagType == TagType.HotPotato) || (tags[tagHash].claimsMade[receiver] < tags[tagHash].perUser), 'not HotP and perUser drained');

    // TODO: Adjust require to account for TagType.CandyMachineDrop (once implemented)

    if (tags[tagHash].tagType == TagType.LimitedOrOpenEdition) {
      require(false, 'not implemented');
      // TODO: Use custom Copyable type...
    } else if (tags[tagHash].tagType == TagType.SingleUse1Of1 || tags[tagHash].tagType == TagType.Refillable1Of1) {
      if (isNotErc1155) {
        IERC721Upgradeable token = IERC721Upgradeable(tags[tagHash].tokenAddress);
        token.safeTransferFrom(address(this), receiver, tags[tagHash].erc721TokenId);
      } else {
        IERC1155Upgradeable token = IERC1155Upgradeable(tags[tagHash].tokenAddress);
        token.safeTransferFrom(address(this), receiver, tags[tagHash].erc721TokenId, 0, "0x00");
      }
      tags[tagHash].numClaimed += 1;
      tags[tagHash].claimsMade[receiver] += 1;
    } else if (tags[tagHash].tagType == TagType.WalletRestrictedFungible) {
      if (isNotErc1155) {
        IERC20Upgradeable token = IERC20Upgradeable(tags[tagHash].tokenAddress);
        token.transfer(receiver, tags[tagHash].fungiblePerClaim);
      } else {
        IERC1155Upgradeable token = IERC1155Upgradeable(tags[tagHash].tokenAddress);
        token.safeTransferFrom(address(this), receiver, 0, tags[tagHash].fungiblePerClaim, "0x00");
      }
      tags[tagHash].numClaimed += tags[tagHash].fungiblePerClaim;
      tags[tagHash].claimsMade[receiver] += tags[tagHash].fungiblePerClaim;
    } else if (tags[tagHash].tagType == TagType.HotPotato) {
      IERC4907Upgradeable token = IERC4907Upgradeable(tags[tagHash].tokenAddress);
      token.setUser(tags[tagHash].erc721TokenId, receiver, MAX_UINT64);
      tags[tagHash].numClaimed += 1;
      tags[tagHash].claimsMade[receiver] += 1;
    } else if (tags[tagHash].tagType == TagType.CandyMachineDrop) {
      require(false, 'not implemented');
      // TODO: Implement
    }
    return (tags[tagHash].tokenAddress, tags[tagHash].erc721TokenId, tags[tagHash].fungiblePerClaim);
  }
}
