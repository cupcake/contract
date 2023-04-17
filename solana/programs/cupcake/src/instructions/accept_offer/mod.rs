use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token};
use crate::errors::ErrorCode;
use crate::state::{PDA_PREFIX, LISTING, Listing, ListingState, Offer, TOKEN, OFFER};
use crate::state::{bakery::*, sprinkle::*};

#[derive(Accounts)]
pub struct AcceptOffer<'info> {
    /// Account that is signing off on the offer acceptance. Can be seller, buyer, or a third party.
    /// Can be seller in any circumstance.
    /// Can be buyer if the offer is above or at the set_price.
    /// Can be anybody if the offer is above or at the set_price.
    pub signer: Signer<'info>,

    /// PDA which stores token approvals for a Bakery, and executes the transfer during claims.
    pub config: Box<Account<'info, Config>>,

    /// PDA which stores data about the state of a Sprinkle.
    pub tag: Box<Account<'info, Tag>>,

    /// PDA which stores data about the state of a listing.
    #[account(mut,
        constraint=signer.key() == listing.seller || (listing.set_price.is_some() && offer.offer_amount >= listing.set_price.unwrap()),
        seeds = [
            PDA_PREFIX, 
            config.authority.key().as_ref(), 
            &tag.uid.to_le_bytes(),
            LISTING
        ],
        bump=listing.bump)]
    pub listing: Box<Account<'info, Listing>>,

    #[account(mut,
        seeds=[
            PDA_PREFIX, 
            config.authority.key().as_ref(), 
            &tag.uid.to_le_bytes(),
            LISTING,
            OFFER,
            buyer.key().as_ref()
        ],
        bump=offer.bump
    )] 
    pub offer: Box<Account<'info, Offer>>,

    /// Buyer
    #[account(mut)] 
    pub buyer: UncheckedAccount<'info>,

    /// Original fee payer, to receive lamports back
    #[account(mut, constraint=original_fee_payer.key() == offer.fee_payer)] 
    pub original_fee_payer: UncheckedAccount<'info>,

    /// SPL System Program, required for account allocation.
    pub system_program: Program<'info, System>,

    /// SPL Token Program, required for transferring tokens.
    pub token_program: Program<'info, Token>,

    /// Needed if this is a price mint and not sol 
    #[account(mut, 
        seeds=[
            PDA_PREFIX, 
            config.authority.key().as_ref(), 
            &tag.uid.to_le_bytes(),
            LISTING,
            TOKEN
        ], bump)]
    pub listing_token: Option<UncheckedAccount<'info>>,

    /// Needed if this is a price mint and not sol
    #[account(mut, 
        seeds=[
            PDA_PREFIX, 
            config.authority.key().as_ref(), 
            &tag.uid.to_le_bytes(),
            LISTING,
            OFFER,
            buyer.key().as_ref(),
            TOKEN
        ], bump)]
    pub offer_token: Option<UncheckedAccount<'info>>,
}



pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, AcceptOffer<'info>>
  ) -> Result<()> {   
    let config = &mut ctx.accounts.config;
    let tag = &mut ctx.accounts.tag;
    let listing = &mut ctx.accounts.listing;
    let offer = &mut ctx.accounts.offer;
    let original_fee_payer = &ctx.accounts.original_fee_payer;
    let buyer = &ctx.accounts.buyer;
    let authority = config.authority.key();
    let buyer_key = buyer.key();
    let offer_seeds = &[
        PDA_PREFIX, 
        authority.as_ref(), 
        &tag.uid.to_le_bytes(),
        LISTING,
        OFFER,
        buyer_key.as_ref(),
        &[offer.bump]
    ];

    listing.agreed_price = Some(offer.offer_amount);
    listing.state = ListingState::Accepted;
    
    if listing.price_mint.is_some() {
        require!(ctx.accounts.offer_token.is_some(), ErrorCode::NoOfferTokenPresent);
        require!(ctx.accounts.listing_token.is_some(), ErrorCode::NoListingTokenPresent);

        let cpi_accounts = token::Transfer {
            from: ctx.accounts.offer_token.clone().unwrap().to_account_info(),
            to: ctx.accounts.listing_token.clone().unwrap().to_account_info(),
            authority: offer.to_account_info(),
        };
        let context =
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(context.with_signer(&[&offer_seeds[..]]), offer.offer_amount)?;

        let cpi_accounts = token::CloseAccount {
            account: ctx.accounts.offer_token.clone().unwrap().to_account_info(),
            destination: original_fee_payer.to_account_info(),
            authority: offer.to_account_info(),
        };
        let context =
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::close_account(context.with_signer(&[&offer_seeds[..]]))?;
    } else {
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &offer.key(),
            &listing.key(),
            offer.offer_amount,
        );

        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                offer.to_account_info(),
                listing.to_account_info(),
            ],
        )?;
    }

    offer.close(original_fee_payer.to_account_info())?;    
    Ok(())
}

