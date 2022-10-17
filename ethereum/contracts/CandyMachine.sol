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
}

contract CandyMachine is CandyMachineStorage, /*UUPSUpgradeable, */ERC1155URIStorageUpgradeable {

  ////////////////////////////////////////////////
  //////// I N I T I A L I Z E R

  /*
   * Initalizes the state variables.
   */
  function initialize(string[] calldata _metadataURIs, address _owner) public onlyInitializing {
    __ERC1155URIStorage_init_unchained();

    for (uint256 i = 0; i < 10; i++) {
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
   * @notice Mint an ERC-1155 asset with a pseudo-randomly selected metadata URI.
   */
  function mint(address _recipient) external onlyOwner {
    uint256 randomNum = _randomNumber();
    while (balanceOf(_recipient, randomNum) > 0) {
      randomNum = _randomNumber();
    }

    _mint(_recipient, randomNum, 1, "0x00");
  }
}
