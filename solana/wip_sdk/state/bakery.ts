import { PublicKey } from "@solana/web3.js";
import { PDA_PREFIX } from "../cucpakeProgram";
import { CUPCAKE_PROGRAM_ID } from "..";

export class Bakery {
  bakeryAuthority: PublicKey

  constructor() {

  }

  static PDA(bakeryAuthority: PublicKey, programId = CUPCAKE_PROGRAM_ID) {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from(PDA_PREFIX), 
        bakeryAuthority.toBuffer(), 
      ],
      programId
    )[0]
  }
}