use std::str::FromStr;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::program::{invoke_signed, invoke};
use anchor_lang::solana_program::system_program;
use anchor_spl::token::{self, Token};
use mpl_token_auth_rules::payload::Payload;
use mpl_token_metadata;
use mpl_token_metadata::instruction::{
    mint_new_edition_from_master_edition_via_token
};
use mpl_token_metadata::processor::AuthorizationData;
use mpl_token_metadata::state::{Metadata, TokenMetadataAccount};
use crate::errors::ErrorCode;
use crate::state::{PDA_PREFIX};
use crate::state::{bakery::*, sprinkle::*, user_info::*};
use crate::utils::{
    assert_is_ata, assert_keys_equal, 
    sighash, grab_update_authority, 
    get_master_edition_supply,
    move_hot_potato, MoveHotPotatoArgs
};

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct CandyMachineArgs {
    /// Discriminator of the CandyMachine instruction to hit.
    instruction: [u8; 8],

    /// Candy Machine creator bump used in PDA generation.
    creator_bump: u8,
}

#[derive(Accounts)]
pub struct ClaimTag<'info> {
    /// Account which receives the NFT claimed from this Sprinkle.
    /// CHECK: User can be any account that can sign a transaction.
    pub user: UncheckedAccount<'info>,

    /// Account which pays the network and rent fees, for this transaction only.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// PDA which stores token approvals for a Bakery, and executes the transfer during claims.
    #[account(mut)]
    pub config: Box<Account<'info, Config>>,

    /// Account which has the authority to execute claims for this Sprinkle.
    pub tag_authority: Signer<'info>,

    /// PDA which stores data about the state of a Sprinkle.
    #[account(mut, 
              has_one = tag_authority,
              seeds = [
                  PDA_PREFIX, 
                  config.authority.key().as_ref(), 
                  &tag.uid.to_le_bytes()
              ], 
              bump = tag.bump)]
    pub tag: Box<Account<'info, Tag>>,

    /// PDA which stores a counter of how many times this user has claimed this Sprinkle.
    #[account(init_if_needed, 
              payer = payer,
              space = UserInfo::SIZE, 
              seeds = [
                  PDA_PREFIX, 
                  config.authority.as_ref(), 
                  &tag.uid.to_le_bytes(), 
                  user.key().as_ref()
              ], 
              bump)]
    pub user_info: Box<Account<'info, UserInfo>>,

    /// SPL System Program, required for account allocation.
    pub system_program: Program<'info, System>,

    /// SPL Token Program, required for transferring tokens.
    pub token_program: Program<'info, Token>,

    /// SPL Rent Sysvar, required for account allocation.
    pub rent: Sysvar<'info, Rent>,
}

// Remaining accounts - 
    // SingleUse1Of1, Refillable1Of1, WalletRestrictedFungible:
        // token (w) - ata of token_mint type owned by config authority wallet
        // user_ata (w) - ata of token_mint type for user
        // If the underlying asset is Programmable, also:
            // bakery_auth
            // token_mint
            // token_metadata - Metadata account for the token
            // token_edition - Edition account for the token
            // token_metadata_program
            // associated_token_program - MPL Token Metadata Program
            // instructions_sysvar
    //
    // HotPotato:
        // token (w) - current location of token (as set in tag field)
        // user_token_account (w) - token account with seed [PREFIX, config.authority.as_ref(), &tag.uid.to_le_bytes(), user.key().as_ref(), tag.token_mint.to_le_bytes()]
        // will be initialized if not setup.
        // edition - existing edition of current token_mint
        // token_mint - token mint on the tag
        // token_metadata_program
    //
    // LimitedOrOpenEdition:
        // token_mint - token mint on the tag
        // token (w) - ata of config authority containing the token
        // new_token_mint (w) - new token mint, must be supply = 1, decimals = 0
        // new_metadata (w) - precomputed new metadata key(will be set by inner CPI here)
        // new_edition (w) - precomputed new edition key
        // metadata - existing metadata of current token_mint
        // master_edition (w) - existing master edition of current token_mint
        // edition_mark_pda (w) - What edition page this edition you are trying to mint is on
        // new_mint_authority (s) - Authority of new mint
        // update_authority - Authority of metadata
        // token_metadata_program
    //
    // CandyMachineDrop:
        // candy_machine_id (w)
        // candy_machine_creator (pda of candy_machine [PREFIX.as_bytes(), candy_machine.key().as_ref()])
        // new_token_mint (w) - new token mint, must be supply = 1, decimals = 0
        // new_metadata (w) - precomputed new metadata key(will be set by inner CPI here)
        // new_edition (w) - precomputed new edition key
        // new_mint_authority (s) - authority for freeze and mint on the mint object.
        // token_metadata_program
        // cmv2 program
        // clock sysvar
        // recent_slothashes
        // instruction_sysvar_account
        // > Only needed if candy machine has whitelist_mint_settings
        // whitelist_token_account (w) - either configs or yours depending on who pays
        // > Only needed if candy machine has whitelist_mint_settings and mode is BurnEveryTime
        // whitelist_token_mint (w)
        // > Only needed if candy machine has token mint
        // token_account_info (w) - either configs or yours depending on who pays
