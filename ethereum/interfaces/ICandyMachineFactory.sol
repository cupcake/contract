// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

interface ICandyMachineFactory {
  function newCandyMachine(string[] calldata metadataURIs) external returns(address);
}
