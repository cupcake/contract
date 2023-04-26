import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { LAMPORTS_PER_SOL, Transaction, VersionedTransaction } from '@solana/web3.js';
import { Cupcake } from '../../target/types/cupcake';
import { expect } from 'chai';
import { SolanaClient } from '../../site/cupcake-data/clients/solana/SolanaClient';
import { bnUid } from '../../site/cupcake-data/clients/solana/SolanaUtil';
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

  let nftMint;
  const listingKey = (await SolanaClient.getListingPDA(admin.publicKey, bnUid(sprinkleUID)))[0];

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
    await cupcakeProgram.provider.connection.confirmTransaction(createBakeryTxHash, 'singleGossip');

    const sprinkleKeypair = anchor.web3.Keypair.generate();
    nftMint = await mintNFT(cupcakeProgram.provider, admin, admin.publicKey, 0);
    const args: BakeSprinkleArgs = {
      sprinkleUid: sprinkleUID,
      tagType: 'HotPotato',
      tokenMint: nftMint,
      candyMachine: null,
      numClaims: 0,
      perUser: 0,
    };
    const bakeSprinkleTxHash = await SolanaClient.runBakeSprinkleTxn(
      admin,
      sprinkleKeypair,
      args,
      cupcakeProgram.provider.connection.rpcEndpoint
    );

    await cupcakeProgram.provider.connection.confirmTransaction(bakeSprinkleTxHash, 'singleGossip');

    const claimSprinkleTx = await SolanaClient.runClaimSprinkleTxn(
      admin,
      sprinkleKeypair,
      bnUid(sprinkleUID),
      user.publicKey,
      cupcakeProgram.provider.connection.rpcEndpoint
    );

    const tx = VersionedTransaction.deserialize(claimSprinkleTx);
    tx.sign([user]);

    console.log(user.publicKey.toBase58());
    // Claim the hot potato for the user...
    const sig3 = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
    await cupcakeProgram.provider.connection.confirmTransaction(sig3, 'singleGossip');
  });

  it('Should create a Listing', async () => {
    const modifyListing = await SolanaClient.runModifyListingTxn(
      admin.publicKey,
      nftMint,
      user,
      user.publicKey,
      {
        priceSettings: {
          priceMint: null,
          setPrice: null,
        },
        collection: null,
        nextState: { initialized: true },
      },
      cupcakeProgram.provider.connection.rpcEndpoint
    );
    console.log('Here...');
    await cupcakeProgram.provider.connection.confirmTransaction(modifyListing, 'singleGossip');
    const listing = await cupcakeProgram.account.listing.fetch(listingKey);
    console.log('modifyListing hash', modifyListing);

    expect(listing.seller.toBase58()).to.equal(user.publicKey.toBase58());
    expect(listing.feePayer.toBase58()).to.equal(user.publicKey.toBase58());
    expect(listing.chosenBuyer).to.be.null;
    expect(listing.state.initialized).to.deep.equal({});
    expect(listing.priceMint).to.be.null;
    expect(listing.setPrice).to.be.null;
    expect(listing.agreedPrice).to.be.null;
  });
});
