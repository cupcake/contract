import { MasterEditionV2, Metadata } from '@metaplex-foundation/mpl-token-metadata';
import { Provider, BN, BorshAccountsCoder, Program, Wallet } from '@project-serum/anchor';
import NodeWallet from '@project-serum/anchor/dist/cjs/nodewallet';
import { getAssociatedTokenAddress, getMint } from '@solana/spl-token';
import { Connection, Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { CANDY_MACHINE_ADDRESS, getCandyMachineCreator, getCollectionAuthorityRecordPDA, getCollectionPDA, getMasterEdition, getMetadata } from './utils/mpl';
import { getCluster, WRAPPED_SOL_MINT } from './utils/solana';
import { sendTransactions, SequenceType, sendPreppedTransactions } from './utils/transaction';
import { CupcakeInstruction } from './instructions';
import { getUserHotPotatoToken } from './pda';

export const PREFIX = 'cupcake';

export const CUPCAKE_PROGRAM_ID = new PublicKey('cakeGJxEdGpZ3MJP8sM3QypwzuzZpko1ueonUQgKLPE');
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
  programmableUnique?: boolean;
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
  minterPays?: boolean;
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

  async claimTag(args: ClaimTagParams, accounts: ClaimTagAccounts): 
    Promise<{
      transactions: { instructions: TransactionInstruction[]; signers: Keypair[]; feePayer: PublicKey }[];
      rpc: () => Promise<{ number: number; txs: { txid: string; slot: number }[] }>;
    }> 
  {
    const tag = (await this.program.account.tag.fetch(accounts.tag)) as Tag;
    const config = (await this.program.account.config.fetch(tag.config)) as Config;

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
          console.log('Collection PDA: ', collectionPDA.toBase58());
          console.log('Authority: ', candyMachine.authority.toBase58());

          accounts.collectionMint = collectionMint;
          accounts.collectionMetadata = collectionMetadata;
          accounts.collectionMasterEdition = collectionMasterEdition;
          accounts.collectionAuthorityRecord = collectionAuthorityRecord;
        }
      }
    } else if (tag.tagType.hotPotato) {
      args.creatorBump = (await getUserHotPotatoToken(this.program, tag.uid, config.authority, user, tag.tokenMint))[1];
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
  if (customRpcUrl) console.log('USING CUSTOM URL', customRpcUrl);

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
