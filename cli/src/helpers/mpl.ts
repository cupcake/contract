import { Keypair, Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { createMint, createAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import {
  PROGRAM_ADDRESS as METADATA_PROGRAM_ADDRESS,
  Creator,
  createCreateMetadataAccountV2Instruction,
  createCreateMasterEditionV3Instruction,
} from '@metaplex-foundation/mpl-token-metadata';
import { BN, Program } from '@project-serum/anchor';
import { constructAndSendTx } from './solana';
import { TOKEN_METADATA_PROGRAM_ID } from './cupcake_program';

export const MPL_METADATA_PROGRAM_ADDRESS = new PublicKey(METADATA_PROGRAM_ADDRESS);
export const CANDY_MACHINE_ADDRESS = new PublicKey('DsRmdpRZJwagptu4MMN7GJWaPuwPgStWPUSbfAinYCg9');

export const MAX_NAME_LENGTH = 32;
export const MAX_URI_LENGTH = 200;
export const MAX_SYMBOL_LENGTH = 10;
export const MAX_CREATOR_LEN = 32 + 1 + 1;
export const MAX_CREATOR_LIMIT = 5;
export const CONFIG_LINE_SIZE = 4 + 32 + 4 + 200;
export const CONFIG_ARRAY_START =
  8 + // key
  32 + // authority
  32 + //wallet
  33 + // token mint
  4 +
  6 + // uuid
  8 + // price
  8 + // items available
  9 + // go live
  10 + // end settings
  4 +
  MAX_SYMBOL_LENGTH + // u32 len + symbol
  2 + // seller fee basis points
  4 +
  MAX_CREATOR_LIMIT * MAX_CREATOR_LEN + // optional + u32 len + actual vec
  8 + //max supply
  1 + // is mutable
  1 + // retain authority
  1 + // option for hidden setting
  4 +
  MAX_NAME_LENGTH + // name length,
  4 +
  MAX_URI_LENGTH + // uri length,
  32 + // hash
  4 + // max number of lines;
  8 + // items redeemed
  1 + // whitelist option
  1 + // whitelist mint mode
  1 + // allow presale
  9 + // discount price
  32 + // mint key for whitelist
  1 +
  32 +
  1; // gatekeeper

export const getMetadata = async (mint: PublicKey) => {
  return (
    await PublicKey.findProgramAddress(
      [Buffer.from('metadata'), MPL_METADATA_PROGRAM_ADDRESS.toBuffer(), mint.toBuffer()],
      MPL_METADATA_PROGRAM_ADDRESS
    )
  )[0];
};

export const getMasterEdition = async (mint: PublicKey) => {
  return (
    await PublicKey.findProgramAddress(
      [Buffer.from('metadata'), MPL_METADATA_PROGRAM_ADDRESS.toBuffer(), mint.toBuffer(), Buffer.from('edition')],
      MPL_METADATA_PROGRAM_ADDRESS
    )
  )[0];
};

export const getCandyMachineCreator = async (candyMachine: PublicKey): Promise<[PublicKey, number]> => {
  return await PublicKey.findProgramAddress(
    [Buffer.from('candy_machine'), candyMachine.toBuffer()],
    CANDY_MACHINE_ADDRESS
  );
};

export const getCollectionPDA = async (candyMachineAddress: PublicKey): Promise<[PublicKey, number]> => {
  return await PublicKey.findProgramAddress(
    [Buffer.from('collection'), candyMachineAddress.toBuffer()],
    CANDY_MACHINE_ADDRESS
  );
};

export const getCollectionAuthorityRecordPDA = async (
  mint: PublicKey,
  newAuthority: PublicKey
): Promise<[PublicKey, number]> => {
  return await PublicKey.findProgramAddress(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from('collection_authority'),
      newAuthority.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
};

export const getEditionMarkPda = async (mint: PublicKey, edition: number): Promise<PublicKey> => {
  const editionNumber = Math.floor(edition / 248);
  return (
    await PublicKey.findProgramAddress(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
        Buffer.from('edition'),
        Buffer.from(editionNumber.toString()),
      ],
      TOKEN_METADATA_PROGRAM_ID
    )
  )[0];
};

export const getEdition = async (mint: PublicKey, number: Number) => {
  return (
    await PublicKey.findProgramAddress(
      [
        Buffer.from('metadata'),
        MPL_METADATA_PROGRAM_ADDRESS.toBuffer(),
        mint.toBuffer(),
        Buffer.from('edition'),
        Buffer.from(number.toString()),
      ],
      MPL_METADATA_PROGRAM_ADDRESS
    )
  )[0];
};

export const createCreateMetadataAccountAccounts = async (keypair: Keypair, mint: PublicKey) => {
  return {
    metadata: await getMetadata(mint),
    mint: mint,
    mintAuthority: keypair.publicKey,
    payer: keypair.publicKey,
    updateAuthority: keypair.publicKey,
  };
};

export const createCreateMetadataAccountArgs = async (
  uri: string,
  name: string,
  symbol: string,
  creators: Creator[],
  sellerFeeBasisPoints: number,
  isMutable: boolean
) => {
  return {
    createMetadataAccountArgsV2: {
      data: {
        collection: null,
        creators,
        name,
        sellerFeeBasisPoints,
        symbol,
        uri,
        uses: null,
      },
      isMutable,
    },
  };
};

export const createCreateMasterEditionAccountAccounts = async (keypair: Keypair, mint: PublicKey) => {
  return {
    edition: await getMasterEdition(mint),
    metadata: await getMetadata(mint),
    mint: mint,
    mintAuthority: keypair.publicKey,
    payer: keypair.publicKey,
    updateAuthority: keypair.publicKey,
  };
};

export const createCreateMasterEditionAccountArgs = async (maxSupply: number) => {
  return {
    createMasterEditionArgs: {
      maxSupply: new BN(maxSupply),
    },
  };
};

export const createMetadataAccount = async (
  connection: Connection,
  keypair: Keypair,
  mint: PublicKey,
  uri: string,
  name: string,
  symbol: string,
  creatorPubkeys: PublicKey[],
  creatorShares: number[],
  royaltyPercentage: number,
  isMutable: boolean
) => {
  return await constructAndSendTx(
    connection,
    [
      createCreateMetadataAccountV2Instruction(
        await createCreateMetadataAccountAccounts(keypair, mint),
        await createCreateMetadataAccountArgs(
          uri,
          name,
          symbol,
          constructCreatorsArray(creatorPubkeys, creatorShares, keypair),
          royaltyPercentage,
          isMutable
        )
      ),
    ],
    [keypair]
  );
};

export const createMasterEditionAccount = async (
  connection: Connection,
  keypair: Keypair,
  mint: PublicKey,
  maxSupply: number
) => {
  return await constructAndSendTx(
    connection,
    [
      createCreateMasterEditionV3Instruction(
        await createCreateMasterEditionAccountAccounts(keypair, mint),
        await createCreateMasterEditionAccountArgs(maxSupply)
      ),
    ],
    [keypair]
  );
};

export const constructCreatorsArray = (creators: PublicKey[], shares: number[], keypair: Keypair) => {
  return creators.map((c, i) => {
    return {
      address: c,
      share: shares[i],
      verified: c === keypair.publicKey,
    };
  });
};

export const calcCandyAccountSize = (candyData: any) => {
  return (
    CONFIG_ARRAY_START + 4 + 10 * CONFIG_LINE_SIZE + 8 + 2 * (Math.floor(candyData.itemsAvailable.toNumber() / 8) + 1)
  );
};

export const createCandyMachine = async (program: Program, candyData: any, keypair: Keypair) => {
  const candyAccount = Keypair.generate();
  candyData.uuid = candyAccount.publicKey.toBase58().slice(0, 6);
  const size = calcCandyAccountSize(candyData);
  const createCandyAccountTx = SystemProgram.createAccount({
    fromPubkey: keypair.publicKey,
    newAccountPubkey: candyAccount.publicKey,
    space: size,
    lamports: await program.provider.connection.getMinimumBalanceForRentExemption(size),
    programId: CANDY_MACHINE_ADDRESS,
  });
  await program.methods
    .initializeCandyMachine(candyData)
    .accounts({
      candyMachine: candyAccount.publicKey,
      wallet: keypair.publicKey,
      authority: keypair.publicKey,
      payer: keypair.publicKey,
    })
    .preInstructions([createCandyAccountTx])
    .signers([keypair, candyAccount])
    .rpc();
  return candyAccount.publicKey;
};

export const mintNFT = async (
  connection: Connection,
  keypair: Keypair,
  uri: string,
  totalSupply: number,
  creators: PublicKey[],
  shares: number[],
  royaltyPercentage: number,
  name: string,
  symbol: string,
  isMutable: boolean
) => {
  const mint = await createMint(connection, keypair, keypair.publicKey, null, 0);
  const ata = await createAssociatedTokenAccount(connection, keypair, mint, keypair.publicKey);
  await mintTo(connection, keypair, mint, ata, keypair, 1);
  const createMetadataAccountTx = await createMetadataAccount(
    connection,
    keypair,
    mint,
    uri,
    name,
    symbol,
    creators,
    shares,
    royaltyPercentage,
    isMutable
  );
  const createMasterEditionAccountTx = await createMasterEditionAccount(connection, keypair, mint, totalSupply);
  return { mint, ata };
};
