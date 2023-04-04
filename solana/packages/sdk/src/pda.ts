import { BN, Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { PREFIX } from "./cupcake_program";
import * as TokenMetadata from "@metaplex-foundation/mpl-token-metadata";

export const getConfig = async (program: Program, authority: PublicKey) => {
  return await PublicKey.findProgramAddress([Buffer.from(PREFIX), authority.toBuffer()], program.programId);
};

export const getTag = async (program: Program, tagUID: BN, authority: PublicKey) => {
  return await PublicKey.findProgramAddress(
    [Buffer.from(PREFIX), authority.toBuffer(), tagUID.toBuffer('le', 8)],
    program.programId
  );
};

export const getUserInfo = async (program: Program, tagUID: BN, authority: PublicKey, user: PublicKey) => {
  return await PublicKey.findProgramAddress(
    [Buffer.from(PREFIX), authority.toBuffer(), tagUID.toBuffer('le', 8), user.toBuffer()],
    program.programId
  );
};

export const getUserHotPotatoToken = async (
  program: Program,
  tagUID: BN,
  authority: PublicKey,
  user: PublicKey,
  tokenMint: PublicKey
) => {
  return await PublicKey.findProgramAddress(
    [Buffer.from(PREFIX), authority.toBuffer(), tagUID.toBuffer('le', 8), user.toBuffer(), tokenMint.toBuffer()],
    program.programId
  );
};

export async function getTokenRecordPDA(tokenMint: PublicKey, associatedToken: PublicKey) {
  return PublicKey.findProgramAddress(
    [
      Buffer.from("metadata"), 
      TokenMetadata.PROGRAM_ID.toBuffer(), 
      tokenMint.toBuffer(),
      Buffer.from("token_record"),
      associatedToken.toBuffer()
    ],
    TokenMetadata.PROGRAM_ID,
  )[0]
}