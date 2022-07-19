#!/usr/bin/env ts-node

import { program } from 'commander';
import * as fs from 'fs';

import { getCupcakeProgram, getTag } from './helpers/cupcake_program';
import { readJSON } from './helpers/misc';
import { decryptData } from './helpers/kms';
import { keypairFromSecretJson } from './helpers/solana';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';
import log from 'loglevel';

require('dotenv/config');

program.version('0.0.1');

programCommand('init', { requireWallet: true }).action(async (_: any, cmd: any) => {
  const { rpcUrl, keypair, env } = cmd.opts();
  const deployerKeypair = keypairFromSecretJson(keypair);
  const anchorProgram = await getCupcakeProgram(deployerKeypair, env, rpcUrl);

  (
    await anchorProgram.initialize(
      {},
      {
        authorityKeypair: deployerKeypair,
      }
    )
  ).rpc();
});

programCommand('show_tag', { requireWallet: true })
  .option('-cp, --config-path <string>', 'JSON file with tag settings')
  .option('-t, --tag <string>', 'Specific tag key if you want to use this instead')
  .option('-a, --authority <string>', 'Specific authority key if you want to use this instead')

  .action(async (_: any, cmd: any) => {
    const { keypair, env, configPath, rpcUrl, tag, authority } = cmd.opts();
    const deployerKeypair = keypairFromSecretJson(keypair);

    const anchorProgram = await getCupcakeProgram(deployerKeypair, env, rpcUrl);

    const actualAuth = authority ? new PublicKey(authority) : deployerKeypair.publicKey;
    let tagKey;
    if (configPath === undefined) {
      tagKey = new PublicKey(tag);
    } else {
      const configString = fs.readFileSync(configPath);

      //@ts-ignore
      const config = JSON.parse(configString);
      const uid = config.hex ? new BN(config.uid, 'hex') : new BN(config.uid);

      tagKey = (await getTag(anchorProgram.program, uid, actualAuth))[0];
    }

    const tagObj = await anchorProgram.program.account.tag.fetch(tagKey);

    console.log('Tag Object ', tagObj.uid);
    console.log('Tag Type', tagObj.tagType);
    console.log('Tag Authority', tagObj.tagAuthority.toBase58());
    console.log('Config Authority', actualAuth.toBase58());
    console.log('Total Supply', tagObj.totalSupply.toNumber());
    console.log('Number Claimed', tagObj.numClaimed.toNumber());
    console.log('Minter Pays?', tagObj.minterPays);
    console.log('Claim Per User', tagObj.perUser.toNumber());
    if (tagObj.tagType.candyMachineDrop) {
      console.log(
        'Candy Machine Payment Token',
        tagObj.tokenMint.equals(SystemProgram.programId) ? 'SOL' : tagObj.tokenMint.toBase58()
      );
      console.log('Candy Machine', tagObj.candyMachine.toBase58());
      console.log(
        'Whitelist Mint',
        tagObj.whitelistMint.equals(SystemProgram.programId) ? 'N/A' : tagObj.whitelistMint.toBase58()
      );
      console.log('Whitelist Token Burns Each Time?', tagObj.whitelistBurn);
      console.log(
        'Please note these are cached values from the candy machine, set at the time of tag update or addition. If you change the CM values, please re-update the tag cached values.'
      );
    } else {
      console.log('Token Mint', tagObj.tokenMint.toBase58());
    }
  });

