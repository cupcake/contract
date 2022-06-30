import { Wallet } from '@project-serum/anchor/dist/cjs/provider';
import {
  Blockhash,
  Commitment,
  Connection,
  FeeCalculator,
  Keypair,
  PublicKey,
  RpcResponseAndContext,
  SignatureStatus,
  SimulatedTransactionResponse,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
} from '@solana/web3.js';
import log from 'loglevel';

export const DEFAULT_TIMEOUT = 15000;

export const getUnixTs = () => {
  return new Date().getTime() / 1000;
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface BlockhashAndFeeCalculator {
  blockhash: Blockhash;
  feeCalculator: FeeCalculator;
}

export const sendTransactionWithRetryWithKeypair = async (
  connection: Connection,
  wallet: Keypair,
  instructions: TransactionInstruction[],
  signers: Keypair[],
  commitment: Commitment = 'singleGossip',
  includesFeePayer: boolean = false,
  block?: BlockhashAndFeeCalculator,
  beforeSend?: () => void
) => {
  const transaction = new Transaction();
  instructions.forEach((instruction) => transaction.add(instruction));
  transaction.recentBlockhash = (block || (await connection.getRecentBlockhash(commitment))).blockhash;

  if (includesFeePayer) {
    transaction.setSigners(...signers.map((s) => s.publicKey));
  } else {
    transaction.setSigners(
      // fee payed by the wallet owner
      wallet.publicKey,
      ...signers.map((s) => s.publicKey)
    );
  }

  if (signers.length > 0) {
    transaction.sign(...[wallet, ...signers]);
  } else {
    transaction.sign(wallet);
  }

  if (beforeSend) {
    beforeSend();
  }

  const { txid, slot } = await sendSignedTransaction({
    connection,
    signedTransaction: transaction,
  });

  return { txid, slot };
};

export async function sendTransactionWithRetry(
  connection: Connection,
  wallet: Wallet,
  instructions: Array<TransactionInstruction>,
  signers: Array<Keypair>,
  commitment: Commitment = 'singleGossip'
): Promise<string | { txid: string; slot: number }> {
  const transaction = new Transaction();
  instructions.forEach((instruction) => transaction.add(instruction));
  // @ts-ignore
  const recentBlockhash = await connection._recentBlockhash(
    // @ts-ignore
    provider.connection._disableBlockhashCaching
  )

  transaction.recentBlockhash = recentBlockhash;

  transaction.feePayer = wallet.publicKey;

  if (signers.length > 0) {
    transaction.partialSign(...signers);
  }

  wallet.signTransaction(transaction);

  return sendSignedTransaction({
    connection,
    signedTransaction: transaction,
  });
}

export async function sendSignedTransaction({
  signedTransaction,
  connection,
  timeout = DEFAULT_TIMEOUT,
}: {
  signedTransaction: Transaction;
  connection: Connection;
  sendingMessage?: string;
  sentMessage?: string;
  successMessage?: string;
  timeout?: number;
}): Promise<{ txid: string; slot: number }> {
  const rawTransaction = signedTransaction.serialize();
  const startTime = getUnixTs();
  let slot = 0;
  const txid: TransactionSignature = await connection.sendRawTransaction(rawTransaction, {
    skipPreflight: true,
  });

  log.debug('Started awaiting confirmation for', txid);

  let done = false;
  (async () => {
    while (!done && getUnixTs() - startTime < timeout) {
      connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
      });
      await sleep(500);
    }
  })();
  try {
    const confirmation = await awaitTransactionSignatureConfirmation(txid, timeout, connection, 'confirmed', true);

    if (!confirmation) throw new Error('Timed out awaiting confirmation on transaction');

    if (confirmation.err) {
      log.error(confirmation.err);
      throw new Error('Transaction failed: Custom instruction error');
    }

    slot = confirmation?.slot || 0;
  } catch (err) {
    log.error('Timeout Error caught', err);
    if (err.timeout) {
      throw new Error('Timed out awaiting confirmation on transaction');
    }
    let simulateResult: SimulatedTransactionResponse | null = null;
    try {
      simulateResult = (await simulateTransaction(connection, signedTransaction, 'single')).value;
    } catch (e) {
      log.error('Simulate Transaction error', e);
    }
    if (simulateResult && simulateResult.err) {
      if (simulateResult.logs) {
        for (let i = simulateResult.logs.length - 1; i >= 0; --i) {
          const line = simulateResult.logs[i];
          if (line.startsWith('Program log: ')) {
            throw new Error('Transaction failed: ' + line.slice('Program log: '.length));
          }
        }
      }
      throw new Error(JSON.stringify(simulateResult.err));
    }
    log.error('Got this far.');
    // throw new Error('Transaction failed');
  } finally {
    done = true;
  }

  log.debug('Latency (ms)', txid, getUnixTs() - startTime);
  return { txid, slot };
}

