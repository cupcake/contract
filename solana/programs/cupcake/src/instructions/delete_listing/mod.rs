use anchor_lang::prelude::*;
use crate::errors::ErrorCode;
use crate::state::{PDA_PREFIX, LISTING, Listing, ListingState};
use crate::state::{bakery::*, sprinkle::*};



#[derive(Accounts)]
pub struct DeleteListing<'info> {
    /// Account which pays the network and rent fees, for this transaction only.
    /// CHECK:  this is safe
    #[account(mut, constraint=payer.key() == listing.fee_payer)]
    pub payer: UncheckedAccount<'info>,

    #[account(constraint=authority.key() == config.authority)]
    pub authority: Signer<'info>,

    /// PDA which stores token approvals for a Bakery, and executes the transfer during claims.
    pub config: Box<Account<'info, Config>>,

    /// PDA which stores data about the state of a Sprinkle.
    #[account(
        seeds = [
            PDA_PREFIX, 
            config.authority.key().as_ref(), 
            &tag.uid.to_le_bytes()
        ], 
        bump = tag.bump)]
    pub tag: Box<Account<'info, Tag>>,

    /// PDA which stores data about the state of a Sprinkle.
    #[account(mut, 
              seeds = [
                  PDA_PREFIX, 
                  config.authority.key().as_ref(), 
                  &tag.uid.to_le_bytes(),
                  LISTING
              ], 
              bump = listing.bump)]
    pub listing: Box<Account<'info, Listing>>,

    /// SPL System Program, required for account allocation.
    pub system_program: Program<'info, System>,
}

pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, DeleteListing<'info>>
  ) -> Result<()> {   
    let payer = &ctx.accounts.payer;
    let listing = &mut ctx.accounts.listing;
    require!(listing.state == ListingState::UserCanceled || 
        listing.state == ListingState::CupcakeCanceled ||
        listing.state == ListingState::Accepted, ErrorCode::CannotDeleteListingInThisState);


    listing.close(payer.to_account_info())?;
   
    Ok(())
}

