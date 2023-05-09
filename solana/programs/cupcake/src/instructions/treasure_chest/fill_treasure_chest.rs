use anchor_lang::prelude::*;
use anchor_spl::token::{Token, Approve, approve};
use crate::errors::ErrorCode;
use crate::state::{Config, Tag, TreasureChest, StorageSpace};

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct FillTreasureChestParams {
    /// 
    offset: u8,
}

#[derive(Accounts)]
pub struct FillTreasureChest<'info> {
    /// Account which pays the network and rent fees, for this transaction only.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Account which has the authority to create/update sprinkles for this Bakery.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// PDA which stores token approvals for a Bakery, and executes the transfer during claims.
    #[account(mut, 
              has_one = authority)]
    pub config: Account<'info, Config>,

    /// PDA which stores data about the state of a Sprinkle.
    #[account(mut, 
              has_one = config)]
    pub sprinkle: Account<'info, Tag>,

    /// Account which has the authority to execute claims for this Sprinkle.
    /// CHECK: TagAuthority can be any account that can sign a transaction.
    #[account(mut)]
    pub sprinkle_authority: UncheckedAccount<'info>,

    /// TreasureChest PDA being initialized.
    #[account(mut, 
              has_one = sprinkle)]
    pub treasure_chest: Account<'info, TreasureChest>,

    pub system_program: Program<'info, System>,

    pub token_program: Program<'info, Token>,

    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_fill_treasure_chest<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, FillTreasureChest<'info>>, 
    params: FillTreasureChestParams
) -> Result<()> {
    let authority = &ctx.accounts.authority;
    let bakery = &ctx.accounts.config;
    let token_program = &ctx.accounts.token_program;

    let treasure_chest = &mut ctx.accounts.treasure_chest;

    let num_remaining_accounts = ctx.remaining_accounts.len();
    require!(
        num_remaining_accounts % 2 == 0,
        ErrorCode::InvalidTreasureChestRemainingAccounts,
    );

    let num_treasures_to_fill = num_remaining_accounts / 2;
    require!(
        params.offset as usize + num_treasures_to_fill <= 10,
        ErrorCode::TooManyTreasureChestItems,
    );

    for (i, mint_and_token_infos) in ctx.remaining_accounts.chunks(2).enumerate() {
        let token_mint = &mint_and_token_infos[0];
        let token = &mint_and_token_infos[1];

        let approve_accounts = Approve {
            to: token.clone(),
            delegate: bakery.to_account_info(),
            authority: authority.to_account_info(),
        };
        let approve_context = CpiContext::new(
            token_program.to_account_info(), 
            approve_accounts,
        );
        approve(approve_context, 1)?;

        treasure_chest.storage[i] = StorageSpace {
            token_mint: token_mint.key(),
            retrieved: false,
        };
    }
    Ok(())
}