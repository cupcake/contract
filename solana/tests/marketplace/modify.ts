import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Cupcake } from '../../target/types/cupcake';
import { SolanaClient } from '../../site/cupcake-data/clients/solana/SolanaClient';
import { BakeSprinkleArgs, tagTypeSchema, tagTypeToNumber } from '../../site/cupcake-data/trpc/bakery/bakerySchemas';

import { createProgrammableNFT, createRuleSetAccount, mintNFT } from '../../wip_sdk/programmableAssets';
import { Bakery } from '../../wip_sdk/state/bakery';

describe('Modify Listing Endpoint', async () => {
  const admin = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();
  const sprinkleUID = '66554433221155';
  const cupcakeProgram = anchor.workspace.Cupcake as Program<Cupcake>;
  const cupcakeProgramClient = await SolanaClient.getCupcakeProgram(
    admin,
    cupcakeProgram.provider.connection.rpcEndpoint
  );

  const bakeryPDA = await Bakery.PDA(admin.publicKey, cupcakeProgram.programId);

  beforeEach(async () => {
    let sig = await cupcakeProgram.provider.connection.requestAirdrop(admin.publicKey, LAMPORTS_PER_SOL * 10);
    await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

    let sig2 = await cupcakeProgram.provider.connection.requestAirdrop(user.publicKey, LAMPORTS_PER_SOL * 10);
    await cupcakeProgram.provider.connection.confirmTransaction(sig2, 'singleGossip');

    const createBakeryTxHash = await SolanaClient.runCreateBakeryTxn(
      admin,
      admin,
      cupcakeProgram.provider.connection.rpcEndpoint
    );
    const sprinkleKeypair = anchor.web3.Keypair.generate();
    const nftMint = await mintNFT(cupcakeProgramClient.provider, admin, admin.publicKey, 0);
    const args: BakeSprinkleArgs = {
      sprinkleUid: sprinkleUID,
      tagType: 'HotPotato',
      tokenMint: nftMint,
      candyMachine: null,
      numClaims: 0,
      perUser: 0,
    };
    const bakeSprinkleTxHash = await SolanaClient.runBakeSprinkleTxn(admin, sprinkleKeypair, args);
    await cupcakeProgram.provider.connection.confirmTransaction(bakeSprinkleTxHash, 'singleGossip');

    // Claim the hot potato for the user...
  });
  it('Should create a Listing', async () => {
    const modifyListing = await SolanaClient.runModifyListingTxn(admin.publicKey, nftMint, user, user.publicKey, {});
    await cupcakeProgram.provider.connection.confirmTransaction(modifyListing, 'singleGossip');

    console.log('modifyListing hash', modifyListing);
  });
});
