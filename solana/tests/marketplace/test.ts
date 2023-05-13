import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { Cupcake } from '../../target/types/cupcake';
import { expect } from 'chai';
import { SolanaClient } from '../../site/cupcake-data/clients/solana/SolanaClient';
import { bnUid } from '../../site/cupcake-data/clients/solana/SolanaUtil';
import { BakeSprinkleArgs, tagTypeSchema, tagTypeToNumber } from '../../site/cupcake-data/trpc/bakery/bakerySchemas';

import { createProgrammableNFT, createRuleSetAccount, mintNFT } from '../../wip_sdk/programmableAssets';
import { Bakery } from '../../wip_sdk/state/bakery';
import { createMint } from '@solana/spl-token';
import { createAssociatedTokenAccount } from '@solana/spl-token';
import { mintTo } from '@solana/spl-token';
import { getAssociatedTokenAddress } from '@solana/spl-token';
const characters = '0123456789';

function generateString(length) {
  let result = ' ';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  return result;
}

describe('Marketplace', async () => {
  const admin = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();
  const buyer = anchor.web3.Keypair.generate();
  const secondCreator = anchor.web3.Keypair.generate();

  let sprinkleUID, listingKey, sprinkleKeypair;
  const cupcakeProgram = anchor.workspace.Cupcake as Program<Cupcake>;
  SolanaClient.setCupcakeProgram(admin, cupcakeProgram);
  SolanaClient.setCupcakeProgram(buyer, cupcakeProgram);
  SolanaClient.setCupcakeProgram(user, cupcakeProgram);

  let nftMint;

  before(async () => {
    let sig = await cupcakeProgram.provider.connection.requestAirdrop(admin.publicKey, LAMPORTS_PER_SOL * 10);
    await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

    let sig2 = await cupcakeProgram.provider.connection.requestAirdrop(user.publicKey, LAMPORTS_PER_SOL * 10);
    await cupcakeProgram.provider.connection.confirmTransaction(sig2, 'singleGossip');

    let sig3 = await cupcakeProgram.provider.connection.requestAirdrop(buyer.publicKey, LAMPORTS_PER_SOL * 10);
    await cupcakeProgram.provider.connection.confirmTransaction(sig3, 'singleGossip');
    ``;
    const createBakeryTxHash = await SolanaClient.runCreateBakeryTxn(
      admin,
      admin,
      cupcakeProgram.provider.connection.rpcEndpoint
    );

    await cupcakeProgram.provider.connection.confirmTransaction(createBakeryTxHash, 'singleGossip');
  });

  describe('Creation fails', async () => {
    it('Seller doesnt have the token', async () => {
      sprinkleUID = generateString(10);
      listingKey = (await SolanaClient.getListingPDA(admin.publicKey, bnUid(sprinkleUID)))[0];

      sprinkleKeypair = anchor.web3.Keypair.generate();
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

      try {
        const modifyListing = await SolanaClient.runModifyListingTxn(
          admin.publicKey,
          nftMint,
          user.publicKey,
          user.publicKey,
          sprinkleUID,
          {
            priceSettings: {
              priceMint: null,
              setPrice: null,
            },
            collection: null,
            nextState: { forSale: true },
          },
          cupcakeProgram.provider.connection.rpcEndpoint
        );
        let tx = VersionedTransaction.deserialize(modifyListing);
        tx.sign([user]);
        await cupcakeProgram.provider.connection.sendTransaction(tx);
        throw new Error('This error shouldnt happen');
      } catch (e) {
        expect(e.message).to.match(new RegExp('0xbc4')); //AccountNotInitialized
      }
    });
  });

  describe('Creation succeeds', async () => {
    beforeEach(async () => {
      sprinkleUID = generateString(10);
      listingKey = (await SolanaClient.getListingPDA(admin.publicKey, bnUid(sprinkleUID)))[0];

      sprinkleKeypair = anchor.web3.Keypair.generate();

      nftMint = await mintNFT(cupcakeProgram.provider, admin, admin.publicKey, 0, secondCreator.publicKey);
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
        user.publicKey,
        user.publicKey,
        sprinkleUID,
        {
          priceSettings: {
            priceMint: null,
            setPrice: null,
          },
          collection: null,
          nextState: { forSale: true },
        },
        cupcakeProgram.provider.connection.rpcEndpoint
      );
      let tx = VersionedTransaction.deserialize(modifyListing);
      tx.sign([user]);
      let sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
      await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

      const listing = await cupcakeProgram.account.listing.fetch(listingKey);

      expect(listing.seller.toBase58()).to.equal(user.publicKey.toBase58());
      expect(listing.feePayer.toBase58()).to.equal(user.publicKey.toBase58());
      expect(listing.chosenBuyer).to.be.null;
      expect(listing.state.forSale).to.deep.equal({});
      expect(listing.priceMint).to.be.null;
      expect(listing.setPrice).to.be.null;
      expect(listing.agreedPrice).to.be.null;
    });

    it('User can set price and priceMint on initialization but can only change price once in forSale', async () => {
      let modifyListing = await SolanaClient.runModifyListingTxn(
        admin.publicKey,
        nftMint,
        user.publicKey,
        user.publicKey,
        sprinkleUID,
        {
          priceSettings: {
            priceMint: null,
            setPrice: new anchor.BN(10000000),
          },
          collection: null,
          nextState: { forSale: true },
        },
        cupcakeProgram.provider.connection.rpcEndpoint
      );
      let tx = VersionedTransaction.deserialize(modifyListing);
      tx.sign([user]);
      let sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
      await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

      let listing = await cupcakeProgram.account.listing.fetch(listingKey);

      expect(listing.seller.toBase58()).to.equal(user.publicKey.toBase58());
      expect(listing.feePayer.toBase58()).to.equal(user.publicKey.toBase58());
      expect(listing.chosenBuyer).to.be.null;
      expect(listing.state.forSale).to.deep.equal({});
      expect(listing.priceMint).to.be.null;
      expect(listing.setPrice.toNumber()).to.equal(10000000);
      expect(listing.agreedPrice).to.be.null;

      modifyListing = await SolanaClient.runModifyListingTxn(
        admin.publicKey,
        nftMint,
        admin.publicKey,
        user.publicKey,
        sprinkleUID,
        {
          priceSettings: null,
          collection: null,
          nextState: { forSale: true },
        },
        cupcakeProgram.provider.connection.rpcEndpoint
      );
      tx = VersionedTransaction.deserialize(modifyListing);
      tx.sign([admin]);
      sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
      await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

      modifyListing = await SolanaClient.runModifyListingTxn(
        admin.publicKey,
        nftMint,
        user.publicKey,
        user.publicKey,
        sprinkleUID,
        {
          priceSettings: {
            priceMint: null,
            setPrice: new anchor.BN(20000000),
          },
          collection: null,
          nextState: null,
        },
        cupcakeProgram.provider.connection.rpcEndpoint
      );
      tx = VersionedTransaction.deserialize(modifyListing);
      tx.sign([user]);
      sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
      await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

      listing = await cupcakeProgram.account.listing.fetch(listingKey);

      expect(listing.state.forSale).to.deep.equal({});
      expect(listing.setPrice.toNumber()).to.equal(20000000);

      try {
        modifyListing = await SolanaClient.runModifyListingTxn(
          admin.publicKey,
          nftMint,
          user.publicKey,
          user.publicKey,
          sprinkleUID,
          {
            priceSettings: {
              priceMint: nftMint, // just reusing a mint because it expects one
              setPrice: null,
            },
            collection: null,
            nextState: null,
          },
          cupcakeProgram.provider.connection.rpcEndpoint
        );

        let tx = VersionedTransaction.deserialize(modifyListing);
        tx.sign([user]);
        await cupcakeProgram.provider.connection.sendTransaction(tx);
        // We should never get here
        throw new Error('This logic should have failed and it didnt');
      } catch (e) {
        expect(e.message).to.match(new RegExp('0x178a')); // CannotChangePriceMintInThisState
      }
    });

    describe('toggle_vaulting', () => {
      it('cant be vaulted by user', async () => {
        try {
          let modifyVaulting = await SolanaClient.runToggleVaultTxn({
            bakery: admin.publicKey,
            tokenMint: nftMint,
            sprinkleUID,
            user: user.publicKey,
            payer: user.publicKey,
            desiredState: { vaulted: true },
            rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
          });

          let tx = VersionedTransaction.deserialize(modifyVaulting);
          tx.sign([user]);
          let sig = await cupcakeProgram.provider.connection.sendTransaction(tx);
          await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');
          throw new Error('This logic should have failed and it didnt');
        } catch (e) {
          expect(e.message).to.match(new RegExp('0x17a3')); // InvalidVaultTransition
        }
      });

      it('cant be unvaulted by user', async () => {
        let modifyVaulting = await SolanaClient.runToggleVaultTxn({
          bakery: admin.publicKey,
          tokenMint: nftMint,
          sprinkleUID,
          user: user.publicKey,
          payer: admin.publicKey,
          desiredState: { vaulted: true },
          rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
        });

        let tx = VersionedTransaction.deserialize(modifyVaulting);
        tx.sign([admin]);
        let sig = await cupcakeProgram.provider.connection.sendTransaction(tx);
        await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

        try {
          modifyVaulting = await SolanaClient.runToggleVaultTxn({
            bakery: admin.publicKey,
            tokenMint: nftMint,
            sprinkleUID,
            user: user.publicKey,
            payer: user.publicKey,
            desiredState: { unvaulted: true },
            rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
          });

          tx = VersionedTransaction.deserialize(modifyVaulting);
          tx.sign([user]);
          sig = await cupcakeProgram.provider.connection.sendTransaction(tx);
          await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');
          throw new Error('This logic should have failed and it didnt');
        } catch (e) {
          expect(e.message).to.match(new RegExp('0x17a3')); // InvalidVaultTransition
        }
      });

      it('can be vaulted by admin and then requested to unvault by a user', async () => {
        let modifyVaulting = await SolanaClient.runToggleVaultTxn({
          bakery: admin.publicKey,
          tokenMint: nftMint,
          sprinkleUID,
          user: user.publicKey,
          payer: admin.publicKey,
          desiredState: { vaulted: true },
          rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
        });

        let tx = VersionedTransaction.deserialize(modifyVaulting);
        tx.sign([admin]);
        let sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
        await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

        modifyVaulting = await SolanaClient.runToggleVaultTxn({
          bakery: admin.publicKey,
          tokenMint: nftMint,
          sprinkleUID,
          user: user.publicKey,
          payer: user.publicKey,
          desiredState: { unvaultingRequested: true },
          rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
        });

        tx = VersionedTransaction.deserialize(modifyVaulting);
        tx.sign([user]);
        sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
        await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

        const tag = await cupcakeProgram.account.tag.fetch(
          (
            await SolanaClient.getSprinklePDA(bnUid(sprinkleUID), admin.publicKey)
          )[0]
        );

        expect(tag.vaultState.unvaultingRequested).to.deep.equal({});
      });

      it('can be inTransit by admin and then shift to unvaulted by a user', async () => {
        let modifyVaulting = await SolanaClient.runToggleVaultTxn({
          bakery: admin.publicKey,
          tokenMint: nftMint,
          sprinkleUID,
          user: user.publicKey,
          payer: admin.publicKey,
          desiredState: { inTransit: true },
          rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
        });

        let tx = VersionedTransaction.deserialize(modifyVaulting);
        tx.sign([admin]);
        let sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
        await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

        modifyVaulting = await SolanaClient.runToggleVaultTxn({
          bakery: admin.publicKey,
          tokenMint: nftMint,
          sprinkleUID,
          user: user.publicKey,
          payer: user.publicKey,
          desiredState: { unvaulted: true },
          rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
        });

        tx = VersionedTransaction.deserialize(modifyVaulting);
        tx.sign([user]);
        sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
        await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

        const tag = await cupcakeProgram.account.tag.fetch(
          (
            await SolanaClient.getSprinklePDA(bnUid(sprinkleUID), admin.publicKey)
          )[0]
        );

        expect(tag.vaultState.unvaulted).to.deep.equal({});
      });

      it('can be vaulted by admin', async () => {
        let modifyVaulting = await SolanaClient.runToggleVaultTxn({
          bakery: admin.publicKey,
          tokenMint: nftMint,
          sprinkleUID,
          user: user.publicKey,
          payer: admin.publicKey,
          desiredState: { vaulted: true },
          rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
        });

        let tx = VersionedTransaction.deserialize(modifyVaulting);
        tx.sign([admin]);
        let sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
        await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

        const tag = await cupcakeProgram.account.tag.fetch(
          (
            await SolanaClient.getSprinklePDA(bnUid(sprinkleUID), admin.publicKey)
          )[0]
        );

        expect(tag.vaultState.vaulted).to.deep.equal({});
      });

      it('can be unvaulted by admin', async () => {
        let modifyVaulting = await SolanaClient.runToggleVaultTxn({
          bakery: admin.publicKey,
          tokenMint: nftMint,
          sprinkleUID,
          user: user.publicKey,
          payer: admin.publicKey,
          desiredState: { vaulted: true },
          rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
        });

        let tx = VersionedTransaction.deserialize(modifyVaulting);
        tx.sign([admin]);
        let sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
        await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

        modifyVaulting = await SolanaClient.runToggleVaultTxn({
          bakery: admin.publicKey,
          tokenMint: nftMint,
          sprinkleUID,
          user: user.publicKey,
          payer: admin.publicKey,
          desiredState: { unvaulted: true },
          rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
        });

        tx = VersionedTransaction.deserialize(modifyVaulting);
        tx.sign([admin]);
        sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
        await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

        const tag = await cupcakeProgram.account.tag.fetch(
          (
            await SolanaClient.getSprinklePDA(bnUid(sprinkleUID), admin.publicKey)
          )[0]
        );

        expect(tag.vaultState.unvaulted).to.deep.equal({});
      });

      it('can be marked in transit by admin', async () => {
        let modifyVaulting = await SolanaClient.runToggleVaultTxn({
          bakery: admin.publicKey,
          tokenMint: nftMint,
          sprinkleUID,
          user: user.publicKey,
          payer: admin.publicKey,
          desiredState: { inTransit: true },
          rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
        });

        let tx = VersionedTransaction.deserialize(modifyVaulting);
        tx.sign([admin]);
        let sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
        await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

        const tag = await cupcakeProgram.account.tag.fetch(
          (
            await SolanaClient.getSprinklePDA(bnUid(sprinkleUID), admin.publicKey)
          )[0]
        );

        expect(tag.vaultState.inTransit).to.deep.equal({});
      });

      it('can be marked unvaulted requested by admin', async () => {
        let modifyVaulting = await SolanaClient.runToggleVaultTxn({
          bakery: admin.publicKey,
          tokenMint: nftMint,
          sprinkleUID,
          user: user.publicKey,
          payer: admin.publicKey,
          desiredState: { unvaultingRequested: true },
          rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
        });

        let tx = VersionedTransaction.deserialize(modifyVaulting);
        tx.sign([admin]);
        let sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
        await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

        const tag = await cupcakeProgram.account.tag.fetch(
          (
            await SolanaClient.getSprinklePDA(bnUid(sprinkleUID), admin.publicKey)
          )[0]
        );

        expect(tag.vaultState.unvaultingRequested).to.deep.equal({});
      });
    });

    it('cant be marked as accepted by anybody from modify', async () => {
      let modifyListing = await SolanaClient.runModifyListingTxn(
        admin.publicKey,
        nftMint,
        user.publicKey,
        user.publicKey,
        sprinkleUID,
        {
          priceSettings: {
            priceMint: null,
            setPrice: null,
          },
          collection: null,
          nextState: { forSale: true },
        },
        cupcakeProgram.provider.connection.rpcEndpoint
      );
      let tx = VersionedTransaction.deserialize(modifyListing);
      tx.sign([user]);
      let sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
      await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

      try {
        modifyListing = await SolanaClient.runModifyListingTxn(
          admin.publicKey,
          nftMint,
          admin.publicKey,
          user.publicKey,
          sprinkleUID,
          {
            priceSettings: {
              priceMint: null,
              setPrice: null,
            },
            collection: null,
            nextState: { accepted: true },
          },
          cupcakeProgram.provider.connection.rpcEndpoint
        );

        let tx = VersionedTransaction.deserialize(modifyListing);
        tx.sign([admin]);
        await cupcakeProgram.provider.connection.sendTransaction(tx);
        // We should never get here
        throw new Error('This logic should have failed and it didnt');
      } catch (e) {
        expect(e.message).to.match(new RegExp('0x1789')); // CannotAcceptFromModify
      }
    });

    it('royalties are paid correctly, buyer can claim the token, and goes to waiting to be shipped', async () => {
      let modifyListing = await SolanaClient.runModifyListingTxn(
        admin.publicKey,
        nftMint,
        user.publicKey,
        user.publicKey,
        sprinkleUID,
        {
          priceSettings: {
            priceMint: null,
            setPrice: null,
          },
          collection: null,
          nextState: { forSale: true },
        },
        cupcakeProgram.provider.connection.rpcEndpoint
      );
      let tx = VersionedTransaction.deserialize(modifyListing);
      tx.sign([user]);
      let sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
      await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

      console.log('Buyer', buyer.publicKey.toBase58());
      let makeOffer = await SolanaClient.runMakeOfferTxn({
        bakery: admin.publicKey,
        tokenMint: nftMint,
        sprinkleUID: bnUid(sprinkleUID),
        payer: buyer.publicKey,
        buyer: buyer.publicKey,
        offerAmount: new anchor.BN(1000000000),
        rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
      });
      tx = VersionedTransaction.deserialize(makeOffer);
      tx.sign([buyer]);
      sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
      await cupcakeProgram.provider.connection.confirmTransaction(sig, 'single');

      const oldSellerLamports = await cupcakeProgram.provider.connection.getBalance(user.publicKey);
      const oldCreator2Lamports = await cupcakeProgram.provider.connection.getBalance(secondCreator.publicKey);
      let acceptOffer = await SolanaClient.runAcceptOfferTxn({
        bakery: admin.publicKey,
        tokenMint: nftMint,
        sprinkleUID: bnUid(sprinkleUID),
        signer: user.publicKey,
        buyer: buyer.publicKey,
        rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
      });
      tx = VersionedTransaction.deserialize(acceptOffer);
      tx.sign([user]);
      sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
      await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

      let moveToken = await SolanaClient.runClaimBoughtNFTTxn({
        bakery: admin.publicKey,
        tokenMint: nftMint,
        sprinkleUID: bnUid(sprinkleUID),
        buyer: buyer.publicKey,
        rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
      });
      tx = VersionedTransaction.deserialize(moveToken);
      tx.sign([buyer]);
      sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
      await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

      const newSellerLamports = await cupcakeProgram.provider.connection.getBalance(user.publicKey);
      const newCreator2Lamports = await cupcakeProgram.provider.connection.getBalance(secondCreator.publicKey);

      expect(newSellerLamports - oldSellerLamports).to.equal(895000000);
      expect(newCreator2Lamports - oldCreator2Lamports).to.equal(50000000);

      const tag = await cupcakeProgram.account.tag.fetch(
        (
          await SolanaClient.getSprinklePDA(bnUid(sprinkleUID), admin.publicKey)
        )[0]
      );

      const location = (
        await SolanaClient.getUserHotPotatoToken(bnUid(sprinkleUID), admin.publicKey, buyer.publicKey, nftMint)
      )[0];
      expect(tag.currentTokenLocation.toBase58()).to.deep.equal(location.toBase58());
      expect(tag.vaultState.unvaultingRequested).to.deep.equal({});
      const tokenAmount = await cupcakeProgram.provider.connection.getTokenAccountBalance(location);
      expect(tokenAmount.value.uiAmount).to.equal(1);
    });

    it('it can go straight to vaulted on a sale and the buyer can claim the token', async () => {
      let modifyListing = await SolanaClient.runModifyListingTxn(
        admin.publicKey,
        nftMint,
        user.publicKey,
        user.publicKey,
        sprinkleUID,
        {
          vaultedPreferred: true,
          priceSettings: {
            priceMint: null,
            setPrice: null,
          },
          collection: null,
          nextState: { forSale: true },
        },
        cupcakeProgram.provider.connection.rpcEndpoint
      );
      let tx = VersionedTransaction.deserialize(modifyListing);
      tx.sign([user]);
      let sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
      await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

      let makeOffer = await SolanaClient.runMakeOfferTxn({
        bakery: admin.publicKey,
        tokenMint: nftMint,
        sprinkleUID: bnUid(sprinkleUID),
        payer: buyer.publicKey,
        buyer: buyer.publicKey,
        offerAmount: new anchor.BN(1000000000),
        rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
      });
      tx = VersionedTransaction.deserialize(makeOffer);
      tx.sign([buyer]);
      sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
      await cupcakeProgram.provider.connection.confirmTransaction(sig, 'single');

      let acceptOffer = await SolanaClient.runAcceptOfferTxn({
        bakery: admin.publicKey,
        tokenMint: nftMint,
        sprinkleUID: bnUid(sprinkleUID),
        signer: user.publicKey,
        buyer: buyer.publicKey,
        rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
      });
      tx = VersionedTransaction.deserialize(acceptOffer);
      tx.sign([user]);
      sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
      await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

      let moveToken = await SolanaClient.runClaimBoughtNFTTxn({
        bakery: admin.publicKey,
        tokenMint: nftMint,
        sprinkleUID: bnUid(sprinkleUID),
        buyer: buyer.publicKey,
        rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
      });
      tx = VersionedTransaction.deserialize(moveToken);
      tx.sign([buyer]);
      sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
      await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

      const tag = await cupcakeProgram.account.tag.fetch(
        (
          await SolanaClient.getSprinklePDA(bnUid(sprinkleUID), admin.publicKey)
        )[0]
      );
      const location = (
        await SolanaClient.getUserHotPotatoToken(bnUid(sprinkleUID), admin.publicKey, buyer.publicKey, nftMint)
      )[0];

      expect(tag.currentTokenLocation.toBase58()).to.deep.equal(location.toBase58());
      expect(tag.vaultState.vaulted).to.deep.equal({});

      const tokenAmount = await cupcakeProgram.provider.connection.getTokenAccountBalance(location);
      expect(tokenAmount.value.uiAmount).to.equal(1);
    });

    it('cancelling in accepted is not possible for the user', async () => {
      let modifyListing = await SolanaClient.runModifyListingTxn(
        admin.publicKey,
        nftMint,
        user.publicKey,
        user.publicKey,
        sprinkleUID,
        {
          priceSettings: {
            priceMint: null,
            setPrice: null,
          },
          collection: null,
          nextState: { forSale: true },
        },
        cupcakeProgram.provider.connection.rpcEndpoint
      );
      let tx = VersionedTransaction.deserialize(modifyListing);
      tx.sign([user]);
      let sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
      await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

      console.log('Buyer', buyer.publicKey.toBase58());
      let makeOffer = await SolanaClient.runMakeOfferTxn({
        bakery: admin.publicKey,
        tokenMint: nftMint,
        sprinkleUID: bnUid(sprinkleUID),
        payer: buyer.publicKey,
        buyer: buyer.publicKey,
        offerAmount: new anchor.BN(1000000),
        rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
      });
      tx = VersionedTransaction.deserialize(makeOffer);
      tx.sign([buyer]);
      sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
      await cupcakeProgram.provider.connection.confirmTransaction(sig, 'single');

      let acceptOffer = await SolanaClient.runAcceptOfferTxn({
        bakery: admin.publicKey,
        tokenMint: nftMint,
        sprinkleUID: bnUid(sprinkleUID),
        signer: user.publicKey,
        buyer: buyer.publicKey,
        rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
      });
      tx = VersionedTransaction.deserialize(acceptOffer);
      tx.sign([user]);
      sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
      await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

      try {
        modifyListing = await SolanaClient.runModifyListingTxn(
          admin.publicKey,
          nftMint,
          user.publicKey,
          user.publicKey,
          sprinkleUID,
          {
            priceSettings: null,
            collection: null,
            nextState: { userCanceled: true },
          },
          cupcakeProgram.provider.connection.rpcEndpoint
        );
        tx = VersionedTransaction.deserialize(modifyListing);
        tx.sign([user]);
        sig = await cupcakeProgram.provider.connection.sendTransaction(tx);
        await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');
        // We should never get here
        throw new Error('This logic should have failed and it didnt');
      } catch (e) {
        expect(e.message).to.match(/0x177c/); //ListingFrozen
      }
    });

    describe('with USDC', () => {
      let tokenMint;

      beforeEach(async () => {
        tokenMint = await createMint(cupcakeProgram.provider.connection, admin, admin.publicKey, admin.publicKey, 10);
        const token = await createAssociatedTokenAccount(
          cupcakeProgram.provider.connection,
          admin,
          tokenMint,
          buyer.publicKey
        );
        console.log('created token');
        await mintTo(cupcakeProgram.provider.connection, admin, tokenMint, token, admin, 1000, [], {
          skipPreflight: true,
        });
        console.log('minted to ata');
      });

      it('can be claimed and pays out royalties and funds seller', async () => {
        let modifyListing = await SolanaClient.runModifyListingTxn(
          admin.publicKey,
          nftMint,
          user.publicKey,
          user.publicKey,
          sprinkleUID,
          {
            priceSettings: {
              priceMint: tokenMint,
              setPrice: null,
            },
            collection: null,
            nextState: { forSale: true },
            vaultedPreferred: false,
          },
          cupcakeProgram.provider.connection.rpcEndpoint
        );
        let tx = VersionedTransaction.deserialize(modifyListing);
        tx.sign([user]);
        let sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
        await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

        console.log('Buyer', buyer.publicKey.toBase58());
        let makeOffer = await SolanaClient.runMakeOfferTxn({
          bakery: admin.publicKey,
          tokenMint: nftMint,
          sprinkleUID: bnUid(sprinkleUID),
          payer: buyer.publicKey,
          buyer: buyer.publicKey,
          offerAmount: new anchor.BN(1000),
          rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
        });
        tx = VersionedTransaction.deserialize(makeOffer);
        tx.sign([buyer]);
        sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
        await cupcakeProgram.provider.connection.confirmTransaction(sig, 'single');

        const oldSellerTokens = 0;
        const oldCreator2Tokens = 0;
        let acceptOffer = await SolanaClient.runAcceptOfferTxn({
          bakery: admin.publicKey,
          tokenMint: nftMint,
          sprinkleUID: bnUid(sprinkleUID),
          signer: user.publicKey,
          buyer: buyer.publicKey,
          rpcURL: cupcakeProgram.provider.connection.rpcEndpoint,
        });
        tx = VersionedTransaction.deserialize(acceptOffer);
        tx.sign([user]);
        sig = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
        await cupcakeProgram.provider.connection.confirmTransaction(sig, 'singleGossip');

        const someNewCupcakeWallet = anchor.web3.Keypair.generate();
        const claimSprinkleTx = await SolanaClient.runClaimSprinkleTxn(
          admin,
          sprinkleKeypair,
          bnUid(sprinkleUID),
          someNewCupcakeWallet.publicKey,
          cupcakeProgram.provider.connection.rpcEndpoint
        );

        tx = VersionedTransaction.deserialize(claimSprinkleTx);
        tx.sign([someNewCupcakeWallet]);
        const sig3 = await cupcakeProgram.provider.connection.sendTransaction(tx, { skipPreflight: true });
        await cupcakeProgram.provider.connection.confirmTransaction(sig3, 'singleGossip');
        const newSellerTokens = (
          await cupcakeProgram.provider.connection.getTokenAccountBalance(
            await getAssociatedTokenAddress(tokenMint, user.publicKey)
          )
        ).value.uiAmount;
        const newCreator2Tokens = (
          await cupcakeProgram.provider.connection.getTokenAccountBalance(
            await getAssociatedTokenAddress(tokenMint, secondCreator.publicKey)
          )
        ).value.uiAmount;
        expect(newSellerTokens - oldSellerTokens).to.equal(8.95e-8);
        expect(newCreator2Tokens - oldCreator2Tokens).to.equal(0.5e-8);
      });
    });
  });
});
