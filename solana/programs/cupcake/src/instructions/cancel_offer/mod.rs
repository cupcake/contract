use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint};
use crate::errors::ErrorCode;
use crate::state::{PDA_PREFIX, LISTING, Listing, Offer, TOKEN, OFFER, ListingState};
use crate::state::{bakery::*, sprinkle::*};
use crate::utils::{
    assert_is_ata,
};


#[derive(Accounts)]
#[instruction(buyer: Pubkey)]
pub struct CancelOffer<'info> {
    /// Account which will receive lamports back from the offer.
    /// CHECK:  this is safe
    #[account(mut, constraint=offer.fee_payer==fee_payer.key())]
    pub fee_payer: UncheckedAccount<'info>,

    /// CHECK:  this is safe
    #[account(mut, constraint=offer.payer==payer.key())]
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


    #[account(mut,
        seeds=[
            PDA_PREFIX, 
            config.authority.key().as_ref(), 
            &tag.uid.to_le_bytes(),
            LISTING,
            OFFER,
            buyer.as_ref()
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
    pub payer_token: Option<Account<'info, TokenAccount>>,

    /// Price mint, if needed
    pub price_mint: Option<Account<'info, Mint>>,
}



pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, CancelOffer<'info>>,
    buyer: Pubkey
  ) -> Result<()> {   
    let config = &mut ctx.accounts.config;
    let tag = &mut ctx.accounts.tag;
    let listing = &mut ctx.accounts.listing;
    let offer_token = &ctx.accounts.offer_token;
    let payer_token = &ctx.accounts.payer_token;
    let offer = &mut ctx.accounts.offer;
    let payer = &mut ctx.accounts.payer;
    let fee_payer = &mut ctx.accounts.fee_payer;
    let price_mint = &ctx.accounts.price_mint;
    let token_program = &ctx.accounts.token_program;

    let authority = config.authority.key();
    let offer_token_seeds = &[
        PDA_PREFIX, 
        authority.as_ref(), 
        &tag.uid.to_le_bytes(),
        LISTING,
        OFFER,
        buyer.as_ref(),
        TOKEN,
        &[*ctx.bumps.get("offer_token").unwrap()]
    ];
    let offer_seeds = &[
        PDA_PREFIX, 
        authority.as_ref(), 
        &tag.uid.to_le_bytes(),
        LISTING,
        OFFER,
        buyer.as_ref(),
        &[offer.bump]
    ];

    if listing.state != ListingState::UserCanceled && listing.state != ListingState::CupcakeCanceled && listing.state != ListingState::Accepted {
        require!(payer.is_signer, ErrorCode::PayerMustSign);
    }

    if let Some(mint) = listing.price_mint {
        require!(payer_token.is_some(), ErrorCode::NoPayerTokenPresent);
        require!(price_mint.is_some(), ErrorCode::NoPriceMintPresent);

        let payer_token_acct = payer_token.clone().unwrap();
        assert_is_ata(
            &payer_token_acct.to_account_info(),
            &payer.key(), 
            &mint, 
            None)?;

        let cpi_accounts = token::Transfer {
            from: offer_token.to_account_info(),
            to: payer_token_acct.to_account_info(),
            authority: offer.to_account_info(),
        };
        let context =
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(context.with_signer(&[&offer_seeds[..]]), offer.offer_amount)?;

        let cpi_accounts = token::CloseAccount {
            account: offer_token.to_account_info(),
            destination: fee_payer.to_account_info(),
            authority: offer.to_account_info(),
        };
        let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
        token::close_account(context.with_signer(&[&offer_seeds[..]]))?;
    } else {
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &offer_token.key(),
            &payer.key(),
            offer.offer_amount,
        );
    
        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &[
                offer_token.to_account_info(),
                payer.to_account_info(),
            ],
            &[&offer_token_seeds[..]]
        )?;
    }

    offer.close(ctx.accounts.fee_payer.to_account_info())?;
    Ok(())
}

