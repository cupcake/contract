import { PublicKey } from "@solana/web3.js";
import { BN } from "@project-serum/anchor";
import { PDA_PREFIX } from "../cucpakeProgram";
import { CUPCAKE_PROGRAM_ID } from "..";

export class TreasureChest {
  sprinkle: PublicKey

  constructor() {

  }

  static async PDA(bakeryAuthority: PublicKey, sprinkleUID: BN, programId = CUPCAKE_PROGRAM_ID) {
    return (await PublicKey.findProgramAddress(
      [
        Buffer.from(PDA_PREFIX), 
        bakeryAuthority.toBuffer(), 
        sprinkleUID.toBuffer('le', 8),
        Buffer.from("treasure-chest"),
      ],
      programId
    ))[0]
  }
}