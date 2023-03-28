import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount, 
  createAssociatedTokenAccountInstruction, 
  createMint, 
  getAssociatedTokenAddress, 
  getAssociatedTokenAddressSync, 
  mintTo,
  TOKEN_PROGRAM_ID, 
} from '@solana/spl-token';
import { 
  createCreateInstruction,
  createCreateMasterEditionV3Instruction, 
  createCreateMetadataAccountV3Instruction, 
  createMintInstruction, 
  PrintSupply, 
  PROGRAM_ID,
  TokenStandard
} from "@metaplex-foundation/mpl-token-metadata"
import { LAMPORTS_PER_SOL, SYSVAR_INSTRUCTIONS_PUBKEY } from '@solana/web3.js';
import { Cupcake } from '../target/types/cupcake';

export const PREFIX = 'cupcake';

function getBakeryPDA(bakeryAuthority: anchor.web3.PublicKey, programId: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(PREFIX), 
      bakeryAuthority.toBuffer()
    ],
    programId
  )[0]
}

function getSprinklePDA(bakeryAuthority: anchor.web3.PublicKey, sprinkleUID: anchor.BN, programId: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(PREFIX), 
      bakeryAuthority.toBuffer(), 
      sprinkleUID.toBuffer('le', 8)
    ],
    programId
  )[0]
}

function getUserInfoPDA(bakeryAuthority: anchor.web3.PublicKey, sprinkleUID: anchor.BN, user: anchor.web3.PublicKey, programId: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(PREFIX), 
      bakeryAuthority.toBuffer(), 
      sprinkleUID.toBuffer('le', 8),
      user.toBuffer()
    ],
    programId
  )[0]
}

function getMetadataPDA(tokenMint: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"), 
      PROGRAM_ID.toBuffer(), 
      tokenMint.toBuffer()
    ],
    PROGRAM_ID
  )[0]
}

function getMasterEditionPDA(tokenMint: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"), 
      PROGRAM_ID.toBuffer(), 
      tokenMint.toBuffer(),
      Buffer.from("edition")
    ],
    PROGRAM_ID
  )[0]
}

function getTokenRecordPDA(tokenMint: anchor.web3.PublicKey, owner: anchor.web3.PublicKey) {
  const associatedToken = getAssociatedTokenAddressSync(tokenMint, owner);
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"), 
      PROGRAM_ID.toBuffer(), 
      tokenMint.toBuffer(),
      Buffer.from("token_record"),
      associatedToken.toBuffer()
    ],
    PROGRAM_ID,
  )[0]
}

