// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

interface ICandyMachineFactory {
  function newCandyMachine(string[] calldata metadataURIs, uint64 subscriptionId, address vrfConsumerBaseV2) external returns(address);
}
