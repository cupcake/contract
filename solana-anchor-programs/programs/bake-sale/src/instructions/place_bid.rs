use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_lang::solana_program::system_instruction;
use cupcake::{self, Config, Tag, UserInfo};
use cupcake::cpi::accounts::ClaimTag;
use cupcake::program::Cupcake;
use anchor_spl::token::{self, Token, Transfer};

use crate::state::BakeSale;

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]

pub struct PlaceBidArgs {
    pub bid_size: u64
}

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    /// The account paying for the bid, and receiving a new printed POAP.
    #[account(mut)]
    pub user: Signer<'info>,

    /// The bakery pda associated with the provided bake sale.
    #[account(mut)]
    pub bakery: Account<'info, Config>,

    /// The sprinkle pda associated with the provided bake sale.
    #[account(mut)]
    pub sprinkle: Account<'info, Tag>,

    /// The user info pda associated with the provided user and sprinkle.
    #[account(mut)]
    pub user_info: Account<'info, UserInfo>,

    /// The bake sale pda being bid on.
    #[account(mut,
              has_one = current_winner,
              has_one = payment_mint)]
    pub bake_sale: Account<'info, BakeSale>,

    /// CHECK: Validated by bake sale has_ones.
    pub current_winner: UncheckedAccount<'info>,

    /// CHECK: Validated by bake sale has_ones.
    pub payment_mint: UncheckedAccount<'info>,

    /// CHECK: Validated in CPI to the Cupcake program.
    pub poap_mint: UncheckedAccount<'info>,

    /// CHECK: Validated in CPI to the Cupcake program.
    pub poap_metadata: UncheckedAccount<'info>,

    /// CHECK: Validated in CPI to the Cupcake program.
    pub poap_edition: UncheckedAccount<'info>,

    /// CHECK: Validated in CPI to the Cupcake program.
    pub new_poap_mint: UncheckedAccount<'info>,

    /// CHECK: Validated in CPI to the Cupcake program.
    pub new_poap_ata: UncheckedAccount<'info>,

    /// CHECK: Validated in CPI to the Cupcake program.
    pub new_poap_metadata: UncheckedAccount<'info>,

    /// CHECK: Validated in CPI to the Cupcake program.
    pub new_poap_edition: UncheckedAccount<'info>,

    /// CHECK: Validated in CPI to the Cupcake program.
    pub new_poap_edition_mark: UncheckedAccount<'info>,

    /// System program ID.
    pub system_program: Program<'info, System>,

    /// Token program ID.
    pub token_program: Program<'info, Token>,

    /// Token metadata program ID.
    pub token_metadata_program: Program<'info, Token>,

    /// Cupcake program ID.
    pub cupcake_program: Program<'info, Cupcake>,

    /// Rent sysvar address.
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> PlaceBid<'info> {
    pub fn user_needs_poap(&self) -> bool {
      self.user_info.num_claimed == 0
    }

    /// Builds the cpi context for claiming a sprinkle from the cupcake program.
    pub fn print_poap_ctx(&self) -> CpiContext<'_, '_, '_, 'info, ClaimTag<'info>> {
        let program = self.cupcake_program.to_account_info();
        let accounts = ClaimTag {
            user: self.user.to_account_info(),
            payer: self.user.to_account_info(),
            config: self.bakery.to_account_info(),
            tag_authority: self.bake_sale.to_account_info(),
            tag: self.sprinkle.to_account_info(),
            user_info: self.user_info.to_account_info(),
            system_program: self.system_program.to_account_info(),
            token_program: self.token_program.to_account_info(),
            rent: self.rent.to_account_info(),
        };
        let remaining_accounts = vec![
            self.poap_mint.to_account_info(),
            self.new_poap_ata.to_account_info(),
            self.new_poap_mint.to_account_info(),
            self.new_poap_metadata.to_account_info(),
            self.new_poap_edition.to_account_info(),
            self.poap_metadata.to_account_info(),
            self.poap_edition.to_account_info(),
            self.new_poap_edition_mark.to_account_info(),
            self.bake_sale.to_account_info(),
            self.bake_sale.to_account_info(),
            self.token_metadata_program.to_account_info()
        ];
        CpiContext::new(program, accounts).with_remaining_accounts(remaining_accounts)
    }

    /// Builds the cpi context for escrowing a new spl bid in the bake sale.
    fn escrow_token_bid_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
      let token_program = self.token_program.to_account_info();
      let transfer_accounts = Transfer {
          from: self.user.to_account_info(),
          to: self.bake_sale.to_account_info(),
          authority: self.user.to_account_info()
      };
      CpiContext::new(token_program, transfer_accounts)
  }

    /// Builds the cpi context for returning a losing sple bid to the original bidder.
    fn refund_token_bid_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let token_program = self.token_program.to_account_info();
        let transfer_accounts = Transfer {
            from: self.bake_sale.to_account_info(),
            to: self.current_winner.to_account_info(),
            authority: self.bake_sale.to_account_info()
        };
        CpiContext::new(token_program, transfer_accounts)
    }

    /// Builds the ix for returning a losing sol bid to the original bidder.
    fn escrow_sol_bid_ix(&self, amount: u64) -> Instruction {
        system_instruction::transfer(
            &self.user.key(),
            &self.bake_sale.key(),
            amount,
        )
    }

    /// Builds the ix for returning a losing sol bid to the original bidder.
    fn refund_sol_bid_ix(&self, amount: u64) -> Instruction {
        system_instruction::transfer(
            &self.bake_sale.key(),
            &self.current_winner.key(),
            amount,
        )
    }
}

