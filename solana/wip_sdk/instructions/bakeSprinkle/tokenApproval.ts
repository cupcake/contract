import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { AccountMeta, Connection, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY, TransactionInstruction } from "@solana/web3.js";
import { getMasterEditionPDA, getMetadataPDA } from "../../programmableAssets";
import { getTokenRecordPDA } from "../../programmableAssets";
import * as TokenMetadata from "@metaplex-foundation/mpl-token-metadata"
import * as TokenAuth from "@metaplex-foundation/mpl-token-auth-rules"

export class BakeTokenApprovalSprinkleData {
  preInstructions: TransactionInstruction[];
  postInstructions: TransactionInstruction[];
  remainingAccounts: AccountMeta[];

  static async buildRemainingAccounts(connection: Connection, bakeryAuthority: PublicKey, tokenMint: PublicKey) {
    //
    const bakeryTokenATA = getAssociatedTokenAddressSync(tokenMint, bakeryAuthority);
    const metadataPDA = await getMetadataPDA(tokenMint);
    const masterEditionPDA = await getMasterEditionPDA(tokenMint);
    const tokenRecordPDA = await getTokenRecordPDA(tokenMint, bakeryTokenATA);

    //
    const metadata = await TokenMetadata.Metadata.fromAccountAddress(
      connection, 
      metadataPDA
    );
    const ruleSetPDA = metadata.programmableConfig?.ruleSet ?? TokenMetadata.PROGRAM_ID

    //
    return [
      { pubkey: tokenMint, isWritable: false, isSigner: false },
      { pubkey: bakeryTokenATA, isWritable: true, isSigner: false },
      { pubkey: metadataPDA, isWritable: true, isSigner: false },
      { pubkey: masterEditionPDA, isWritable: false, isSigner: false },
      { pubkey: tokenRecordPDA, isWritable: true, isSigner: false },
      { pubkey: ruleSetPDA, isWritable: false, isSigner: false },
      { pubkey: TokenAuth.PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: TokenMetadata.PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isWritable: false, isSigner: false },
    ];
  }
}