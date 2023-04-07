import { Program, BN } from "@project-serum/anchor";
import { Keypair, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { Cupcake } from '../target/types/cupcake';
import * as TokenAuth from "@metaplex-foundation/mpl-token-auth-rules"
import * as TokenMetadata from "@metaplex-foundation/mpl-token-metadata"
import { ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { getTokenRecordPDA } from "./programmableAssets";
import { Bakery } from "./state/bakery";
import { Sprinkle } from "./state/sprinkle";
import { UserInfo } from "./state/userInfo";

export const PDA_PREFIX = 'cupcake';

export async function getMetadataPDA(tokenMint: PublicKey) {
  return (await PublicKey.findProgramAddress(
    [
      Buffer.from("metadata"), 
      TokenMetadata.PROGRAM_ID.toBuffer(), 
      tokenMint.toBuffer()
    ],
    TokenMetadata.PROGRAM_ID
  ))[0]
}

export async function getMasterEditionPDA(tokenMint: PublicKey) {
  return (await PublicKey.findProgramAddress(
    [
      Buffer.from("metadata"), 
      TokenMetadata.PROGRAM_ID.toBuffer(), 
      tokenMint.toBuffer(),
      Buffer.from("edition")
    ],
    TokenMetadata.PROGRAM_ID
  ))[0]
}

export class CupcakeProgram {
    program: Program<Cupcake>;
    bakeryAuthorityKeypair: Keypair;
    bakeryPDA: PublicKey;

    constructor(program: Program<Cupcake>, bakeryAuthorityKeypair: Keypair) {
      this.program = program;
      this.bakeryAuthorityKeypair = bakeryAuthorityKeypair;
      this.bakeryPDA = Bakery.PDA(bakeryAuthorityKeypair.publicKey, program.programId)
    }

    async createBakery() {
      return this.program.methods
        .initialize()
        .accounts({
          authority: this.bakeryAuthorityKeypair.publicKey,
          payer: this.bakeryAuthorityKeypair.publicKey,
          config: this.bakeryPDA,
        })
        .signers([this.bakeryAuthorityKeypair])
        .rpc()
    }

    async bakeSprinkle(sprinkleType: string, uid: string, tokenMint: PublicKey, numClaims: number, perUser: number, sprinkleAuthority: Keypair) {
      const sprinkleUID = new BN(`CC${uid}`, "hex");
      const sprinklePDA = await Sprinkle.PDA(
        this.bakeryAuthorityKeypair.publicKey, 
        sprinkleUID, 
        this.program.programId
      );

      const bakeryTokenATA = getAssociatedTokenAddressSync(
        tokenMint, 
        this.bakeryAuthorityKeypair.publicKey
      );

      const metadataPDA = await getMetadataPDA(tokenMint);
      const masterEditionPDA = await getMasterEditionPDA(tokenMint);
      const tokenRecordPDA = await getTokenRecordPDA(tokenMint, bakeryTokenATA);

      const metadata = await TokenMetadata.Metadata.fromAccountAddress(
        this.program.provider.connection, 
        metadataPDA
      );
      const isProgrammable = !!metadata.programmableConfig
      const hasRuleset = !!metadata.programmableConfig?.ruleSet
      console.log(isProgrammable, hasRuleset, "baking")

      return this.program.methods
        .addOrRefillTag({
          uid: sprinkleUID,
          numClaims: new BN(numClaims),
          perUser: new BN(perUser),
          minterPays: false,
          pricePerMint: null,
          whitelistBurn: false,
          tagType: { [sprinkleType]: true }
        } as any)
        .accounts({
          authority: this.bakeryAuthorityKeypair.publicKey,
          payer: this.bakeryAuthorityKeypair.publicKey,
          config: this.bakeryPDA,
          tagAuthority: sprinkleAuthority.publicKey,
          tag: sprinklePDA
        })
        .remainingAccounts([
          { pubkey: tokenMint, isWritable: false, isSigner: false },
          { pubkey: bakeryTokenATA, isWritable: true, isSigner: false },
          { pubkey: metadataPDA, isWritable: true, isSigner: false },
          { pubkey: masterEditionPDA, isWritable: false, isSigner: false },
          { pubkey: tokenRecordPDA, isWritable: true, isSigner: false },
          { 
            pubkey: hasRuleset ? metadata.programmableConfig!.ruleSet : TokenMetadata.PROGRAM_ID, 
            isWritable: false, 
            isSigner: false 
          },
          { pubkey: TokenAuth.PROGRAM_ID, isWritable: false, isSigner: false },
          { pubkey: TokenMetadata.PROGRAM_ID, isWritable: false, isSigner: false },
          { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isWritable: false, isSigner: false },
        ])
        .signers([this.bakeryAuthorityKeypair])
        .rpc()
    }

    async claimSprinkle(uid: string, user: PublicKey, sprinkleAuthorityKeypair: Keypair) {
      const sprinkleUID = new BN(`CC${uid}`, "hex");
      const sprinklePDA = await Sprinkle.PDA(
        this.bakeryAuthorityKeypair.publicKey, 
        sprinkleUID, 
        this.program.programId
      );
      const sprinkleState = await this.program.account.tag.fetch(await sprinklePDA);
      const token = getAssociatedTokenAddressSync(
        sprinkleState.tokenMint, 
        this.bakeryAuthorityKeypair.publicKey
      );
      const userATA = getAssociatedTokenAddressSync(
        sprinkleState.tokenMint, 
        user
      );
      const userInfoPDA = await UserInfo.PDA(
        this.bakeryAuthorityKeypair.publicKey, 
        sprinkleUID, 
        user,
        this.program.programId
      );
      const metadataPDA = await getMetadataPDA(sprinkleState.tokenMint);
      const masterEditionPDA = await getMasterEditionPDA(sprinkleState.tokenMint);
      const tokenRecordPDA = await getTokenRecordPDA(sprinkleState.tokenMint, token);
      const destinationTokenRecordPDA = await getTokenRecordPDA(sprinkleState.tokenMint, userATA);

      const metadata = await TokenMetadata.Metadata.fromAccountAddress(
        this.program.provider.connection, 
        await metadataPDA
      );
      const isProgrammable = !!metadata.programmableConfig
      const hasRuleset = !!metadata.programmableConfig?.ruleSet

      return this.program.methods
      .claimTag(0)
      .accounts({
        user,
        authority: this.bakeryAuthorityKeypair.publicKey,
        payer: this.bakeryAuthorityKeypair.publicKey,
        config: this.bakeryPDA,
        tagAuthority: sprinkleAuthorityKeypair.publicKey,
        tag: sprinklePDA,
        userInfo: userInfoPDA,
      })
      .remainingAccounts([
        // Base transfer accounts
        { pubkey: token, isWritable: true, isSigner: false },
        { pubkey: userATA, isWritable: true, isSigner: false },
        // Bakery auth
        { pubkey: this.bakeryAuthorityKeypair.publicKey, isWritable: false, isSigner: false },
        // Mint
        { pubkey: sprinkleState.tokenMint, isWritable: false, isSigner: false },
        // Metadata + edition
        { pubkey: metadataPDA, isWritable: true, isSigner: false },
        { pubkey: masterEditionPDA, isWritable: true, isSigner: false },
        // Current token location record
        { 
          pubkey: isProgrammable ? tokenRecordPDA : TokenMetadata.PROGRAM_ID, 
          isWritable: isProgrammable, 
          isSigner: false 
        },
        // Destination token record
        { 
          pubkey: isProgrammable ? destinationTokenRecordPDA : TokenMetadata.PROGRAM_ID, 
          isWritable: isProgrammable, 
          isSigner: false 
        },
        // Token ruleset
        { 
          pubkey: hasRuleset ? metadata.programmableConfig!.ruleSet : TokenMetadata.PROGRAM_ID, 
          isWritable: false, 
          isSigner: false 
        },
        // Programs / Sysvars
        { pubkey: TokenAuth.PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: TokenMetadata.PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isWritable: false, isSigner: false },
      ])
      .preInstructions([
        createAssociatedTokenAccountInstruction(
          this.bakeryAuthorityKeypair.publicKey, 
          userATA, 
          user, 
          sprinkleState.tokenMint
        )
      ])
      .signers([this.bakeryAuthorityKeypair, sprinkleAuthorityKeypair])
      .rpc()
    }


}