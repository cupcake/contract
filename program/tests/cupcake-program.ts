import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Cupcake } from '../target/types/cupcake';
import { CupcakeProgram, getBakeryPDA } from "../sdk/cucpakeProgram";
import { createProgrammableNFT, createRuleSetAccount } from "../sdk/programmableAssets";

describe('cupcake', () => {
  anchor.setProvider(anchor.Provider.env());

  const admin = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();

  const cupcakeProgram = anchor.workspace.Cupcake as Program<Cupcake>;
  const cupcakeProgramClient = new CupcakeProgram(cupcakeProgram, admin)

  const bakeryPDA = getBakeryPDA(admin.publicKey, cupcakeProgram.programId);

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

  it('Tests for pNFTs with PubkeyMatch rules', async () => {
    const sprinkleUID = "66554433221100"
    const sprinkleAuthority = anchor.web3.Keypair.generate();

    const createRuleSetAccountTxHash = await createRuleSetAccount(
      "cupcake-ruleset", 
      admin, 
      {
        "Delegate:Transfer": {
          "PubkeyMatch": [
            Array.from(bakeryPDA.toBytes()),
            "Target"
          ]
        },
        "Transfer:TransferDelegate": {
          "PubkeyMatch": [
            Array.from(bakeryPDA.toBytes()),
            "Target"
          ]
        }
      },
      cupcakeProgramClient.program.provider
    )
    console.log("createRuleSetAccountTxHash", createRuleSetAccountTxHash)

    const programmableNFTMint = await createProgrammableNFT(
      cupcakeProgramClient.program.provider,
      admin,
      admin.publicKey,
      0,
      admin.publicKey,
      "cupcake-ruleset"
    );
    console.log("programmableNFTMint", programmableNFTMint.toString());

    const createBakeryTxHash = await cupcakeProgramClient.createBakery()
    console.log('createBakeryTxHash', createBakeryTxHash);

    const bakeSprinkleTxHash = await cupcakeProgramClient.bakeSprinkle(
      sprinkleUID, 
      programmableNFTMint, 
      1, 
      1, 
      sprinkleAuthority
    );
    console.log('bakeSprinkleTxHash', bakeSprinkleTxHash);

    try{
    const claimSprinkleTxHash = await cupcakeProgramClient.claimSprinkle(
      sprinkleUID, 
      user.publicKey,
      sprinkleAuthority
    );
    console.log('claimSprinkleTxHash', claimSprinkleTxHash);
    }catch(e){console.warn(e)}
});

  it('Tests for pNFTs with PubkeyListMatch rules', async () => {
      const sprinkleUID = "66554433221101"
      const sprinkleAuthority = anchor.web3.Keypair.generate();

      const createRuleSetAccountTxHash = await createRuleSetAccount(
        "cupcake-ruleset", 
        admin, 
        {
          "Delegate:Transfer": {
            "PubkeyListMatch": [
              [Array.from(bakeryPDA.toBytes())],
              "Target"
            ]
          },
          "Transfer:TransferDelegate": {
            "PubkeyListMatch": [
              [Array.from(bakeryPDA.toBytes())],
              "Target"
            ]
          }
        },
        cupcakeProgramClient.program.provider
      )
      console.log("createRuleSetAccountTxHash", createRuleSetAccountTxHash)

      const programmableNFTMint = await createProgrammableNFT(
        cupcakeProgramClient.program.provider,
        admin,
        admin.publicKey,
        0,
        admin.publicKey,
        "cupcake-ruleset"
      );
      console.log("programmableNFTMint", programmableNFTMint.toString());

      const bakeSprinkleTxHash = await cupcakeProgramClient.bakeSprinkle(
        sprinkleUID, 
        programmableNFTMint, 
        1, 
        1, 
        sprinkleAuthority
      );
      console.log('bakeSprinkleTxHash', bakeSprinkleTxHash);
  
      const claimSprinkleTxHash = await cupcakeProgramClient.claimSprinkle(
        sprinkleUID, 
        user.publicKey,
        sprinkleAuthority
      );
      console.log('claimSprinkleTxHash', claimSprinkleTxHash);
  });
});