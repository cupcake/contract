import { Program, BN } from "@project-serum/anchor";
import { Transaction, Keypair, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY, SystemProgram, SYSVAR_SLOT_HASHES_PUBKEY, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { Cupcake } from '../target/types/cupcake';
import * as TokenAuth from "@metaplex-foundation/mpl-token-auth-rules"
import * as TokenMetadata from "@metaplex-foundation/mpl-token-metadata"
import { ASSOCIATED_TOKEN_PROGRAM_ID, MintLayout, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createInitializeMintInstruction, createMintToInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { getTokenRecordPDA } from "./programmableAssets";
import { Bakery } from "./state/bakery";
import { Sprinkle } from "./state/sprinkle";
import { UserInfo } from "./state/userInfo";
import { CandyMachine, CandyIDL } from "./idl/CandyMachine";
import { TreasureChest } from "./state/treasureChest";

const CUPCAKE_CANDY_PROGRAM_ID = new PublicKey("DsRmdpRZJwagptu4MMN7GJWaPuwPgStWPUSbfAinYCg9");
export const PDA_PREFIX = 'cupcake';

export const getCandyMachineCreator = (candyMachine: PublicKey) => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('candy_machine'), candyMachine.toBuffer()],
    CUPCAKE_CANDY_PROGRAM_ID
  );
};
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

    async bakeTreasureChestSprinkle(uid: string, sprinkleAuthority: Keypair) {
      const sprinkleUID = new BN(`CC${uid}`, "hex");
      const sprinklePDA = await Sprinkle.PDA(
        this.bakeryAuthorityKeypair.publicKey, 
        sprinkleUID, 
        this.program.programId
      );

      return this.program.methods
        .bakeTreasureChest({ uid: sprinkleUID })
        .accounts({
          authority: this.bakeryAuthorityKeypair.publicKey,
          payer: this.bakeryAuthorityKeypair.publicKey,
          bakery: this.bakeryPDA,
          sprinkle: sprinklePDA,
          sprinkleAuthority: sprinkleAuthority.publicKey,
          treasureChest: await TreasureChest.PDA(this.bakeryAuthorityKeypair.publicKey, sprinkleUID)
        })
        .signers([this.bakeryAuthorityKeypair])
        .rpc()
    }

    async fillTreasureChestSprinkle(uid: string, tokenMints: PublicKey[], sprinkleAuthority: Keypair, offset: number) {
      const sprinkleUID = new BN(`CC${uid}`, "hex");
      const sprinklePDA = await Sprinkle.PDA(
        this.bakeryAuthorityKeypair.publicKey, 
        sprinkleUID, 
        this.program.programId
      );

      const remainingAccounts = tokenMints.map(tokenMint => {
        const tokenATA = getAssociatedTokenAddressSync(tokenMint, this.bakeryAuthorityKeypair.publicKey);
        return [
          { pubkey: tokenMint, isWritable: false, isSigner: false },
          { pubkey: tokenATA, isWritable: true, isSigner: false }
        ]
      }).flat()

      return this.program.methods
        .fillTreasureChest({ offset })
        .accounts({
          authority: this.bakeryAuthorityKeypair.publicKey,
          payer: this.bakeryAuthorityKeypair.publicKey,
          config: this.bakeryPDA,
          sprinkle: sprinklePDA,
          sprinkleAuthority: sprinkleAuthority.publicKey,
          treasureChest: await TreasureChest.PDA(this.bakeryAuthorityKeypair.publicKey, sprinkleUID)
        })
        .remainingAccounts(remainingAccounts)
        .signers([this.bakeryAuthorityKeypair])
        .rpc()
    }

    async claimFromTreasureChestSprinkle(claimer: PublicKey, uid: string, sprinkleAuthority: Keypair, tokenMint: PublicKey, treasureNum: number) {
      const sprinkleUID = new BN(`CC${uid}`, "hex");
      const sprinklePDA = await Sprinkle.PDA(
        this.bakeryAuthorityKeypair.publicKey, 
        sprinkleUID, 
        this.program.programId
      );

      return this.program.methods
        .claimFromTreasureChest({ treasureNum })
        .accounts({
          claimer,
          tokenMint,
          authority: this.bakeryAuthorityKeypair.publicKey,
          payer: this.bakeryAuthorityKeypair.publicKey,
          config: this.bakeryPDA,
          sprinkle: sprinklePDA,
          tagAuthority: sprinkleAuthority.publicKey,
          treasureChest: await TreasureChest.PDA(this.bakeryAuthorityKeypair.publicKey, sprinkleUID),
          tokenLocation: getAssociatedTokenAddressSync(tokenMint, this.bakeryAuthorityKeypair.publicKey),
          tokenDestination: getAssociatedTokenAddressSync(tokenMint, claimer),
        })
        .signers([this.bakeryAuthorityKeypair, sprinkleAuthority])
        .rpc()
    }

    async bakeCandySprinkle(uid: string, candyMachine: PublicKey, numClaims: number, perUser: number, sprinkleAuthority: Keypair) {
      const sprinkleUID = new BN(`CC${uid}`, "hex");
      const sprinklePDA = await Sprinkle.PDA(
        this.bakeryAuthorityKeypair.publicKey, 
        sprinkleUID, 
        this.program.programId
      );
      return this.program.methods
        .addOrRefillTag({
          uid: sprinkleUID,
          numClaims: new BN(numClaims),
          perUser: new BN(perUser),
          minterPays: false,
          pricePerMint: null,
          whitelistBurn: false,
          tagType: { ["candyMachineDrop"]: true }
        } as any)
        .accounts({
          authority: this.bakeryAuthorityKeypair.publicKey,
          payer: this.bakeryAuthorityKeypair.publicKey,
          config: this.bakeryPDA,
          tagAuthority: sprinkleAuthority.publicKey,
          tag: sprinklePDA
        })
        .remainingAccounts([
          { pubkey: candyMachine, isWritable: false, isSigner: false },
          { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
          { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
          { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
          { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
        ])
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

    async hackyClaimCandySprinkle(uid: string, user: PublicKey, bakeryKeypair: Keypair, sprinkleAuthorityKeypair: Keypair) {
      const candyProgram = new Program<CandyMachine>(CandyIDL, CUPCAKE_CANDY_PROGRAM_ID, this.program.provider);

      const sprinkleUID = new BN(`CC${uid}`, "hex");
      const sprinklePDA = await Sprinkle.PDA(
        this.bakeryAuthorityKeypair.publicKey, 
        sprinkleUID, 
        this.program.programId
      );
      const sprinkleState = await this.program.account.tag.fetch(sprinklePDA);
      const candyMachineState = await candyProgram.account.candyMachine.fetch(sprinkleState.candyMachine);

      const [candyMachineCreator, candyMachineCreatorBump] = getCandyMachineCreator(sprinkleState.candyMachine);
      const newTokenMintKeypair = Keypair.generate();
      const newMetadataPDA = await getMetadataPDA(newTokenMintKeypair.publicKey);
      const newMasterEditionPDA = await getMasterEditionPDA(newTokenMintKeypair.publicKey);
      const newUserATA = getAssociatedTokenAddressSync(newTokenMintKeypair.publicKey, user);

      const preInstructions = [
        SystemProgram.createAccount({
          fromPubkey: bakeryKeypair.publicKey,
          newAccountPubkey: newTokenMintKeypair.publicKey,
          space: MintLayout.span,
          lamports: await this.program.provider.connection.getMinimumBalanceForRentExemption(MintLayout.span),
          programId: TOKEN_PROGRAM_ID
        }),
        createInitializeMintInstruction(
          newTokenMintKeypair.publicKey,
          0,
          bakeryKeypair.publicKey,
          bakeryKeypair.publicKey
        ),    
        createAssociatedTokenAccountInstruction(
          bakeryKeypair.publicKey,
          newUserATA,
          user,
          newTokenMintKeypair.publicKey,
        ),
        createMintToInstruction(
          newTokenMintKeypair.publicKey,
          newUserATA,
          bakeryKeypair.publicKey,
          1
        ),
      ];

      const resp = await candyProgram.methods
        .mintNft(candyMachineCreatorBump)
        .accounts({
          candyMachineCreator,
          candyMachine: sprinkleState.candyMachine,
          payer: bakeryKeypair.publicKey,
          wallet: candyMachineState.wallet,
          metadata: newMetadataPDA,
          mint: newTokenMintKeypair.publicKey,
          mintAuthority: bakeryKeypair.publicKey,
          updateAuthority: bakeryKeypair.publicKey,
          masterEdition: newMasterEditionPDA,
          tokenMetadataProgram: TokenMetadata.PROGRAM_ID,
          clock: SYSVAR_CLOCK_PUBKEY,
          recentBlockhashes: SYSVAR_SLOT_HASHES_PUBKEY,
          instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .signers([bakeryKeypair, newTokenMintKeypair])
        .preInstructions(preInstructions)
        .rpc();
      console.log(resp)
    }

    async claimCandySprinkle(uid: string, user: PublicKey, userKeypair: Keypair, bakeryKeypair: Keypair, sprinkleAuthorityKeypair: Keypair) {
      const candyProgram = new Program<CandyMachine>(CandyIDL, CUPCAKE_CANDY_PROGRAM_ID, this.program.provider);

      const sprinkleUID = new BN(`CC${uid}`, "hex");
      const sprinklePDA = await Sprinkle.PDA(
        this.bakeryAuthorityKeypair.publicKey, 
        sprinkleUID, 
        this.program.programId
      );
      const userInfoPDA = await UserInfo.PDA(
        this.bakeryAuthorityKeypair.publicKey, 
        sprinkleUID, 
        user,
        this.program.programId
      );

      const sprinkleState = await this.program.account.tag.fetch(sprinklePDA);
      const candyMachineState = await candyProgram.account.candyMachine.fetch(sprinkleState.candyMachine)
      
      const [candyMachineCreator, candyMachineCreatorBump] = getCandyMachineCreator(sprinkleState.candyMachine);
      const newTokenMintKeypair = Keypair.generate();
      const newMetadataPDA = await getMetadataPDA(newTokenMintKeypair.publicKey);
      const newMasterEditionPDA = await getMasterEditionPDA(newTokenMintKeypair.publicKey);
      const newUserATA = getAssociatedTokenAddressSync(newTokenMintKeypair.publicKey, user)

      const preInstructions = [
        SystemProgram.createAccount({
          fromPubkey: bakeryKeypair.publicKey,
          newAccountPubkey: newTokenMintKeypair.publicKey,
          space: MintLayout.span,
          lamports: await this.program.provider.connection.getMinimumBalanceForRentExemption(MintLayout.span),
          programId: TOKEN_PROGRAM_ID
        }),
        createInitializeMintInstruction(
          newTokenMintKeypair.publicKey,
          0,
          bakeryKeypair.publicKey,
          bakeryKeypair.publicKey
        ),    
        createAssociatedTokenAccountInstruction(
          bakeryKeypair.publicKey,
          newUserATA,
          user,
          newTokenMintKeypair.publicKey,
        ),
        createMintToInstruction(
          newTokenMintKeypair.publicKey,
          newUserATA,
          bakeryKeypair.publicKey,
          1
        ),
      ];

      const claimSprinkleTxn1 = new Transaction().add(...preInstructions)
      /*claimSprinkleTxn.recentBlockhash = (
        await this.program.provider.connection.getRecentBlockhash()
      ).blockhash
      claimSprinkleTxn.feePayer = bakeryKeypair.publicKey*/
      //claimSprinkleTxn.sign(bakeryKeypair, sprinkleAuthorityKeypair, newTokenMintKeypair, userKeypair)

      const resp1 = await this.program.provider.connection.sendTransaction(
        claimSprinkleTxn1, 
        [bakeryKeypair, newTokenMintKeypair]
      )
      console.log(resp1)

      
      const resp2 = await this.program.methods
        .claimTag(candyMachineCreatorBump)
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
          { pubkey: sprinkleState.candyMachine, isWritable: true, isSigner: false },
          { pubkey: candyMachineCreator, isWritable: false, isSigner: false },
          { pubkey: candyMachineState.wallet, isWritable: true, isSigner: false },
          { pubkey: newTokenMintKeypair.publicKey, isWritable: true, isSigner: false },
          { pubkey: newMetadataPDA, isWritable: true, isSigner: false },
          { pubkey: newMasterEditionPDA, isWritable: true, isSigner: false },
          { pubkey: bakeryKeypair.publicKey, isWritable: true, isSigner: true },
          { pubkey: TokenMetadata.PROGRAM_ID, isWritable: false, isSigner: false },
          { pubkey: CUPCAKE_CANDY_PROGRAM_ID, isWritable: false, isSigner: false },
          { pubkey: SYSVAR_CLOCK_PUBKEY, isWritable: false, isSigner: false },
          { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isWritable: false, isSigner: false },
          { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isWritable: false, isSigner: false }
        ])
        .signers([bakeryKeypair, sprinkleAuthorityKeypair])
        .rpc();
      console.log(resp2)

        //.preInstructions(preInstructions)
        //.signers([this.bakeryAuthorityKeypair, sprinkleAuthorityKeypair, newTokenMintKeypair])
        //.rpc()
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