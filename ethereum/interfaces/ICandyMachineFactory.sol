// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface ICandyMachineFactory {
  function newCandyMachine(string[] calldata _metadataURIs, address _owner) external returns(address newCM);
}
