use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Token, Mint, self, TokenAccount};
use crate::errors::ErrorCode;
use crate::state::{Config, Tag, TreasureChest, PDA_PREFIX};

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct ClaimFromTreasureChestParams {
    /// 
    treasure_num: u8,
}

#[derive(Accounts)]
pub struct ClaimFromTreasureChest<'info> {
    /// CHECK: todo
    pub claimer: UncheckedAccount<'info>,
    
    /// Account which pays the network and rent fees, for this transaction only.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Account which has the authority to create/update sprinkles for this Bakery.
    pub authority: UncheckedAccount<'info>,

    /// PDA which stores token approvals for a Bakery, and executes the transfer during claims.
    #[account(mut, 
              has_one = authority)]
    pub config: Box<Account<'info, Config>>,

    /// PDA which stores data about the state of a Sprinkle.
    #[account(mut, 
              has_one = config,
              has_one = tag_authority)]
    pub sprinkle: Box<Account<'info, Tag>>,

    #[account(mut)]
    pub tag_authority: Signer<'info>,

    /// TreasureChest PDA being initialized.
    #[account(mut, 
              has_one = sprinkle)]
    pub treasure_chest: Box<Account<'info, TreasureChest>>,

    pub token_mint: Account<'info, Mint>,

    #[account(mut,
              associated_token::mint = token_mint,
              associated_token::authority = authority)]
    pub token_location: Account<'info, TokenAccount>,

    #[account(init_if_needed,
              payer = payer,
              associated_token::mint = token_mint,
              associated_token::authority = claimer)]
    pub token_destination: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,

    pub token_program: Program<'info, Token>,

    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handle_claim_from_treasure_chest<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, ClaimFromTreasureChest<'info>>, 
    params: ClaimFromTreasureChestParams
) -> Result<()> {
    let bakery = &ctx.accounts.config;
    let token_mint = &ctx.accounts.token_mint;
    let token_location = &ctx.accounts.token_location;
    let token_destination = &ctx.accounts.token_destination;
    let token_program = &ctx.accounts.token_program;

    let treasure_chest = &mut ctx.accounts.treasure_chest;

    let bakery_seeds = &[
        &PDA_PREFIX[..], 
        &bakery.authority.as_ref()[..], 
        &[bakery.bump]
    ];

    require!(
        params.treasure_num as usize <= 10,
        ErrorCode::InvalidTreasureIndex,
    );

    let treasure_to_claim = treasure_chest.storage[params.treasure_num as usize];
    require!(
        token_mint.key() == treasure_to_claim.token_mint,
        ErrorCode::TreasureMintMismatch,
    );
    require!(
        !treasure_to_claim.retrieved,
        ErrorCode::TreasureAlreadyRetrieved,
    );

    let cpi_accounts = token::Transfer {
        from: token_location.to_account_info(),
        to: token_destination.to_account_info(),
        authority: bakery.to_account_info(),
    };
    let context = CpiContext::new(
        token_program.to_account_info(), 
        cpi_accounts
    );
    token::transfer(
        context.with_signer(&[&bakery_seeds[..]]), 
        1,
    )?;

    treasure_chest.storage[params.treasure_num as usize].retrieved = true;
    
    Ok(())
}