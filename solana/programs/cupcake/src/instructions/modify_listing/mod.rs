use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Token, Mint, TokenAccount};
use crate::errors::ErrorCode;
use crate::state::{PDA_PREFIX, LISTING, Listing, ListingState, TOKEN};
use crate::state::{bakery::*, sprinkle::*};
use crate::utils::{
    create_program_token_account_if_not_present,
    assert_is_ata,
    empty_listing_escrow_to_seller,
    EmptyListingEscrowToSellerArgs,
    assert_derivation
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
              constraint=listing.state == ListingState::Initialized || listing.seller == seller.key(),
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

    /// Token metadata, if moving to scanned state
    /// CHECK: this is safe
    #[account(mut)] 
    pub token_metadata: Option<UncheckedAccount<'info>>,


    /// ata program, if moving to scanned state
    pub ata_program: Option<Program<'info, AssociatedToken>>,


    /// Seller ata is either the ata if using price mint, or is the seller itself if using SOL. Only need to pass this up if moving to scanned state, otherwise
    /// does nothing.
    /// CHECK: this is safe
    #[account(mut)] 
    pub seller_ata: Option<UncheckedAccount<'info>>,

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
        let token_metadata = &ctx.accounts.token_metadata;
        let ata_program = &ctx.accounts.ata_program;
        let seller_ata = &ctx.accounts.seller_ata;
        let seller_token = &ctx.accounts.seller_token;
        let listing_seeds = &[&PDA_PREFIX[..], &config.authority.as_ref()[..], &tag.uid.to_le_bytes()[..], &LISTING[..], &[listing.bump]];
        let listing_token_seeds = &[&PDA_PREFIX[..], &config.authority.as_ref()[..], &tag.uid.to_le_bytes()[..], &LISTING[..], &TOKEN[..], &[*ctx.bumps.get("listing_token").unwrap()]];

        // tested
        if args.next_state == Some(ListingState::Initialized) {
            listing.bump = *ctx.bumps.get("listing").unwrap();
            listing.fee_payer = payer.key();
            listing.seller = seller.key();
            // Redundant check but just in case.
            require!(seller_token.owner == seller.key(), ErrorCode::SellerMustBeLister);
            require!(seller_token.amount > 0, ErrorCode::MustHoldTokenToSell);
            require!(payer.key() == seller.key(), ErrorCode::SellerMustInitiateSale);
        }

        // If there is an agreed price, or we are trying to move states, we need to check on whether
        // you are user or cupcake. Otherwise, you can only just be trying to change price
        // or collection, and that's pretty much fine.
        if listing.agreed_price.is_some() || args.next_state.is_some() {
            // tested
            // User can only create the listing or cancel it, after that, cupcake must do the rest.
            if payer.key() != config.authority && args.next_state != Some(ListingState::Initialized) && args.next_state != Some(ListingState::UserCanceled) {
                return Err(ErrorCode::MustUseConfigAsPayer.into());
            }

            if payer.key() != config.authority && listing.state != ListingState::Initialized {
                // If the user is trying to do something outside of the initialized state, 
                // then if they are trying to do something other than cancel, or they are doing it while
                // in the shipped state, blow up. We dont want them cancelling a shipped order,
                // and we dont want them doing any other thing than cancelling.
                // tested
                if args.next_state != Some(ListingState::UserCanceled) || listing.state == ListingState::Shipped {
                    return Err(ErrorCode::MustUseConfigAsPayer.into());
                }
            }

        }

        // Cannot claim to have user cancel if you are not user
        // Conversely, cannot cancel as cupcake if you are not cupcake.
        if args.next_state == Some(ListingState::CupcakeCanceled) {
            require!(payer.key() == config.authority, ErrorCode::MustUseConfigAsPayer);
        } else if args.next_state == Some(ListingState::UserCanceled) {
            require!(payer.key() == listing.seller, ErrorCode::MustUseSellerAsPayer);
        }

        // tested
        // Scanned / Returned is a frozen endpoint, cannot move from here.
        require!(listing.state != ListingState::Scanned && listing.state != ListingState::Returned, ErrorCode::ListingFrozen);

        // tested
        // To move into the accepted state, please use the accept offer instruction as seller,
        // or as buyer, make bid that is above or at asking price.
        require!(args.next_state != Some(ListingState::Accepted), ErrorCode::CannotAcceptFromModify);

        if let Some(settings) = args.price_settings {
            // Can only change the price mint or price during initialized/received.
            // Once it is for sale, there will be bids with escrowed coins potentially of wrong mints or amounts that could be accepted.
            // In ForSale, to make things easier, we allow price changes, but not mint changes. However, bids that do become eligible for auto-acceptance
            // won't be - they will need to be closed and remade, or accepted manually by the seller.
            if listing.state == ListingState::Initialized || 
                listing.state == ListingState::Received ||
                args.next_state == Some(ListingState::Initialized) ||
                args.next_state == Some(ListingState::Received)  {
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
                // Regardless of what state you are transitioning to, if you are in ForSale, you can only change the price, for simplicity. We could detect
                // if you were going back to initialized or received and then allow for mint changes but let's not be greedy.
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


        if let Some(next_state) = args.next_state {
            if next_state == ListingState::Received || next_state == ListingState::Initialized || next_state == ListingState::ForSale ||
                next_state == ListingState::UserCanceled || next_state == ListingState::CupcakeCanceled || next_state == ListingState::Returned {
                // Refund the buyer, if there is one.
                if let Some(buyer) = listing.chosen_buyer {
                    if let Some(price_mint) = listing.price_mint {
                        require!(ctx.accounts.buyer_token.is_some(), ErrorCode::NoBuyerTokenPresent);

                        let buyer_token_acct = ctx.accounts.buyer_token.clone().unwrap();
                        assert_is_ata(
                            &buyer_token_acct.to_account_info(), 
                            &buyer, 
                            &price_mint, 
                            None)?;

                        let cpi_accounts = token::Transfer {
                            from: ctx.accounts.listing_token.to_account_info(),
                            to: buyer_token_acct.to_account_info(),
                            authority: listing.to_account_info(),
                        };
                        let context =
                            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
                        token::transfer(context.with_signer(&[&listing_seeds[..]]), listing.agreed_price.unwrap())?;
                    } else { 
                        require!(ctx.accounts.buyer.is_some(), ErrorCode::NoBuyerPresent);
                        // tested
                        let ix = anchor_lang::solana_program::system_instruction::transfer(
                            &listing_token.key(),
                            &buyer,
                            listing_token.to_account_info().lamports(),
                        );
                        anchor_lang::solana_program::program::invoke_signed(
                            &ix,
                            &[
                                listing_token.to_account_info(),
                                ctx.accounts.buyer.clone().unwrap().to_account_info(),
                            ],
                            &[listing_token_seeds]
                        )?;
                    }
                }
                
                listing.chosen_buyer = None;
            } else if next_state == ListingState::Scanned {
                // tested (with sol only)

                // Can force an escrow empty and go to scanned if we feel the package arrived.

                require!(ctx.accounts.token_metadata.is_some(), ErrorCode::NoTokenMetadataPresent);
                require!(listing.price_mint.is_none() || ctx.accounts.price_mint.is_some(), ErrorCode::NoPriceMintPresent);
                require!(ctx.accounts.ata_program.is_some(), ErrorCode::NoAtaProgramPresent);
                require!(ctx.accounts.seller_ata.is_some(), ErrorCode::NoSellerAtaPresent);
                require!(listing.agreed_price.is_some(), ErrorCode::NeedAgreedPrice);
                require!(listing.chosen_buyer.is_some(), ErrorCode::NeedBuyer);

                let tm = token_metadata.clone().unwrap().to_account_info();
                let pm = if listing.price_mint.is_none() { 
                    system_program.to_account_info() 
                } else { 
                    price_mint.clone().unwrap().to_account_info() 
                };
                let lm = listing_token.to_account_info();
                let seller = seller_ata.clone().unwrap().to_account_info();
                let ap = ata_program.clone().unwrap().to_account_info();
                let rent = ctx.accounts.rent.to_account_info();

                require!(listing.price_mint.is_none() || Some(pm.key()) == listing.price_mint, ErrorCode::PriceMintMismatch);

                assert_derivation(
                    &mpl_token_metadata::id(),
                    &tm,
                    &[
                        mpl_token_metadata::state::PREFIX.as_bytes(),
                        mpl_token_metadata::id().as_ref(),
                        tag.token_mint.as_ref(),
                    ],
                )?;
                empty_listing_escrow_to_seller(EmptyListingEscrowToSellerArgs {
                    remaining_accounts: ctx.remaining_accounts,
                    config,
                    tag,
                    listing: &listing,
                    listing_token_account: &lm,
                    listing_seeds,
                    listing_token_seeds,
                    token_metadata: &tm,
                    payer: &payer,
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
            }
        } 

    listing.state = args.next_state.unwrap_or(listing.state);
    Ok(())
}

