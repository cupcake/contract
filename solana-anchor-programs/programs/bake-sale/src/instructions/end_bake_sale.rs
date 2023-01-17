use anchor_lang::prelude::*;
use anchor_spl::token::{Transfer, Token, self};
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::system_instruction;
use anchor_lang::solana_program::program::invoke_signed;

use crate::{PDA_PREFIX, state::BakeSale};

#[derive(Accounts)]
pub struct EndBakeSale<'info> {
    ///
    pub bakery_authority: Signer<'info>,

    /// The bake sale pda being closed.
    #[account(mut, 
              close = bakery_authority,
              has_one = current_winner,
              seeds = [
                  PDA_PREFIX,
                  bakery_authority.key().as_ref(),
                  &bake_sale.auction_id.to_le_bytes()
              ],
              bump)]
    pub bake_sale: Account<'info, BakeSale>,

    /// CHECK: Validated by bake sale has_ones.
    pub current_winner: UncheckedAccount<'info>,

    /// The token program id.
    pub token_program: Program<'info, Token>,
}

impl<'info> EndBakeSale<'info> {
    /// Builds the cpi context for transferring the prize token to the winner of a bake sale.
    fn pay_out_winner_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let token_program = self.token_program.to_account_info();
        let transfer_accounts = Transfer {
            from: self.bake_sale.to_account_info(),
            to: self.current_winner.to_account_info(),
            authority: self.bake_sale.to_account_info()
        };
        CpiContext::new(token_program, transfer_accounts)
    }

    /// Builds the cpi context for transferring the winning bid of a bake sale to the bakery authority.
    fn pay_out_bakery_tokens_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let token_program = self.token_program.to_account_info();
        let transfer_accounts = Transfer {
            from: self.bake_sale.to_account_info(),
            to: self.bakery_authority.to_account_info(),
            authority: self.bake_sale.to_account_info()
        };
        CpiContext::new(token_program, transfer_accounts)
    }

    /// Builds the ix for returning a losing sol bid to the original bidder.
    fn pay_out_bakery_sol_ix(&self, amount: u64) -> Instruction {
        system_instruction::transfer(
            &self.bake_sale.key(),
            &self.bakery_authority.key(),
            amount,
        )
    }
}

pub fn handler(ctx: Context<EndBakeSale>) -> Result<()> {
    let bake_sale = &ctx.accounts.bake_sale;

    // Transfer the bake sale prize token to the final winning bidder.
    token::transfer(
        ctx.accounts.pay_out_winner_ctx(), 
        1
    )?;

    // Transfer the winning bid to the bakery authority before closing the bake sale.
    match bake_sale.has_spl_payment() {
      // Using an SPL token as payment:
      true => {
          token::transfer(
              ctx.accounts.pay_out_bakery_tokens_ctx(), 
              bake_sale.current_bid
          )?;
      },
      // Using native SOL as payment:
      false => {
          invoke_signed(
              &ctx.accounts.pay_out_bakery_sol_ix(ctx.accounts.bake_sale.current_bid),
              &vec![
                  ctx.accounts.bake_sale.to_account_info(),
                  ctx.accounts.current_winner.to_account_info(),
              ],
              &[&ctx.accounts.bake_sale.pda_seeds()],
          )?
      }
    }

    Ok(())
}