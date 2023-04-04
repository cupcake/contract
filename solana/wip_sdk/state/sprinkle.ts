import { PublicKey } from "@solana/web3.js";
import { PDA_PREFIX } from "../cucpakeProgram";
import { BN } from "@project-serum/anchor";
import { CUPCAKE_PROGRAM_ID } from "..";

export enum SprinkleType {

}

export class Sprinkle {
  uid: BN
  sprinkleType: SprinkleType
  bakeryAuthority: PublicKey
  sprinkleAuthority: PublicKey

  constructor() {

  }

  static PDA(bakeryAuthority: PublicKey, sprinkleUID: BN, programId = CUPCAKE_PROGRAM_ID) {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from(PDA_PREFIX), 
        bakeryAuthority.toBuffer(), 
        sprinkleUID.toBuffer('le', 8)
      ],
      programId
    )[0]
  }
}