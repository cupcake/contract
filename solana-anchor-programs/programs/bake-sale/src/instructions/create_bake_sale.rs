use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use cupcake::{TagType, AddOrRefillTagParams};
use cupcake::program::Cupcake;
use cupcake::cpi::accounts::AddOrRefillTag;

use crate::PDA_PREFIX;
use crate::state::BakeSale;

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct CreateBakeSaleArgs {
    pub auction_id: u64,
    pub auction_length: u64,
    pub reserve_price: u64,
    pub tick_size: u64,
    pub bidders_pay: bool,
}

#[derive(Accounts)]
pub struct CreateBakeSale<'info> {
    /// The authority account of the provided bakery.
    #[account(mut)]
    pub bakery_authority: Signer<'info>,

    /// The bakery pda the auction is being created under.
    /// CHECK: lol
    #[account(mut)]
    pub bakery: UncheckedAccount<'info>,

    /// The sprinkle pda used to print POAPs for bidders.
    /// CHECK: lol
    #[account(mut)]
    pub sprinkle: UncheckedAccount<'info>,

    /// The bake sale pda to be created.
    #[account(init, 
              payer = bakery_authority,
              space = BakeSale::SIZE,
              seeds = [
                  PDA_PREFIX,
                  bakery_authority.key().as_ref()
              ],
              bump)]
    pub bake_sale: Account<'info, BakeSale>,

    /// The fungible token which acts as the currency for the bake sale.
    /// CHECK: Validated in a cpi to the cupcake program.
    pub payment_mint: UncheckedAccount<'info>,

    /// The master edition token, used to create a POAP sprinkle in the cupcake program.
    /// CHECK: Validated in a cpi to the cupcake program.
    #[account(mut)]
    pub poap_mint: UncheckedAccount<'info>,

    /// The token rewarded to the highest bidder at the conclusion of the bake sale.
    /// CHECK: Validated in a cpi to the cupcake program.
    pub prize_mint: UncheckedAccount<'info>,

    /// System program id
    pub system_program: Program<'info, System>,

    /// Token program id
    pub token_program: Program<'info, Token>,

    /// Cupcake program id
    pub cupcake_program: Program<'info, Cupcake>,

    /// Rent sysvar address
    pub rent: Sysvar<'info, Rent>
}

impl<'info> CreateBakeSale<'info> {
    /// Builds the cpi context for baking the bake sale POAP sprinkle from the cupcake program.
    pub fn bake_sprinkle_ctx(&self) -> CpiContext<'_, '_, '_, 'info, AddOrRefillTag<'info>> {
        let cpi_program = self.cupcake_program.to_account_info();
        let cpi_accounts = AddOrRefillTag {
            authority: self.bakery_authority.to_account_info(),
            payer: self.bakery_authority.to_account_info(),
            config: self.bakery.to_account_info(),
            tag_authority: self.bake_sale.to_account_info(),
            tag: self.sprinkle.to_account_info(),
            system_program: self.system_program.to_account_info(),
            token_program: self.token_program.to_account_info(),
            rent: self.rent.to_account_info()
        };
        let remaining_accounts = vec![
            self.poap_mint.to_account_info()
        ];
        CpiContext::new(cpi_program, cpi_accounts)
          .with_remaining_accounts(remaining_accounts)
    }
}

/// Allows the authority of a cupcake program bakery to start a bake sale. 
/// Each bake sale is an auction for an spl token, with free POAPs for each
/// successful bidder, printed through the cupcake program.
pub fn handler(ctx: Context<CreateBakeSale>, args: CreateBakeSaleArgs) -> Result<()> {
    let payment_mint_key = ctx.accounts.payment_mint.key();
    let poap_mint_key = ctx.accounts.poap_mint.key();
    let prize_mint_key = ctx.accounts.prize_mint.key();
    let system_program_key = ctx.accounts.system_program.key();

    // Set the bump here so we can use it to derive signer seeds when baking the POAP
    ctx.accounts.bake_sale.pda_bump = [*ctx.bumps.get("bake_sale").unwrap()];

    // Bake the provided POAP into a sprinkle in the cupcake program. 
    cupcake::cpi::add_or_refill_tag(
        ctx.accounts
          .bake_sprinkle_ctx(), 
        AddOrRefillTagParams {
            uid: args.auction_id,
            tag_type: TagType::LimitedOrOpenEdition,
            num_claims: 0,
            per_user: 1,
            minter_pays: args.bidders_pay,
            whitelist_burn: false,
            price_per_mint: None
        }
    )?;

    // Set the initial state for the bake sale. Leave current_bid unset to default to 0.
    let bake_sale = &mut ctx.accounts.bake_sale;
    bake_sale.auction_length = args.auction_length;
    bake_sale.reserve_price = args.reserve_price;
    bake_sale.tick_size = args.tick_size;
    bake_sale.bidders_pay = args.bidders_pay;
    bake_sale.payment_mint = payment_mint_key;
    bake_sale.poap_mint = poap_mint_key;
    bake_sale.prize_mint = prize_mint_key;
    bake_sale.current_winner = system_program_key;

    Ok(())
}