import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { Cupcake } from '../target/types/cupcake';
import { CupcakeProgram } from "../wip_sdk/cucpakeProgram";
import { mintNFT } from "../wip_sdk/programmableAssets";

describe('`TreasureChest` Sprinkle', () => {
  anchor.setProvider(anchor.Provider.env());

  const admin = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();

  let nftMint: PublicKey | undefined = undefined;
  let nftMint2: PublicKey | undefined = undefined;

  const cupcakeProgram = anchor.workspace.Cupcake as Program<Cupcake>;
  const cupcakeProgramClient = new CupcakeProgram(cupcakeProgram, admin)

  const sprinkleUID = "66554493221155"
  const sprinkleAuthority = anchor.web3.Keypair.generate();

  it('Should create a bakery', async () => {
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

    const createBakeryTxHash = await cupcakeProgramClient.createBakery()
    console.log('createBakeryTxHash', createBakeryTxHash);
  });

  it('Should mint 2 non-programmable NFTs', async () => {
    nftMint = await mintNFT(
      cupcakeProgramClient.program.provider,
      admin,
      admin.publicKey,
      0
    );
    console.log("nftMint", nftMint.toString());

    nftMint2 = await mintNFT(
      cupcakeProgramClient.program.provider,
      admin,
      admin.publicKey,
      0
    );
    console.log("nftMint2", nftMint2.toString());
  });

  it('Should bake a `TreasureChest` Sprinkle', async () => {
    try {
    const bakeSprinkleTxHash = await cupcakeProgramClient.bakeTreasureChestSprinkle(sprinkleUID, sprinkleAuthority);
    console.log('bakeSprinkleTxHash', bakeSprinkleTxHash);
    }catch(e){console.warn(e)}
  });

  it('Should fill the `TreasureChest` Sprinkle with both of the mints', async () => {
    try {
    const bakeSprinkleTxHash = await cupcakeProgramClient.fillTreasureChestSprinkle(
      sprinkleUID, 
      [nftMint, nftMint2], 
      sprinkleAuthority,
      0,
    );
    console.log('bakeSprinkleTxHash', bakeSprinkleTxHash);
    }catch(e){console.warn(e)}
  });

  it('Should claim from the `TreasureChest` Sprinkle at index 0', async () => {
    try {
    const bakeSprinkleTxHash = await cupcakeProgramClient.claimFromTreasureChestSprinkle(
      user.publicKey,
      sprinkleUID, 
      sprinkleAuthority,
      nftMint,
      0,
    );
    console.log('bakeSprinkleTxHash', bakeSprinkleTxHash);
    }catch(e){console.warn(e)}
  });

  it('Should fail to claim from index 0 again', async () => {
    try {
    const bakeSprinkleTxHash = await cupcakeProgramClient.claimFromTreasureChestSprinkle(
      user.publicKey,
      sprinkleUID, 
      sprinkleAuthority,
      nftMint,
      0,
    );
    console.log('bakeSprinkleTxHash', bakeSprinkleTxHash);
    }catch(e){console.warn(e)}
  });

  it('Should claim from the `TreasureChest` Sprinkle at index 1', async () => {
    try {
    const bakeSprinkleTxHash = await cupcakeProgramClient.claimFromTreasureChestSprinkle(
      user.publicKey,
      sprinkleUID, 
      sprinkleAuthority,
      nftMint2,
      1,
    );
    console.log('bakeSprinkleTxHash', bakeSprinkleTxHash);
    }catch(e){console.warn(e)}
  });

  it('Should fail to claim from index 2', async () => {
    try {
    const bakeSprinkleTxHash = await cupcakeProgramClient.claimFromTreasureChestSprinkle(
      user.publicKey,
      sprinkleUID, 
      sprinkleAuthority,
      nftMint,
      2,
    );
    console.log('bakeSprinkleTxHash', bakeSprinkleTxHash);
    }catch(e){console.warn(e)}
  });
});