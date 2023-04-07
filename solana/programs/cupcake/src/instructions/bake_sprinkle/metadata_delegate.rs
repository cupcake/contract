use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::{instructions::AddOrRefillTag, state::{Tag, TagType}};

use super::AddOrRefillTagParams;

pub fn handler<'a, 'b, 'c, 'info>(
  ctx: Context<'a, 'b, 'c, 'info, AddOrRefillTag<'info>>,
  tag_params: AddOrRefillTagParams
) -> Result<()> {
    let config = &ctx.accounts.config;
    let tag = &mut ctx.accounts.tag;
    let tag_authority = &mut ctx.accounts.tag_authority;

    // Verify that the provided token mint is legitimate.
    let token_mint = &ctx.remaining_accounts[0];
    let _mint: Account<Mint> = Account::try_from(token_mint)?;

    let new_sprinkle = Tag {
        uid: tag_params.uid,
        tag_type: TagType::LimitedOrOpenEdition,
        total_supply: tag_params.num_claims,
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