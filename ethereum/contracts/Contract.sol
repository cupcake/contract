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
import "../interfaces/IERC721CopyableUpgradeable.sol";
import "../interfaces/IERC1155CopyableUpgradeable.sol";

import "./CandyMachine.sol";
import "./CandyMachineFactory.sol";

/*
 * The ContractStorage contract contains all of the Contract's state variables which are then inherited by Contract.
 * Via this seperation of storage and logic we ensure that Contract's state variables come first in the storage layout
 * and that Contract has the ability to change the list of contracts it inherits from in the future via upgradeability.
 */
contract ContractStorage {
  using SafeMathUpgradeable for uint256;

  event TagCreationOrRefill(
    address _bakery,
    TagType _tagType,
    address indexed _assetAddress,
    uint256 _erc721TokenId,
    address indexed _tagAuthority,
    uint256 _totalSupply,
    uint256 _perUser,
    uint256 _fungiblePerClaim,
    uint256 indexed _uid,
    bool _isNotErc1155
  );

  event TagClaim(
    address _bakery,
    address indexed _recipient,
    address indexed _assetAddress,
    uint256 _erc721TokenId,
    uint256 _fungiblePerClaim,
    uint256 indexed _uid,
    bool _isNotErc1155
  );

  event Cancellation(
    address indexed _bakery,
    uint256 indexed _uid,
    bool _isNotErc1155,
    uint256 indexed _numClaimed
  );

  uint64 constant internal MAX_UINT64 = (2 ** 64) - 1; // Represents the largest possible Unix timestamp

  address candyMachineFactoryAddr;

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
    // Each claimable NFT is randomly selected from a predefined set up to the preset total supply
    CandyMachineDrop
  }

  struct Tag {
    // The enum type of the tag
    TagType tagType;
    // The address of the ERC-1155, ERC-721 or ERC-20 compliant claimable token, or the CandyMachine contract address
    address assetAddress;
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


  /*
   * This struct is used to pass arguments to the addOrRefillTag() function to avoid "Stack too deep" errors (resulting
   * from exceeding the local variables quota for addOrRefillTag() function calls).
   */
  struct TagPassed {
    TagType tagType;
    address assetAddress;
    uint256 erc721TokenId;
    address tagAuthority;
    uint256 totalSupply;
    uint256 perUser;
    uint256 fungiblePerClaim;
    uint256 uid;
  }

  mapping (
    // tag's unique identifier, see the hashUniqueTag() function below to see how the bytes32 is generated.
    bytes32 => Tag
  ) public tags;
}

