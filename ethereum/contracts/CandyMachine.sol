//SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.7;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

/*
 * The CandyMachineStorage contract contains all of the Contract's state variables which are then inherited by Contract.
 * Via this seperation of storage and logic we ensure that Contract's state variables come first in the storage layout
 * and that Contract has the ability to change the list of contracts it inherits from in the future via upgradeability.
 */
contract CandyMachineStorage {
  using SafeMathUpgradeable for uint256;

  event Cancellation();  

  uint256 numURIsExisting;
  uint256 nonce;
  address owner;

  mapping(uint256 => bool) public mintedTokenIds;
}

contract CandyMachine is CandyMachineStorage, ERC1155URIStorageUpgradeable {
  using SafeMathUpgradeable for uint256;

  ////////////////////////////////////////////////
  //////// I N I T I A L I Z E R

  /*
   * Initalizes the state variables.
   */
  function initialize(string[] calldata metadataURIs, address ownerArg) external initializer {
    __ERC1155URIStorage_init_unchained();
    require(metadataURIs.length > 0, 'empty metadataURIs passed');
    require(ownerArg != address(0), 'owner cannot be zero-address');

    for (uint256 i = 0; i < metadataURIs.length; i++) {
      _setURI(i, metadataURIs[i]);
    }

    numURIsExisting = metadataURIs.length;
    nonce = 0;
    owner = ownerArg;
  }

  /*
   * Modifier to ensure that only the designated "owner" can access the associated function.
   * NOTE: This modifier should NOT be confused with OwnableUpgradeable's modifier by the same name.
   */
  modifier onlyOwner {
    require(msg.sender == owner, 'caller not owner');
    _;
  }

  ////////////////////////////////////////////////
  //////// F U N C T I O N S

  /*
   * @notice Generates a pseudo-random number between 0 and the numURIsExisting state variable.
   * @param nonceArg the nonce we use to generate the random number. NOTE: we pass in this variable instead of
   *               reading it from the state to avoid costly operations inside a loop that might waste gas.
   * @returns uint256 the pseudo-randmly generated number.
   */
  function _randomNumber(uint256 nonceArg) internal view onlyOwner returns(uint256) {
    return uint(keccak256(abi.encodePacked(block.timestamp, msg.sender, nonceArg))) % numURIsExisting;
  }

  /*
   * @notice Check if the CandyMachine has been cancelled or is depleted.
   */
  function isFinished() view public returns(bool) {
    return (numURIsExisting == 0);
  }

  /*
   * @notice Mint an ERC-1155 asset with a pseudo-randomly selected metadata URI.
   * @dev Emits a {TransferSingle} event.
   */
  function mint(address recipient) external onlyOwner {
    require(!isFinished(), 'CandyMachine cancelled');
    uint256 randomNum = _randomNumber(nonce);
    uint256 i = 0;
    while (mintedTokenIds[randomNum] && i < numURIsExisting) {
      randomNum = _randomNumber(nonce + i);
      i++;
    }
    nonce += i;
    if(mintedTokenIds[randomNum]) {
      numURIsExisting = 0;
      revert('CandyMachine depleted');
    }
    mintedTokenIds[randomNum] = true;
    _mint(recipient, randomNum, 1, "0x00");
  }

  /*
   * @notice Cancel the CandyMachine. This means that no further NFTs can be minted.
   */
  function cancel() external onlyOwner {
    emit Cancellation();

    for (uint256 i = 0; i < numURIsExisting; i++) {
      if (!mintedTokenIds[i]) {
        _setURI(i, "");
      }
    }
    numURIsExisting = 0;
  }
}
