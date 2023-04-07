use anchor_lang::{prelude::*, solana_program::{program::invoke_signed, instruction::Instruction}};
use anchor_spl::token::{Mint, Approve, approve};
use mpl_token_auth_rules::payload::Payload;
use mpl_token_metadata::{state::{Metadata, TokenRecord, TokenMetadataAccount}, instruction::{DelegateArgs, MetadataInstruction, RevokeArgs}, processor::AuthorizationData};

use crate::{instructions::AddOrRefillTag, state::{TagType, PDA_PREFIX, Tag}, errors::ErrorCode, utils::assert_is_ata};

use super::AddOrRefillTagParams;

pub fn handler<'a, 'b, 'c, 'info>(
  ctx: Context<'a, 'b, 'c, 'info, AddOrRefillTag<'info>>,
  tag_params: AddOrRefillTagParams
) -> Result<()> {
    let tag = &mut ctx.accounts.tag;
    let tag_authority = &mut ctx.accounts.tag_authority;
    let config = &ctx.accounts.config;
    let token_program = &ctx.accounts.token_program;
    let config_seeds = &[&PDA_PREFIX[..], &config.authority.as_ref()[..], &[config.bump]];

    let token_mint = &ctx.remaining_accounts[0];
    let token = &ctx.remaining_accounts[1];

    // Check that the provided ATA is legitimate.
    assert_is_ata(
        token,
        &ctx.accounts.config.authority.key(),
        &token_mint.key(),
        Some(&ctx.accounts.config.key()),
    )?;

    // Check that the provided mint is legitimate.
    let _mint: Account<Mint> = Account::try_from(token_mint)?;

    // Determine the total_supply of the new or updated Sprinkle.
    let total_supply = match tag.tag_type {
        // SingleUse1Of1s and HotPotatos can only have a total_supply of 1.
        TagType::SingleUse1Of1 => 1,

        // Only increment total supply if the sprinkle is empty
        TagType::Refillable1Of1 => {
            if tag.num_claimed == tag.total_supply
            {
                tag.total_supply
                    .checked_add(1)
                    .ok_or(ErrorCode::NumericalOverflowError)?
            } else {
                tag.total_supply
            }
        }

        // For all other cases, accept the user-provided value.
        _ => tag_params.num_claims,
    };

    let mut is_programmable = false;
    if ctx.remaining_accounts.len() > 2 {
        let token_metadata_info = &ctx.remaining_accounts[2];
        let token_metadata = Metadata::from_account_info(token_metadata_info)?;
        is_programmable = token_metadata.programmable_config != None;
    }


    match is_programmable {
        false => {
            let cpi_accounts = Approve {
                to: token.clone(),
                delegate: ctx.accounts.config.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            };
            let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
            approve(context, total_supply)?;
        },

        true => {
            let token_metadata_info = &ctx.remaining_accounts[2];
            let token_edition = &ctx.remaining_accounts[3];
            let token_record_info = &ctx.remaining_accounts[4];
            let token_ruleset = &ctx.remaining_accounts[5];
            let token_ruleset_program = &ctx.remaining_accounts[6];
            let token_metadata_program = &ctx.remaining_accounts[7];
            let instructions_sysvar = &ctx.remaining_accounts[8];

            let account_metas = vec![
                AccountMeta::new_readonly(token_metadata_program.key(), false),
                AccountMeta::new_readonly(config.key(), false),
                AccountMeta::new(token_metadata_info.key(), false),
                AccountMeta::new_readonly(token_edition.key(), false),
                AccountMeta::new(token_record_info.key(), false),
                AccountMeta::new_readonly(token_mint.key(), false),
                AccountMeta::new(token.key(), false),
                AccountMeta::new_readonly(ctx.accounts.authority.key(), true),
                AccountMeta::new_readonly(ctx.accounts.payer.key(), true),
                AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
                AccountMeta::new_readonly(instructions_sysvar.key(), false),
                AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
                AccountMeta::new_readonly(token_ruleset_program.key(), false),
                AccountMeta::new_readonly(token_ruleset.key(), false),
            ];
            let account_infos = [
                token_metadata_program.clone(),
                config.to_account_info(),
                token_metadata_info.clone(),
                token_edition.clone(),
                token_record_info.clone(),
                token_mint.clone(),
                token.clone(),
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                instructions_sysvar.clone(),
                ctx.accounts.token_program.to_account_info(),
                token_ruleset_program.clone(),
                token_ruleset.clone()
            ];

          // We need to revoke the active delegation for the token record if it exists
          let token_record = TokenRecord::from_account_info(&token_record_info)?;
          if token_record.delegate.is_some() {
              msg!("has delegate");
              let revoke_account_metas = vec![
                  AccountMeta::new_readonly(token_metadata_program.key(), false),
                  AccountMeta::new_readonly(config.key(), false),
                  AccountMeta::new(token_metadata_info.key(), false),
                  AccountMeta::new_readonly(token_edition.key(), false),
                  AccountMeta::new(token_record_info.key(), false),
                  AccountMeta::new_readonly(token_mint.key(), false),
                  AccountMeta::new(token.key(), false),
                  AccountMeta::new_readonly(ctx.accounts.authority.key(), true),
                  AccountMeta::new_readonly(ctx.accounts.payer.key(), true),
                  AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
                  AccountMeta::new_readonly(instructions_sysvar.key(), false),
                  AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
                  AccountMeta::new_readonly(token_ruleset_program.key(), false),
                  AccountMeta::new_readonly(token_ruleset.key(), false),
              ];
              let revoke_account_infos = [
                  token_metadata_program.clone(),
                  config.to_account_info(),
                  token_metadata_info.clone(),
                  token_edition.clone(),
                  token_record_info.clone(),
                  token_mint.clone(),
                  token.clone(),
                  ctx.accounts.authority.to_account_info(),
                  ctx.accounts.payer.to_account_info(),
                  ctx.accounts.system_program.to_account_info(),
                  instructions_sysvar.clone(),
                  ctx.accounts.token_program.to_account_info(),
                  token_ruleset_program.clone(),
                  token_ruleset.clone()
              ];
              let revoke_ix_data = MetadataInstruction::Revoke(
                  RevokeArgs::TransferV1
              );
              invoke_signed(
                  &Instruction {  
                      program_id: token_metadata_program.key(),
                      accounts: revoke_account_metas,
                      data: revoke_ix_data.try_to_vec().unwrap(),
                  }, 
                  &revoke_account_infos,
                  &[&config_seeds[..]],
              )?;
          } else {
            msg!("no delegate");
          }
          
          let ix_data = MetadataInstruction::Delegate(
              DelegateArgs::TransferV1 { 
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
          )?;
      }
  }

    // If the Sprinkle is a SingleUse1Of1, the per_user and total_supply values will both always be 1.
    tag.per_user = match tag.tag_type {
        TagType::SingleUse1Of1 => 1,
        _ => tag_params.per_user,
    };

    if tag.tag_type != TagType::SingleUse1Of1 {
        tag.total_supply = total_supply;
    } else {
        tag.total_supply = 1;
    }

    let new_sprinkle = Tag {
        total_supply,
        uid: tag_params.uid,
        tag_type: tag_params.tag_type,
        per_user: tag_params.per_user,
        token_mint: token_mint.key(),
        config: config.key(),
        tag_authority: tag_authority.key(),
        num_claimed: tag.num_claimed,
        minter_pays: tag_params.minter_pays,
        bump: *ctx.bumps.get("tag").unwrap(),

        candy_machine: tag.candy_machine,
        whitelist_mint: tag.whitelist_mint,
        whitelist_burn: tag_params.whitelist_burn,
        current_token_location: tag.current_token_location,
    };
    tag.set_inner(new_sprinkle);

    Ok(())
}