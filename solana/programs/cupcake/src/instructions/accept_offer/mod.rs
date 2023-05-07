use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token};
use crate::state::{PDA_PREFIX, LISTING, Listing, ListingState, Offer, TOKEN, OFFER};
use crate::state::{bakery::*, sprinkle::*};
use crate::utils::{move_hot_potato, MoveHotPotatoArgs};
use crate::errors::ErrorCode;


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
    /// CHECK:  this is safe
    #[account(mut)] 
    pub buyer: UncheckedAccount<'info>,

    /// Original fee payer, to receive lamports back
    /// CHECK:  this is safe
    #[account(mut, constraint=original_fee_payer.key() == offer.fee_payer)] 
    pub original_fee_payer: UncheckedAccount<'info>,

    /// SPL System Program, required for account allocation.
    pub system_program: Program<'info, System>,

    /// SPL Token Program, required for transferring tokens.
    pub token_program: Program<'info, Token>,

    /// Rent
    pub rent: Sysvar<'info, Rent>,

    /// Is a SOL account if sol, is a token account if price mint set
    /// CHECK: this is safe
    #[account(mut, 
        seeds=[
            PDA_PREFIX, 
            config.authority.key().as_ref(), 
            &tag.uid.to_le_bytes(),
            LISTING,
            TOKEN
        ], bump)]
    pub listing_token: UncheckedAccount<'info>,

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

    /// Optional accounts only needed if accepting an Offer that will remain vaulted:
    /// All of these accounts get checked in util function because of older code in
    /// claim_sprinkle, so we avoid doing redundant checks here, making them UncheckedAccounts.
    /// These all correspond to identical fields from claim_sprinkle.

    /// Check: No
    pub token_metadata: Option<UncheckedAccount<'info>>,
    /// Check: No
    pub token_metadata_program: Option<UncheckedAccount<'info>>,
    /// Check: No
    pub ata_program: Option<UncheckedAccount<'info>>,
    /// Check: No
    pub token_mint: Option<UncheckedAccount<'info>>,
    /// Check: No
    pub edition: Option<UncheckedAccount<'info>>,
    /// Check: No
    pub user_token_account: Option<UncheckedAccount<'info>>,
    /// Check: No
    pub token: Option<UncheckedAccount<'info>>,

}



pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, AcceptOffer<'info>>,
    creator_bump: u8, // Ignored except in hotpotato use. In hotpotato is used to make the token account.
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

    let offer_token_seeds = &[
        PDA_PREFIX, 
        authority.as_ref(), 
        &tag.uid.to_le_bytes(),
        LISTING,
        OFFER,
        buyer_key.as_ref(),
        TOKEN,
        &[*ctx.bumps.get("offer_token").unwrap()]
    ];

    let config_seeds = &[&PDA_PREFIX[..], &config.authority.as_ref()[..], &[config.bump]];


    listing.agreed_price = Some(offer.offer_amount);
    listing.chosen_buyer = Some(offer.buyer);

    if listing.vaulted_preferred {
        require!(ctx.accounts.token_metadata.is_some(), ErrorCode::MissingVaultOfferField);
        require!(ctx.accounts.token_metadata_program.is_some(), ErrorCode::MissingVaultOfferField);
        require!(ctx.accounts.ata_program.is_some(), ErrorCode::MissingVaultOfferField);
        require!(ctx.accounts.token_mint.is_some(), ErrorCode::MissingVaultOfferField);
        require!(ctx.accounts.edition.is_some(), ErrorCode::MissingVaultOfferField);
        require!(ctx.accounts.user_token_account.is_some(), ErrorCode::MissingVaultOfferField);
        require!(ctx.accounts.token.is_some(), ErrorCode::MissingVaultOfferField);

        // Need to add shifting logic here.
        // It remains vaulted, but the buyer now becomes the holder.
        move_hot_potato(MoveHotPotatoArgs{
            token_metadata: &ctx.accounts.token_metadata.unwrap().to_account_info(),
            token_metadata_program: &ctx.accounts.token_metadata_program.unwrap().to_account_info(),
            ata_program: &ctx.accounts.ata_program.unwrap().to_account_info(),
            token_mint: &ctx.accounts.token_mint.unwrap().to_account_info(),
            edition: &ctx.accounts.edition.unwrap().to_account_info(),
            user_token_account: &ctx.accounts.user_token_account.unwrap().to_account_info(),
            token: &ctx.accounts.token.unwrap().to_account_info(),
            tag,
            config,
            user: buyer,
            rent: &ctx.accounts.rent,
            system_program: &ctx.accounts.system_program,
            token_program: &ctx.accounts.token_program,
            payer: &ctx.accounts.signer,
            creator_bump,
            config_seeds,
        })?;
        tag.vaulted = true;
        tag.vault_authority = Some(buyer_key);
        listing.state = ListingState::Vaulted;
    } else {
        listing.state = ListingState::Accepted;
    }
    
    if listing.price_mint.is_some() {
        let cpi_accounts = token::Transfer {
            from: ctx.accounts.offer_token.to_account_info(),
            to: ctx.accounts.listing_token.to_account_info(),
            authority: offer.to_account_info(),
        };
        let context =
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(context.with_signer(&[&offer_seeds[..]]), offer.offer_amount)?;

        let cpi_accounts = token::CloseAccount {
            account: ctx.accounts.offer_token.to_account_info(),
            destination: original_fee_payer.to_account_info(),
            authority: offer.to_account_info(),
        };
        let context =
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::close_account(context.with_signer(&[&offer_seeds[..]]))?;
    } else {
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.offer_token.key(),
            &ctx.accounts.listing_token.key(),
            offer.offer_amount,
        );

        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &[
                ctx.accounts.offer_token.to_account_info(),
                ctx.accounts.listing_token.to_account_info(),
            ],
            &[offer_token_seeds]
        )?;
    }

    offer.close(original_fee_payer.to_account_info())?;    
    Ok(())
}

