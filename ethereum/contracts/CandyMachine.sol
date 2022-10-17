//SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

// import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

/*
 * The CandyMachineStorage contract contains all of the Contract's state variables which are then inherited by Contract.
 * Via this seperation of storage and logic we ensure that Contract's state variables come first in the storage layout
 * and that Contract has the ability to change the list of contracts it inherits from in the future via upgradeability.
 */
contract CandyMachineStorage {
  using SafeMathUpgradeable for uint256;

  uint256 numURIsExisting;
  uint256 nonce;
  address owner;

  // Optional mapping for token URIs
  mapping(uint256 => bool) public mintedTokenIds;
}

contract CandyMachine is CandyMachineStorage, /*UUPSUpgradeable, */ERC1155URIStorageUpgradeable {

  ////////////////////////////////////////////////
  //////// I N I T I A L I Z E R

  /*
   * Initalizes the state variables.
   */
  function initialize(string[] calldata _metadataURIs, address _owner) public onlyInitializing {
    __ERC1155URIStorage_init_unchained();
    require(_metadataURIs.length > 0, 'empty _metadataURIs passed');

    for (uint256 i = 0; i < _metadataURIs.length; i++) {
      _setURI(i, _metadataURIs[i]);
    }

    numURIsExisting = _metadataURIs.length;
    nonce = 0;
    owner = _owner;
  }

  modifier onlyOwner {
    require(msg.sender == owner, 'caller not owner');
    _;
  }

  ////////////////////////////////////////////////
  //////// F U N C T I O N S

  /*
   * @notice Authorizes contract upgrades only for the contract owner (contract deployer) via the onlyOwner modifier.
   */
  // function _authorizeUpgrade(address) internal override onlyOwner {}

  /*
   * @notice Generates a pseudo-random number between 0 and the numURIsExisting state variable.
   * @returns uint256 the pseudo-randmly generated number.
   */
  function _randomNumber() internal onlyOwner returns(uint256) {
    uint256 randNum = uint(keccak256(abi.encodePacked(block.timestamp, msg.sender, nonce))) % numURIsExisting;
    nonce++;
    return randNum;
  }

  /*
   * @notice Check if the CandyMachine has been cancelled or is depleted.
   */
  function isFinished() view public returns(bool) {
    return (numURIsExisting == 0);
  }

  /*
   * @notice Mint an ERC-1155 asset with a pseudo-randomly selected metadata URI.
   */
  function mint(address _recipient) external onlyOwner {
    require(!isFinished(), 'CandyMachine cancelled');
    uint256 randomNum = _randomNumber();
    uint256 i = 0;
    while (mintedTokenIds[randomNum] && i < numURIsExisting) {
      randomNum = _randomNumber();
      i++;
    }
    if(!mintedTokenIds[randomNum]) {
      numURIsExisting = 0;
      revert('CandyMachine depleted');
    }

    _mint(_recipient, randomNum, 1, "0x00");
    mintedTokenIds[randomNum] = true;
  }

  /*
   * @notice Cancel the CandyMachine. This means that no further NFTs can be minted.
   */
  function cancel() external onlyOwner {
    for (uint256 i = 0; i < numURIsExisting; i++) {
      if (!mintedTokenIds[i]) {
        _setURI(i, "");
      }
    }
    numURIsExisting = 0;
  }
}
