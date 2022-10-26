//SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.7;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../interfaces/ICandyMachineFactory.sol";
import "./CandyMachine.sol";

/*
 * The CandyMachineStorage contract contains all of the Contract's state variables which are then inherited by Contract.
 * Via this seperation of storage and logic we ensure that Contract's state variables come first in the storage layout
 * and that Contract has the ability to change the list of contracts it inherits from in the future via upgradeability.
 */
contract CandyMachineFactory is ICandyMachineFactory, Initializable, UUPSUpgradeable, OwnableUpgradeable {
  
  event Creation(address indexed newCandyMachine);  

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /*
   * Initalizes the state variables.
   */
  function initialize() external initializer {
    __Ownable_init();
  }

  /*
   * @notice Authorizes contract upgrades only for the contract owner (contract deployer) via the onlyOwner modifier.
   */
  function _authorizeUpgrade(address) internal override onlyOwner {}

  /*
   * @notice Creates a new CandyMachine contract.
   * @dev Initalizes the new CandyMachine using the passed arguments and emits a {Creation} event.
   */
  function newCandyMachine(string[] calldata metadataURIs, address ownerCM) external override returns(address) {
    CandyMachine candyMachine = new CandyMachine();
    emit Creation(address(candyMachine));
    candyMachine.initialize(metadataURIs, ownerCM);
    return address(candyMachine);
  }
}
