use anchor_lang::prelude::*;
use anchor_spl::token::{Token, Mint, TokenAccount};
use crate::errors::ErrorCode;
use crate::state::{PDA_PREFIX, LISTING, Listing, ListingState, ListingVersion, TOKEN};
use crate::state::{bakery::*, sprinkle::*};
use crate::utils::{
    create_program_token_account_if_not_present
};

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct PriceSettings {
    /// Set to None to use SOL
    price_mint: Option<Pubkey>,
    /// Set to None if you only want to use Offers, if set to something, any offer at or above price
    /// will auto accept. Like buy it now
    set_price: Option<u64>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct ModifyListingArgs {
    /// Price Settings
    pub price_settings: Option<PriceSettings>,
    /// Unchecked collection of NFT. Used to rpc filter on listings.
    pub collection: Option<Pubkey>,

    pub vaulted_preferred: Option<bool>,

    /// New state to go to
    pub next_state: Option<ListingState>,

}

#[derive(Accounts)]
pub struct ModifyListing<'info> {
    /// Account which pays the network and rent fees, for this transaction only.
    #[account(mut, constraint=payer.key() == config.authority || payer.key() == seller.key())]
    pub payer: Signer<'info>,

    /// The seller.
    /// CHECK: No check.
    pub seller: UncheckedAccount<'info>,

    // The hot potato token account of the seller.
    #[account(
        seeds=[
            PDA_PREFIX, 
            config.authority.as_ref(), 
            &tag.uid.to_le_bytes(),
            seller.key().as_ref(), 
            tag.token_mint.as_ref()], bump)] 
    pub seller_token: Account<'info, TokenAccount>,

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
    #[account(init_if_needed, 
              seeds = [
                  PDA_PREFIX, 
                  config.authority.key().as_ref(), 
                  &tag.uid.to_le_bytes(),
                  LISTING
              ], 
              space = Listing::SIZE,
              constraint=listing.version == ListingVersion::Unset || listing.seller == seller.key(),
              payer=payer,
              bump)]
    pub listing: Box<Account<'info, Listing>>,

    /// SPL System Program, required for account allocation.
    pub system_program: Program<'info, System>,

    /// SPL Token Program, required for transferring tokens.
    pub token_program: Program<'info, Token>,

    /// SPL Rent Sysvar, required for account allocation.
    pub rent: Sysvar<'info, Rent>,

    /// Is a SOL account if using SOL, and a token account if using a price mint
    /// CHECK: this is safe
    #[account(mut, seeds=[
        PDA_PREFIX, 
        config.authority.key().as_ref(), 
        &tag.uid.to_le_bytes(),
        LISTING,
        TOKEN
    ],
    bump)]
    pub listing_token: UncheckedAccount<'info>,

    /// Mint of type of money you want to be accepted for this listing
    pub price_mint: Option<Account<'info, Mint>>,

    /// Buyer's token account, if they are using a token to pay for this listing
    #[account(mut)]
    pub buyer_token: Option<Account<'info, TokenAccount>>,

    /// Buyer, if present
    #[account(mut, constraint= listing.chosen_buyer.is_none() || listing.chosen_buyer == Some(buyer.key()))] 
    pub buyer: Option<UncheckedAccount<'info>>,



}



pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, ModifyListing<'info>>,
    args: ModifyListingArgs
  ) -> Result<()> {   
        let tag = &mut ctx.accounts.tag;
        let config = &ctx.accounts.config;
        let payer = &ctx.accounts.payer;
        let seller = &ctx.accounts.seller;
        let listing = &mut ctx.accounts.listing;
        let system_program = &ctx.accounts.system_program;
        let rent = &ctx.accounts.rent;
        let token_program = &ctx.accounts.token_program;
        let listing_token = &ctx.accounts.listing_token;
        let price_mint = &ctx.accounts.price_mint;
        let seller_token = &ctx.accounts.seller_token;
        let listing_token_seeds = &[&PDA_PREFIX[..], &config.authority.as_ref()[..], &tag.uid.to_le_bytes()[..], &LISTING[..], &TOKEN[..], &[*ctx.bumps.get("listing_token").unwrap()]];

        // tested
        if listing.version == ListingVersion::Unset {
            listing.bump = *ctx.bumps.get("listing").unwrap();
            listing.fee_payer = payer.key();
            listing.seller = seller.key();
            // Redundant check but just in case.
            require!(seller_token.owner == seller.key(), ErrorCode::SellerMustBeLister);
            require!(seller_token.amount > 0, ErrorCode::MustHoldTokenToSell);
            require!(payer.key() == seller.key(), ErrorCode::SellerMustInitiateSale);
        }

        if payer.key() != config.authority && 
            listing.state != ListingState::ForSale {
            // Don't let a user do anything to an order that isnt for salke
            return Err(ErrorCode::MustUseConfigAsPayer.into());
        }

        // User can only create the listing or cancel it, after that, cupcake must do the rest.
        if payer.key() != config.authority && 
            args.next_state != Some(ListingState::ForSale) && 
            args.next_state != Some(ListingState::UserCanceled) &&
            !args.next_state.is_none() {
            return Err(ErrorCode::MustUseConfigAsPayer.into());
        }

        if let Some(settings) = args.price_settings {
            // Can only change the price mint or price during initialization.
            // Once it is for sale, there will be bids with escrowed coins potentially of wrong mints or amounts that could be accepted.
            // After, to make things easier, we allow price changes, but not mint changes. However, bids that do become eligible for auto-acceptance
            // won't be - they will need to be closed and remade, or accepted manually by the seller.
            if listing.version == ListingVersion::Unset {
                listing.price_mint = settings.price_mint;
                listing.set_price = settings.set_price;

                if listing.price_mint.is_some() {
                    let price_mint_unwrapped = match price_mint {
                        Some(mint) => mint,
                        None => return Err(ErrorCode::MustSendUpPriceMint.into())
                    };
                    
                    create_program_token_account_if_not_present(
                        listing_token,
                        system_program,
                        payer,
                        token_program,
                        price_mint_unwrapped,
                        &listing.to_account_info(),
                        rent,
                        listing_token_seeds
                    )?;
                }
            } else if listing.state == ListingState::ForSale {
                // Regardless of what state you are transitioning to, if you are in ForSale, you can only change the price, for simplicity.
                //tested
                listing.set_price = settings.set_price;
                
                require!(listing.price_mint == settings.price_mint, ErrorCode::CannotChangePriceMintInThisState);
            } else {
                return Err(ErrorCode::CannotChangePriceSettingsInThisState.into());
            }
        }

        // Change filtering collection whenever you want.
        if let Some(collection) = args.collection {
            listing.collection = collection;
        }

        if let Some(vaulted_preferred) = args.vaulted_preferred {
            listing.vaulted_preferred = vaulted_preferred;
        }

        // Accepted is a frozen endpoint, cannot move from here.
        require!(listing.state != ListingState::Accepted, ErrorCode::ListingFrozen);


        if let Some(next_state) = args.next_state {
            // Basically you can only go from ForSale to a form of cancelled,
            // and from cancelled to returned (or for sale to returned).
            // Those are the transitions.

            if next_state == ListingState::ForSale || next_state == ListingState::UserCanceled || 
                next_state == ListingState::CupcakeCanceled{
                require!(listing.chosen_buyer.is_none(), ErrorCode::ChosenBuyerSet);
            }

            if next_state != ListingState::CupcakeCanceled && next_state != ListingState::UserCanceled &&
                next_state != ListingState::ForSale && listing.chosen_buyer.is_none() {
                return Err(ErrorCode::MustChooseBuyer.into());
            }

            // Cannot claim to have user cancel if you are not user
            // Conversely, cannot cancel as cupcake if you are not cupcake.
            if next_state == ListingState::CupcakeCanceled {
                require!(payer.key() == config.authority, ErrorCode::MustUseConfigAsPayer);
            } else if next_state == ListingState::UserCanceled {
                require!(payer.key() == listing.seller, ErrorCode::MustUseSellerAsPayer);
            }

            // tested
            // To move into the accepted state, please use the accept offer instruction as seller,
            // or as buyer, make bid that is above or at asking price.
            require!(next_state != ListingState::Accepted, ErrorCode::CannotAcceptFromModify);
        } 

        listing.state = args.next_state.unwrap_or(listing.state);
        // Set at the bottom so we can have one run through where we can check
        // if this is the first time through.
        listing.version = ListingVersion::V1;
        Ok(())
}

