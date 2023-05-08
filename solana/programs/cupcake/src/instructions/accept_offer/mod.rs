use anchor_lang::prelude::*;
use anchor_spl::token::{Token, Mint};
use crate::state::{PDA_PREFIX, LISTING, Listing, ListingState, Offer, TOKEN, OFFER};
use crate::state::{bakery::*, sprinkle::*};
use crate::utils::{move_hot_potato, MoveHotPotatoArgs, empty_offer_escrow_to_seller, EmptyOfferEscrowToSellerArgs};
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

    /// Buyer
    /// CHECK:  this is safe
    #[account(mut, constraint=seller.key() == listing.seller)] 
    pub seller: UncheckedAccount<'info>,

    /// Original fee payer, to receive lamports back
    /// CHECK:  this is safe
    #[account(mut, constraint=original_fee_payer.key() == offer.fee_payer)] 
    pub original_fee_payer: UncheckedAccount<'info>,


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

    // ATA of seller for price mint, if necessary
    #[account(mut)] 
    pub seller_ata: Option<UncheckedAccount<'info>>,


    /// Mint of type of money you want to be accepted for this listing
    pub price_mint: Option<Account<'info, Mint>>,

    /// All of these accounts get checked in util function because of older code in
    /// claim_sprinkle, so we avoid doing redundant checks here, making them UncheckedAccounts.
    /// These all correspond to identical fields from claim_sprinkle.

    /// Check: No
    pub token_metadata: UncheckedAccount<'info>,
    /// Check: No
    pub token_metadata_program: UncheckedAccount<'info>,
    /// Check: No
    pub ata_program: UncheckedAccount<'info>,
    /// Check: No
    pub token_mint: UncheckedAccount<'info>,
    /// Check: No
    pub edition: UncheckedAccount<'info>,
    /// Check: No
    pub user_token_account: UncheckedAccount<'info>,
    /// Check: No
    pub token: UncheckedAccount<'info>,

    /// SPL System Program, required for account allocation.
    pub system_program: Program<'info, System>,

    /// SPL Token Program, required for transferring tokens.
    pub token_program: Program<'info, Token>,

    /// Rent
    pub rent: Sysvar<'info, Rent>,

    // Remaining accounts:
    // OUR_ADDRESS (w) sol account for collecting fees
    // OUR_ADDRESS (w) ata account for collecting price mint fees
    // royalty sol account (w) followed by royalty ata (w) pair from NFT (derive ATA from royalty accounts) [up to 5]
    // Note you only need to pass the ata account after the sol account IF using a price mint, otherwise its only the sol accounts
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
    let system_program = &ctx.accounts.system_program;
    let buyer = &ctx.accounts.buyer;
    let token_metadata =  &ctx.accounts.token_metadata;
    let token_metadata_program =  &ctx.accounts.token_metadata_program;
    let ata_program =  &ctx.accounts.ata_program;
    let token_mint =  &ctx.accounts.token_mint;
    let edition =  &ctx.accounts.edition;
    let user_token_account =  &ctx.accounts.user_token_account;
    let token =  &ctx.accounts.token;
    let price_mint = &ctx.accounts.price_mint;
    let offer_token = &ctx.accounts.offer_token;
    let signer = &ctx.accounts.signer;
    let seller = &ctx.accounts.seller;
    let seller_ata = &ctx.accounts.seller_ata;
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
        // Need to add shifting logic here.
        // It remains vaulted, but the buyer now becomes the holder.
        tag.vaulted = true;
        tag.vault_authority = Some(buyer_key);
        listing.state = ListingState::Vaulted;
    } else {
        // Moves to accepted on the way to Shipped -> Scanned..
        tag.vaulted = false;
        tag.vault_authority = None;
        listing.state = ListingState::Accepted;
    }

    move_hot_potato(MoveHotPotatoArgs{
        token_metadata: &token_metadata.to_account_info(),
        token_metadata_program: &token_metadata_program.to_account_info(),
        ata_program: &ata_program.to_account_info(),
        token_mint: &token_mint.to_account_info(),
        edition: &edition.to_account_info(),
        user_token_account: &user_token_account.to_account_info(),
        token: &token.to_account_info(),
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
    
    let tm = token_metadata.to_account_info();
    let pm = if listing.price_mint.is_none() { 
        system_program.to_account_info() 
    } else { 
        price_mint.clone().unwrap().to_account_info() 
    };
    let ap = ata_program.to_account_info();
    let rent = ctx.accounts.rent.to_account_info();

    require!(listing.price_mint.is_none() || Some(pm.key()) == listing.price_mint, ErrorCode::PriceMintMismatch);

    empty_offer_escrow_to_seller(EmptyOfferEscrowToSellerArgs {
        remaining_accounts: ctx.remaining_accounts,
        config,
        tag,
        listing: &listing,
        offer: &offer,
        offer_token_account: &offer_token.to_account_info(),
        offer_seeds,
        offer_token_seeds,
        token_metadata: &tm,
        payer: &signer,
        price_mint: &pm,
        ata_program: &ap,
        token_program: &ctx.accounts.token_program,
        system_program: &ctx.accounts.system_program,
        rent: &rent,
        seller: &seller,
        seller_ata: match seller_ata {
            Some(val) => val,
            None => &seller,
        },
        program_id: ctx.program_id,
    })?;

    offer.close(original_fee_payer.to_account_info())?;    
    Ok(())
}