contract Contract is ContractStorage, UUPSUpgradeable, OwnableUpgradeable, ERC721HolderUpgradeable, ERC1155HolderUpgradeable {
  using SafeMathUpgradeable for uint256;

  ////////////////////////////////////////////////
  //////// I N I T I A L I Z E R

  /*
   * Initalizes the state variables.
   */
  function initialize(address _candyMachineFactoryAddr) public initializer {
    __Ownable_init();
    candyMachineFactoryAddr = _candyMachineFactoryAddr;
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
  function hashUniqueTag(address _bakeryPubkey, uint256 _tagUid) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_bakeryPubkey, _tagUid));
  }

  /*
   * @notice Add or refill ERC-1155 assets that can be claimed for a specified tag
   */
  function addOrRefillTag(
    TagPassed calldata _passedTag,
    // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
    // NOTE: Relevent when `tagType` is not HotPotato
    bool _isNotErc1155,
    // Indicates the metadata URIs to use for the new NFT assets in CandyMachine
    // NOTE: Relevent when `tagType` is CandyMachineDrop
    string[] calldata _metadataURIs
  ) external onlyOwner {
    // The following checks are only required when the tagType is not HotPotato, SingleUse1Of1, Refillable1Of1
    require (_passedTag.tagType == TagType.HotPotato || _passedTag.tagType == TagType.SingleUse1Of1 || _passedTag.tagType == TagType.Refillable1Of1 || _passedTag.totalSupply > 0, 'zero totalSupply');
    require (_passedTag.tagType == TagType.HotPotato || _passedTag.tagType == TagType.SingleUse1Of1 || _passedTag.tagType == TagType.Refillable1Of1 || _passedTag.perUser > 0, 'zero perUser');
    require (_passedTag.tagType == TagType.HotPotato || _passedTag.tagType == TagType.SingleUse1Of1 || _passedTag.tagType == TagType.Refillable1Of1 || _passedTag.perUser <= _passedTag.totalSupply, 'perUser > totalSupply');

    bytes32 tagHash = hashUniqueTag(msg.sender, _passedTag.uid);

    bool isCleanTag = tags[tagHash].totalSupply == 0;

    Tag storage tag = tags[tagHash];
    tag.tagType = _passedTag.tagType;
    tag.uid = _passedTag.uid;
    tag.tagAuthority = _passedTag.tagAuthority;

    if (_passedTag.tagType == TagType.LimitedOrOpenEdition) {
      // Verify that either this tag has never existed before or the supply has been completely drained
      require (isCleanTag || tags[tagHash].numClaimed >= tags[tagHash].totalSupply, 'existing tag undrained');

      tag.assetAddress = _passedTag.assetAddress;
      tag.erc721TokenId = _passedTag.erc721TokenId;
      tag.totalSupply = _passedTag.totalSupply;
      tag.perUser = _passedTag.perUser;
      tag.fungiblePerClaim = 0;
      if (_isNotErc1155) {
        IERC721CopyableUpgradeable token = IERC721CopyableUpgradeable(_passedTag.assetAddress);
        token.safeTransferFrom(msg.sender, address(this), _passedTag.erc721TokenId);
      } else {
        IERC1155CopyableUpgradeable token = IERC1155CopyableUpgradeable(_passedTag.assetAddress);
        token.safeTransferFrom(msg.sender, address(this), _passedTag.erc721TokenId, 0, "0x00");
      }
    } else if (_passedTag.tagType == TagType.SingleUse1Of1 || _passedTag.tagType == TagType.Refillable1Of1) {
      // Verify that either this tag has never existed before or (if _passedTag.tagType is Refillable1Of1) the (fixed) supply of 1 has been completely depleted
      require (isCleanTag || (_passedTag.tagType == TagType.Refillable1Of1 && tags[tagHash].numClaimed >= 1), 'existing tag either not a Refillable1Of1 or undrained');

      tag.assetAddress = _passedTag.assetAddress;
      tag.erc721TokenId = _passedTag.erc721TokenId;
      tag.totalSupply = 1;
      tag.perUser = 1;
      tag.fungiblePerClaim = 0;
      if (_isNotErc1155) {
        IERC721Upgradeable token = IERC721Upgradeable(_passedTag.assetAddress);
        token.safeTransferFrom(msg.sender, address(this), _passedTag.erc721TokenId);
      } else {
        IERC1155Upgradeable token = IERC1155Upgradeable(_passedTag.assetAddress);
        token.safeTransferFrom(msg.sender, address(this), _passedTag.erc721TokenId, 0, "0x00");
      }
    } else if (_passedTag.tagType == TagType.WalletRestrictedFungible) {
      // Verify that either this tag has never existed before or the supply has been completely drained
      require (isCleanTag || tags[tagHash].numClaimed >= tags[tagHash].totalSupply, 'existing fungible tag undrained');
      require (_passedTag.fungiblePerClaim <= _passedTag.perUser, 'fungiblePerClaim > perUser');

      tag.assetAddress = _passedTag.assetAddress;
      tag.erc721TokenId = 0;
      tag.totalSupply = _passedTag.totalSupply;
      tag.perUser = _passedTag.perUser;
      tag.fungiblePerClaim = _passedTag.fungiblePerClaim;
      if (_isNotErc1155) {
        IERC20Upgradeable token = IERC20Upgradeable(_passedTag.assetAddress);
        token.transferFrom(msg.sender, address(this), _passedTag.totalSupply);
      } else {
        IERC1155Upgradeable token = IERC1155Upgradeable(_passedTag.assetAddress);
        token.safeTransferFrom(msg.sender, address(this), 0, _passedTag.totalSupply, "0x00");
      }
    } else if (_passedTag.tagType == TagType.HotPotato) {
      // Verify that this tag has never existed before
      require (isCleanTag, 'existing tag');

      tag.assetAddress = _passedTag.assetAddress;
      tag.erc721TokenId = _passedTag.erc721TokenId;
      tag.totalSupply = 1;
      tag.perUser = 0;
      tag.fungiblePerClaim = 0;
      IERC4907Upgradeable token = IERC4907Upgradeable(_passedTag.assetAddress);
      token.safeTransferFrom(msg.sender, address(this), _passedTag.erc721TokenId);
    } else if (_passedTag.tagType == TagType.CandyMachineDrop) {
      // Verify that this tag has never existed before
      require (isCleanTag, 'existing tag');

      CandyMachineFactory candyMachineFactory = CandyMachineFactory(candyMachineFactoryAddr);
      tag.assetAddress = candyMachineFactory.newCandyMachine(_metadataURIs, msg.sender);
      tag.erc721TokenId = 0;
      tag.totalSupply = _metadataURIs.length;
      tag.perUser = _passedTag.perUser;
      tag.fungiblePerClaim = 0;
    }
    tag.numClaimed = 0;

    emit TagCreationOrRefill(
      msg.sender,
      tag.tagType,
      tag.assetAddress,
      tag.erc721TokenId,
      tag.tagAuthority,
      tag.totalSupply,
      tag.perUser,
      tag.fungiblePerClaim,
      tag.uid,
      _isNotErc1155
    );
  }

  /*
   * @notice Claim an asset for a specified tag
   * @returns address representing the address of the newly claimed token
   * @returns uint256 representing the tokenId of the newly claimed token (if non-fungible)
   * @returns uint256 representing the amount of the newly claimed token (if fungible)
   */
  function claimTag(
    address _recipient,
    uint256 _uid,
    // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
    // NOTE: Relevent when `tagType` is not HotPotato
    bool _isNotErc1155,
    // Indicates the new (copied) asset's token
    // NOTE: Relevent when `tagType` is LimitedOrOpenEdition; this value must not already exist in the collection.
    uint256 _newTokenId
  ) external onlyOwner returns(address, uint256, uint256) {
    bytes32 tagHash = hashUniqueTag(msg.sender, _uid);

    require (tags[tagHash].totalSupply > 0, 'tag not existent or depleted');
    require (msg.sender == tags[tagHash].tagAuthority, 'signer must be tagAuthority');

    require (tags[tagHash].tagType == TagType.HotPotato || tags[tagHash].numClaimed < tags[tagHash].totalSupply, 'not HotPotato and total drained');
    require (tags[tagHash].tagType == TagType.HotPotato || tags[tagHash].claimsMade[_recipient] < tags[tagHash].perUser, 'not HotP and perUser drained');

    if (tags[tagHash].tagType == TagType.LimitedOrOpenEdition) {
      if (_isNotErc1155) {
        IERC721CopyableUpgradeable token = IERC721CopyableUpgradeable(tags[tagHash].assetAddress);
        token.mintCopy(_recipient, tags[tagHash].erc721TokenId, _newTokenId);
      } else {
        IERC1155CopyableUpgradeable token = IERC1155CopyableUpgradeable(tags[tagHash].assetAddress);
        token.mintCopy(_recipient, tags[tagHash].erc721TokenId, _newTokenId);
      }
    } else if (tags[tagHash].tagType == TagType.SingleUse1Of1 || tags[tagHash].tagType == TagType.Refillable1Of1) {
      if (_isNotErc1155) {
        IERC721Upgradeable token = IERC721Upgradeable(tags[tagHash].assetAddress);
        token.safeTransferFrom(address(this), _recipient, tags[tagHash].erc721TokenId);
      } else {
        IERC1155Upgradeable token = IERC1155Upgradeable(tags[tagHash].assetAddress);
        token.safeTransferFrom(address(this), _recipient, tags[tagHash].erc721TokenId, 0, "0x00");
      }
    } else if (tags[tagHash].tagType == TagType.WalletRestrictedFungible) {
      if (_isNotErc1155) {
        IERC20Upgradeable token = IERC20Upgradeable(tags[tagHash].assetAddress);
        token.transfer(_recipient, tags[tagHash].fungiblePerClaim);
      } else {
        IERC1155Upgradeable token = IERC1155Upgradeable(tags[tagHash].assetAddress);
        token.safeTransferFrom(address(this), _recipient, 0, tags[tagHash].fungiblePerClaim, "0x00");
      }
    } else if (tags[tagHash].tagType == TagType.HotPotato) {
      IERC4907Upgradeable token = IERC4907Upgradeable(tags[tagHash].assetAddress);
      token.setUser(tags[tagHash].erc721TokenId, _recipient, MAX_UINT64);
    } else if (tags[tagHash].tagType == TagType.CandyMachineDrop) {
      CandyMachine candyMachine = CandyMachine(tags[tagHash].assetAddress);
      candyMachine.mint(_recipient);
    }

    if (tags[tagHash].tagType == TagType.WalletRestrictedFungible) {
      tags[tagHash].numClaimed += tags[tagHash].fungiblePerClaim;
      tags[tagHash].claimsMade[_recipient] += tags[tagHash].fungiblePerClaim;
    } else {
      tags[tagHash].numClaimed += 1;
      tags[tagHash].claimsMade[_recipient] += 1;
    }

    emit TagClaim(
      msg.sender,
      _recipient,
      tags[tagHash].assetAddress,
      tags[tagHash].erc721TokenId,
      tags[tagHash].fungiblePerClaim,
      tags[tagHash].uid,
      _isNotErc1155
    );

    return (
      tags[tagHash].assetAddress,
      (tags[tagHash].tagType == TagType.LimitedOrOpenEdition) ? _newTokenId : tags[tagHash].erc721TokenId,
      tags[tagHash].fungiblePerClaim
    );
  }

  /*
   * @notice Cancel and empty a specified tag
   */
  function cancelAndEmpty(
    uint256 _uid,
    // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
    // NOTE: Relevent when `tagType` is not HotPotato
    bool _isNotErc1155
  ) external onlyOwner {
    bytes32 tagHash = hashUniqueTag(msg.sender, _uid);

    require (tags[tagHash].totalSupply > 0, 'tag not existent or depleted');
    require (tags[tagHash].tagType == TagType.HotPotato || tags[tagHash].numClaimed < tags[tagHash].totalSupply, 'not HotPotato and total drained');

    if (tags[tagHash].tagType == TagType.LimitedOrOpenEdition) {
      if (_isNotErc1155) {
        IERC721CopyableUpgradeable token = IERC721CopyableUpgradeable(tags[tagHash].assetAddress);
        token.safeTransferFrom(address(this), msg.sender, tags[tagHash].erc721TokenId);
      } else {
        IERC1155CopyableUpgradeable token = IERC1155CopyableUpgradeable(tags[tagHash].assetAddress);
        token.safeTransferFrom(address(this), msg.sender, tags[tagHash].erc721TokenId, 0, "0x00");
      }
    } else if (tags[tagHash].tagType == TagType.SingleUse1Of1 || tags[tagHash].tagType == TagType.Refillable1Of1) {
      require(tags[tagHash].numClaimed == 0, 'tag already claimed');
      if (_isNotErc1155) {
        IERC721Upgradeable token = IERC721Upgradeable(tags[tagHash].assetAddress);
        token.safeTransferFrom(address(this), msg.sender, tags[tagHash].erc721TokenId);
      } else {
        IERC1155Upgradeable token = IERC1155Upgradeable(tags[tagHash].assetAddress);
        token.safeTransferFrom(address(this), msg.sender, tags[tagHash].erc721TokenId, 0, "0x00");
      }
    } else if (tags[tagHash].tagType == TagType.WalletRestrictedFungible) {
      require(tags[tagHash].totalSupply - tags[tagHash].numClaimed > 0, 'tag totally depleted');
      if (_isNotErc1155) {
        IERC20Upgradeable token = IERC20Upgradeable(tags[tagHash].assetAddress);
        token.transfer(msg.sender, tags[tagHash].totalSupply - tags[tagHash].numClaimed);
      } else {
        IERC1155Upgradeable token = IERC1155Upgradeable(tags[tagHash].assetAddress);
        token.safeTransferFrom(address(this), msg.sender, 0, tags[tagHash].totalSupply - tags[tagHash].numClaimed, "0x00");
      }
    } else if (tags[tagHash].tagType == TagType.HotPotato) {
      IERC4907Upgradeable token = IERC4907Upgradeable(tags[tagHash].assetAddress);
      require(token.userOf(tags[tagHash].erc721TokenId) == msg.sender, 'bakery must be current renter');
      token.safeTransferFrom(address(this), msg.sender, tags[tagHash].erc721TokenId);
    } else if (tags[tagHash].tagType == TagType.CandyMachineDrop) {
      CandyMachine candyMachine = CandyMachine(tags[tagHash].assetAddress);
      candyMachine.cancel();
    }

    emit Cancellation(
      msg.sender,
      _uid,
      _isNotErc1155,
      tags[tagHash].numClaimed
    );

    // Default everything
    delete tags[tagHash];
  }
}
