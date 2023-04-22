import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Cupcake } from '../../target/types/cupcake';
import { CupcakeProgram } from '../../wip_sdk/cucpakeProgram';
import { createProgrammableNFT, createRuleSetAccount, mintNFT } from '../../wip_sdk/programmableAssets';
import { Bakery } from '../../wip_sdk/state/bakery';

describe('Programmable with no RuleSet', async () => {
  const admin = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();

  const cupcakeProgram = anchor.workspace.Cupcake as Program<Cupcake>;
  const cupcakeProgramClient = new CupcakeProgram(cupcakeProgram, admin);

  const bakeryPDA = await Bakery.PDA(admin.publicKey, cupcakeProgram.programId);

  it('Should fund test wallets', async () => {
    let sig = await cupcakeProgram.provider.connection.requestAirdrop(admin.publicKey, LAMPORTS_PER_SOL * 10);
    await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

    let sig2 = await cupcakeProgram.provider.connection.requestAirdrop(user.publicKey, LAMPORTS_PER_SOL * 10);
    await cupcakeProgram.provider.connection.confirmTransaction(sig2, 'singleGossip');
  });

  it('Should create a Bakery', async () => {
    const createBakeryTxHash = await cupcakeProgramClient.createBakery();
    console.log('createBakeryTxHash', createBakeryTxHash);
  });

  it('Tests for pNFTs with no ruleset', async () => {
    const sprinkleUID = '66557433221590';
    const sprinkleAuthority = anchor.web3.Keypair.generate();

    const programmableNFTMint = await createProgrammableNFT(
      cupcakeProgramClient.program.provider,
      admin,
      admin.publicKey,
      0,
      null,
      null
    );
    console.log('programmableNFTMint', programmableNFTMint.toString());

    try {
      const bakeSprinkleTxHash = await cupcakeProgramClient.bakeSprinkle(
        'refillable1Of1',
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
    } catch (e) {
      console.warn(e);
    }
  });
});
