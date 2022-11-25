//SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.7;

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
    address bakery,
    TagType tagType,
    address indexed assetAddress,
    uint256 erc721TokenId,
    address indexed tagAuthority,
    uint256 totalSupply,
    uint256 perUser,
    uint256 fungiblePerClaim,
    uint256 indexed uid,
    bool isNotErc1155
  );

  event TagClaim(
    address bakery,
    address indexed recipient,
    address indexed assetAddress,
    uint256 erc721TokenId,
    uint256 fungiblePerClaim,
    uint256 indexed uid,
    bool isNotErc1155
  );

  event Cancellation(
    address indexed bakery,
    uint256 indexed uid,
    bool isNotErc1155,
    uint256 indexed numClaimed
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

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /*
   * Initalizes the state variables.
   */
  function initialize(address candyMachineFactoryAddrArg) external initializer {
    require(candyMachineFactoryAddrArg != address(0), 'factoryAddr cannot be 0-addr');
    __Ownable_init();
    candyMachineFactoryAddr = candyMachineFactoryAddrArg;
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
   */
  function addOrRefillTag(
    TagPassed calldata passedTag,
    // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
    // NOTE: Relevent when `tagType` is not HotPotato
    bool isNotErc1155,
    // Indicates the metadata URIs to use for the new NFT assets in CandyMachine
    // NOTE: Relevent when `tagType` is CandyMachineDrop
    string[] calldata metadataURIs
  ) external onlyOwner {

    // The following checks are only required when the tagType is not HotPotato, SingleUse1Of1, Refillable1Of1
    require (passedTag.tagType == TagType.HotPotato || passedTag.tagType == TagType.SingleUse1Of1 || passedTag.tagType == TagType.Refillable1Of1 || passedTag.tagType == TagType.CandyMachineDrop || passedTag.totalSupply > 0, 'zero totalSupply');
    require (passedTag.tagType == TagType.HotPotato || passedTag.tagType == TagType.SingleUse1Of1 || passedTag.tagType == TagType.Refillable1Of1 || passedTag.perUser > 0, 'zero perUser');
    require (passedTag.tagType == TagType.HotPotato || passedTag.tagType == TagType.SingleUse1Of1 || passedTag.tagType == TagType.Refillable1Of1 || passedTag.perUser <= passedTag.totalSupply || (passedTag.tagType == TagType.CandyMachineDrop && passedTag.perUser <= metadataURIs.length), 'perUser > totalSupply');

    bytes32 tagHash = hashUniqueTag(msg.sender, passedTag.uid);

    bool isCleanTag = tags[tagHash].totalSupply == 0;

    Tag storage tag = tags[tagHash];
    tag.tagType = passedTag.tagType;
    tag.uid = passedTag.uid;
    tag.tagAuthority = passedTag.tagAuthority;

    if (passedTag.tagType == TagType.LimitedOrOpenEdition) {
      // Verify that either this tag has never existed before or the supply has been completely drained
      require (isCleanTag || tags[tagHash].numClaimed >= tags[tagHash].totalSupply, 'existing tag undrained');

      tag.assetAddress = passedTag.assetAddress;
      tag.erc721TokenId = passedTag.erc721TokenId;
      tag.totalSupply = passedTag.totalSupply;
      tag.perUser = passedTag.perUser;
      tag.fungiblePerClaim = 0;
      tag.numClaimed = 0;
      if (isNotErc1155) {
        IERC721CopyableUpgradeable tokenERC721Copyable = IERC721CopyableUpgradeable(passedTag.assetAddress);
        tokenERC721Copyable.safeTransferFrom(msg.sender, address(this), passedTag.erc721TokenId);
      } else {
        IERC1155CopyableUpgradeable tokenERC1155Copyable = IERC1155CopyableUpgradeable(passedTag.assetAddress);
        tokenERC1155Copyable.safeTransferFrom(msg.sender, address(this), passedTag.erc721TokenId, 0, "0x00");
      }
    } else if (passedTag.tagType == TagType.SingleUse1Of1 || passedTag.tagType == TagType.Refillable1Of1) {
      // Verify that either this tag has never existed before or (if passedTag.tagType is Refillable1Of1) the (fixed) supply of 1 has been completely depleted
      require (isCleanTag || (passedTag.tagType == TagType.Refillable1Of1 && tags[tagHash].numClaimed >= 1), 'existing tag either not a Refillable1Of1 or undrained');

      tag.assetAddress = passedTag.assetAddress;
      tag.erc721TokenId = passedTag.erc721TokenId;
      tag.totalSupply = 1;
      tag.perUser = 1;
      tag.fungiblePerClaim = 0;
      tag.numClaimed = 0;
      if (isNotErc1155) {
        IERC721Upgradeable tokenERC721 = IERC721Upgradeable(passedTag.assetAddress);
        tokenERC721.safeTransferFrom(msg.sender, address(this), passedTag.erc721TokenId);
      } else {
        IERC1155Upgradeable tokenERC1155 = IERC1155Upgradeable(passedTag.assetAddress);
        tokenERC1155.safeTransferFrom(msg.sender, address(this), passedTag.erc721TokenId, 0, "0x00");
      }
    } else if (passedTag.tagType == TagType.WalletRestrictedFungible) {
      // Verify that either this tag has never existed before or the supply has been completely drained
      require (isCleanTag || tags[tagHash].numClaimed >= tags[tagHash].totalSupply, 'existing fungible tag undrained');
      require (passedTag.fungiblePerClaim <= passedTag.perUser, 'fungiblePerClaim > perUser');

      tag.assetAddress = passedTag.assetAddress;
      tag.erc721TokenId = 0;
      tag.totalSupply = passedTag.totalSupply;
      tag.perUser = passedTag.perUser;
      tag.fungiblePerClaim = passedTag.fungiblePerClaim;
      tag.numClaimed = 0;
      if (isNotErc1155) {
        IERC20Upgradeable tokenERC20 = IERC20Upgradeable(passedTag.assetAddress);
        require(tokenERC20.transferFrom(msg.sender, address(this), passedTag.totalSupply), 'ERC-20 transferFrom failed');
      } else {
        IERC1155Upgradeable tokenERC1155Fungible = IERC1155Upgradeable(passedTag.assetAddress);
        tokenERC1155Fungible.safeTransferFrom(msg.sender, address(this), 0, passedTag.totalSupply, "0x00");
      }
    } else if (passedTag.tagType == TagType.HotPotato) {
      // Verify that this tag has never existed before
      require (isCleanTag, 'existing tag');

      tag.assetAddress = passedTag.assetAddress;
      tag.erc721TokenId = passedTag.erc721TokenId;
      tag.totalSupply = 1;
      tag.perUser = 0;
      tag.fungiblePerClaim = 0;
      tag.numClaimed = 0;
      IERC4907Upgradeable tokenERC4907 = IERC4907Upgradeable(passedTag.assetAddress);
      tokenERC4907.safeTransferFrom(msg.sender, address(this), passedTag.erc721TokenId);
    } else if (passedTag.tagType == TagType.CandyMachineDrop) {
      // Verify that this tag has never existed before
      require (isCleanTag, 'existing tag');

      tag.erc721TokenId = 0;
      tag.totalSupply = metadataURIs.length;
      tag.perUser = passedTag.perUser;
      tag.fungiblePerClaim = 0;
      tag.numClaimed = 0;
      CandyMachineFactory candyMachineFactory = CandyMachineFactory(candyMachineFactoryAddr);
      tag.assetAddress = candyMachineFactory.newCandyMachine(metadataURIs);
    }

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
      isNotErc1155
    );
  }

  /*
   * @notice Claim an asset for a specified tag
   * @returns address representing the address of the newly claimed token
   * @returns uint256 representing the tokenId of the newly claimed token (if non-fungible)
   * @returns uint256 representing the amount of the newly claimed token (if fungible)
   */
  function claimTag(
    address recipient,
    uint256 uid,
    // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
    // NOTE: Relevent when `tagType` is not HotPotato
    bool isNotErc1155,
    // Indicates the new (copied) asset's token
    // NOTE: Relevent when `tagType` is LimitedOrOpenEdition; this value must not already exist in the collection.
    uint256 newTokenId
  ) external onlyOwner returns(address, uint256, uint256) {
    bytes32 tagHash = hashUniqueTag(msg.sender, uid);

    require (tags[tagHash].totalSupply > 0, 'tag not existent or depleted');
    require (msg.sender == tags[tagHash].tagAuthority, 'signer must be tagAuthority');

    require (tags[tagHash].tagType == TagType.HotPotato || tags[tagHash].tagType == TagType.Refillable1Of1 || tags[tagHash].numClaimed < tags[tagHash].totalSupply, 'not HotP or ReF and tot drained');
    require (tags[tagHash].tagType == TagType.HotPotato || tags[tagHash].tagType == TagType.Refillable1Of1 || tags[tagHash].claimsMade[recipient] < tags[tagHash].perUser, 'not HotP or ReF and pU drained');

    emit TagClaim(
      msg.sender,
      recipient,
      tags[tagHash].assetAddress,
      tags[tagHash].erc721TokenId,
      tags[tagHash].fungiblePerClaim,
      tags[tagHash].uid,
      isNotErc1155
    );

    if (tags[tagHash].tagType == TagType.WalletRestrictedFungible) {
      tags[tagHash].numClaimed += tags[tagHash].fungiblePerClaim;
      tags[tagHash].claimsMade[recipient] += tags[tagHash].fungiblePerClaim;
    } else {
      tags[tagHash].numClaimed += 1;
      tags[tagHash].claimsMade[recipient] += 1;
    }

    if (tags[tagHash].tagType == TagType.LimitedOrOpenEdition) {
      if (isNotErc1155) {
        IERC721CopyableUpgradeable tokenERC721Copyable = IERC721CopyableUpgradeable(tags[tagHash].assetAddress);
        tokenERC721Copyable.mintCopy(recipient, tags[tagHash].erc721TokenId, newTokenId);
      } else {
        IERC1155CopyableUpgradeable tokenERC1155Copyable = IERC1155CopyableUpgradeable(tags[tagHash].assetAddress);
        tokenERC1155Copyable.mintCopy(recipient, tags[tagHash].erc721TokenId, newTokenId);
      }
    } else if (tags[tagHash].tagType == TagType.SingleUse1Of1 || tags[tagHash].tagType == TagType.Refillable1Of1) {
      if (isNotErc1155) {
        IERC721Upgradeable tokenERC721 = IERC721Upgradeable(tags[tagHash].assetAddress);
        tokenERC721.safeTransferFrom(address(this), recipient, tags[tagHash].erc721TokenId);
      } else {
        IERC1155Upgradeable tokenERC1155 = IERC1155Upgradeable(tags[tagHash].assetAddress);
        tokenERC1155.safeTransferFrom(address(this), recipient, tags[tagHash].erc721TokenId, 0, "0x00");
      }
    } else if (tags[tagHash].tagType == TagType.WalletRestrictedFungible) {
      if (isNotErc1155) {
        IERC20Upgradeable tokenERC20 = IERC20Upgradeable(tags[tagHash].assetAddress);
        require(tokenERC20.transfer(recipient, tags[tagHash].fungiblePerClaim), 'ERC-20 transfer failed');
      } else {
        IERC1155Upgradeable tokenERC1155Fungible = IERC1155Upgradeable(tags[tagHash].assetAddress);
        tokenERC1155Fungible.safeTransferFrom(address(this), recipient, 0, tags[tagHash].fungiblePerClaim, "0x00");
      }
    } else if (tags[tagHash].tagType == TagType.HotPotato) {
      IERC4907Upgradeable tokenERC4907 = IERC4907Upgradeable(tags[tagHash].assetAddress);
      tokenERC4907.setUser(tags[tagHash].erc721TokenId, recipient, MAX_UINT64);
    } else if (tags[tagHash].tagType == TagType.CandyMachineDrop) {
      CandyMachine candyMachine = CandyMachine(tags[tagHash].assetAddress);
      candyMachine.mint(recipient);
    }

    return (
      tags[tagHash].assetAddress,
      (tags[tagHash].tagType == TagType.LimitedOrOpenEdition) ? newTokenId : tags[tagHash].erc721TokenId,
      tags[tagHash].fungiblePerClaim
    );
  }

  /*
   * @notice Cancel and empty a specified tag
   */
  function cancelAndEmpty(
    uint256 uid,
    // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
    // NOTE: Relevent when `tagType` is not HotPotato
    bool isNotErc1155
  ) external onlyOwner {
    bytes32 tagHash = hashUniqueTag(msg.sender, uid);

    require (tags[tagHash].totalSupply > 0, 'tag not existent or depleted');
    require (tags[tagHash].tagType == TagType.HotPotato || tags[tagHash].numClaimed < tags[tagHash].totalSupply, 'not HotPotato and total drained');

    TagType tagType = tags[tagHash].tagType;
    address assetAddress = tags[tagHash].assetAddress;
    uint256 erc721TokenId = tags[tagHash].erc721TokenId;
    uint256 numClaimed = tags[tagHash].numClaimed;
    uint256 totalSupply = tags[tagHash].totalSupply;

    emit Cancellation(
      msg.sender,
      uid,
      isNotErc1155,
      numClaimed
    );

    // Default everything
    delete tags[tagHash];

    if (tagType == TagType.LimitedOrOpenEdition) {
      if (isNotErc1155) {
        IERC721CopyableUpgradeable tokenERC721Copyable = IERC721CopyableUpgradeable(assetAddress);
        tokenERC721Copyable.safeTransferFrom(address(this), msg.sender, erc721TokenId);
      } else {
        IERC1155CopyableUpgradeable tokenERC1155Copyable = IERC1155CopyableUpgradeable(assetAddress);
        tokenERC1155Copyable.safeTransferFrom(address(this), msg.sender, erc721TokenId, 0, "0x00");
      }
    } else if (tagType == TagType.SingleUse1Of1 || tagType == TagType.Refillable1Of1) {
      require(numClaimed == 0, 'tag already claimed');
      if (isNotErc1155) {
        IERC721Upgradeable tokenERC721 = IERC721Upgradeable(assetAddress);
        tokenERC721.safeTransferFrom(address(this), msg.sender, erc721TokenId);
      } else {
        IERC1155Upgradeable tokenERC1155 = IERC1155Upgradeable(assetAddress);
        tokenERC1155.safeTransferFrom(address(this), msg.sender, erc721TokenId, 0, "0x00");
      }
    } else if (tagType == TagType.WalletRestrictedFungible) {
      require(totalSupply - numClaimed > 0, 'tag totally depleted');
      if (isNotErc1155) {
        IERC20Upgradeable tokenERC20 = IERC20Upgradeable(assetAddress);
        require(tokenERC20.transfer(msg.sender, totalSupply - numClaimed), 'ERC-20 transfer failed');
      } else {
        IERC1155Upgradeable tokenERC1155Fungible = IERC1155Upgradeable(assetAddress);
        tokenERC1155Fungible.safeTransferFrom(address(this), msg.sender, 0, totalSupply - numClaimed, "0x00");
      }
    } else if (tagType == TagType.HotPotato) {
      IERC4907Upgradeable tokenERC4907 = IERC4907Upgradeable(assetAddress);
      require(tokenERC4907.userOf(erc721TokenId) == msg.sender, 'bakery must be current renter');
      tokenERC4907.safeTransferFrom(address(this), msg.sender, erc721TokenId);
    } else if (tagType == TagType.CandyMachineDrop) {
      CandyMachine candyMachine = CandyMachine(assetAddress);
      candyMachine.cancel();
    }
  }
}
