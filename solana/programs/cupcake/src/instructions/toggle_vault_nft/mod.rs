use anchor_lang::prelude::*;
use anchor_spl::token::{ TokenAccount};
use crate::errors::ErrorCode;
use crate::state::{PDA_PREFIX};
use crate::state::{bakery::*, sprinkle::*};



#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct ToggleVaultNFT<'info> {
    /// Either the bakery owner or the user holding the token (to change from InTransit to Unvaulted)
    #[account(mut, constraint=payer.key() == config.authority || payer.key() == user)]
    pub payer: Signer<'info>,

    /// CHECK:  this is safe
    #[account(constraint=authority.key() == config.authority)]
    pub authority: UncheckedAccount<'info>,

    /// PDA which stores token approvals for a Bakery, and executes the transfer during claims.
    pub config: Box<Account<'info, Config>>,

    /// PDA which stores data about the state of a Sprinkle.
    #[account(
        mut,
        seeds = [
            PDA_PREFIX, 
            config.authority.key().as_ref(), 
            &tag.uid.to_le_bytes()
        ], 
        bump = tag.bump)]
    pub tag: Box<Account<'info, Tag>>,

    #[account(mut, seeds=[
        PDA_PREFIX, 
        config.authority.key().as_ref(), 
        &tag.uid.to_le_bytes(),
        user.as_ref(),
        tag.token_mint.as_ref()
    ],
    constraint=hot_potato_token.amount == 1,
    token::mint = tag.token_mint,
    bump)]
    pub hot_potato_token: Account<'info, TokenAccount>,
}

pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, ToggleVaultNFT<'info>>,
    user: Pubkey,
    desired_state: VaultState
  ) -> Result<()> {   
    let tag = &mut ctx.accounts.tag;
    let payer = &ctx.accounts.payer;
    let authority = &ctx.accounts.authority;

    if payer.key() != authority.key() {
        require!(tag.vault_state == VaultState::Vaulted || tag.vault_state == VaultState::InTransit, ErrorCode::InvalidVaultTransition);
        require!((tag.vault_state == VaultState::Vaulted && 
            desired_state == VaultState::UnvaultingRequested) || 
                (tag.vault_state == VaultState::InTransit && 
            desired_state == VaultState::Unvaulted), ErrorCode::InvalidVaultTransition);
        
    };
  
    tag.vault_state = desired_state;
    tag.vault_authority = Some(user);
   
    Ok(())
}

