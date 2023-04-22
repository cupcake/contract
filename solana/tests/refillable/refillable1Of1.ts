import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { Cupcake } from '../../target/types/cupcake';
import { CupcakeProgram } from '../../wip_sdk/cucpakeProgram';
import { createProgrammableNFT, createRuleSetAccount, mintNFT } from '../../wip_sdk/programmableAssets';
import { Bakery } from '../../wip_sdk/state/bakery';

describe('`Refillable1Of1` Sprinkle', async () => {
  const admin = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();

  let nftMint: PublicKey | undefined = undefined;
  let nftMint2: PublicKey | undefined = undefined;

  const cupcakeProgram = anchor.workspace.Cupcake as Program<Cupcake>;
  const cupcakeProgramClient = new CupcakeProgram(cupcakeProgram, admin);

  const bakeryPDA = await Bakery.PDA(admin.publicKey, cupcakeProgram.programId);

  const sprinkleUID = '66554433221155';
  const sprinkleAuthority = anchor.web3.Keypair.generate();

  it('Should create a bakery', async () => {
    let sig = await cupcakeProgram.provider.connection.requestAirdrop(admin.publicKey, LAMPORTS_PER_SOL * 10);
    console.log('Admin key', admin.publicKey.toBase58());
    await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');
    let sig2 = await cupcakeProgram.provider.connection.requestAirdrop(user.publicKey, LAMPORTS_PER_SOL * 10);
    await cupcakeProgram.provider.connection.confirmTransaction(sig2, 'singleGossip');

    const createBakeryTxHash = await cupcakeProgramClient.createBakery();
    console.log('createBakeryTxHash', createBakeryTxHash);
  });

  it('Should mint 2 non-programmable NFTs', async () => {
    nftMint = await mintNFT(cupcakeProgramClient.program.provider, admin, admin.publicKey, 0);
    console.log('nftMint', nftMint.toString());

    nftMint2 = await mintNFT(cupcakeProgramClient.program.provider, admin, admin.publicKey, 0);
    console.log('nftMint2', nftMint2.toString());
  });

  it('Should bake a `Refillable1Of1` Sprinkle with the first mint', async () => {
    try {
      const bakeSprinkleTxHash = await cupcakeProgramClient.bakeSprinkle(
        'refillable1Of1',
        sprinkleUID,
        nftMint,
        1,
        1,
        sprinkleAuthority
      );
      console.log('bakeSprinkleTxHash', bakeSprinkleTxHash);
    } catch (e) {
      console.warn(e);
    }
  });

  it('Should claim the `Refillable1Of1` Sprinkle', async () => {
    try {
      const claimSprinkleTxHash = await cupcakeProgramClient.claimSprinkle(
        sprinkleUID,
        user.publicKey,
        sprinkleAuthority
      );
      console.log('claimSprinkleTxHash', claimSprinkleTxHash);
    } catch (e) {
      console.warn(e);
    }
  });

  it('Should rebake the `Refillable1Of1` Sprinkle with the 2nd mint', async () => {
    try {
      const bakeSprinkleTxHash = await cupcakeProgramClient.bakeSprinkle(
        'refillable1Of1',
        sprinkleUID,
        nftMint2,
        1,
        2,
        sprinkleAuthority
      );
      console.log('bakeSprinkleTxHash', bakeSprinkleTxHash);
    } catch (e) {
      console.warn(e);
    }
  });

  it('Should claim the rebaked `Refillable1Of1` Sprinkle', async () => {
    try {
      const claimSprinkleTxHash = await cupcakeProgramClient.claimSprinkle(
        sprinkleUID,
        user.publicKey,
        sprinkleAuthority
      );
      console.log('claimSprinkleTxHash', claimSprinkleTxHash);
    } catch (e) {
      console.warn(e);
    }
  });
});
