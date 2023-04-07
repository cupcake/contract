use anchor_lang::{prelude::*, solana_program::program::invoke_signed};
use anchor_spl::token::{SetAuthority, set_authority, Mint, TokenAccount};
use mpl_token_metadata::instruction::freeze_delegated_account;

use crate::{instructions::AddOrRefillTag, errors::ErrorCode, utils::assert_keys_equal, state::{PDA_PREFIX, TagType, Tag}};

use super::AddOrRefillTagParams;

pub fn handler<'a, 'b, 'c, 'info>(
  ctx: Context<'a, 'b, 'c, 'info, AddOrRefillTag<'info>>,
  tag_params: AddOrRefillTagParams
) -> Result<()> {
    let config = &ctx.accounts.config;
    let tag = &mut ctx.accounts.tag;
    let tag_authority = &mut ctx.accounts.tag_authority;
    let config_seeds = &[&PDA_PREFIX[..], &config.authority.as_ref()[..], &[config.bump]];

    let token_mint = &ctx.remaining_accounts[0];
    let token = &ctx.remaining_accounts[1];
    let edition = &ctx.remaining_accounts[2];
    let token_metadata_program = &ctx.remaining_accounts[3];

    // Check that the provided token is legitimate.
    let _mint: Account<Mint> = Account::try_from(token_mint)?;
    let token_account: Account<TokenAccount> = Account::try_from(token)?;

    // Ensure the provided TokenMetadataProgramId is legitimate.
    assert_keys_equal(
        token_metadata_program.key(),
        mpl_token_metadata::ID,
    )?;

    require!(
        tag.uid == 0
            || tag.current_token_location == token.key()
            || token_account.amount == 1,
        ErrorCode::CanOnlyMutateHotPotatoWhenAtHome
    );

    // If the token isn't already frozen, freeze it now.
    if token_account.state != spl_token::state::AccountState::Frozen {
        let cpi_accounts = SetAuthority {
            current_authority: ctx.accounts.authority.to_account_info(),
            account_or_mint: token.clone(),
        };
        let context = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
        );
        set_authority(
            context,
            spl_token::instruction::AuthorityType::CloseAccount,
            Some(config.key()),
        )?;
        invoke_signed(
            &freeze_delegated_account(
                token_metadata_program.key(),
                config.key(),
                token.key(),
                edition.key(),
                token_mint.key(),
            ),
            &[
                token_metadata_program.clone(),
                config.to_account_info(),
                token.clone(),
                edition.clone(),
                token_mint.clone(),
            ],
            &[&config_seeds[..]],
        )?;
    }

    let new_sprinkle = Tag {
        uid: tag_params.uid,
        tag_type: TagType::HotPotato,
        total_supply: 1,
        per_user: 1,
        token_mint: token_mint.key(),
        config: config.key(),
        tag_authority: tag_authority.key(),
        current_token_location: token.key(),
        num_claimed: tag.num_claimed,
        minter_pays: tag_params.minter_pays,
        bump: *ctx.bumps.get("tag").unwrap(),
        
        candy_machine: tag.candy_machine,
        whitelist_mint: tag.whitelist_mint,
        whitelist_burn: tag_params.whitelist_burn,
    };
    tag.set_inner(new_sprinkle);

    Ok(())
}