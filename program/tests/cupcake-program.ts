import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Cupcake } from '../target/types/cupcake';
import { CupcakeProgram } from "../sdk/cucpakeProgram";
import { createProgrammableNFT, createRuleSetAccount, mintNFT } from "../sdk/programmableAssets";
import { Bakery } from '../sdk/state/bakery';

describe('cupcake', () => {
  anchor.setProvider(anchor.Provider.env());

  const admin = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();

  const cupcakeProgram = anchor.workspace.Cupcake as Program<Cupcake>;
  const cupcakeProgramClient = new CupcakeProgram(cupcakeProgram, admin)

  const bakeryPDA = Bakery.PDA(admin.publicKey, cupcakeProgram.programId);

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

  it('Tests for a normal NFT', async () => {
    try {
    const sprinkleUID = "66554433221155"
    const sprinkleAuthority = anchor.web3.Keypair.generate();

    const nftMint = await mintNFT(
      cupcakeProgramClient.program.provider,
      admin,
      admin.publicKey,
      0
    );
    console.log("nftMint", nftMint.toString());

    const createBakeryTxHash = await cupcakeProgramClient.createBakery()
    console.log('createBakeryTxHash', createBakeryTxHash);

    const bakeSprinkleTxHash = await cupcakeProgramClient.bakeSprinkle(
      "refillable1Of1",
      sprinkleUID, 
      nftMint, 
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
    }catch(e){console.warn(e)}
});

it('Tests for pNFTs with no ruleset', async () => {
  const sprinkleUID = "66557433221590"
  const sprinkleAuthority = anchor.web3.Keypair.generate();

  const programmableNFTMint = await createProgrammableNFT(
    cupcakeProgramClient.program.provider,
    admin,
    admin.publicKey,
    0,
    null,
    null
  );
  console.log("programmableNFTMint", programmableNFTMint.toString());

  try {
  const bakeSprinkleTxHash = await cupcakeProgramClient.bakeSprinkle(
    "programmableUnique",
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
}catch(e){console.warn(e)}

});

it('Tests for pNFTs with Pass rules', async () => {
  const sprinkleUID = "66557433221100"
  const sprinkleAuthority = anchor.web3.Keypair.generate();

  const createRuleSetAccountTxHash = await createRuleSetAccount(
    "cupcake-ruleset", 
    admin, 
    {
      "Delegate:Transfer": "Pass",
      "Transfer:TransferDelegate": "Pass"
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

  try{
  const bakeSprinkleTxHash = await cupcakeProgramClient.bakeSprinkle(
    "programmableUnique",
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
}catch(e){console.warn(e)}

});

it('Tests for pNFTs with Amount rules', async () => {
  const sprinkleUID = "66556455251101"
  const sprinkleAuthority = anchor.web3.Keypair.generate();

  const createRuleSetAccountTxHash = await createRuleSetAccount(
    "cupcake-ruleset", 
    admin, 
    {
      "Delegate:Transfer": {
        "Amount": [
          69,
          "Lt",
          "Amount"
        ]
      },
      "Transfer:TransferDelegate": {
        "Amount": [
          69,
          "Lt",
          "Amount"
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

  try{
  const bakeSprinkleTxHash = await cupcakeProgramClient.bakeSprinkle(
    "programmableUnique",
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
  }catch(e){console.warn(e)}
});

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
            "Delegate"
          ]
        },
        "Transfer:TransferDelegate": {
          "PubkeyMatch": [
            Array.from(user.publicKey.toBytes()),
            "Destination"
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

    try{
    const bakeSprinkleTxHash = await cupcakeProgramClient.bakeSprinkle(
      "programmableUnique",
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
              "Delegate"
            ]
          },
          "Transfer:TransferDelegate": {
            "PubkeyListMatch": [
              [Array.from(user.publicKey.toBytes())],
              "Destination"
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
        "programmableUnique",
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

  it('Tests for pNFTs with ProgramOwned rules', async () => {
    const sprinkleUID = "66552255221441"
    const sprinkleAuthority = anchor.web3.Keypair.generate();

    const createRuleSetAccountTxHash = await createRuleSetAccount(
      "cupcake-ruleset", 
      admin, 
      {
        "Delegate:Transfer": {
          "ProgramOwned": [
            Array.from(cupcakeProgram.programId.toBytes()),
            "Delegate"
          ]
        },
        "Transfer:TransferDelegate": "Pass"
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
      "programmableUnique",
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

  it('Tests for pNFTs with ProgramOwnedList rules', async () => {
    const sprinkleUID = "66554455221101"
    const sprinkleAuthority = anchor.web3.Keypair.generate();

    const createRuleSetAccountTxHash = await createRuleSetAccount(
      "cupcake-ruleset", 
      admin, 
      {
        "Delegate:Transfer": {
          "ProgramOwnedList": [
            [Array.from(cupcakeProgram.programId.toBytes())],
            "Delegate"
          ]
        },
        "Transfer:TransferDelegate": "Pass"
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
      "programmableUnique",
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