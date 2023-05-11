use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint};
use crate::errors::ErrorCode;
use crate::state::{PDA_PREFIX, LISTING, Listing, Offer, TOKEN, OFFER, ListingState};
use crate::state::{bakery::*, sprinkle::*};
use crate::utils::{
    assert_is_ata,
};

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct CancelOfferArgs {
    offer_amount: u64
}

#[derive(Accounts)]
pub struct CancelOffer<'info> {
    /// Account which pays the network and rent fees, for this transaction only.
    /// CHECK:  this is safe
    #[account(mut, constraint=offer.fee_payer==payer.key())]
    pub payer: UncheckedAccount<'info>,

    /// PDA which stores token approvals for a Bakery, and executes the transfer during claims.
    pub config: Box<Account<'info, Config>>,

    /// PDA which stores data about the state of a Sprinkle.
    pub tag: Box<Account<'info, Tag>>,

    /// PDA which stores data about the state of a listing.
    #[account(seeds = [
            PDA_PREFIX, 
            config.authority.key().as_ref(), 
            &tag.uid.to_le_bytes(),
            LISTING
        ],
        bump=listing.bump)]
    pub listing: Box<Account<'info, Listing>>,


    /// Buyer
    /// CHECK:  this is safe
    #[account(mut)] 
    pub buyer: UncheckedAccount<'info>,

    #[account(mut,
        seeds=[
            PDA_PREFIX, 
            config.authority.key().as_ref(), 
            &tag.uid.to_le_bytes(),
            LISTING,
            OFFER,
            buyer.key().as_ref()
        ],
        bump=offer.bump,
    )] 
    pub offer: Box<Account<'info, Offer>>,

    /// SPL System Program, required for account allocation.
    pub system_program: Program<'info, System>,

    /// SPL Token Program, required for transferring tokens.
    pub token_program: Program<'info, Token>,

    /// CHECK:  this is safe
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
    pub offer_token: UncheckedAccount<'info>,

    /// Buyer's token account, if they are using a token to pay for this listing
    #[account(mut)]
    pub buyer_token: Option<Account<'info, TokenAccount>>,

    /// Price mint, if needed
    pub price_mint: Option<Account<'info, Mint>>,
}



pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, CancelOffer<'info>>,
    args: CancelOfferArgs
  ) -> Result<()> {   
    let config = &mut ctx.accounts.config;
    let tag = &mut ctx.accounts.tag;
    let listing = &mut ctx.accounts.listing;
    let offer_token = &ctx.accounts.offer_token;
    let buyer_token = &ctx.accounts.buyer_token;
    let offer = &mut ctx.accounts.offer;
    let payer = &mut ctx.accounts.payer;
    let price_mint = &ctx.accounts.price_mint;
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

    if listing.state != ListingState::UserCanceled && listing.state != ListingState::CupcakeCanceled && listing.state != ListingState::Accepted {
        require!(buyer.is_signer, ErrorCode::BuyerMustSign);
    }

    if let Some(mint) = listing.price_mint {
        require!(buyer_token.is_some(), ErrorCode::NoBuyerTokenPresent);
        require!(price_mint.is_some(), ErrorCode::NoPriceMintPresent);

        let buyer_token_acct = buyer_token.clone().unwrap();
        assert_is_ata(
            &buyer_token_acct.to_account_info(),
            &buyer.key(), 
            &mint, 
            None)?;

        let cpi_accounts = token::Transfer {
            from: offer_token.to_account_info(),
            to: buyer_token_acct.to_account_info(),
            authority: offer.to_account_info(),
        };
        let context =
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(context.with_signer(&[&offer_seeds[..]]), args.offer_amount)?;
    } else {
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &offer.key(),
            &buyer.key(),
            args.offer_amount,
        );

        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                offer.to_account_info(),
                buyer.to_account_info(),
            ],
        )?;
    }

    offer.close(payer.to_account_info())?;
    Ok(())
}

