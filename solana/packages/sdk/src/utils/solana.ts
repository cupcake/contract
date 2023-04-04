import fs from 'fs';
import {
  Keypair,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram,
  BpfLoader,
  BPF_LOADER_PROGRAM_ID,
} from '@solana/web3.js';
import { Provider, Program } from '@project-serum/anchor';
import { readJSON } from './misc';
export const WRAPPED_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
export const keypairFromSecretJson = (file: string) => {
  return Keypair.fromSecretKey(Uint8Array.from(readJSON(file)));
};

export const constructAndSendTx = async (
  connection: Connection,
  instructions: TransactionInstruction[],
  signers: Keypair[]
) => {
  const tx = new Transaction();
  instructions.map((i) => tx.add(i));
  return await sendAndConfirmTransaction(connection, tx, signers);
};

export const sendSOL = async (connection: Connection, from: Keypair, to: PublicKey, lamports: number) => {
  return await constructAndSendTx(
    connection,
    [
      SystemProgram.transfer({
        fromPubkey: from.publicKey,
        toPubkey: to,
        lamports,
      }),
    ],
    [from]
  );
};

export const loadAnchorProgram = async (programId: PublicKey, idlFile?: string, provider?: Provider) => {
  let idl: any;
  if (!idlFile) {
    idl = await Program.fetchIdl(programId, provider);
  } else {
    idl = JSON.parse(await (await fetch(idlFile)).text());
  }
  return new Program(idl, programId, provider);
};

export const deployProgram = async (connection: Connection, keypair: Keypair, program: string, address?: string) => {
  const programId = address ? keypairFromSecretJson(address) : Keypair.generate();
  const successful = await BpfLoader.load(
    connection,
    keypair,
    programId,
    fs.readFileSync(program),
    BPF_LOADER_PROGRAM_ID
  );
  if (!successful) {
    throw 'Account already created.';
  }
  return programId;
};

import { clusterApiUrl } from '@solana/web3.js';

type Cluster = {
  name: string;
  url: string;
};
export const CLUSTERS: Cluster[] = [
  {
    name: 'mainnet-beta',
    url: 'https://api.metaplex.solana.com/',
  },
  {
    name: 'testnet',
    url: clusterApiUrl('testnet'),
  },
  {
    name: 'devnet',
    url: clusterApiUrl('devnet'),
  },
];
export const DEFAULT_CLUSTER = CLUSTERS[2];
export function getCluster(name: string): string {
  for (const cluster of CLUSTERS) {
    if (cluster.name === name) {
      return cluster.url;
    }
  }
  return DEFAULT_CLUSTER.url;
}