async function simulateTransaction(
  connection: Connection,
  transaction: Transaction,
  commitment: Commitment
): Promise<RpcResponseAndContext<SimulatedTransactionResponse>> {
  // @ts-ignore
  const recentBlockhash = await connection._recentBlockhash(
    // @ts-ignore
    provider.connection._disableBlockhashCaching
  )
  transaction.recentBlockhash = recentBlockhash;

  const signData = transaction.serializeMessage();
  // @ts-ignore
  const wireTransaction = transaction._serialize(signData);
  const encodedTransaction = wireTransaction.toString('base64');
  const config: any = { encoding: 'base64', commitment };
  const args = [encodedTransaction, config];

  // @ts-ignore
  const res = await connection._rpcRequest('simulateTransaction', args);
  if (res.error) {
    throw new Error('failed to simulate transaction: ' + res.error.message);
  }
  return res.result;
}

async function awaitTransactionSignatureConfirmation(
  txid: TransactionSignature,
  timeout: number,
  connection: Connection,
  commitment: Commitment = 'recent',
  queryStatus = false
): Promise<SignatureStatus | null | void> {
  let done = false;
  let status: SignatureStatus | null | void = {
    slot: 0,
    confirmations: 0,
    err: null,
  };
  let subId = 0;
  // eslint-disable-next-line no-async-promise-executor
  status = await new Promise(async (resolve, reject) => {
    setTimeout(() => {
      if (done) {
        return;
      }
      done = true;
      log.warn('Rejecting for timeout...');
      reject({ timeout: true });
    }, timeout);
    try {
      subId = connection.onSignature(
        txid,
        (result, context) => {
          done = true;
          status = {
            err: result.err,
            slot: context.slot,
            confirmations: 0,
          };
          if (result.err) {
            log.warn('Rejected via websocket', result.err);
            reject(status);
          } else {
            log.debug('Resolved via websocket', result);
            resolve(status);
          }
        },
        commitment
      );
    } catch (e) {
      done = true;
      log.error('WS error in setup', txid, e);
    }
    while (!done && queryStatus) {
      // eslint-disable-next-line no-loop-func
      (async () => {
        try {
          const signatureStatuses = await connection.getSignatureStatuses([txid]);
          status = signatureStatuses && signatureStatuses.value[0];
          if (!done) {
            if (!status) {
              log.debug('REST null result for', txid, status);
            } else if (status.err) {
              log.error('REST error for', txid, status);
              done = true;
              reject(status.err);
            } else if (!status.confirmations) {
              log.debug('REST no confirmations for', txid, status);
            } else {
              log.debug('REST confirmation for', txid, status);
              done = true;
              resolve(status);
            }
          }
        } catch (e) {
          if (!done) {
            log.error('REST connection error: txid', txid, e);
          }
        }
      })();
      await sleep(2000);
    }
  });

  //@ts-ignore
  if (connection._subscriptionsByHash[subId]) connection.removeSignatureListener(subId);
  done = true;
  log.debug('Returning status', status);
  return status;
}