programCommand('add_or_refill_tag', { requireWallet: true })
  .requiredOption('-cp, --config-path <string>', 'JSON file with tag settings')
  .option('-ta, --tag-authority <string>', 'Specific keypair for tag')

  .action(async (_: any, cmd: any) => {
    const { keypair, env, configPath, rpcUrl, tagAuthority } = cmd.opts();
    const deployerKeypair = keypairFromSecretJson(keypair);
    const tagKeypair = tagAuthority ? keypairFromSecretJson(tagAuthority) : deployerKeypair;

    const anchorProgram = await getCupcakeProgram(deployerKeypair, env, rpcUrl);

    if (configPath === undefined) {
      throw new Error('The configPath is undefined');
    }
    const configString = fs.readFileSync(configPath);
    //@ts-ignore
    const config = JSON.parse(configString);

    const tokenMint = config.candyMachine ? config.candyMachine.paymentMint : config.tokenMint;

    const uid = config.hex ? new BN(config.uid, 'hex') : new BN(config.uid);

    (
      await anchorProgram.addOrRefillTag(
        {
          uid,
          tagType: config.tagType,
          numClaims: new BN(config.numClaims),
          perUser: new BN(config.perUser),
          minterPays: !!config.minterPays,
          pricePerMint: config.candyMachine?.pricePerMint ? new BN(config.candyMachine?.pricePerMint) : null,
          whitelistBurn: !!config.candyMachine?.whitelistBurn,
        },
        {
          authorityKeypair: deployerKeypair,
          tagAuthorityKeypair: tagKeypair,
          tokenMint: tokenMint ? new PublicKey(tokenMint) : null,
          candyMachine: config.candyMachine ? new PublicKey(config.candyMachine.id) : null,
        }
      )
    ).rpc();
  });

programCommand('claim_tag', { requireWallet: true })
  .requiredOption('-cp, --config-path <string>', 'JSON file with tag settings')
  .requiredOption('-u, --user <string>', 'JSON keypair for user claiming')

  .action(async (_: any, cmd: any) => {
    const { keypair, env, configPath, rpcUrl, user } = cmd.opts();
    const deployerKeypair = keypairFromSecretJson(keypair);
    const userKeypair = keypairFromSecretJson(user);

    const anchorProgram = await getCupcakeProgram(deployerKeypair, env, rpcUrl);

    if (configPath === undefined) {
      throw new Error('The configPath is undefined');
    }
    const configString = fs.readFileSync(configPath);
    //@ts-ignore
    const config = JSON.parse(configString);

    const authority = config.configAuthority ? new PublicKey(config.configAuthority) : deployerKeypair.publicKey;
    const tagAuthority = config.tagAuthority ? new PublicKey(config.tagAuthority) : deployerKeypair.publicKey;
    const uid = config.hex ? new BN(config.uid, 'hex') : new BN(config.uid);

    (
      await anchorProgram.claimTag(
        {},
        {
          tagAuthorityKeypair: deployerKeypair.publicKey.equals(tagAuthority) ? deployerKeypair : null,
          tagAuthority,
          userKeypair: userKeypair,
          tag: (await getTag(anchorProgram.program, uid, authority))[0],
          newTokenMint: config.newTokenMint ? new PublicKey(config.newTokenMint) : null,
          candyMachine: config.candyMachine ? new PublicKey(config.candyMachine.id) : null,
        }
      )
    ).rpc();
  });

programCommand('decrypt_tag', { requireWallet: false })
  .option('-id, --tagId <number>', 'tag id')
  .action(async (_: any, cmd: any) => {
    const { tagId } = cmd.opts();
    const cache = readJSON('.cache/cache.json');
    const plaintext = (
      await decryptData({
        KeyId: 'arn:aws:kms:' + process.env.AWS_REGION + ':' + process.env.AWS_ACCOUNT_ID + ':alias/panda-nfc/' + tagId,
        CiphertextBlob: Uint8Array.from(cache[tagId]['data']),
      })
    ).Plaintext.toString();
    const tagSecret = JSON.parse(plaintext);
    console.log('Tag authority secret decrypted:', tagSecret);
  });

function programCommand(name: string, options: { requireWallet: boolean } = { requireWallet: true }) {
  let cliProgram = program
    .command(name)
    .option('-e, --env <string>', 'Solana cluster env name', 'devnet')
    .option('-r, --rpc-url <string>', 'Custom Solana RPC url')
    .option('-l, --log-level <string>', 'log level', setLogLevel);

  if (options.requireWallet) {
    cliProgram = cliProgram.requiredOption(
      '-k, --keypair <path>',
      `Solana wallet location`,
      process.env['AUTHORITY_SOLANA_KEYPAIR']
    );
  }
  return cliProgram;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setLogLevel(value, prev) {
  if (value === undefined || value === null) {
    return;
  }
  log.info('setting the log value to: ' + value);
  log.setLevel(value);
}
program.parse(process.argv);
