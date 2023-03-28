use anchor_lang::prelude::*;
use crate::state::{PDA_PREFIX, config::*};

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// Account which has the authority to create/update sprinkles for this Bakery.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Account which pays the network and rent fees, for this transaction only.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// PDA which stores token approvals for this Bakery, and executes the transfer during claims.
    #[account(init, 
              payer = payer, 
              space =  Config::SIZE,
              seeds = [
                  PDA_PREFIX, 
                  authority.key().as_ref()
              ], 
              bump)]
    pub config: Account<'info, Config>,
    
    /// SPL System Program, required for account allocation.
    pub system_program: Program<'info, System>,

    /// SPL Rent Sysvar, required for account allocation.
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler<'a, 'b, 'c, 'info>(ctx: Context<Initialize<'info>>) -> Result<()> {
    // Now that a fresh Bakery PDA has been created by the Anchor constraints,
    // we can store the authority account's address and the PDA bump inside.
    ctx.accounts.config.authority = *ctx.accounts.authority.to_account_info().key;
    ctx.accounts.config.bump = *ctx.bumps.get("config").unwrap();

    // We could expand this in the future to store more info, such as a
    // total sprinkle counter, but for now it exists just to transfer
    // tokens as a delegate.
    Ok(())
}