import { Keypair, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY, Transaction } from "@solana/web3.js";
import { BN, Provider } from "@project-serum/anchor";
import * as TokenAuth from "@metaplex-foundation/mpl-token-auth-rules"
import * as TokenMetadata from "@metaplex-foundation/mpl-token-metadata"
import { decode, encode } from "@msgpack/msgpack";
import { createAssociatedTokenAccount, createMint, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getMasterEditionPDA, getMetadataPDA } from "./cucpakeProgram";
import { createCreateInstruction, createCreateMasterEditionV3Instruction, createCreateMetadataAccountV3Instruction, createMintInstruction, MasterEditionHasPrintsError, TokenStandard } from "@metaplex-foundation/mpl-token-metadata";
import { ASSOCIATED_PROGRAM_ID } from "@project-serum/anchor/dist/cjs/utils/token";

export function getTokenRecordPDA(tokenMint: PublicKey, associatedToken: PublicKey) {
  return PublicKey.findProgramAddressSync(
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

export async function createRuleSetAccount(name: string, owner: Keypair, rules: any, provider: Provider) {
  const encoded = encode([
    1,
    Array.from(owner.publicKey.toBytes()),
    name,
    rules
  ]);
  const rulesetPDA = (await TokenAuth.findRuleSetPDA(owner.publicKey, "cupcake-ruleset"))[0]
  const createTokenAuthRuleSetIx = TokenAuth.createCreateOrUpdateInstruction(
    {
      ruleSetPda: rulesetPDA,
      payer: owner.publicKey,
    },
    {
      createOrUpdateArgs: {
        __kind: "V1",
        serializedRuleSet: encoded
      }
    }
  );
  const txn = new Transaction().add(createTokenAuthRuleSetIx);
  txn.recentBlockhash = (await provider.connection.getRecentBlockhash()).blockhash;
  txn.feePayer = provider.wallet.publicKey;
  const signedTxn = await provider.wallet.signTransaction(txn);
  return (await provider.sendAll([{ tx: signedTxn, signers: [owner] }]))[0];
}

export async function mintNFT(provider: Provider, payer: Keypair, creator: PublicKey, totalSupply: number) {
  // Initialize the token mint.
  const tokenMint = await createMint(
    provider.connection, 
    payer, 
    creator, 
    creator, 
    totalSupply
  );

  // Create an ATA for the mint owned by admin.
  const token = await createAssociatedTokenAccount(
    provider.connection, 
    payer, 
    tokenMint, 
    creator
  );

  await mintTo(
    provider.connection, 
    payer, 
    tokenMint, 
    token, 
    payer, 
    1
  );

  const metadataPDA = getMetadataPDA(tokenMint)
  const masterEditionPDA = getMasterEditionPDA(tokenMint)

  const createMetadataIx = createCreateMetadataAccountV3Instruction(
    {
      payer: payer.publicKey,
      metadata: metadataPDA,
      mint: tokenMint,
      mintAuthority: payer.publicKey,
      updateAuthority: payer.publicKey,
    },
    {
      createMetadataAccountArgsV3: { 
        data: {
          name: "CupcakeNFT",
          symbol: "cNFT",
          uri: "https://cupcake.com/collection.json",
          sellerFeeBasisPoints: 0,
          creators: [{ address: creator, share: 100, verified: true }],
          uses: null,
          collection: null,
        }, 
        isMutable: true, 
        collectionDetails: null
      }
    }
  );

  const createMasterEditionIx = createCreateMasterEditionV3Instruction(
    {
      edition: masterEditionPDA,
      mint: tokenMint,
      updateAuthority: payer.publicKey,
      mintAuthority: payer.publicKey,
      payer: payer.publicKey,
      metadata: metadataPDA
    },
    {
      createMasterEditionArgs: {
        maxSupply: 0
      }
    }
  );

  // Pack both instructions into a transaction and send/confirm it.
  const txn = new Transaction().add(createMetadataIx, createMasterEditionIx);
  txn.recentBlockhash = (await provider.connection.getRecentBlockhash()).blockhash;
  txn.feePayer = provider.wallet.publicKey;
  const signedTxn = await provider.wallet.signTransaction(txn);
  const txHash = (await provider.sendAll([{ tx: signedTxn, signers: [payer] }]))[0];
  console.log(txHash)
  return tokenMint
}

export async function createProgrammableNFT(provider: Provider, payer: Keypair, creator: PublicKey, totalSupply: number, ruleSetOwner?: PublicKey, ruleSetName?: string) {
    const hasRuleset = !!ruleSetOwner || !!ruleSetName;

   // Initialize the token mint.
   const tokenMint = await createMint(
    provider.connection, 
    payer, 
    creator, 
    creator, 
    totalSupply
  );

  // Create an ATA for the mint owned by admin.
  const token = await createAssociatedTokenAccount(
    provider.connection, 
    payer, 
    tokenMint, 
    creator
  );

  const rulesetPDA = hasRuleset ? (await TokenAuth.findRuleSetPDA(ruleSetOwner, ruleSetName))[0] : undefined
  const metadataPDA = getMetadataPDA(tokenMint)
  const masterEditionPDA = getMasterEditionPDA(tokenMint)
  const tokenRecordPDA = getTokenRecordPDA(tokenMint, token)

  // Create the Create instruction.
  const createCreateIx = createCreateInstruction(
    {
      metadata: metadataPDA,
      masterEdition: masterEditionPDA,
      mint: tokenMint,
      authority: creator,
      payer: payer.publicKey,
      updateAuthority: creator,
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
          creators: [{ address: creator, share: 100, verified: true }],
          uses: null,
          collection: null,
          isMutable: true,
          primarySaleHappened: false,
          tokenStandard: TokenStandard.ProgrammableNonFungible,
          collectionDetails: null,
          ruleSet: rulesetPDA
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
      tokenOwner: creator,
      metadata: metadataPDA,
      masterEdition: masterEditionPDA,
      tokenRecord: tokenRecordPDA,
      mint: tokenMint,
      authority: creator,
      payer: payer.publicKey,
      sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      splTokenProgram: TOKEN_PROGRAM_ID,
      splAtaProgram: ASSOCIATED_PROGRAM_ID
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
  const txn = new Transaction().add(createCreateIx, createMintIx);
  txn.recentBlockhash = (await provider.connection.getRecentBlockhash()).blockhash;
  txn.feePayer = provider.wallet.publicKey;
  const signedTxn = await provider.wallet.signTransaction(txn);
  const txHash = (await provider.sendAll([{ tx: signedTxn, signers: [payer] }]))[0];
  console.log(txHash)
  return tokenMint
}

export function parseRuleSetAccountData(ruleSetAccountData: Buffer) {
  console.log("Data length:", ruleSetAccountData.length)

  // Parse header
  const ruleSetHeaderData = ruleSetAccountData.slice(0, 9)
  console.log("ruleSetHeaderData", ruleSetHeaderData)
  const ruleSetAccountKey = ruleSetHeaderData.at(0)
  console.log("ruleSetAccountKey", ruleSetAccountKey)
  const ruleSetAccountRevMapVersionLocation = new BN(ruleSetHeaderData.slice(1).reverse(), 16)
  const ruleSetAccountRevMapVersion = ruleSetAccountData.at(ruleSetAccountRevMapVersionLocation.toNumber())
  console.log("ruleSetAccountRevMapVersion", ruleSetAccountRevMapVersion.toString())

  // parse rev map
  const ruleSetAccountRevMapData = ruleSetAccountData.slice(ruleSetAccountRevMapVersionLocation.toNumber() + 1)
  console.log("ruleSetAccountRevMapData", ruleSetAccountRevMapData)
  const ruleSetAccountRevMapLength = new BN(ruleSetAccountRevMapData.slice(0, 3).reverse(), 16)
  const ruleSetAccountRevVersionOffset = ((ruleSetAccountRevMapLength.toNumber() - 1) * 8) + 4
  const activeRuleSetLocation = new BN(ruleSetAccountRevMapData.slice(
    ruleSetAccountRevVersionOffset, 
    ruleSetAccountRevVersionOffset + 8
  ).reverse(), 16)
  console.log("activeRuleSetLocation", activeRuleSetLocation.toString())

  // parse active rule set
  const activeRuleSetVersionAndData = ruleSetAccountData.slice(activeRuleSetLocation, ruleSetAccountRevMapVersionLocation)
  console.log("activeRuleSetVersionAndData", activeRuleSetVersionAndData)
  const activeRuleSetVersion = activeRuleSetVersionAndData.at(0)
  console.log("activeRuleSetVersion", activeRuleSetVersion)
  const activeRuleSetData = decode(activeRuleSetVersionAndData.slice(1))
  console.log("activeRuleSetData", activeRuleSetData)
}