describe('cupcake', () => {
  anchor.setProvider(anchor.Provider.env());
  const cupcakeProgram = anchor.workspace.Cupcake as Program<Cupcake>;

  const admin = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();
  const sprinkleAuthority = anchor.web3.Keypair.generate();

  const bakeryPDA = getBakeryPDA(admin.publicKey, cupcakeProgram.programId);

  const sprinkleUID = new anchor.BN('CC00112233445566', 'hex');
  const sprinklePDA = getSprinklePDA(admin.publicKey, sprinkleUID, cupcakeProgram.programId);
  const userInfoPDA = getUserInfoPDA(admin.publicKey, sprinkleUID, user.publicKey, cupcakeProgram.programId)

  const sprinkle2Authority = anchor.web3.Keypair.generate();
  const sprinkle2UID = new anchor.BN('CC66554433221100', 'hex');
  const sprinkle2PDA = getSprinklePDA(admin.publicKey, sprinkle2UID, cupcakeProgram.programId);
  const userInfo2PDA = getUserInfoPDA(admin.publicKey, sprinkle2UID, user.publicKey, cupcakeProgram.programId)


  let tokenMint: any;
  let token: any;

  it('Should fund test wallets', async () => {
    let sig = await cupcakeProgram.provider.connection.requestAirdrop(
      admin.publicKey, 
      LAMPORTS_PER_SOL * 10
    );
    await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

    let sig2 = await cupcakeProgram.provider.connection.requestAirdrop(
      user.publicKey, 
      LAMPORTS_PER_SOL * 10
    );
    await cupcakeProgram.provider.connection.confirmTransaction(sig2, 'singleGossip');
  })

  it('Should create a Bakery', async () => {
    const tx = await cupcakeProgram.methods
      .initialize()
      .accounts({
        authority: admin.publicKey,
        payer: admin.publicKey,
        config: bakeryPDA,
      })
      .signers([admin])
      .rpc()
    console.log('Your transaction signature', tx);
  });

  it('Should mint a normal NFT', async () => {
    // Initialize the token mint.
    tokenMint = await createMint(
      cupcakeProgram.provider.connection, 
      admin, 
      admin.publicKey, 
      admin.publicKey, 
      0
    );

    // Create an ATA for the mint owned by admin.
    token = await createAssociatedTokenAccount(
      cupcakeProgram.provider.connection, 
      admin, 
      tokenMint, 
      admin.publicKey
    );

    // Mint a single token from the mint to the ATA.
    await mintTo(
      cupcakeProgram.provider.connection, 
      admin, 
      tokenMint, 
      token, 
      admin, 
      1
    );

    const metadataPDA = getMetadataPDA(tokenMint)
    const masterEditionPDA = getMasterEditionPDA(tokenMint)

    // Create the CreateMetadata instruction.
    const createMetadataIx = createCreateMetadataAccountV3Instruction(
      {  
        metadata: metadataPDA, 
        mint: tokenMint, 
        payer: admin.publicKey, 
        mintAuthority: admin.publicKey, 
        updateAuthority: admin.publicKey 
      },
      { 
        createMetadataAccountArgsV3: {
          data: {
            name: "CupcakeNFT",
            symbol: "cNFT",
            uri: "https://cupcake.com/collection.json",
            sellerFeeBasisPoints: 0,
            creators: [{ address: admin.publicKey, share: 100, verified: true }],
            uses: null,
            collection: null,
          },
          isMutable: true,
          collectionDetails: null
        }
      }
    )

    // Create the CreateMasterEdition instruction.
    const createMasterEditionIx = createCreateMasterEditionV3Instruction(
      { 
        edition: masterEditionPDA, 
        metadata: metadataPDA, 
        mint: tokenMint, 
        payer: admin.publicKey,
        mintAuthority: admin.publicKey,
        updateAuthority: admin.publicKey
      },
      { createMasterEditionArgs: { maxSupply: 0 } }
    )

    // Pack both instructions into a transaction and send/confirm it.
    const txn = new anchor.web3.Transaction().add(createMetadataIx, createMasterEditionIx);
    txn.recentBlockhash = (await cupcakeProgram.provider.connection.getRecentBlockhash()).blockhash;
    txn.feePayer = cupcakeProgram.provider.wallet.publicKey;
    const signedTxn = await cupcakeProgram.provider.wallet.signTransaction(txn);
    const txHash = (await cupcakeProgram.provider.sendAll([{ tx: signedTxn, signers: [admin] }]))[0];
    console.log(txHash)
  });

  it('Should bake a new Refillable1Of1 Sprinkle', async () => {
    const tx = await cupcakeProgram.methods
      .addOrRefillTag({
        uid: sprinkleUID,
        numClaims: new anchor.BN(0),
        perUser: new anchor.BN(1),
        minterPays: false,
        pricePerMint: null,
        whitelistBurn: false,
        tagType: { refillable1Of1: true }
      } as any)
      .accounts({
        authority: admin.publicKey,
        payer: admin.publicKey,
        config: bakeryPDA,
        tagAuthority: sprinkleAuthority.publicKey,
        tag: sprinklePDA
      })
      .remainingAccounts([
        { pubkey: tokenMint, isWritable: false, isSigner: false },
        { pubkey: token, isWritable: true, isSigner: false },
      ])
      .signers([admin])
      .rpc()
    console.log('Your transaction signature', tx);
  });

  it('Should claim the Refillable1Of1 Sprinkle', async () => {
    const userATA = await getAssociatedTokenAddress(tokenMint, user.publicKey)
    const metadataPDA = getMetadataPDA(tokenMint)
    const masterEditionPDA = getMasterEditionPDA(tokenMint)
    try {
    const tx = await cupcakeProgram.methods
      .claimTag(0)
      .accounts({
        user: user.publicKey,
        authority: admin.publicKey,
        payer: admin.publicKey,
        config: bakeryPDA,
        tagAuthority: sprinkleAuthority.publicKey,
        tag: sprinklePDA,
        userInfo: userInfoPDA,
      })
      .remainingAccounts([
        // Base transfer accounts
        { pubkey: token, isWritable: true, isSigner: false },
        { pubkey: userATA, isWritable: true, isSigner: false },

        // Bakery auth
        /*{ pubkey: admin.publicKey, isWritable: false, isSigner: false },

        // Mint
        { pubkey: tokenMint, isWritable: false, isSigner: false },

        // Metadata + edition
        { pubkey: metadataPDA, isWritable: true, isSigner: false },
        { pubkey: masterEditionPDA, isWritable: true, isSigner: false },

        // Programs / Sysvars
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isWritable: false, isSigner: false },*/
      ])
      .preInstructions([
        createAssociatedTokenAccountInstruction(
          admin.publicKey, 
          userATA, 
          user.publicKey, 
          tokenMint
        )
      ])
      .signers([admin, sprinkleAuthority])
      .rpc()
    console.log('Your transaction signature', tx);
    }catch(e){console.warn(e)}
  });

  it('Should mint a ProgrammableNFT', async () => {
    // Initialize the token mint.
    tokenMint = await createMint(
      cupcakeProgram.provider.connection, 
      admin, 
      admin.publicKey, 
      admin.publicKey, 
      0
    );

    // Create an ATA for the mint owned by admin.
    token = await createAssociatedTokenAccount(
      cupcakeProgram.provider.connection, 
      admin, 
      tokenMint, 
      admin.publicKey
    );

    const metadataPDA = getMetadataPDA(tokenMint)
    const masterEditionPDA = getMasterEditionPDA(tokenMint)
    const tokenRecordPDA = getTokenRecordPDA(tokenMint, admin.publicKey)

    // Create the Create instruction.
    const createCreateIx = createCreateInstruction(
      {
        metadata: metadataPDA,
        masterEdition: masterEditionPDA,
        mint: tokenMint,
        authority: admin.publicKey,
        payer: admin.publicKey,
        updateAuthority: admin.publicKey,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        splTokenProgram: TOKEN_PROGRAM_ID
      },
      { 
        createArgs: {
          __kind: "V1",
          assetData: {
            name: "CupcakeNFT",
            symbol: "cNFT",
            uri: "https://cupcake.com/collection.json",
            sellerFeeBasisPoints: 0,
            creators: [{ address: admin.publicKey, share: 100, verified: true }],
            uses: null,
            collection: null,
            isMutable: true,
            primarySaleHappened: false,
            tokenStandard: TokenStandard.ProgrammableNonFungible,
            collectionDetails: null,
            ruleSet: null
          },
          decimals: 0,
          printSupply: { __kind: "Zero" }
        }
      }
    )

    // Create the Mint instruction.
    const createMintIx = createMintInstruction(
      {
        token,
        tokenOwner: admin.publicKey,
        metadata: metadataPDA,
        masterEdition: masterEditionPDA,
        tokenRecord: tokenRecordPDA,
        mint: tokenMint,
        authority: admin.publicKey,
        payer: admin.publicKey,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        splTokenProgram: TOKEN_PROGRAM_ID,
        splAtaProgram: ASSOCIATED_TOKEN_PROGRAM_ID
      },
      { 
        mintArgs: {
          __kind: "V1",
          amount: 1,
          authorizationData: null
        }
      }
    )

    // Pack both instructions into a transaction and send/confirm it.
    try {
    const txn = new anchor.web3.Transaction().add(createCreateIx, createMintIx);
    txn.recentBlockhash = (await cupcakeProgram.provider.connection.getRecentBlockhash()).blockhash;
    txn.feePayer = cupcakeProgram.provider.wallet.publicKey;
    const signedTxn = await cupcakeProgram.provider.wallet.signTransaction(txn);
    const txHash = (await cupcakeProgram.provider.sendAll([{ tx: signedTxn, signers: [admin] }]))[0];
    console.log(txHash)
    }catch(e){console.warn(e)}
  });

  it('Should bake a new Programmable_Refillable1Of1 Sprinkle', async () => {
    try{
    const tx = await cupcakeProgram.methods
      .addOrRefillTag({
        uid: sprinkle2UID,
        numClaims: new anchor.BN(0),
        perUser: new anchor.BN(1),
        minterPays: false,
        pricePerMint: null,
        whitelistBurn: false,
        tagType: { refillable1Of1: true }
      } as any)
      .accounts({
        authority: admin.publicKey,
        payer: admin.publicKey,
        config: bakeryPDA,
        tagAuthority: sprinkle2Authority.publicKey,
        tag: sprinkle2PDA
      })
      .remainingAccounts([
        { pubkey: tokenMint, isWritable: false, isSigner: false },
        { pubkey: token, isWritable: true, isSigner: false },
      ])
      .signers([admin])
      .rpc()
    console.log('Your transaction signature', tx);
    }catch(e){console.warn(e)}
  });

  it('Should claim the Programmable_Refillable1Of1 Sprinkle', async () => {
    const userATA = await getAssociatedTokenAddress(tokenMint, user.publicKey)
    const metadataPDA = getMetadataPDA(tokenMint)
    const masterEditionPDA = getMasterEditionPDA(tokenMint)
    try {
    const tx = await cupcakeProgram.methods
      .claimTag(0)
      .accounts({
        user: user.publicKey,
        authority: admin.publicKey,
        payer: admin.publicKey,
        config: bakeryPDA,
        tagAuthority: sprinkle2Authority.publicKey,
        tag: sprinkle2PDA,
        userInfo: userInfo2PDA,
      })
      .remainingAccounts([
        // Base transfer accounts
        { pubkey: token, isWritable: true, isSigner: false },
        { pubkey: userATA, isWritable: true, isSigner: false },
        // Bakery auth
        { pubkey: admin.publicKey, isWritable: false, isSigner: false },
        // Mint
        { pubkey: tokenMint, isWritable: false, isSigner: false },
        // Metadata + edition
        { pubkey: metadataPDA, isWritable: true, isSigner: false },
        { pubkey: masterEditionPDA, isWritable: true, isSigner: false },
        // Programs / Sysvars
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isWritable: false, isSigner: false },
      ])
      .preInstructions([
        createAssociatedTokenAccountInstruction(
          admin.publicKey, 
          userATA, 
          user.publicKey, 
          tokenMint
        )
      ])
      .signers([admin, sprinkle2Authority])
      .rpc()
    console.log('Your transaction signature', tx);
    }catch(e){console.warn(e)}
  });
});