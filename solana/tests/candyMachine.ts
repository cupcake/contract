import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { Cupcake } from '../target/types/cupcake';
import { CupcakeProgram } from "../wip_sdk/cucpakeProgram";
import { Bakery } from '../wip_sdk/state/bakery';

describe('`CandyMachineDrop` Sprinkle', () => {
  anchor.setProvider(anchor.Provider.env());

  const admin = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();

  let nftMint: PublicKey | undefined = undefined;
  let nftMint2: PublicKey | undefined = undefined;

  const cupcakeProgram = anchor.workspace.Cupcake as Program<Cupcake>;
  const cupcakeProgramClient = new CupcakeProgram(cupcakeProgram, admin)

  const bakeryPDA = Bakery.PDA(admin.publicKey, cupcakeProgram.programId);

  const sprinkleUID = "66554433221155"
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

  it('Should bake a `CandyMachine` Sprinkle with the first mint', async () => {
    try {
      const bakeSprinkleTxHash = await cupcakeProgramClient.bakeCandySprinkle(
        sprinkleUID, 
        new PublicKey("GVd3x2LvQHZGXRn5ZRyPcGXC7GXr6Er56sWgnnZ13dQm"), 
        71, 
        1, 
        sprinkleAuthority
      );
      console.log('bakeSprinkleTxHash', bakeSprinkleTxHash);
    } catch(e) {
      console.warn(e)
    }
  });

  it('Should claim the `CandyMachine` Sprinkle', async () => {
    try {
    const claimSprinkleTxHash = await cupcakeProgramClient.claimCandySprinkle(
      sprinkleUID, 
      user.publicKey,
      user,
      admin,
      sprinkleAuthority
    );
    console.log('claimSprinkleTxHash', claimSprinkleTxHash);
    }catch(e){console.warn(e)}
  });
});