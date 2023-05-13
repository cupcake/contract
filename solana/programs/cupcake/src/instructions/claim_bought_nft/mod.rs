use crate::errors::ErrorCode;
use crate::state::PDA_PREFIX;
use crate::state::{bakery::*, sprinkle::*};
use crate::utils::{move_hot_potato, MoveHotPotatoArgs};
use anchor_lang::prelude::*;
use anchor_spl::token::Token;

#[derive(Accounts)]
pub struct ClaimBoughtNFT<'info> {
    /// PDA which stores token approvals for a Bakery, and executes the transfer during claims.
    #[account(mut)]
    pub config: Box<Account<'info, Config>>,

    /// PDA which stores data about the state of a Sprinkle.
    #[account(mut)]
    pub tag: Box<Account<'info, Tag>>,

    /// Buyer
    /// CHECK:  this is safe
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// All of these accounts get checked in util function because of older code in
    /// claim_sprinkle, so we avoid doing redundant checks here, making them UncheckedAccounts.
    /// These all correspond to identical fields from claim_sprinkle.

    /// CHECK: No
    pub token_metadata: UncheckedAccount<'info>,
    /// CHECK: No
    pub token_metadata_program: UncheckedAccount<'info>,
    /// CHECK: No
    pub ata_program: UncheckedAccount<'info>,
    /// CHECK: No
    pub token_mint: UncheckedAccount<'info>,
    /// CHECK: No
    pub edition: UncheckedAccount<'info>,
    /// CHECK: No
    #[account(mut)]
    pub user_token_account: UncheckedAccount<'info>,
    /// CHECK: No
    #[account(mut)]
    pub token: UncheckedAccount<'info>,

    /// SPL System Program, required for account allocation.
    pub system_program: Program<'info, System>,

    /// SPL Token Program, required for transferring tokens.
    pub token_program: Program<'info, Token>,

    /// Rent
    pub rent: Sysvar<'info, Rent>,
}

/// Sort of a trimmed down version of claim-sprinkle, only for hot potato NFTs,
/// in the case for whena buyer just won a bid. Doesn't require tag authority to sign off like
/// claim does. That means you'd need to go through a lamdba, and we want programmatic access
/// to these contracts to work for liquidity purposes.
///
/// In actuality this handler could be used multiple times. If you are vault authority,
/// you should be able to reclaim your NFT at any time, but that is the most salient case.

pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, ClaimBoughtNFT<'info>>,
    creator_bump: u8, // Ignored except in hotpotato use. In hotpotato is used to make the token account.
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let tag = &mut ctx.accounts.tag;
    let token_metadata = &ctx.accounts.token_metadata;
    let token_metadata_program = &ctx.accounts.token_metadata_program;
    let ata_program = &ctx.accounts.ata_program;
    let token_mint = &ctx.accounts.token_mint;
    let edition = &ctx.accounts.edition;
    let user_token_account = &ctx.accounts.user_token_account;
    let token = &ctx.accounts.token;
    let buyer = &ctx.accounts.buyer;

    let config_seeds = &[
        &PDA_PREFIX[..],
        &config.authority.as_ref()[..],
        &[config.bump],
    ];

    require!(
        tag.vault_authority == Some(buyer.key()),
        ErrorCode::NotVaultAuthority
    );
    require!(
        tag.vault_state == VaultState::Vaulted
            || tag.vault_state == VaultState::InTransit
            || tag.vault_state == VaultState::UnvaultingRequested,
        ErrorCode::NotVaulted
    );
    move_hot_potato(MoveHotPotatoArgs {
        token_metadata: &token_metadata.to_account_info(),
        token_metadata_program: &token_metadata_program.to_account_info(),
        ata_program: &ata_program.to_account_info(),
        token_mint: &token_mint.to_account_info(),
        edition: &edition.to_account_info(),
        user_token_account: &user_token_account.to_account_info(),
        token: &token.to_account_info(),
        tag,
        config,
        user: &buyer.to_account_info(),
        rent: &ctx.accounts.rent,
        system_program: &ctx.accounts.system_program,
        token_program: &ctx.accounts.token_program,
        payer: buyer,
        creator_bump,
        config_seeds,
    })?;

    Ok(())
}
