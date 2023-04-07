import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { AccountMeta, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { getMasterEditionPDA } from "../../programmableAssets";
import * as TokenMetadata from "@metaplex-foundation/mpl-token-metadata"

export class BakeHotPotatoSprinkleData {
  preInstructions: TransactionInstruction[];
  postInstructions: TransactionInstruction[];
  remainingAccounts: AccountMeta[];

  static async construct(bakeryAuthority: PublicKey, tokenMint: PublicKey) {
    //
    const bakeryTokenATA = getAssociatedTokenAddressSync(tokenMint, bakeryAuthority);
    const masterEditionPDA = await getMasterEditionPDA(tokenMint);

    //
    const remainingAccounts = [
      { pubkey: tokenMint, isWritable: false, isSigner: false },
      { pubkey: bakeryTokenATA, isWritable: true, isSigner: false },
      { pubkey: masterEditionPDA, isWritable: false, isSigner: false },
      { pubkey: TokenMetadata.PROGRAM_ID, isWritable: false, isSigner: false },
    ];

    return { remainingAccounts } as BakeHotPotatoSprinkleData
  }
}