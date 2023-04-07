import { ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { AccountMeta, Connection, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY, TransactionInstruction } from "@solana/web3.js";
import { getMasterEditionPDA, getMetadataPDA } from "../../programmableAssets";
import { getTokenRecordPDA } from "../../programmableAssets";
import * as TokenMetadata from "@metaplex-foundation/mpl-token-metadata"
import * as TokenAuth from "@metaplex-foundation/mpl-token-auth-rules"
import { SprinkleX } from "../../state/sprinkle";

export class ClaimTokenTransferSprinkleData {
  preInstructions: TransactionInstruction[];
  remainingAccounts: AccountMeta[];

  static async construct(connection: Connection, bakeryAuthority: PublicKey, claimer: PublicKey, sprinkleState: SprinkleX) {
    //
    const userATA = getAssociatedTokenAddressSync(sprinkleState.tokenMint, claimer);
    const bakeryTokenATA = getAssociatedTokenAddressSync(sprinkleState.tokenMint, bakeryAuthority);
    const metadataPDA = await getMetadataPDA(sprinkleState.tokenMint);
    const masterEditionPDA = await getMasterEditionPDA(sprinkleState.tokenMint);
    const tokenRecordPDA = await getTokenRecordPDA(sprinkleState.tokenMint, bakeryTokenATA);
    const destinationTokenRecordPDA = await getTokenRecordPDA(sprinkleState.tokenMint, userATA);

    //
    let ruleSetPDA = TokenMetadata.PROGRAM_ID;
    let isProgrammable = false;
    try {
      const metadata = await TokenMetadata.Metadata.fromAccountAddress(
        connection, 
        metadataPDA
      );
      isProgrammable = !!metadata.programmableConfig;
      ruleSetPDA = metadata.programmableConfig?.ruleSet ?? TokenMetadata.PROGRAM_ID;
    } catch {
      console.warn("Baking token with no metadata")
    }

    const preInstructions = [];
    if (true) {
      const createATAIx = createAssociatedTokenAccountInstruction(
        bakeryAuthority, 
        userATA, 
        claimer, 
        sprinkleState.tokenMint
      );
      preInstructions.push(createATAIx);
    }

    //
    const remainingAccounts = [
      { pubkey: bakeryTokenATA, isWritable: true, isSigner: false },
      { pubkey: userATA, isWritable: true, isSigner: false },
    ];
    if (isProgrammable) {
      const programmableRemainingAccounts = [
        { pubkey: bakeryAuthority, isWritable: false, isSigner: false },
        { pubkey: sprinkleState.tokenMint, isWritable: false, isSigner: false },
        { pubkey: metadataPDA, isWritable: true, isSigner: false },
        { pubkey: masterEditionPDA, isWritable: true, isSigner: false },
        { pubkey: tokenRecordPDA, isWritable: true, isSigner: false },
        { pubkey: destinationTokenRecordPDA, isWritable: true, isSigner: false },
        { pubkey: ruleSetPDA, isWritable: false, isSigner: false },
        { pubkey: TokenAuth.PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: TokenMetadata.PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isWritable: false, isSigner: false },
      ];
      remainingAccounts.push(...programmableRemainingAccounts);
    }

    return { preInstructions, remainingAccounts } as ClaimTokenTransferSprinkleData
  }
}