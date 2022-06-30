import { MasterEditionV2, Metadata } from '@metaplex-foundation/mpl-token-metadata';
import { Provider, BN, BorshAccountsCoder, Program, Wallet } from '@project-serum/anchor';
import NodeWallet from '@project-serum/anchor/dist/cjs/nodewallet';

import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  createMintToInstruction,
  MintLayout,
  createInitializeMintInstruction,
  createApproveInstruction,
  createRevokeInstruction,
  getMint,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_SLOT_HASHES_PUBKEY,
  TransactionInstruction,
} from '@solana/web3.js';
import { bool } from 'aws-sdk/clients/signer';
import log from 'loglevel';
import {
  CANDY_MACHINE_ADDRESS,
  getCandyMachineCreator,
  getCollectionAuthorityRecordPDA,
  getCollectionPDA,
  getEdition,
  getEditionMarkPda,
  getMasterEdition,
  getMetadata,
} from './mpl';
import { getCluster, WRAPPED_SOL_MINT } from './solana';
import { sendTransactions, sendTransactionWithRetry, SequenceType, sendPreppedTransactions } from './transaction';

export const CUPCAKE_PROGRAM_ID = new PublicKey('cakeGJxEdGpZ3MJP8sM3QypwzuzZpko1ueonUQgKLPE');

export const PREFIX = 'cupcake';

export const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

export const transactionHelper = { sendPreppedTransactions };

export enum TagType {
  LimitedOrOpenEdition,
  SingleUse1Of1,
  CandyMachineDrop,
  Refillable1Of1,
  WalletRestrictedFungible,
  HotPotato,
}

export interface AnchorTagType {
  limitedOrOpenEdition?: boolean;
  singleUse1Of1?: boolean;
  candyMachineDrop?: boolean;
  refillable1Of1?: boolean;
  walletRestrictedFungible?: boolean;
  hotPotato?: boolean;
}

export interface Config {
  authority: PublicKey;
  bump: number;
}

export interface Tag {
  uid: BN;
  tagType: AnchorTagType;
  tagAuthority: PublicKey;
  config: PublicKey;
  totalSupply: Number;
  numClaimed: Number;
  perUser: Number;
  minterPays: boolean;
  tokenMint: PublicKey;
  candyMachine: PublicKey;
  whitelistMint: PublicKey;
  whitelistBurn: PublicKey;
  bump: Number;
  currentTokenLocation: PublicKey;
}

export interface UserInfo {
  numClaimed: Number;
  bump: number;
}

export interface InitializeAccounts {
  authorityKeypair?: Keypair;
  authority?: PublicKey;
}

export interface AddOrRefillTagParams {
  uid: BN;
  tagType: AnchorTagType;
  numClaims: BN;
  perUser: BN;
  minterPays: boolean;
  // candy only
  pricePerMint?: BN | null;
  whitelistBurn?: boolean;
}

export interface AddOrRefillTagAccounts {
  authority?: PublicKey;
  authorityKeypair?: Keypair;
  tagAuthorityKeypair?: Keypair;
  tagAuthority?: PublicKey;
  tokenMint?: PublicKey;
  candyMachine?: PublicKey;
  whitelistMint?: PublicKey;
  paymentTokenMint?: PublicKey;
}

export interface ClaimTagParams {
  creatorBump?: number;
  minterPays?: bool;
}

export interface ClaimTagAccounts {
  userKeypair?: Keypair;
  user?: PublicKey;
  tagAuthority?: PublicKey;
  tagAuthorityKeypair?: Keypair;
  tag: PublicKey;
  newTokenMint?: PublicKey;
  newMintAuthorityKeypair?: Keypair;
  newMintAuthority?: PublicKey;
  updateAuthority?: PublicKey;
  candyMachine?: PublicKey;
  candyMachineWallet?: PublicKey;
  collectionMint?: PublicKey;
  collectionMetadata?: PublicKey;
  collectionMasterEdition?: PublicKey;
  collectionAuthorityRecord?: PublicKey;
  candyMachineAuthority?: PublicKey;
}

