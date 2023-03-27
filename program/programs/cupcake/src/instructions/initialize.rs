use anchor_lang::prelude::*;
use crate::PREFIX;
use crate::state::config::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init, payer = payer, seeds = [PREFIX, authority.key().as_ref()], bump, space =  CONFIG_SIZE)]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler<'a, 'b, 'c, 'info>(ctx: Context<Initialize<'info>>) -> Result<()> {   
    ctx.accounts.config.authority = *ctx.accounts.authority.to_account_info().key;
    ctx.accounts.config.bump = *ctx.bumps.get("config").unwrap();
    Ok(())
}