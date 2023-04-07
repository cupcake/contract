import { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import * as TokenAuth from "@metaplex-foundation/mpl-token-auth-rules"
import { Program, Provider } from "@project-serum/anchor";
import { ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createInitializeMintInstruction, createMintToInstruction, getAssociatedTokenAddressSync, MintLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY, SYSVAR_INSTRUCTIONS_PUBKEY, SYSVAR_RENT_PUBKEY, SYSVAR_SLOT_HASHES_PUBKEY } from "@solana/web3.js";
import { TOKEN_METADATA_PROGRAM_ID, AddOrRefillTagAccounts, AddOrRefillTagParams, ClaimTagAccounts, ClaimTagAdditionalArgs, ClaimTagParams, InitializeAccounts } from "./cupcake_program";
import { getConfig, getTag, getTokenRecordPDA, getUserHotPotatoToken, getUserInfo } from "./pda";
import { CANDY_MACHINE_ADDRESS, getCandyMachineCreator, getCollectionPDA, getEditionMarkPda, getMasterEdition, getMetadata } from "./utils/mpl";

export class CupcakeInstruction {
  id: PublicKey;
  program: Program;

  constructor(args: { id: PublicKey; program: Program }) {
    this.id = args.id;
    this.program = args.program;
  }

  async initialize(_args: {}, accounts: InitializeAccounts, _additionalArgs = {}) {
    if (
      accounts.authority &&
      accounts.authorityKeypair &&
      !accounts.authority.equals(accounts.authorityKeypair.publicKey)
    ) {
      throw new Error('Authority and authority keypair must match if both present');
    }

    const authority =
      accounts.authority ||
      accounts.authorityKeypair?.publicKey ||
      (this.program.provider as Provider).wallet.publicKey;

    const [config, _configBump] = await getConfig(this.program, authority);

    return {
      transactions: [
        {
          instructions: [
            await this.program.methods
              .initialize()
              .accounts({
                config,
                authority,
                payer: (this.program.provider as Provider).wallet.publicKey,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,
              })
              .instruction(),
          ],
          signers: accounts.authorityKeypair ? [accounts.authorityKeypair] : [],
        },
      ],
    };
  }

  async addOrRefillTag(args: AddOrRefillTagParams, accounts: AddOrRefillTagAccounts, _additionalArgs = {}) {
    if (
      accounts.authority &&
      accounts.authorityKeypair &&
      !accounts.authority.equals(accounts.authorityKeypair.publicKey)
    ) {
      throw new Error('Authority and authority keypair must match if both present');
    }

    if (
      accounts.tagAuthority &&
      accounts.tagAuthorityKeypair &&
      !accounts.tagAuthority.equals(accounts.tagAuthorityKeypair.publicKey)
    ) {
      throw new Error('Tag Authority and tag authority keypair must match if both present');
    }

    const authority =
      accounts.authority ||
      accounts.authorityKeypair?.publicKey ||
      (this.program.provider as Provider).wallet.publicKey;

    const tagAuthority =
      accounts.tagAuthority ||
      accounts.tagAuthorityKeypair?.publicKey ||
      (this.program.provider as Provider).wallet.publicKey;

    const [config, _configBump] = await getConfig(this.program, authority);
    const [tag, _tagBump] = await getTag(this.program, args.uid, authority);
    const signers = [];

    if (accounts.authorityKeypair) {
      signers.push(accounts.authorityKeypair);
    }

    if (accounts.tagAuthorityKeypair) {
      signers.push(accounts.tagAuthorityKeypair);
    }

    const remainingAccounts = [];

    if (args.tagType.walletRestrictedFungible || args.tagType.refillable1Of1 || args.tagType.singleUse1Of1 || args.tagType.refillable1Of1) {
      const configTokenAta = getAssociatedTokenAddressSync(accounts.tokenMint, authority);

      remainingAccounts.push({ pubkey: accounts.tokenMint, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: configTokenAta, isWritable: true, isSigner: false });

      if (args.tagType.programmableUnique) {
        // Always add the Metadata and MasterEdition accounts
        const metadataPDA = await getMetadata(accounts.tokenMint);
        const masterEditionPDA = await getMasterEdition(accounts.tokenMint);
        remainingAccounts.push({ pubkey: metadataPDA, isWritable: false, isSigner: false });
        remainingAccounts.push({ pubkey: masterEditionPDA, isWritable: false, isSigner: false });

        // Fetch the metadata account info to check for programmable status
        const metadata = await Metadata.fromAccountAddress(
          this.program.provider.connection, 
          metadataPDA
        );

        // Check if this is a pNFT
        if (metadata.programmableConfig) {
          const tokenRecordPDA = await getTokenRecordPDA(accounts.tokenMint, configTokenAta);
          remainingAccounts.push({ pubkey: tokenRecordPDA, isWritable: false, isSigner: false });
        } else {
          remainingAccounts.push({ pubkey: TOKEN_METADATA_PROGRAM_ID, isWritable: false, isSigner: false });
        }

        // Check if this is a pNFT without a RuleSet
        if (metadata.programmableConfig?.ruleSet) {
          remainingAccounts.push({ pubkey: metadata.programmableConfig.ruleSet, isWritable: false, isSigner: false });
        } else {
          remainingAccounts.push({ pubkey: TOKEN_METADATA_PROGRAM_ID, isWritable: false, isSigner: false });
        }

        // Always add the Programs and SysvarInstructions
        remainingAccounts.push({ pubkey: TokenAuth.PROGRAM_ID, isWritable: false, isSigner: false });
        remainingAccounts.push({ pubkey: TOKEN_METADATA_PROGRAM_ID, isWritable: false, isSigner: false });
        remainingAccounts.push({ pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isWritable: false, isSigner: false });
      }
    } else if (args.tagType.hotPotato) {
      const configTokenAta = getAssociatedTokenAddressSync(accounts.tokenMint, authority);

      remainingAccounts.push({ pubkey: accounts.tokenMint, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: configTokenAta, isWritable: true, isSigner: false });
      remainingAccounts.push({
        pubkey: await getMasterEdition(accounts.tokenMint),
        isWritable: false,
        isSigner: false,
      });
      remainingAccounts.push({ pubkey: TOKEN_METADATA_PROGRAM_ID, isWritable: false, isSigner: false });
    } else if (args.tagType.limitedOrOpenEdition) {
      remainingAccounts.push({ pubkey: accounts.tokenMint, isWritable: false, isSigner: false });
    } else if (args.tagType.candyMachineDrop) {
      remainingAccounts.push({ pubkey: accounts.candyMachine, isWritable: false, isSigner: false });

      remainingAccounts.push({
        pubkey: accounts.whitelistMint || SystemProgram.programId,
        isWritable: false,
        isSigner: false,
      });

      remainingAccounts.push({
        pubkey:
          args.minterPays || !accounts.whitelistMint
            ? SystemProgram.programId
            : getAssociatedTokenAddressSync(accounts.whitelistMint, authority),
        isWritable: accounts.whitelistMint && !args.minterPays,
        isSigner: false,
      });

      remainingAccounts.push({
        pubkey: accounts.paymentTokenMint || SystemProgram.programId,
        isWritable: false,
        isSigner: false,
      });

      remainingAccounts.push({
        pubkey:
          args.minterPays || !accounts.paymentTokenMint
            ? SystemProgram.programId
            : getAssociatedTokenAddressSync(accounts.paymentTokenMint, authority),
        isWritable: accounts.paymentTokenMint && !args.minterPays,
        isSigner: false,
      });
    }

    return {
      transactions: [
        {
          instructions: [
            await this.program.methods
              .addOrRefillTag(args)
              .accounts({
                authority,
                config,
                tagAuthority,
                payer: (this.program.provider as Provider).wallet.publicKey,
                tag,
                systemProgram: SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                rent: SYSVAR_RENT_PUBKEY,
              })
              .remainingAccounts(remainingAccounts)
              .instruction(),
          ],
          signers,
        },
      ],
    };
  }

  async claimTag(args: ClaimTagParams, accounts: ClaimTagAccounts, additionalArgs: ClaimTagAdditionalArgs) {
    if (
      accounts.tagAuthority &&
      accounts.tagAuthorityKeypair &&
      !accounts.tagAuthority.equals(accounts.tagAuthorityKeypair.publicKey)
    ) {
      throw new Error('Tag Authority and tag authority keypair must match if both present');
    }

    const tagAuthority =
      accounts.tagAuthority ||
      accounts.tagAuthorityKeypair?.publicKey ||
      (this.program.provider as Provider).wallet.publicKey;

    if (accounts.user && accounts.userKeypair && !accounts.user.equals(accounts.userKeypair.publicKey)) {
      throw new Error('User and user keypair must match if both present');
    }

    const user =
      accounts.user || accounts.userKeypair?.publicKey || (this.program.provider as Provider).wallet.publicKey;

    const payer = args.minterPays ? user : (this.program.provider as Provider).wallet.publicKey;

    if (
      accounts.newMintAuthority &&
      accounts.newMintAuthorityKeypair &&
      !accounts.newMintAuthority.equals(accounts.newMintAuthorityKeypair.publicKey)
    ) {
      throw new Error('Mint authority and mint authority keypair must match if both present');
    }

    const newMintAuthority =
      accounts.newMintAuthority || accounts.newMintAuthorityKeypair?.publicKey || args.minterPays
        ? accounts.userKeypair.publicKey
        : (this.program.provider as Provider).wallet.publicKey;

    const tagObj = additionalArgs.tag;
    const configObj = additionalArgs.config;

    const [config, _configBump] = await getConfig(this.program, configObj.authority);
    const [tag, _tagBump] = await getTag(this.program, tagObj.uid, configObj.authority);
    const signers = [];
    const newMintSigners = [];
    const priorInstructions = [];
    const postInstructions = [];

    if (
      accounts.userKeypair &&
      user.equals(accounts.userKeypair.publicKey) &&
      (args.minterPays || tagObj.tagType.hotPotato)
    ) {
      signers.push(accounts.userKeypair);
    }

    if (accounts.tagAuthorityKeypair && tagAuthority.equals(accounts.tagAuthorityKeypair.publicKey)) {
      signers.push(accounts.tagAuthorityKeypair);
    }

    if (accounts.newMintAuthorityKeypair && newMintAuthority.equals(accounts.newMintAuthorityKeypair.publicKey)) {
      signers.push(accounts.newMintAuthorityKeypair);
    }

    const remainingAccounts = [];

    const configTokenAta = getAssociatedTokenAddressSync(tagObj.tokenMint, configObj.authority);

    const newTokenMintKeypair = Keypair.generate();
    const newTokenInfo = {
      newTokenMint: accounts.newTokenMint || newTokenMintKeypair.publicKey,
      newMetadata: null,
      newEdition: null,
    };

    // default is a normal token transfer of some kind, but if candy or edition,
    // reset to new token mint
    let userAta = getAssociatedTokenAddressSync(tagObj.tokenMint, user);

    if (tagObj.tagType.limitedOrOpenEdition || tagObj.tagType.candyMachineDrop) {
      newTokenInfo.newMetadata = await getMetadata(newTokenInfo.newTokenMint);
      newTokenInfo.newEdition = await getMasterEdition(newTokenInfo.newTokenMint);
      userAta = getAssociatedTokenAddressSync(newTokenInfo.newTokenMint, user);

      if (newTokenInfo.newTokenMint.equals(newTokenMintKeypair.publicKey)) {
        newMintSigners.push(newTokenMintKeypair);
        if (accounts.userKeypair && args.minterPays) newMintSigners.push(accounts.userKeypair);

        priorInstructions.push(
          SystemProgram.createAccount({
            fromPubkey: payer,
            newAccountPubkey: newTokenInfo.newTokenMint,
            space: MintLayout.span,
            lamports: await this.program.provider.connection.getMinimumBalanceForRentExemption(MintLayout.span),
            programId: TOKEN_PROGRAM_ID,
          })
        );
        priorInstructions.push(createInitializeMintInstruction(newTokenInfo.newTokenMint, 0, newMintAuthority, payer));
        priorInstructions.push(
          createAssociatedTokenAccountInstruction(payer, userAta, user, newTokenInfo.newTokenMint)
        );
        priorInstructions.push(
          createMintToInstruction(newTokenInfo.newTokenMint, userAta, newMintAuthority, 1)
        );
      }
    } else if (additionalArgs.createAta) {
      priorInstructions.push(createAssociatedTokenAccountInstruction(payer, userAta, user, tagObj.tokenMint));
    }

    if (tagObj.tagType.walletRestrictedFungible || tagObj.tagType.refillable1Of1 || tagObj.tagType.singleUse1Of1 || tagObj.tagType.programmableUnique) {
      remainingAccounts.push({ pubkey: configTokenAta, isWritable: true, isSigner: false });
      remainingAccounts.push({ pubkey: userAta, isWritable: true, isSigner: false });

      if (tagObj.tagType.programmableUnique) {
        // Always add the BakeryAuthority, TokenMint, Metadata, and MasterEdition accounts
        const metadataPDA = await getMetadata(tagObj.tokenMint);
        const masterEditionPDA = await getMasterEdition(tagObj.tokenMint);
        remainingAccounts.push({ pubkey: configTokenAta, isWritable: true, isSigner: false });
        remainingAccounts.push({ pubkey: tagObj.tokenMint, isWritable: true, isSigner: false });
        remainingAccounts.push({ pubkey: metadataPDA, isWritable: true, isSigner: false });
        remainingAccounts.push({ pubkey: masterEditionPDA, isWritable: true, isSigner: false });

        // Fetch the metadata account info to check for programmable status
        const metadata = await Metadata.fromAccountAddress(
          this.program.provider.connection, 
          metadataPDA
        );

        // Check if this is a pNFT
        if (metadata.programmableConfig) {
          const tokenRecordPDA = await getTokenRecordPDA(tagObj.tokenMint, configTokenAta);
          const destinationTokenRecordPDA = await getTokenRecordPDA(tagObj.tokenMint, userAta);
          remainingAccounts.push({ pubkey: tokenRecordPDA, isWritable: false, isSigner: false });
          remainingAccounts.push({ pubkey: destinationTokenRecordPDA, isWritable: false, isSigner: false });
        } else {
          remainingAccounts.push({ pubkey: TOKEN_METADATA_PROGRAM_ID, isWritable: false, isSigner: false });
          remainingAccounts.push({ pubkey: TOKEN_METADATA_PROGRAM_ID, isWritable: false, isSigner: false });
        }

        // Check if this is a pNFT without a RuleSet
        if (metadata.programmableConfig?.ruleSet) {
          remainingAccounts.push({ pubkey: metadata.programmableConfig.ruleSet, isWritable: false, isSigner: false });
        } else {
          remainingAccounts.push({ pubkey: TOKEN_METADATA_PROGRAM_ID, isWritable: false, isSigner: false });
        }

        // Always add the Programs and SysvarInstructions
        remainingAccounts.push({ pubkey: TokenAuth.PROGRAM_ID, isWritable: false, isSigner: false });
        remainingAccounts.push({ pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isWritable: false, isSigner: false });
        remainingAccounts.push({ pubkey: TOKEN_METADATA_PROGRAM_ID, isWritable: false, isSigner: false });
        remainingAccounts.push({ pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isWritable: false, isSigner: false });
      }
    } else if (tagObj.tagType.hotPotato) {
      remainingAccounts.push({ pubkey: tagObj.currentTokenLocation, isWritable: true, isSigner: false });
      remainingAccounts.push({
        pubkey: (await getUserHotPotatoToken(this.program, tagObj.uid, configObj.authority, user, tagObj.tokenMint))[0],
        isWritable: true,
        isSigner: false,
      });
      remainingAccounts.push({
        pubkey: await getMasterEdition(tagObj.tokenMint),
        isWritable: true,
        isSigner: false,
      });
      remainingAccounts.push({ pubkey: tagObj.tokenMint, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: TOKEN_METADATA_PROGRAM_ID, isWritable: false, isSigner: false });
      // Add user as signer to force signer since anchor wont do it
      remainingAccounts.push({ pubkey: user, isWritable: false, isSigner: true });
    } else if (tagObj.tagType.limitedOrOpenEdition) {
      remainingAccounts.push({ pubkey: tagObj.tokenMint, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: configTokenAta, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: newTokenInfo.newTokenMint, isWritable: true, isSigner: false });
      remainingAccounts.push({ pubkey: newTokenInfo.newMetadata, isWritable: true, isSigner: false });
      remainingAccounts.push({ pubkey: newTokenInfo.newEdition, isWritable: true, isSigner: false });
      remainingAccounts.push({ pubkey: await getMetadata(tagObj.tokenMint), isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: await getMasterEdition(tagObj.tokenMint), isWritable: true, isSigner: false });
      if (!additionalArgs.nextEdition) throw new Error('Need to set edition');
      if (!accounts.updateAuthority) throw new Error('Need update authority of current token');
      console.log(additionalArgs.nextEdition)
      remainingAccounts.push({
        pubkey: await getEditionMarkPda(tagObj.tokenMint, parseInt(additionalArgs.nextEdition.toString())),
        isWritable: true,
        isSigner: false,
      });
      remainingAccounts.push({ pubkey: newMintAuthority, isWritable: true, isSigner: true });

      if (accounts.newMintAuthorityKeypair) signers.push(accounts.newMintAuthorityKeypair);
      remainingAccounts.push({ pubkey: accounts.updateAuthority, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: TOKEN_METADATA_PROGRAM_ID, isWritable: false, isSigner: false });
    } else if (tagObj.tagType.candyMachineDrop) {
      remainingAccounts.push({ pubkey: accounts.candyMachine, isWritable: true, isSigner: false });
      remainingAccounts.push({
        pubkey: (await getCandyMachineCreator(accounts.candyMachine))[0],
        isWritable: false,
        isSigner: false,
      });
      remainingAccounts.push({ pubkey: accounts.candyMachineWallet, isWritable: true, isSigner: false });
      remainingAccounts.push({ pubkey: newTokenInfo.newTokenMint, isWritable: true, isSigner: false });
      remainingAccounts.push({ pubkey: newTokenInfo.newMetadata, isWritable: true, isSigner: false });
      remainingAccounts.push({ pubkey: newTokenInfo.newEdition, isWritable: true, isSigner: false });
      remainingAccounts.push({ pubkey: newMintAuthority, isWritable: true, isSigner: true });
      remainingAccounts.push({ pubkey: TOKEN_METADATA_PROGRAM_ID, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: CANDY_MACHINE_ADDRESS, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: SYSVAR_CLOCK_PUBKEY, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isWritable: false, isSigner: false });

      if (!tagObj.whitelistMint.equals(SystemProgram.programId))
        remainingAccounts.push({
          pubkey: getAssociatedTokenAddressSync(tagObj.whitelistMint, tagObj.minterPays ? user : configObj.authority),
          isWritable: true,
          isSigner: false,
        });

      if (tagObj.whitelistBurn) {
        remainingAccounts.push({
          pubkey: tagObj.whitelistMint,
          isWritable: true,
          isSigner: false,
        });
      }

      if (!tagObj.tokenMint.equals(SystemProgram.programId)) {
        remainingAccounts.push({
          pubkey: getAssociatedTokenAddressSync(tagObj.tokenMint, tagObj.minterPays ? user : configObj.authority),
          isWritable: true,
          isSigner: false,
        });
      }
    }

    if (accounts.collectionMasterEdition) {
      if (!additionalArgs.candyProgram) {
        throw new Error('Must pass in candy program if using candy drop');
      }

      const collectionPDA = (await getCollectionPDA(accounts.candyMachine))[0];
      postInstructions.unshift(
        await additionalArgs.candyProgram.methods
          .setCollectionDuringMint()
          .accounts({
            candyMachine: accounts.candyMachine,
            metadata: newTokenInfo.newMetadata,
            payer,
            collectionPda: collectionPDA,
            tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
            instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
            collectionMint: accounts.collectionMint,
            collectionMetadata: accounts.collectionMetadata,
            collectionMasterEdition: accounts.collectionMasterEdition,
            authority: accounts.candyMachineAuthority,
            collectionAuthorityRecord: accounts.collectionAuthorityRecord,
          })
          .instruction()
      );
    }

    const instruction = await this.program.methods
      .claimTag(args.creatorBump)
      .accounts({
        user,
        payer,
        config,
        tagAuthority,
        tag,
        userInfo: (await getUserInfo(this.program, tagObj.uid, configObj.authority, user))[0],
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .remainingAccounts(remainingAccounts)
      .instruction();

    if (accounts.collectionMasterEdition) {
      return {
        transactions: [
          {
            instructions: priorInstructions,
            signers: newMintSigners,
            feePayer: payer,
          },
          {
            instructions: [instruction, ...postInstructions],
            signers: [...signers],
            feePayer: payer,
          },
        ],
      };
    } else {
      return {
        transactions: [
          {
            instructions: [...priorInstructions, instruction, ...postInstructions],
            signers: [...signers, ...newMintSigners],
            feePayer: payer,
          },
        ],
      };
    }
  }
}
