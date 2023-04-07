use anchor_lang::{prelude::*, solana_program::system_program};
use anchor_spl::token::{Approve, approve, Mint};

use crate::{instructions::AddOrRefillTag, errors::ErrorCode, utils::assert_is_ata, state::{Tag, TagType}};

use super::AddOrRefillTagParams;

pub fn handler<'a, 'b, 'c, 'info>(
  ctx: Context<'a, 'b, 'c, 'info, AddOrRefillTag<'info>>,
  tag_params: AddOrRefillTagParams
) -> Result<()> {
    let config = &ctx.accounts.config;
    let tag = &mut ctx.accounts.tag;
    let tag_authority = &ctx.accounts.tag_authority;
    let token_program = &ctx.accounts.token_program;

    let candy_machine = &ctx.remaining_accounts[0];
    let whitelist_mint = &ctx.remaining_accounts[1];
    let whitelist_token = &ctx.remaining_accounts[2];
    let payment_token_mint = &ctx.remaining_accounts[3];
    let payment_token = &ctx.remaining_accounts[4];

    // If the CandyMachine is whitelisted, and minter_pays is false,
    // ensure the Bakery has an ATA for the whitelist token.
    require!(
        whitelist_mint.key() == system_program::ID
            || whitelist_token.key() != system_program::ID
            || tag_params.minter_pays,
        ErrorCode::MustProvideWhitelistTokenIfMinterIsNotProvidingIt
    );

    // If the CandyMachine required payment for mints, the payment
    // token is not native SOL, and minter_pays is false,
    // ensure the Bakery has an ATA for the payment token.
    require!(
        payment_token_mint.key() == system_program::ID
            || payment_token.key() != system_program::ID
            || tag_params.minter_pays,
        ErrorCode::MustProvidePaymentAccountIfMinterIsNotProviding
    );

    // Verify that the provided whitelist token accounts
    // are legitimate, then delegate them to the Bakery PDA. 
    if whitelist_mint.key() != system_program::ID
        && whitelist_token.key() != system_program::ID
    {
        let _wl_mint: Account<Mint> = Account::try_from(&whitelist_mint)?;
        assert_is_ata(
            &whitelist_token,
            &ctx.accounts.config.authority.key(),
            &whitelist_mint.key(),
            Some(&ctx.accounts.config.key()),
        )?;
        let cpi_accounts = Approve {
            to: whitelist_token.clone(),
            delegate: ctx.accounts.config.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
        approve(context, tag_params.num_claims)?;
    }

    // Verify that the provided payment token accounts
    // are legitimate, then delegate them to the Bakery PDA. 
    if payment_token_mint.key() != system_program::ID
        && payment_token.key() != system_program::ID
    {
        let _mint: Account<Mint> = Account::try_from(&payment_token_mint)?;
        assert_is_ata(
            &payment_token,
            &ctx.accounts.config.authority.key(),
            &payment_token_mint.key(),
            Some(&ctx.accounts.config.key()),
        )?;
        let cpi_accounts = Approve {
            to: payment_token.clone(),
            delegate: ctx.accounts.config.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
        approve(
            context,
            tag_params
                .price_per_mint
                .unwrap()
                .checked_mul(tag_params.num_claims)
                .ok_or(ErrorCode::NumericalOverflowError)?,
        )?;
    }

    let new_sprinkle = Tag {
        uid: tag_params.uid,
        tag_type: TagType::CandyMachineDrop,
        tag_authority: tag_authority.key(),
        config: config.key(),
        token_mint: payment_token_mint.key(),
        candy_machine: candy_machine.key(),
        whitelist_mint: whitelist_mint.key(),
        total_supply: tag_params.num_claims,
        per_user: tag_params.per_user,
        num_claimed: tag.num_claimed,
        minter_pays: tag_params.minter_pays,
        whitelist_burn: tag_params.whitelist_burn,
        bump: *ctx.bumps.get("tag").unwrap(),

        current_token_location: tag.current_token_location,
    };
    tag.set_inner(new_sprinkle);

    Ok(())
}