// -

pub fn handler<'a, 'b, 'c, 'info>(
  ctx: Context<'a, 'b, 'c, 'info, ClaimTag<'info>>,
  creator_bump: u8, // Ignored except in candy machine use and hotpotato use. In hotpotato is used to make the token account.
) -> Result<()> {   
    let tag = &mut ctx.accounts.tag;
    let tag_type: TagType = tag.tag_type;
    let config = &ctx.accounts.config;
    let payer = &ctx.accounts.payer;
    let user_info = &ctx.accounts.user_info;
    let user = &ctx.accounts.user;
    let config_seeds = &[&PDA_PREFIX[..], &config.authority.as_ref()[..], &[config.bump]];

    // Ensure the Sprinkle's total_supply value has not already been reached.
    // HotPotatos have no claim limits, so they are excluded from this check.
    // Sprinkles with a total_supply of 0 have unlimited claims, so they are excluded from this check.
    if tag.tag_type != TagType::HotPotato
        && (tag.total_supply > 0)
        && (tag.num_claimed == tag.total_supply)
    {
        return Err(ErrorCode::TagDepleted.into());
    };

    // Ensure the claiming user has not reached the Sprinkle's per_user value.
    // HotPotatos have no claim limits, so they are excluded from this check.
    require!(
        tag.tag_type == TagType::HotPotato || user_info.num_claimed < tag.per_user,
        ErrorCode::ClaimLimitExceeded
    );

    // Ensure that if the Sprinkle's minter_pays is set to true, 
    // the BakeryAuthority is not the one paying for the transaction fees.
    if tag.minter_pays {
        require!(config.authority != payer.key(), ErrorCode::AuthorityShouldNotBePayer);
    }

    let mut amount_to_claim = 1;

    match tag_type {
        TagType::LimitedOrOpenEdition => {
            let token_mint = &ctx.remaining_accounts[0];
            let token = &ctx.remaining_accounts[1];
            let new_token_mint = &ctx.remaining_accounts[2];
            let new_metadata = &ctx.remaining_accounts[3];
            let new_edition = &ctx.remaining_accounts[4];
            let metadata = &ctx.remaining_accounts[5];
            let master_edition = &ctx.remaining_accounts[6];
            let edition_mark_pda = &ctx.remaining_accounts[7];
            let new_mint_authority = &ctx.remaining_accounts[8];
            let update_authority = &ctx.remaining_accounts[9];
            let token_metadata_program = &ctx.remaining_accounts[10];

            // Make sure that the provided metadata accounts are legitimate.
            let update_auth = grab_update_authority(&metadata)?;
            assert_keys_equal(update_auth, update_authority.key())?;
            assert_keys_equal(tag.token_mint, token_mint.key())?;
            assert_keys_equal(
                token_metadata_program.key(),
                mpl_token_metadata::ID,
            )?;

            // Grab the MasterEdition supply, and incremment it to get the new Edition number.
            let edition = get_master_edition_supply(&master_edition)?
                .checked_add(1)
                .ok_or(ErrorCode::NumericalOverflowError)?;

            // CPI into the Token Metadata Program to print a new Edition from the MasterEdition.
            invoke(
                &mint_new_edition_from_master_edition_via_token(
                    token_metadata_program.key(),
                    new_metadata.key(),
                    new_edition.key(),
                    master_edition.key(),
                    new_token_mint.key(),
                    new_mint_authority.key(),
                    payer.key(),
                    config.authority,
                    token.key(),
                    update_auth,
                    metadata.key(),
                    token_mint.key(),
                    edition,
                ),
                &[
                    token_metadata_program.clone(),
                    new_metadata.clone(),
                    new_edition.clone(),
                    master_edition.clone(),
                    new_token_mint.clone(),
                    new_mint_authority.clone(),
                    payer.to_account_info(),
                    config.to_account_info(),
                    token.clone(),
                    update_authority.clone(),
                    metadata.clone(),
                    token_mint.clone(),
                    edition_mark_pda.clone(),
                    ctx.accounts.rent.to_account_info(),
                ],
            )?;
        }

        TagType::CandyMachineDrop => {
            let candy_machine_id = &ctx.remaining_accounts[0];
            let candy_machine_creator = &ctx.remaining_accounts[1];
            let candy_machine_wallet = &ctx.remaining_accounts[2];
            let new_token_mint = &ctx.remaining_accounts[3];
            let new_metadata = &ctx.remaining_accounts[4];
            let new_edition = &ctx.remaining_accounts[5];
            let new_mint_authority = &ctx.remaining_accounts[6];
            let token_metadata_program = &ctx.remaining_accounts[7];
            let candy_machine_program = &ctx.remaining_accounts[8];

            // These three are enforced by inner contract, no need to check
            let clock = &ctx.remaining_accounts[9];
            let recent_slothashes = &ctx.remaining_accounts[10];
            let instruction_sysvar_account = &ctx.remaining_accounts[11];

            // Ensure the CandyMachine is coming from Cupcake's forked program.
            assert_keys_equal(
                candy_machine_program.key(),
                Pubkey::from_str("DsRmdpRZJwagptu4MMN7GJWaPuwPgStWPUSbfAinYCg9").unwrap(),
            )?;

            // Begin assembling the list of account metas for CandyMachine CPIs.
            let mut ctr = 12;
            let mut keys = vec![
                AccountMeta::new(candy_machine_id.key(), false),
                AccountMeta::new_readonly(candy_machine_creator.key(), false),
                AccountMeta::new(payer.key(), true),
                AccountMeta::new(candy_machine_wallet.key(), false),
                AccountMeta::new(new_metadata.key(), false),
                AccountMeta::new(new_token_mint.key(), false),
                AccountMeta::new_readonly(new_mint_authority.key(), true),
                AccountMeta::new_readonly(new_mint_authority.key(), true),
                AccountMeta::new(new_edition.key(), false),
                AccountMeta::new_readonly(token_metadata_program.key(), false),
                AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
                AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
                AccountMeta::new_readonly(ctx.accounts.rent.key(), false),
                AccountMeta::new_readonly(clock.key(), false),
                AccountMeta::new_readonly(recent_slothashes.key(), false),
                AccountMeta::new_readonly(instruction_sysvar_account.key(), false),
            ];
            let mut accounts = vec![
                candy_machine_id.clone(),
                candy_machine_creator.clone(),
                payer.to_account_info(),
                candy_machine_wallet.clone(),
                new_metadata.clone(),
                new_token_mint.clone(),
                new_mint_authority.clone(),
                user.to_account_info(),
                new_edition.clone(),
                token_metadata_program.clone(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.rent.to_account_info(),
                clock.clone(),
                recent_slothashes.clone(),
                instruction_sysvar_account.clone(),
                candy_machine_program.clone(),
            ];

            // If the CandyMachine has a whitelist token, we need to include it in the account metas.
            if tag.whitelist_mint != system_program::ID {
                let whitelist_token_account = &ctx.remaining_accounts[ctr];
                keys.push(AccountMeta::new(whitelist_token_account.key(), false));
                accounts.push(whitelist_token_account.clone());
                ctr += 1;
                if tag.whitelist_burn {
                    let whitelist_token_mint = &ctx.remaining_accounts[ctr];
                    keys.push(AccountMeta::new(whitelist_token_mint.key(), false));
                    accounts.push(whitelist_token_mint.clone());

                    if !tag.minter_pays {
                        // use config pda delegate for burn
                        keys.push(AccountMeta::new_readonly(config.key(), true));
                        accounts.push(config.to_account_info());
                    } else {
                        keys.push(AccountMeta::new_readonly(user.key(), true));
                    }
                    ctr += 1;
                }
            }

            // If the CandyMachine has a payment token, we need to include it in the account metas.
            if tag.token_mint != system_program::ID {
                let token_account = &ctx.remaining_accounts[ctr];
                keys.push(AccountMeta::new(token_account.key(), false));
                accounts.push(token_account.clone());

                if !tag.minter_pays {
                    // use config pda delegate for tfer
                    keys.push(AccountMeta::new_readonly(config.key(), true));
                    accounts.push(config.to_account_info());
                } else {
                    keys.push(AccountMeta::new_readonly(user.key(), true));
                }
            }

            // Mint one NFT from the CandyMachine, to the claimer's wallet.
            invoke_signed(
                &Instruction {
                    program_id: candy_machine_program.key(),
                    accounts: keys,
                    data: AnchorSerialize::try_to_vec(&CandyMachineArgs {
                        instruction: sighash("global", "mint_nft"),
                        creator_bump,
                    })?,
                },
                &accounts,
                &[config_seeds],
            )?;
        }

        TagType::WalletRestrictedFungible
        | TagType::Refillable1Of1
        | TagType::SingleUse1Of1
        | TagType::ProgrammableUnique => {
            let token = &ctx.remaining_accounts[0];
            let user_ata = &ctx.remaining_accounts[1];

            let mut is_programmable = false;
            if ctx.remaining_accounts.len() > 2 {
                let token_metadata = Metadata::from_account_info(&ctx.remaining_accounts[4])?;
                is_programmable = token_metadata.programmable_config != None;
            }

            // Ensure both the Bakery and User ATAs are legitimate.
            assert_is_ata(
                &token,
                &ctx.accounts.config.authority,
                &tag.token_mint,
                Some(&ctx.accounts.config.key()),
            )?;
            assert_is_ata(
                &user_ata,
                &ctx.accounts.user.key(),
                &tag.token_mint,
                Some(&ctx.accounts.config.key()),
            )?;

            // Calculate the maximum number of tokens the user
            // can claim, without exceeding the per_user value.
            amount_to_claim = tag
                .per_user
                .checked_sub(ctx.accounts.user_info.num_claimed)
                .ok_or(ErrorCode::NumericalOverflowError)?;

            // Now, take the minimum of that value,
            // and the remaining supply in the Sprinkle.
            amount_to_claim = std::cmp::min(
                amount_to_claim,
                tag.total_supply
                    .checked_sub(tag.num_claimed)
                    .ok_or(ErrorCode::NumericalOverflowError)?,
            );

            match is_programmable {
                true => {
                    let bakery_authority = &ctx.remaining_accounts[2];
                    let token_mint = &ctx.remaining_accounts[3];
                    let token_metadata_info = &ctx.remaining_accounts[4];
                    let token_edition = &ctx.remaining_accounts[5];
                    let token_record_info = &ctx.remaining_accounts[6];
                    let destination_token_record = &ctx.remaining_accounts[7];
                    let token_ruleset = &ctx.remaining_accounts[8];
                    let token_auth_program = &ctx.remaining_accounts[9];
                    let associated_token_program = &ctx.remaining_accounts[10];
                    let token_metadata_program = &ctx.remaining_accounts[11];
                    let instructions_sysvar = &ctx.remaining_accounts[12];
                    // We need to CPI to TokenMetadataProgram to call Transfer for pNFTs, 
                    // which wraps the normal TokenProgram Transfer call.
                    let account_metas = vec![
                        AccountMeta::new(token.key(), false),
                        AccountMeta::new_readonly(bakery_authority.key(), false),
                        AccountMeta::new(user_ata.key(), false),
                        AccountMeta::new_readonly(user.key(), false),
                        AccountMeta::new_readonly(token_mint.key(), false),
                        AccountMeta::new(token_metadata_info.key(), false),
                        AccountMeta::new(token_edition.key(), false),
                        AccountMeta::new(token_record_info.key(), false),
                        AccountMeta::new(destination_token_record.key(), false),
                        AccountMeta::new_readonly(config.key(), true),
                        AccountMeta::new(payer.key(), true),
                        AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
                        AccountMeta::new_readonly(instructions_sysvar.key(), false),
                        AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
                        AccountMeta::new_readonly(associated_token_program.key(), false),
                        AccountMeta::new_readonly(token_auth_program.key(), false),
                        AccountMeta::new_readonly(token_ruleset.key(), false),
                    ];
                    let account_infos = [
                        token.clone(),
                        bakery_authority.to_account_info(),
                        user_ata.clone(),
                        user.to_account_info(),
                        token_mint.clone(),
                        token_metadata_info.clone(),
                        token_edition.clone(),
                        token_record_info.clone(),
                        destination_token_record.clone(),
                        config.to_account_info(),
                        payer.to_account_info(),
                        ctx.accounts.system_program.to_account_info(),
                        instructions_sysvar.clone(),
                        ctx.accounts.token_program.to_account_info(),
                        associated_token_program.clone(),
                        token_auth_program.clone(),
                        token_ruleset.clone(),
                    ];

                    let ix_data = 
                        mpl_token_metadata::instruction::MetadataInstruction::Transfer(
                            mpl_token_metadata::instruction::TransferArgs::V1 { 
                                amount: 1, 
                                authorization_data: Some(AuthorizationData { payload: Payload::new() }) 
                            }
                        );
                        
                    invoke_signed(
                        &Instruction {  
                            program_id: token_metadata_program.key(),
                            accounts: account_metas,
                            data: ix_data.try_to_vec().unwrap(),
                        }, 
                        &account_infos,
                        &[&config_seeds[..]],
                    )?
                },

                false => {
                    let cpi_accounts = token::Transfer {
                        from: token.clone(),
                        to: user_ata.clone(),
                        authority: ctx.accounts.config.to_account_info(),
                    };
                    let context = CpiContext::new(
                        ctx.accounts.token_program.to_account_info(), 
                        cpi_accounts
                    );
                    token::transfer(
                        context.with_signer(&[&config_seeds[..]]), 
                        amount_to_claim
                    )?
                }
            }
        }

        TagType::HotPotato => {
            let token = &ctx.remaining_accounts[0];
            let user_token_account = &ctx.remaining_accounts[1];
            let edition = &ctx.remaining_accounts[2];
            let token_mint = &ctx.remaining_accounts[3];
            let token_metadata_program = &ctx.remaining_accounts[4];


            // Disallow claiming while vaulted
            require!(tag.vault_state != VaultState::Vaulted && 
                tag.vault_state != VaultState::UnvaultingRequested, ErrorCode::CannotClaimVaulted);
            if tag.vault_state == VaultState::InTransit {
                require!(tag.vault_authority == Some(user.key()), ErrorCode::CanOnlyClaimAsVaultAuthority);
                tag.vault_state = VaultState::Unvaulted;
            }
            // Not required for other modes but is for this one.
            require!(user.is_signer, ErrorCode::UserMustSign);

            move_hot_potato(MoveHotPotatoArgs{
                token_metadata_program,
                token_mint,
                edition,
                user_token_account,
                token,
                tag,
                config,
                user,
                rent: &ctx.accounts.rent,
                system_program: &ctx.accounts.system_program,
                token_program: &ctx.accounts.token_program,
                payer,
                creator_bump,
                config_seeds,
            })?;
        }
    };

    // Increment the num_claimed counter in the claimer's UserInfoPDA.
    ctx.accounts.user_info.num_claimed = ctx
        .accounts
        .user_info
        .num_claimed
        .checked_add(amount_to_claim)
        .ok_or(ErrorCode::NumericalOverflowError)?;

    // Increment the num_claimed counter in the SprinklePDA.
    ctx.accounts.tag.num_claimed = ctx
        .accounts
        .tag
        .num_claimed
        .checked_add(amount_to_claim)
        .unwrap();

    Ok(())
}