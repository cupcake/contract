import { createAssociatedTokenAccountInstruction, createInitializeMintInstruction, createMintToInstruction, getAssociatedTokenAddressSync, MintLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountMeta, Connection, Keypair, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { getEditionMarkPDA, getMasterEditionPDA, getMetadataPDA } from "../../programmableAssets";
import * as TokenMetadata from "@metaplex-foundation/mpl-token-metadata"
import { SprinkleX } from "../../state/sprinkle";

export class ClaimEditionPrinterSprinkleData {
  preInstructions: TransactionInstruction[];
  remainingAccounts: AccountMeta[];
  extraSigners: Keypair[];

  static async construct(connection: Connection, bakeryAuthority: PublicKey, claimer: PublicKey, sprinkleState: SprinkleX) {
    //
    const bakeryTokenATA = getAssociatedTokenAddressSync(sprinkleState.tokenMint, bakeryAuthority);
    const metadataPDA = await getMetadataPDA(sprinkleState.tokenMint);
    const masterEditionPDA = await getMasterEditionPDA(sprinkleState.tokenMint);

    const newTokenMintKeypair = Keypair.generate();
    const newTokenMint = newTokenMintKeypair.publicKey;
    const newUserATA = getAssociatedTokenAddressSync(newTokenMint, claimer);
    const newMetadataPDA = await getMetadataPDA(newTokenMint);
    const newMasterEditionPDA = await getMasterEditionPDA(newTokenMint);

    const masterEditionAccountInfo = await connection.getAccountInfo(masterEditionPDA);
    const masterEdition = TokenMetadata.MasterEditionV2.fromAccountInfo(masterEditionAccountInfo)[0];
    const newEditionNumber = masterEdition.supply.toNumber() + 1;
    const editionMarkPDA = await getEditionMarkPDA(sprinkleState.tokenMint, newEditionNumber);

    const preInstructions = [];
    const extraSigners = [];
    const createMintAccountIx = SystemProgram.createAccount({
      fromPubkey: bakeryAuthority,
      newAccountPubkey: newTokenMint,
      space: MintLayout.span,
      lamports: await connection.getMinimumBalanceForRentExemption(MintLayout.span),
      programId: TOKEN_PROGRAM_ID,
    });
    const initializeMintIx = createInitializeMintInstruction(newTokenMint, 0, bakeryAuthority, bakeryAuthority);
    const createATAIx = createAssociatedTokenAccountInstruction(bakeryAuthority, newUserATA, claimer, newTokenMint);
    const mintToIx = createMintToInstruction(newTokenMint, newUserATA, bakeryAuthority, 1)
    preInstructions.push(createMintAccountIx, initializeMintIx, createATAIx, mintToIx);
    extraSigners.push(newTokenMintKeypair);

    //
    const remainingAccounts = [
      { pubkey: sprinkleState.tokenMint, isWritable: false, isSigner: false },
      { pubkey: bakeryTokenATA, isWritable: true, isSigner: false },
      { pubkey: newTokenMintKeypair.publicKey, isWritable: true, isSigner: false },
      { pubkey: newMetadataPDA, isWritable: true, isSigner: false },
      { pubkey: newMasterEditionPDA, isWritable: true, isSigner: false },
      { pubkey: metadataPDA, isWritable: false, isSigner: false },
      { pubkey: masterEditionPDA, isWritable: true, isSigner: false },
      { pubkey: editionMarkPDA, isWritable: true, isSigner: false },
      { pubkey: bakeryAuthority, isWritable: false, isSigner: true },
      { pubkey: bakeryAuthority, isWritable: false, isSigner: false },
      { pubkey: TokenMetadata.PROGRAM_ID, isWritable: false, isSigner: false },
    ];

    return { preInstructions, remainingAccounts, extraSigners } as ClaimEditionPrinterSprinkleData
  }
}