import { PublicKey } from "@solana/web3.js";
import { PDA_PREFIX } from "../cucpakeProgram";
import { BN } from "@project-serum/anchor";
import { CUPCAKE_PROGRAM_ID } from "..";

export class UserInfo {
  bakeryAuthority: PublicKey
  sprinkleUID: BN
  user: PublicKey


  constructor() {

  }

  static async PDA(bakeryAuthority: PublicKey, sprinkleUID: BN, user: PublicKey, programId = CUPCAKE_PROGRAM_ID) {
    return (await PublicKey.findProgramAddress(
      [
        Buffer.from(PDA_PREFIX), 
        bakeryAuthority.toBuffer(), 
        sprinkleUID.toBuffer('le', 8),
        user.toBuffer()
      ],
      programId
    ))[0]
  }
}