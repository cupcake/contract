import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { Cupcake } from '../target/types/cupcake';
import { CupcakeProgram } from "../wip_sdk/cucpakeProgram";
import { mintNFT } from "../wip_sdk/programmableAssets";
import { Bakery } from '../wip_sdk/state/bakery';

describe('`EditionPrinter` Sprinkle', () => {
  anchor.setProvider(anchor.Provider.env());

  const admin = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();

  let nftMint: PublicKey | undefined = undefined;

  const cupcakeProgram = anchor.workspace.Cupcake as Program<Cupcake>;
  const cupcakeProgramClient = new CupcakeProgram(cupcakeProgram, admin)

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

  it('Should mint an NFT with a printSupply of 1', async () => {
    nftMint = await mintNFT(
      cupcakeProgramClient.program.provider,
      admin,
      admin.publicKey,
      1
    );
    console.log("nftMint", nftMint.toString());
  });

  it('Should bake a `EditionPrinter` Sprinkle with the NFT', async () => {
    try {
    const bakeSprinkleTxHash = await cupcakeProgramClient.bakeSprinkle(
      "limitedOrOpenEdition",
      sprinkleUID, 
      nftMint, 
      0, 
      5, 
      sprinkleAuthority
    );
    console.log('bakeSprinkleTxHash', bakeSprinkleTxHash);
    }catch(e){console.warn(e)}
  });

  it('Should claim the `EditionPrinter` Sprinkle', async () => {
    try {
    const claimSprinkleTxHash = await cupcakeProgramClient.claimSprinkle(
      sprinkleUID, 
      user,
      sprinkleAuthority
    );
    console.log('claimSprinkleTxHash', claimSprinkleTxHash);
    }catch(e){console.warn(e)}
  });
});