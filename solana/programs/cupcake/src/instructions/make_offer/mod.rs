use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint};
use crate::errors::ErrorCode;
use crate::state::{PDA_PREFIX, LISTING, Listing, Offer, TOKEN, OFFER};
use crate::state::{bakery::*, sprinkle::*};
use crate::utils::{
    assert_is_ata,
    create_program_token_account_if_not_present
};

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct MakeOfferArgs {
    offer_amount: u64
}

#[derive(Accounts)]
pub struct MakeOffer<'info> {
    /// Account which pays the network and rent fees, for this transaction only.
    #[account(mut)]
    pub payer: Signer<'info>,

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


    /// Buyer, must be a signer if using SOL
    /// CHECK:  this is safe
    #[account(mut)] 
    pub buyer: UncheckedAccount<'info>,

    #[account(init,
        seeds=[
            PDA_PREFIX, 
            config.authority.key().as_ref(), 
            &tag.uid.to_le_bytes(),
            LISTING,
            OFFER,
            buyer.key().as_ref()
        ],
        bump,
        payer=payer,
        space=Offer::SIZE
    )] 
    pub offer: Box<Account<'info, Offer>>,

    /// SPL System Program, required for account allocation.
    pub system_program: Program<'info, System>,

    /// SPL Token Program, required for transferring tokens.
    pub token_program: Program<'info, Token>,

    /// SPL Rent Sysvar, required for account allocation.
    pub rent: Sysvar<'info, Rent>,

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

    /// Buyer's token account, if they are using a token to pay for this listing
    #[account(mut)]
    pub buyer_token: Option<Account<'info, TokenAccount>>,

    /// Transfer authority to move out of buyer token account
    pub transfer_authority: Option<Signer<'info>>,

    /// Price mint
    pub price_mint: Option<Account<'info, Mint>>,
}



pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, MakeOffer<'info>>,
    args: MakeOfferArgs
  ) -> Result<()> {   
    let config = &mut ctx.accounts.config;
    let tag = &mut ctx.accounts.tag;
    let listing = &mut ctx.accounts.listing;
    let offer_token = &ctx.accounts.offer_token;
    let buyer_token = &ctx.accounts.buyer_token;
    let offer = &mut ctx.accounts.offer;
    let transfer_authority = &mut ctx.accounts.transfer_authority;
    let system_program = &mut ctx.accounts.system_program;
    let rent = &mut ctx.accounts.rent;
    let token_program = &mut ctx.accounts.token_program;
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

    offer.bump = *ctx.bumps.get("offer").unwrap();

    offer.buyer = *buyer.key;

    offer.fee_payer = *payer.key;

    offer.offer_amount = args.offer_amount;

    offer.offer_mint = listing.price_mint;

    offer.tag = tag.key();

    if let Some(mint) = listing.price_mint {
        require!(buyer_token.is_some(), ErrorCode::NoBuyerTokenPresent);
        require!(offer_token.is_some(), ErrorCode::NoOfferTokenPresent);
        require!(transfer_authority.is_some(), ErrorCode::NoTransferAuthorityPresent);
        require!(price_mint.is_some(), ErrorCode::NoPriceMintPresent);

        let buyer_token_acct = buyer_token.clone().unwrap();
        assert_is_ata(
            &buyer_token_acct.to_account_info(),
            &buyer.key(), 
            &mint, 
            None)?;

        create_program_token_account_if_not_present(
            &offer_token.clone().unwrap(),
            system_program,
            payer,
            token_program,
            &price_mint.clone().unwrap(),
            &offer.to_account_info(),
            rent,
            offer_seeds
        )?;

        let cpi_accounts = token::Transfer {
            from: buyer_token_acct.to_account_info(),
            to: offer_token.clone().unwrap().to_account_info(),
            authority: transfer_authority.clone().unwrap().to_account_info(),
        };
        let context =
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(context, args.offer_amount)?;
    } else {
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &buyer.key(),
            &offer.key(),
            args.offer_amount,
        );

        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                buyer.to_account_info(),
                offer.to_account_info(),
            ],
        )?;
    }
    Ok(())
}

