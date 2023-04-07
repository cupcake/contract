import { PublicKey } from "@solana/web3.js";
import { PDA_PREFIX } from "../cucpakeProgram";
import { BN } from "@project-serum/anchor";
import { CUPCAKE_PROGRAM_ID } from "..";

export enum SprinkleType {
  LimitedOrOpenEdition,
  SingleUse1Of1,
  CandyMachineDrop,
  Refillable1Of1,
  WalletRestrictedFungible,
  HotPotato,
  ProgrammableUnique
}

export interface AnchorSprinkleType {
  limitedOrOpenEdition?: boolean;
  singleUse1Of1?: boolean;
  candyMachineDrop?: boolean;
  refillable1Of1?: boolean;
  walletRestrictedFungible?: boolean;
  hotPotato?: boolean;
  programmableUnique?: boolean;
}

export interface SprinkleX {
  uid: BN;
  tagType: AnchorSprinkleType;
  tagAuthority: PublicKey;
  config: PublicKey;
  totalSupply: Number;
  numClaimed: Number;
  perUser: Number;
  minterPays: boolean;
  tokenMint: PublicKey;
  candyMachine: PublicKey;
  whitelistMint: PublicKey;
  whitelistBurn: boolean;
  bump: Number;
  currentTokenLocation: PublicKey;
}

export class Sprinkle {
  uid: BN
  sprinkleType: SprinkleType
  bakeryAuthority: PublicKey
  sprinkleAuthority: PublicKey

  constructor() {

  }

  static async PDA(bakeryAuthority: PublicKey, sprinkleUID: BN, programId = CUPCAKE_PROGRAM_ID) {
    return (await PublicKey.findProgramAddress(
      [
        Buffer.from(PDA_PREFIX), 
        bakeryAuthority.toBuffer(), 
        sprinkleUID.toBuffer('le', 8)
      ],
      programId
    ))[0]
  }
}