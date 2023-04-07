import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { Cupcake } from '../target/types/cupcake';
import { CupcakeProgram } from "../wip_sdk/cucpakeProgram";
import { mintNFT, mintToken } from "../wip_sdk/programmableAssets";

describe('`Fungible` Sprinkle', () => {
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

  it('Should mint an token with 0 decimals and an initial supply of 100', async () => {
    nftMint = await mintToken(
      cupcakeProgramClient.program.provider,
      admin,
      admin.publicKey,
      0,
      100
    );
    console.log("nftMint", nftMint.toString());
  });

  it('Should bake a `Fungible` Sprinkle with the Tokens', async () => {
    try {
    const bakeSprinkleTxHash = await cupcakeProgramClient.bakeSprinkle(
      "walletRestrictedFungible",
      sprinkleUID, 
      nftMint, 
      100, 
      100, 
      sprinkleAuthority
    );
    console.log('bakeSprinkleTxHash', bakeSprinkleTxHash);
    }catch(e){console.warn(e)}
  });

  it('Should claim the `Fungible` Sprinkle', async () => {
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