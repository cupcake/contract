use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Mint, TokenAccount};
use crate::errors::ErrorCode;
use crate::state::{PDA_PREFIX, LISTING, Listing, ListingState, TOKEN};
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

    /// SPL Token Program, required for transferring tokens.
    pub token_program: Program<'info, Token>,

    /// Will be initialized only if needed, we dont do typing here because
    /// we really dont know if this is needed at all until logic fires.
    /// CHECK:  this is safe
    #[account(mut, seeds=[
        PDA_PREFIX, 
        config.authority.key().as_ref(), 
        &tag.uid.to_le_bytes(),
        LISTING,
        TOKEN
    ],
    bump)]
    pub listing_token: Option<UncheckedAccount<'info>>,

    /// Mint of type of money you want to be accepted for this listing
    pub price_mint: Option<Account<'info, Mint>>,
}

pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, DeleteListing<'info>>
  ) -> Result<()> {   
    let tag = &mut ctx.accounts.tag;
    let config = &ctx.accounts.config;
    let payer = &ctx.accounts.payer;
    let listing = &mut ctx.accounts.listing;
    let token_program = &ctx.accounts.token_program;
    let listing_token = &ctx.accounts.listing_token;
    let listing_seeds = &[&PDA_PREFIX[..], &config.authority.as_ref()[..], &tag.uid.to_le_bytes()[..], &LISTING[..], &[listing.bump]];

    // In the canceled and scanned states, we know the accounts have been drained of sol/lamports, just need to close the accounts if present still
    // shipped closes the token account down, whereas canceled does not, as its possible cupcake may reify the listing again from cancelled
    // whereas once something enters scanned, it is frozen and cant leave
    require!(listing.state == ListingState::UserCanceled || 
        listing.state == ListingState::CupcakeCanceled || 
        listing.state == ListingState::Returned || 
        listing.state == ListingState::Scanned, ErrorCode::CannotDeleteListingInThisState);

    if listing.price_mint.is_some() {
        require!(listing_token.is_some(), ErrorCode::NoListingTokenPresent);
        let lt = listing_token.clone().unwrap();
        // close the listing token if needed
        if !lt.data_is_empty() {
            let buf: &mut &[u8] = &mut &lt.data.try_borrow_mut().unwrap()[..];
            let listing_token_account = TokenAccount::try_deserialize(buf).unwrap();
            require!(listing_token_account.amount == 0, ErrorCode::ListingTokenHasBalance);
            let cpi_accounts = token::CloseAccount {
                account: lt.to_account_info(),
                destination: payer.to_account_info(),
                authority: listing.to_account_info(),
            };
            let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
            token::close_account(context.with_signer(&[&listing_seeds[..]]))?;
        }

    }

    listing.close(payer.to_account_info())?;
   
    Ok(())
}

