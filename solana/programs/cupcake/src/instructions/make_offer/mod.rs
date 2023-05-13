use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint};
use crate::errors::ErrorCode;
use crate::state::{PDA_PREFIX, LISTING, Listing, Offer, TOKEN, OFFER, ListingState};
use crate::state::{bakery::*, sprinkle::*};
use crate::utils::{
    assert_is_ata,
    create_program_token_account_if_not_present
};

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct MakeOfferArgs {
    offer_amount: u64,
    buyer: Pubkey
}

#[derive(Accounts)]
#[instruction(args: MakeOfferArgs)]
pub struct MakeOffer<'info> {
    /// Account which will receive lamports back from the offer.
    #[account(mut)]
    pub fee_payer: Signer<'info>,

    /// Account which will actually pay for the offer.
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

    #[account(init,
        seeds=[
            PDA_PREFIX, 
            config.authority.key().as_ref(), 
            &tag.uid.to_le_bytes(),
            LISTING,
            OFFER,
            args.buyer.key().as_ref()
        ],
        bump,
        payer=fee_payer,
        space=Offer::SIZE
    )] 
    pub offer: Box<Account<'info, Offer>>,

    /// SPL System Program, required for account allocation.
    pub system_program: Program<'info, System>,

    /// SPL Token Program, required for transferring tokens.
    pub token_program: Program<'info, Token>,

    /// SPL Rent Sysvar, required for account allocation.
    pub rent: Sysvar<'info, Rent>,

    /// Either the token account or the SOL account
    /// CHECK: this is safe
    #[account(mut, 
        seeds=[
            PDA_PREFIX, 
            config.authority.key().as_ref(), 
            &tag.uid.to_le_bytes(),
            LISTING,
            OFFER,
            args.buyer.key().as_ref(),
            TOKEN
        ], bump)]
    pub offer_token: UncheckedAccount<'info>,

    /// Buyer's token account, if they are using a token to pay for this listing
    #[account(mut)]
    pub payer_token: Option<Account<'info, TokenAccount>>,

    /// Transfer authority to move out of buyer token account
    pub transfer_authority: Option<Signer<'info>>,

    /// Price mint
    pub price_mint: Option<Account<'info, Mint>>,
}



pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, MakeOffer<'info>>,
    args: MakeOfferArgs
  ) -> Result<()> {   
    let buyer = args.buyer;
    let config = &ctx.accounts.config;
    let tag = &ctx.accounts.tag;
    let listing = &mut ctx.accounts.listing;
    let offer_token = &ctx.accounts.offer_token;
    let payer_token = &ctx.accounts.payer_token;
    let offer = &mut ctx.accounts.offer;
    let transfer_authority = &ctx.accounts.transfer_authority;
    let system_program = &ctx.accounts.system_program;
    let rent = &ctx.accounts.rent;
    let token_program = &ctx.accounts.token_program;
    let payer = &mut ctx.accounts.payer;
    let price_mint = &ctx.accounts.price_mint;
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

    require!(listing.price_mint.is_some() || args.offer_amount >= 1000000, ErrorCode::MinimumOffer);
    require!(listing.state == ListingState::ForSale, ErrorCode::ListingNotForSale);

    offer.bump = *ctx.bumps.get("offer").unwrap();

    offer.buyer = buyer;

    offer.payer = payer.key();

    offer.fee_payer = ctx.accounts.fee_payer.key();

    offer.offer_amount = args.offer_amount;

    offer.offer_mint = listing.price_mint;

    offer.tag = tag.key();

    if let Some(mint) = listing.price_mint {
        require!(payer_token.is_some(), ErrorCode::NoPayerTokenPresent);
        require!(price_mint.is_some(), ErrorCode::NoPriceMintPresent);

        let payer_token_acct = payer_token.clone().unwrap();
        if transfer_authority.is_some() {
            let tfer_auth = transfer_authority.clone().unwrap();
            assert_is_ata(
                &payer_token_acct.to_account_info(),
                &payer.key(), 
                &mint, 
                Some(&tfer_auth.key()))?;
        } else {
            assert_is_ata(
                &payer_token_acct.to_account_info(),
                &payer.key(), 
                &mint, 
                None)?;
        }

        create_program_token_account_if_not_present(
            &offer_token,
            system_program,
            &ctx.accounts.fee_payer,
            token_program,
            &price_mint.clone().unwrap(),
            &offer.to_account_info(),
            rent,
            offer_token_seeds
        )?;

        let cpi_accounts = token::Transfer {
            from: payer_token_acct.to_account_info(),
            to: offer_token.to_account_info(),
            authority: transfer_authority.clone().unwrap().to_account_info(),
        };
        let context =
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(context, args.offer_amount)?;
    } else {
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &payer.key(),
            &offer_token.key(),
            args.offer_amount,
        );

        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                payer.to_account_info(),
                offer_token.to_account_info(),
            ],
            
        )?;
    }
    Ok(())
}