export interface ClaimTagAdditionalArgs {
  tag: Tag;
  config: Config;
  nextEdition?: BN;
  createAta: boolean;
  candyProgram?: Program;
}

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

export class CupcakeInstruction {
  id: PublicKey;
  program: Program;

  constructor(args: { id: PublicKey; program: Program }) {
    this.id = args.id;
    this.program = args.program;
  }

  async initialize(_args: {}, accounts: InitializeAccounts, _additionalArgs = {}) {
    if (
      accounts.authority &&
      accounts.authorityKeypair &&
      !accounts.authority.equals(accounts.authorityKeypair.publicKey)
    ) {
      throw new Error('Authority and authority keypair must match if both present');
    }

    const authority =
      accounts.authority ||
      accounts.authorityKeypair?.publicKey ||
      (this.program.provider as Provider).wallet.publicKey;

    const [config, _configBump] = await getConfig(this.program, authority);

    return {
      transactions: [
        {
          instructions: [
            await this.program.methods
              .initialize()
              .accounts({
                config,
                authority,
                payer: (this.program.provider as Provider).wallet.publicKey,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,
              })
              .instruction(),
          ],
          signers: accounts.authorityKeypair ? [accounts.authorityKeypair] : [],
        },
      ],
    };
  }

  async addOrRefillTag(args: AddOrRefillTagParams, accounts: AddOrRefillTagAccounts, _additionalArgs = {}) {
    if (
      accounts.authority &&
      accounts.authorityKeypair &&
      !accounts.authority.equals(accounts.authorityKeypair.publicKey)
    ) {
      throw new Error('Authority and authority keypair must match if both present');
    }

    if (
      accounts.tagAuthority &&
      accounts.tagAuthorityKeypair &&
      !accounts.tagAuthority.equals(accounts.tagAuthorityKeypair.publicKey)
    ) {
      throw new Error('Tag Authority and tag authority keypair must match if both present');
    }

    const authority =
      accounts.authority ||
      accounts.authorityKeypair?.publicKey ||
      (this.program.provider as Provider).wallet.publicKey;

    const tagAuthority =
      accounts.tagAuthority ||
      accounts.tagAuthorityKeypair?.publicKey ||
      (this.program.provider as Provider).wallet.publicKey;

    const [config, _configBump] = await getConfig(this.program, authority);
    const [tag, _tagBump] = await getTag(this.program, args.uid, authority);
    const signers = [];

    if (accounts.authorityKeypair) {
      signers.push(accounts.authorityKeypair);
    }

    if (accounts.tagAuthorityKeypair) {
      signers.push(accounts.tagAuthorityKeypair);
    }

    const remainingAccounts = [];

    if (args.tagType.walletRestrictedFungible || args.tagType.refillable1Of1 || args.tagType.singleUse1Of1) {
      const configTokenAta = await getAssociatedTokenAddress(accounts.tokenMint, authority);

      remainingAccounts.push({ pubkey: accounts.tokenMint, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: configTokenAta, isWritable: true, isSigner: false });
    } else if (args.tagType.hotPotato) {
      const configTokenAta = await getAssociatedTokenAddress(accounts.tokenMint, authority);

      remainingAccounts.push({ pubkey: accounts.tokenMint, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: configTokenAta, isWritable: true, isSigner: false });
      remainingAccounts.push({
        pubkey: await getMasterEdition(accounts.tokenMint),
        isWritable: false,
        isSigner: false,
      });
      remainingAccounts.push({ pubkey: TOKEN_METADATA_PROGRAM_ID, isWritable: false, isSigner: false });
    } else if (args.tagType.limitedOrOpenEdition) {
      remainingAccounts.push({ pubkey: accounts.tokenMint, isWritable: false, isSigner: false });
    } else if (args.tagType.candyMachineDrop) {
      remainingAccounts.push({ pubkey: accounts.candyMachine, isWritable: false, isSigner: false });

      remainingAccounts.push({
        pubkey: accounts.whitelistMint || SystemProgram.programId,
        isWritable: false,
        isSigner: false,
      });

      remainingAccounts.push({
        pubkey:
          args.minterPays || !accounts.whitelistMint
            ? SystemProgram.programId
            : await getAssociatedTokenAddress(accounts.whitelistMint, authority),
        isWritable: accounts.whitelistMint && !args.minterPays,
        isSigner: false,
      });

      remainingAccounts.push({
        pubkey: accounts.paymentTokenMint || SystemProgram.programId,
        isWritable: false,
        isSigner: false,
      });

      remainingAccounts.push({
        pubkey:
          args.minterPays || !accounts.paymentTokenMint
            ? SystemProgram.programId
            : await getAssociatedTokenAddress(accounts.paymentTokenMint, authority),
        isWritable: accounts.paymentTokenMint && !args.minterPays,
        isSigner: false,
      });
    }

    return {
      transactions: [
        {
          instructions: [
            await this.program.methods
              .addOrRefillTag(args)
              .accounts({
                authority,
                config,
                tagAuthority,
                payer: (this.program.provider as Provider).wallet.publicKey,
                tag,
                systemProgram: SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                rent: SYSVAR_RENT_PUBKEY,
              })
              .remainingAccounts(remainingAccounts)
              .instruction(),
          ],
          signers,
        },
      ],
    };
  }

