import { Program, BN } from "@project-serum/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";

export enum TagType {
  LimitedOrOpenEdition,
  SingleUse1Of1,
  CandyMachineDrop,
  Refillable1Of1,
  WalletRestrictedFungible,
  HotPotato,
}

export interface AnchorTagType {
  limitedOrOpenEdition?: boolean;
  singleUse1Of1?: boolean;
  candyMachineDrop?: boolean;
  refillable1Of1?: boolean;
  walletRestrictedFungible?: boolean;
  hotPotato?: boolean;
  programmableUnique?: boolean;
}

export interface Config {
  authority: PublicKey;
  bump: number;
}

export interface Tag {
  uid: BN;
  tagType: AnchorTagType;
  tagAuthority: PublicKey;
  config: PublicKey;
  totalSupply: Number;
  numClaimed: Number;
  perUser: Number;
  minterPays: boolean;
  tokenMint: PublicKey;
  candyMachine: PublicKey;
  whitelistMint: PublicKey;
  whitelistBurn: PublicKey;
  bump: Number;
  currentTokenLocation: PublicKey;
}

export interface UserInfo {
  numClaimed: Number;
  bump: number;
}

export interface InitializeAccounts {
  authorityKeypair?: Keypair;
  authority?: PublicKey;
}

export interface AddOrRefillTagParams {
  uid: BN;
  tagType: AnchorTagType;
  numClaims: BN;
  perUser: BN;
  minterPays: boolean;
  // candy only
  pricePerMint?: BN | null;
  whitelistBurn?: boolean;
}

export interface AddOrRefillTagAccounts {
  authority?: PublicKey;
  authorityKeypair?: Keypair;
  tagAuthorityKeypair?: Keypair;
  tagAuthority?: PublicKey;
  tokenMint?: PublicKey;
  candyMachine?: PublicKey;
  whitelistMint?: PublicKey;
  paymentTokenMint?: PublicKey;
}

export interface ClaimTagParams {
  creatorBump?: number;
  minterPays?: boolean;
}

export interface ClaimTagAccounts {
  userKeypair?: Keypair;
  user?: PublicKey;
  tagAuthority?: PublicKey;
  tagAuthorityKeypair?: Keypair;
  tag: PublicKey;
  newTokenMint?: PublicKey;
  newMintAuthorityKeypair?: Keypair;
  newMintAuthority?: PublicKey;
  updateAuthority?: PublicKey;
  candyMachine?: PublicKey;
  candyMachineWallet?: PublicKey;
  collectionMint?: PublicKey;
  collectionMetadata?: PublicKey;
  collectionMasterEdition?: PublicKey;
  collectionAuthorityRecord?: PublicKey;
  candyMachineAuthority?: PublicKey;
}

export interface ClaimTagAdditionalArgs {
  tag: Tag;
  config: Config;
  nextEdition?: BN;
  createAta: boolean;
  candyProgram?: Program;
}