pub fn handler(ctx: Context<PlaceBid>, args: PlaceBidArgs) -> Result<()> {
    let has_previous_bid = ctx.accounts.bake_sale.has_previous_bid();
    let has_spl_payment = ctx.accounts.bake_sale.has_spl_payment();
    let user_needs_poap = ctx.accounts.user_needs_poap();

    // If this is the first bid, the amount must be at least the reserve price. If there 
    // is an existing bid, the amount must be at least the existing bid + the tick size.
    let minimum_bid = match has_previous_bid {
      true => ctx.accounts.bake_sale.current_bid + ctx.accounts.bake_sale.tick_size,
      false => ctx.accounts.bake_sale.reserve_price
    };
    require!(
      args.bid_size >= minimum_bid,
      InsufficientBidError,
    );
    

    // Now that we know the bid is valid, refund the current escroed bid, if it exists.
    if has_previous_bid {
        match has_spl_payment {
            // Using an SPL token as payment:
            true => {
                token::transfer(
                    ctx.accounts
                        .refund_token_bid_ctx()
                        .with_signer(&[&ctx.accounts.bake_sale.pda_seeds()]),
                    ctx.accounts.bake_sale.current_bid,
                )?
            }
            // Using native SOL as payment:
            false => {
                invoke_signed(
                    &ctx.accounts.refund_sol_bid_ix(ctx.accounts.bake_sale.current_bid),
                    &vec![
                        ctx.accounts.bake_sale.to_account_info(),
                        ctx.accounts.current_winner.to_account_info(),
                    ],
                    &[&ctx.accounts.bake_sale.pda_seeds()],
                )?
            }
        };
    };

    // Now that the bake sale escrow is empty, transfer the new bid in.
    match has_spl_payment {
        // Using an SPL token as payment:
        true => {
            token::transfer(
                ctx.accounts.escrow_token_bid_ctx(),
                args.bid_size,
            )?
        }
        // Using native SOL as payment:
        false => {
            invoke(
                &ctx.accounts.escrow_sol_bid_ix(args.bid_size),
                &vec![
                  ctx.accounts.user.to_account_info(),
                  ctx.accounts.bake_sale.to_account_info(),
              ],
            )?
        }
    };

    // If this is the user's first bid, cpi into the cupcake program to claim them a POAP.
    if user_needs_poap {
        cupcake::cpi::claim_tag(ctx.accounts.print_poap_ctx(), 0)?;
    }

    // Update the bake sale to reflect the new winning bidder.
    let bake_sale = &mut ctx.accounts.bake_sale;
    bake_sale.current_bid = args.bid_size;
    bake_sale.current_winner = ctx.accounts.user.key();

    Ok(())
}