  async claimTag(args: ClaimTagParams, accounts: ClaimTagAccounts, additionalArgs: ClaimTagAdditionalArgs) {
    if (
      accounts.tagAuthority &&
      accounts.tagAuthorityKeypair &&
      !accounts.tagAuthority.equals(accounts.tagAuthorityKeypair.publicKey)
    ) {
      throw new Error('Tag Authority and tag authority keypair must match if both present');
    }

    const tagAuthority =
      accounts.tagAuthority ||
      accounts.tagAuthorityKeypair?.publicKey ||
      (this.program.provider as Provider).wallet.publicKey;

    if (accounts.user && accounts.userKeypair && !accounts.user.equals(accounts.userKeypair.publicKey)) {
      throw new Error('User and user keypair must match if both present');
    }

    const user =
      accounts.user || accounts.userKeypair?.publicKey || (this.program.provider as Provider).wallet.publicKey;

    const payer = args.minterPays ? user : (this.program.provider as Provider).wallet.publicKey;

    if (
      accounts.newMintAuthority &&
      accounts.newMintAuthorityKeypair &&
      !accounts.newMintAuthority.equals(accounts.newMintAuthorityKeypair.publicKey)
    ) {
      throw new Error('Mint authority and mint authority keypair must match if both present');
    }

    const newMintAuthority =
      accounts.newMintAuthority || accounts.newMintAuthorityKeypair?.publicKey || args.minterPays
        ? accounts.userKeypair.publicKey
        : (this.program.provider as Provider).wallet.publicKey;

    const tagObj = additionalArgs.tag;
    const configObj = additionalArgs.config;

    const [config, _configBump] = await getConfig(this.program, configObj.authority);
    const [tag, _tagBump] = await getTag(this.program, tagObj.uid, configObj.authority);
    const signers = [];
    const newMintSigners = [];
    const priorInstructions = [];
    const postInstructions = [];

    if (
      accounts.userKeypair &&
      user.equals(accounts.userKeypair.publicKey) &&
      (args.minterPays || tagObj.tagType.hotPotato)
    ) {
      signers.push(accounts.userKeypair);
    }

    if (accounts.tagAuthorityKeypair && tagAuthority.equals(accounts.tagAuthorityKeypair.publicKey)) {
      signers.push(accounts.tagAuthorityKeypair);
    }

    if (accounts.newMintAuthorityKeypair && newMintAuthority.equals(accounts.newMintAuthorityKeypair.publicKey)) {
      signers.push(accounts.newMintAuthorityKeypair);
    }

    const remainingAccounts = [];

    const configTokenAta = await getAssociatedTokenAddress(tagObj.tokenMint, configObj.authority);

    const newTokenMintKeypair = Keypair.generate();
    const newTokenInfo = {
      newTokenMint: accounts.newTokenMint || newTokenMintKeypair.publicKey,
      newMetadata: null,
      newEdition: null,
    };

    // default is a normal token transfer of some kind, but if candy or edition,
    // reset to new token mint
    let userAta = await getAssociatedTokenAddress(tagObj.tokenMint, user);

    if (tagObj.tagType.limitedOrOpenEdition || tagObj.tagType.candyMachineDrop) {
      newTokenInfo.newMetadata = await getMetadata(newTokenInfo.newTokenMint);
      newTokenInfo.newEdition = await getMasterEdition(newTokenInfo.newTokenMint);
      userAta = await getAssociatedTokenAddress(newTokenInfo.newTokenMint, user);

      if (newTokenInfo.newTokenMint.equals(newTokenMintKeypair.publicKey)) {
        newMintSigners.push(newTokenMintKeypair);
        if (accounts.userKeypair && args.minterPays) newMintSigners.push(accounts.userKeypair);

        priorInstructions.push(
          SystemProgram.createAccount({
            fromPubkey: payer,
            newAccountPubkey: newTokenInfo.newTokenMint,
            space: MintLayout.span,
            lamports: await this.program.provider.connection.getMinimumBalanceForRentExemption(MintLayout.span),
            programId: TOKEN_PROGRAM_ID,
          })
        );
        priorInstructions.push(createInitializeMintInstruction(newTokenInfo.newTokenMint, 0, newMintAuthority, payer));
        priorInstructions.push(
          createAssociatedTokenAccountInstruction(payer, userAta, user, newTokenInfo.newTokenMint)
        );
        priorInstructions.push(
          createMintToInstruction(newTokenInfo.newTokenMint, userAta, newMintAuthority, 1)
        );
      }
    } else if (additionalArgs.createAta) {
      priorInstructions.push(createAssociatedTokenAccountInstruction(payer, userAta, user, tagObj.tokenMint));
    }

    if (tagObj.tagType.walletRestrictedFungible || tagObj.tagType.refillable1Of1 || tagObj.tagType.singleUse1Of1) {
      remainingAccounts.push({ pubkey: configTokenAta, isWritable: true, isSigner: false });
      remainingAccounts.push({ pubkey: userAta, isWritable: true, isSigner: false });
    } else if (tagObj.tagType.hotPotato) {
      remainingAccounts.push({ pubkey: tagObj.currentTokenLocation, isWritable: true, isSigner: false });
      remainingAccounts.push({
        pubkey: (await getUserHotPotatoToken(this.program, tagObj.uid, tagObj.tagAuthority, user, tagObj.tokenMint))[0],
        isWritable: true,
        isSigner: false,
      });
      remainingAccounts.push({
        pubkey: await getMasterEdition(tagObj.tokenMint),
        isWritable: true,
        isSigner: false,
      });
      remainingAccounts.push({ pubkey: tagObj.tokenMint, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: TOKEN_METADATA_PROGRAM_ID, isWritable: false, isSigner: false });
      // Add user as signer to force signer since anchor wont do it
      remainingAccounts.push({ pubkey: user, isWritable: false, isSigner: true });
    } else if (tagObj.tagType.limitedOrOpenEdition) {
      remainingAccounts.push({ pubkey: tagObj.tokenMint, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: configTokenAta, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: newTokenInfo.newTokenMint, isWritable: true, isSigner: false });
      remainingAccounts.push({ pubkey: newTokenInfo.newMetadata, isWritable: true, isSigner: false });
      remainingAccounts.push({ pubkey: newTokenInfo.newEdition, isWritable: true, isSigner: false });
      remainingAccounts.push({ pubkey: await getMetadata(tagObj.tokenMint), isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: await getMasterEdition(tagObj.tokenMint), isWritable: true, isSigner: false });
      if (!additionalArgs.nextEdition) throw new Error('Need to set edition');
      if (!accounts.updateAuthority) throw new Error('Need update authority of current token');
      remainingAccounts.push({
        pubkey: await getEditionMarkPda(tagObj.tokenMint, additionalArgs.nextEdition.toNumber()),
        isWritable: true,
        isSigner: false,
      });
      remainingAccounts.push({ pubkey: newMintAuthority, isWritable: true, isSigner: true });

      if (accounts.newMintAuthorityKeypair) signers.push(accounts.newMintAuthorityKeypair);
      remainingAccounts.push({ pubkey: accounts.updateAuthority, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: TOKEN_METADATA_PROGRAM_ID, isWritable: false, isSigner: false });
    } else if (tagObj.tagType.candyMachineDrop) {
      remainingAccounts.push({ pubkey: accounts.candyMachine, isWritable: true, isSigner: false });
      remainingAccounts.push({
        pubkey: (await getCandyMachineCreator(accounts.candyMachine))[0],
        isWritable: false,
        isSigner: false,
      });
      remainingAccounts.push({ pubkey: accounts.candyMachineWallet, isWritable: true, isSigner: false });
      remainingAccounts.push({ pubkey: newTokenInfo.newTokenMint, isWritable: true, isSigner: false });
      remainingAccounts.push({ pubkey: newTokenInfo.newMetadata, isWritable: true, isSigner: false });
      remainingAccounts.push({ pubkey: newTokenInfo.newEdition, isWritable: true, isSigner: false });
      remainingAccounts.push({ pubkey: newMintAuthority, isWritable: true, isSigner: true });
      remainingAccounts.push({ pubkey: TOKEN_METADATA_PROGRAM_ID, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: CANDY_MACHINE_ADDRESS, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: SYSVAR_CLOCK_PUBKEY, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isWritable: false, isSigner: false });

      if (!tagObj.whitelistMint.equals(SystemProgram.programId))
        remainingAccounts.push({
          pubkey: await getAssociatedTokenAddress(tagObj.whitelistMint, tagObj.minterPays ? user : configObj.authority),
          isWritable: true,
          isSigner: false,
        });

      if (tagObj.whitelistBurn) {
        remainingAccounts.push({
          pubkey: tagObj.whitelistMint,
          isWritable: true,
          isSigner: false,
        });
      }

      if (!tagObj.tokenMint.equals(SystemProgram.programId)) {
        remainingAccounts.push({
          pubkey: await getAssociatedTokenAddress(tagObj.tokenMint, tagObj.minterPays ? user : configObj.authority),
          isWritable: true,
          isSigner: false,
        });
      }
    }

    if (accounts.collectionMasterEdition) {
      if (!additionalArgs.candyProgram) {
        throw new Error('Must pass in candy program if using candy drop');
      }

      const collectionPDA = (await getCollectionPDA(accounts.candyMachine))[0];
      postInstructions.unshift(
        await additionalArgs.candyProgram.methods
          .setCollectionDuringMint()
          .accounts({
            candyMachine: accounts.candyMachine,
            metadata: newTokenInfo.newMetadata,
            payer,
            collectionPda: collectionPDA,
            tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
            instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
            collectionMint: accounts.collectionMint,
            collectionMetadata: accounts.collectionMetadata,
            collectionMasterEdition: accounts.collectionMasterEdition,
            authority: accounts.candyMachineAuthority,
            collectionAuthorityRecord: accounts.collectionAuthorityRecord,
          })
          .instruction()
      );
    }

    const instruction = await this.program.methods
      .claimTag(args.creatorBump)
      .accounts({
        user,
        payer,
        config,
        tagAuthority,
        tag,
        userInfo: (await getUserInfo(this.program, tagObj.uid, configObj.authority, user))[0],
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .remainingAccounts(remainingAccounts)
      .instruction();

    if (accounts.collectionMasterEdition) {
      return {
        transactions: [
          {
            instructions: priorInstructions,
            signers: newMintSigners,
            feePayer: payer,
          },
          {
            instructions: [instruction, ...postInstructions],
            signers: [...signers],
            feePayer: payer,
          },
        ],
      };
    } else {
      return {
        transactions: [
          {
            instructions: [...priorInstructions, instruction, ...postInstructions],
            signers: [...signers, ...newMintSigners],
            feePayer: payer,
          },
        ],
      };
    }
  }
}

export class CupcakeProgram {
  id: PublicKey;
  program: Program;
  candyProgram?: Program;
  instruction: CupcakeInstruction;

  constructor(args: { id: PublicKey; program: Program }) {
    this.id = args.id;
    this.program = args.program;

    this.instruction = new CupcakeInstruction({
      id: this.id,
      program: this.program,
    });
  }

  async getCandyProgram() {
    if (this.candyProgram) return this.candyProgram;

    const idl = await Program.fetchIdl(CANDY_MACHINE_ADDRESS, this.program.provider);
    const program = new Program(idl, CANDY_MACHINE_ADDRESS, this.program.provider);
    this.candyProgram = program;
    return program;
  }

  async initialize(
    args = {},
    accounts: InitializeAccounts
  ): Promise<{
    transactions: { instructions: TransactionInstruction[]; signers: Keypair[] }[];
    rpc: () => Promise<{ number: number; txs: { txid: string; slot: number }[] }>;
  }> {
    const { transactions } = await this.instruction.initialize(args, accounts);
    return {
      transactions,
      rpc: async () =>
        await sendTransactions(
          (this.program.provider as Provider).connection,
          (this.program.provider as Provider).wallet,
          transactions.map((t) => t.instructions),
          transactions.map((t) => t.signers)
        ),
    };
  }

  async addOrRefillTag(
    args: AddOrRefillTagParams,
    accounts: AddOrRefillTagAccounts
  ): Promise<{
    transactions: { instructions: TransactionInstruction[]; signers: Keypair[] }[];

    rpc: () => Promise<{ number: number; txs: { txid: string; slot: number }[] }>;
  }> {
    if (
      (accounts.whitelistMint == undefined ||
        accounts.paymentTokenMint == undefined ||
        args.pricePerMint == undefined) &&
      accounts.candyMachine
    ) {
      const candyProgram = await this.getCandyProgram();

      const cm = await candyProgram.account.candyMachine.fetch(accounts.candyMachine);

      //@ts-ignore
      if (cm.data.whitelistMintSettings) {
        //@ts-ignore
        accounts.whitelistMint = cm.data.whitelistMintSettings.mint;
        //@ts-ignore
        if (cm.data.whitelistMintSettings.mode.burnEveryTime) {
          args.whitelistBurn = true;
        }
      }

      //@ts-ignore
      if (cm.tokenMint && !cm.tokenMint.equals(WRAPPED_SOL_MINT)) {
        //@ts-ignore
        accounts.paymentTokenMint = cm.tokenMint;
      }

      //@ts-ignore
      args.pricePerMint = cm.data.price;
    } else if (!accounts.candyMachine) {
      const mintInfo = await getMint(this.program.provider.connection, new PublicKey(accounts.tokenMint));

      const mantissa = 10 ** mintInfo.decimals;

      args.perUser = new BN(args.perUser.toNumber() * mantissa);
      args.numClaims = new BN(args.numClaims.toNumber() * mantissa);
    }

    const { transactions } = await this.instruction.addOrRefillTag(args, accounts);

    return {
      transactions,
      rpc: async () =>
        await sendTransactions(
          (this.program.provider as Provider).connection,
          (this.program.provider as Provider).wallet,
          transactions.map((t) => t.instructions),
          transactions.map((t) => t.signers)
        ),
    };
  }

  async claimTag(
    args: ClaimTagParams,
    accounts: ClaimTagAccounts
  ): Promise<{
    transactions: { instructions: TransactionInstruction[]; signers: Keypair[]; feePayer: PublicKey }[];
    rpc: () => Promise<{ number: number; txs: { txid: string; slot: number }[] }>;
  }> {
    const tag = (await this.program.account.tag.fetch(accounts.tag)) as Tag;

    let createAta = false;
    let nextEdition = undefined;

    args.creatorBump = 0;
    args.minterPays = tag.minterPays;
    const candyProgram = await this.getCandyProgram();
    const user =
      accounts.user || accounts.userKeypair?.publicKey || (this.program.provider as Provider).wallet.publicKey;

    if (tag.tagType.walletRestrictedFungible || tag.tagType.refillable1Of1 || tag.tagType.singleUse1Of1) {
      const userAta = await getAssociatedTokenAddress(tag.tokenMint, user);
      const exists = await this.program.provider.connection.getAccountInfo(userAta);
      if (!exists) createAta = true;
    } else if (tag.tagType.limitedOrOpenEdition) {
      const masterEdition = await this.program.provider.connection.getAccountInfo(
        await getMasterEdition(tag.tokenMint)
      );

      const metadata = await this.program.provider.connection.getAccountInfo(await getMetadata(tag.tokenMint));

      const meObj = MasterEditionV2.fromAccountInfo(masterEdition)[0];
      const mdObj = Metadata.fromAccountInfo(metadata)[0];
      nextEdition = (new BN(meObj.supply)).toNumber() + 1;
      accounts.updateAuthority = mdObj.updateAuthority;
    } else if (tag.tagType.candyMachineDrop) {
      const candyMachine = await candyProgram.account.candyMachine.fetch(tag.candyMachine);

      accounts.candyMachineWallet = candyMachine.wallet;
      accounts.candyMachine = tag.candyMachine;

      accounts.candyMachineAuthority = candyMachine.authority;

      args.creatorBump = (await getCandyMachineCreator(tag.candyMachine))[1];
      const collectionPDA = (await getCollectionPDA(tag.candyMachine))[0];
      const collectionPDAAccount = await this.program.provider.connection.getAccountInfo(collectionPDA);

      if (collectionPDAAccount && candyMachine.data.retainAuthority) {
        const collectionPdaData = (await candyProgram.coder.accounts.decodeUnchecked(
          'CollectionPDA',
          collectionPDAAccount.data
        )) as {
          mint: PublicKey;
        };
        const collectionMint = collectionPdaData.mint;
        const collectionAuthorityRecord = (await getCollectionAuthorityRecordPDA(collectionMint, collectionPDA))[0];

        if (collectionMint) {
          const collectionMetadata = await getMetadata(collectionMint);
          const collectionMasterEdition = await getMasterEdition(collectionMint);
          log.debug('Collection PDA: ', collectionPDA.toBase58());
          log.debug('Authority: ', candyMachine.authority.toBase58());

          accounts.collectionMint = collectionMint;
          accounts.collectionMetadata = collectionMetadata;
          accounts.collectionMasterEdition = collectionMasterEdition;
          accounts.collectionAuthorityRecord = collectionAuthorityRecord;
        }
      }
    } else if (tag.tagType.hotPotato) {
      args.creatorBump = (await getUserHotPotatoToken(this.program, tag.uid, tag.tagAuthority, user, tag.tokenMint))[1];
    }

    const addArgs: ClaimTagAdditionalArgs = {
      tag,
      config: (await this.program.account.config.fetch(tag.config)) as Config,
      createAta,
      nextEdition,
      candyProgram,
    };

    const { transactions } = await this.instruction.claimTag(args, accounts, addArgs);

    return {
      transactions,
      rpc: async () =>
        await sendTransactions(
          (this.program.provider as Provider).connection,
          (this.program.provider as Provider).wallet,
          transactions.map((t) => t.instructions),
          transactions.map((t) => t.signers),
          SequenceType.StopOnFailure,
          transactions.length > 1 ? 'finalized' : 'single',
          transactions[0].feePayer
        ),
    };
  }
}

export async function getCupcakeProgram(
  anchorWallet: NodeWallet | Keypair,
  env: string,
  customRpcUrl: string
): Promise<CupcakeProgram> {
  if (customRpcUrl) log.debug('USING CUSTOM URL', customRpcUrl);

  const solConnection = new Connection(customRpcUrl || getCluster(env));

  if (anchorWallet instanceof Keypair) anchorWallet = new NodeWallet(anchorWallet);

  const provider = new Provider(solConnection, anchorWallet, {
    preflightCommitment: 'recent',
  });

  const idl = await Program.fetchIdl(CUPCAKE_PROGRAM_ID, provider);

  const program = new Program(idl, CUPCAKE_PROGRAM_ID, provider);

  return new CupcakeProgram({
    id: CUPCAKE_PROGRAM_ID,
    program,
  });
}
