import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { ASSOCIATED_PROGRAM_ID } from '@project-serum/anchor/dist/cjs/utils/token';
import { createAssociatedTokenAccount, createMint, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { LAMPORTS_PER_SOL, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { CupcakeProgram } from '../target/types/cupcake_program';

export const PREFIX = 'cupcake';

describe('cupcake', () => {
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.CupcakeProgram as Program<CupcakeProgram>;

  const admin = anchor.web3.Keypair.generate();

  let configPDA: any;
  let tagPDA: any;
  let tokenMint: any;
  let token: any;

  it('initialize config', async () => {
    let sig = await program.provider.connection.requestAirdrop(admin.publicKey, LAMPORTS_PER_SOL * 10);
    await program.provider.connection.confirmTransaction(sig, 'singleGossip');

    configPDA = (
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(PREFIX), admin.publicKey.toBuffer()],
        program.programId
      )
    )[0];

    const tx = await program.rpc.initialize({
      accounts: {
        authority: admin.publicKey,
        payer: admin.publicKey,
        config: configPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [admin],
    });
    console.log('Your transaction signature', tx);
  });

  it('add tag', async () => {
    const tagAuthority = anchor.web3.Keypair.generate();

    const tagUID = new anchor.BN('CC04267BE22E6780', 'hex');

    tagPDA = (
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(PREFIX), admin.publicKey.toBuffer(), tagUID.toArrayLike(Buffer, 'le')],
        program.programId
      )
    )[0];

    tokenMint = await createMint(program.provider.connection, admin, admin.publicKey, null, 0);

    token = await createAssociatedTokenAccount(program.provider.connection, admin, tokenMint, admin.publicKey);

    await mintTo(program.provider.connection, admin, tokenMint, token, admin, 1);

    const newTagParams: any = {
      uid: tagUID,
      tagType: 0,
      numClaims: new anchor.BN(0),
      perUser: new anchor.BN(0),
    };

    const tx = await program.rpc.addTag(newTagParams, {
      accounts: {
        authority: admin.publicKey,
        payer: admin.publicKey,
        config: configPDA,
        tagAuthority: tagAuthority.publicKey,
        tag: tagPDA,
        tokenMint: tokenMint,
        token: token,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      },
      signers: [admin],
    });
    console.log('Your transaction signature', tx);
  });
});