export enum SequenceType {
  Sequential,
  Parallel,
  StopOnFailure,
}

export const sendTransactions = async (
  connection: Connection,
  wallet: any,
  instructionSet: TransactionInstruction[][],
  signersSet: Keypair[][],
  sequenceType: SequenceType = SequenceType.Parallel,
  commitment: Commitment = 'singleGossip',
  feePayer: PublicKey = wallet.publicKey,
  successCallback: (txid: string, ind: number) => void = (txid, ind) => {},
  failCallback: (reason: string, ind: number) => boolean = (txid, ind) => false,
  block?: BlockhashAndFeeCalculator,
  beforeTransactions: Transaction[] = [],
  afterTransactions: Transaction[] = []
): Promise<{ number: number; txs: { txid: string; slot: number }[] }> => {
  if (!wallet.publicKey) throw new Error('Wallet not connected');

  const unsignedTxns: Transaction[] = beforeTransactions;

  if (!block) {
    block = await connection.getRecentBlockhash(commitment);
  }

  for (let i = 0; i < instructionSet.length; i++) {
    const instructions = instructionSet[i];
    const signers = signersSet[i];

    if (instructions.length === 0) {
      continue;
    }

    let transaction = new Transaction();
    instructions.forEach((instruction) => transaction.add(instruction));
    const walletUsed = !!instructions.find((i) => i.keys.find((k) => k.isSigner && k.pubkey.equals(wallet.publicKey)));
    transaction.recentBlockhash = block.blockhash;
    transaction.setSigners(
      // fee payed by the wallet owner
      ...(walletUsed ? [wallet.publicKey] : []),
      ...signers.map((s) => s.publicKey)
    );
    transaction.feePayer = feePayer;

    if (signers.length > 0) {
      transaction.partialSign(...signers);
    }

    unsignedTxns.push(transaction);
  }
  unsignedTxns.push(...afterTransactions);

  const partiallySignedTransactions = unsignedTxns.filter((t) =>
    t.signatures.find((sig) => sig.publicKey.equals(wallet.publicKey))
  );
  const fullySignedTransactions = unsignedTxns.filter(
    (t) => !t.signatures.find((sig) => sig.publicKey.equals(wallet.publicKey))
  );
  let signedTxns = await wallet.signAllTransactions(partiallySignedTransactions);
  signedTxns = fullySignedTransactions.concat(signedTxns);
  return await sendPreppedTransactions(connection, signedTxns, sequenceType, successCallback, failCallback);
};

export const sendPreppedTransactions = async (
  connection: Connection,
  signedTxns: Transaction[],
  sequenceType: SequenceType = SequenceType.Parallel,
  successCallback: (txid: string, ind: number) => void = (txid, ind) => {},
  failCallback: (reason: string, ind: number) => boolean = (txid, ind) => false
): Promise<{ number: number; txs: { txid: string; slot: number }[] }> => {
  const pendingTxns: Promise<{ txid: string; slot: number }>[] = [];

  for (let i = 0; i < signedTxns.length; i++) {
    const signedTxnPromise = sendSignedTransaction({
      connection,
      signedTransaction: signedTxns[i],
    });

    if (sequenceType !== SequenceType.Parallel) {
      try {
        await signedTxnPromise.then(({ txid, slot }) => successCallback(txid, i));
        pendingTxns.push(signedTxnPromise);
      } catch (e) {
        console.log('Failed at txn index:', i);
        console.log('Caught failure:', e);

        failCallback(e, i);
        if (sequenceType === SequenceType.StopOnFailure) {
          return {
            number: i,
            txs: await Promise.all(pendingTxns),
          };
        }
      }
    } else {
      pendingTxns.push(signedTxnPromise);
    }
  }

  if (sequenceType !== SequenceType.Parallel) {
    const result = await Promise.all(pendingTxns);
    return { number: signedTxns.length, txs: result };
  }

  return { number: signedTxns.length, txs: await Promise.all(pendingTxns) };
};
