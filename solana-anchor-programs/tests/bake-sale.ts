import { Program, Provider, BN, workspace, setProvider } from '@project-serum/anchor'
import { LAMPORTS_PER_SOL, Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import { Cupcake } from '../target/types/cupcake'
import { BakeSale } from '../target/types/bake_sale'
import { createAssociatedTokenAccount, createMint, getAssociatedTokenAddress, mintTo } from '@solana/spl-token'

export const PREFIX = 'bake-sale'

describe('bake-sale', async () => {
  const provider = Provider.env()
  setProvider(provider)

  const cupcakeProgram = workspace.Cupcake as Program<Cupcake>
  const bakeSaleProgram = workspace.BakeSale as Program<BakeSale>

  console.log("Generating and funding accounts:")

  const admin = Keypair.generate()
  const sig = await provider.connection.requestAirdrop(admin.publicKey, LAMPORTS_PER_SOL * 10)
  await provider.connection.confirmTransaction(sig, 'singleGossip')
  console.log("\tbakery authority:", admin.publicKey.toString())

  const bakeryPDA = (
    await PublicKey.findProgramAddress(
      [
        Buffer.from('cupcake'), 
        admin.publicKey.toBuffer()
      ],
      cupcakeProgram.programId
    )
  )[0]
  console.log("\tbakery PDA:", bakeryPDA.toString())

  const sprinklePDA = (
    await PublicKey.findProgramAddress(
      [
        Buffer.from('cupcake'), 
        admin.publicKey.toBuffer(), 
        new BN(0).toBuffer('le', 8)
      ],
      cupcakeProgram.programId
    )
  )[0]
  console.log("\tsprinkle PDA:", sprinklePDA.toString())

  const bakeSalePDA = (
    await PublicKey.findProgramAddress(
      [
        Buffer.from('bake-sale'), 
        admin.publicKey.toBuffer()
      ],
      bakeSaleProgram.programId
    )
  )[0]
  console.log("\tbake sale PDA:", bakeSalePDA.toString())

  const poapTokenMint = await createMint(provider.connection, admin, admin.publicKey, null, 0)
  console.log("\tpoap token mint:", poapTokenMint.toString())

  const prizetokenMint = await createMint(provider.connection, admin, admin.publicKey, null, 0)
  console.log("\tprize token mint:", prizetokenMint.toString())
  const prizeTokenAta = await createAssociatedTokenAccount(
    provider.connection, 
    admin, 
    prizetokenMint, 
    admin.publicKey
  )
  await mintTo(provider.connection, admin, prizetokenMint, prizeTokenAta, admin, 1);
  console.log("\tprize token ATA:", prizeTokenAta.toString(), '\n')

  const bidder = Keypair.generate()
  const sig2 = await provider.connection.requestAirdrop(bidder.publicKey, LAMPORTS_PER_SOL * 10)
  await provider.connection.confirmTransaction(sig2, 'singleGossip')
  console.log("\tbidder:", bidder.publicKey.toString())

  const bidderUserInfoPDA = (
    await PublicKey.findProgramAddress(
      [
        Buffer.from('cupcake'), 
        admin.publicKey.toBuffer(), 
        new BN(0).toBuffer('le', 8),
        bidder.publicKey.toBuffer()
      ],
      cupcakeProgram.programId
    )
  )[0]
  console.log("\tbidder user info PDA:", bidderUserInfoPDA.toString())

  const newPoapMint = await createMint(provider.connection, admin, admin.publicKey, null, 0)
  console.log("\tnew poap mint:", newPoapMint.toString())
  const newPoapAta = await getAssociatedTokenAddress(poapTokenMint, bidder.publicKey)
  console.log("\tnew poap ATA:", newPoapAta.toString())

  console.log("Creating bakery:")
  const createBakeryTx = await cupcakeProgram.methods
    .initialize()
    .accounts({
      authority: admin.publicKey,
      payer: admin.publicKey,
      config: bakeryPDA
    })
    .signers([admin])
    .rpc()
  console.log("\t" + createBakeryTx, '\n')

  console.log("Creating bake sale:")
  const createBakeSaleTx = await bakeSaleProgram.methods
    .createBakeSale({
      auctionId: new BN(0),
      auctionLength: new BN(100),
      reservePrice: new BN(0),
      tickSize: new BN(1),
      biddersPay: false,
    })
    .accounts({
      bakeryAuthority: admin.publicKey,
      bakery: bakeryPDA,
      sprinkle: sprinklePDA,
      bakeSale: bakeSalePDA,
      paymentMint: SystemProgram.programId,
      poapMint: poapTokenMint,
      prizeMint: prizetokenMint,
      cupcakeProgram: cupcakeProgram.programId
    })
    .signers([admin])
    .rpc()
  console.log('\t', createBakeSaleTx, '\n')

  console.log("Fetching bake sale state:")
  const bakeSaleState = await bakeSaleProgram.account.bakeSale.fetch(bakeSalePDA)
  console.log('\t', bakeSaleState, '\n')

  console.log("Bidding on bake sale:")
  const placeBidTx = await bakeSaleProgram.methods
    .placeBid({
      bidSize: new BN(1)
    })
    .accounts({
      newPoapMint,
      newPoapAta,
      user: bidder.publicKey,
      bakery: bakeryPDA,
      sprinkle: sprinklePDA,
      userInfo: bidderUserInfoPDA,
      bakeSale: bakeSalePDA,
      currentWinner: SystemProgram.programId,
      paymentMint: SystemProgram.programId,
      poapMint: poapTokenMint,
      tokenMetadataProgram: '',
      cupcakeProgram: cupcakeProgram.programId
    })
    .signers([bidder, newPoapMint])
    .rpc()
  console.log('\t', placeBidTx, '\n')

})
