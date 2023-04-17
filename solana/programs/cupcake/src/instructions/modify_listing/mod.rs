use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Mint, TokenAccount};
use mpl_token_metadata;
use crate::errors::ErrorCode;
use crate::state::{PDA_PREFIX, LISTING, Listing, ListingState, TOKEN};
use crate::state::{bakery::*, sprinkle::*};
use crate::utils::{
    create_program_token_account_if_not_present,
    assert_is_ata
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
    #[account(mut)]
    pub payer: Signer<'info>,

    /// PDA which stores token approvals for a Bakery, and executes the transfer during claims.
    #[account(mut)]
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
              payer=payer,
              bump)]
    pub listing: Box<Account<'info, Listing>>,

    /// SPL System Program, required for account allocation.
    pub system_program: Program<'info, System>,

    /// SPL Token Program, required for transferring tokens.
    pub token_program: Program<'info, Token>,

    /// SPL Rent Sysvar, required for account allocation.
    pub rent: Sysvar<'info, Rent>,

    /// Will be initialized only if needed, we dont do typing here because
    /// we really dont know if this is needed at all until logic fires.
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
        let listing = &mut ctx.accounts.listing;
        let system_program = &ctx.accounts.system_program;
        let rent = &ctx.accounts.rent;
        let token_program = &ctx.accounts.token_program;
        let listing_token = &ctx.accounts.listing_token;
        let price_mint = &ctx.accounts.price_mint;
        let listing_seeds = &[&PDA_PREFIX[..], &config.authority.as_ref()[..], &tag.uid.to_le_bytes()[..], &LISTING[..], &[listing.bump]];
      

        if args.next_state == Some(ListingState::Initialized) {
            listing.bump = *ctx.bumps.get("listing").unwrap();
        }

        // User can only create the listing, after that, cupcake must do the rest.
        if payer.key() != config.authority && args.next_state != Some(ListingState::Initialized) {
            return Err(ErrorCode::MustUseConfigAsPayer.into());
        }

        if payer.key() != config.authority && listing.state != ListingState::Initialized {
            return Err(ErrorCode::MustUseConfigAsPayer.into());
        }

        // Scanned is a frozen endpoint, cannot move from here.
        require!(listing.state != ListingState::Scanned, ErrorCode::ListingFrozen);

        // Scanning can only happen from claim.
        require!(args.next_state != Some(ListingState::Scanned), ErrorCode::CannotScanFromModify);

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
                    let listing_token_unwrapped = match listing_token {
                        Some(lt) => lt,
                        None => return Err(ErrorCode::MustSendUpListingTokenAccount.into())
                    };

                    let price_mint_unwrapped = match price_mint {
                        Some(mint) => mint,
                        None => return Err(ErrorCode::MustSendUpPriceMint.into())
                    };
                    
                    create_program_token_account_if_not_present(
                        listing_token_unwrapped,
                        system_program,
                        payer,
                        token_program,
                        price_mint_unwrapped,
                        &listing.to_account_info(),
                        rent,
                        listing_seeds
                    )?;
                }
            } else if listing.state == ListingState::ForSale {
                // Regardless of what state you are transitioning to, if you are in ForSale, you can only change the price, for simplicity. We could detect
                // if you were going back to initialized or received and then allow for mint changes but let's not be greedy.

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
                next_state == ListingState::UserCanceled || next_state == ListingState::CupcakeCanceled {
                // Refund the buyer, if there is one.
                if let Some(buyer) = listing.chosen_buyer {
                    if let Some(price_mint) = listing.price_mint {

                        let buyer_token_acct = ctx.accounts.buyer_token.clone().unwrap();
                        assert_is_ata(
                            &buyer_token_acct.to_account_info(), 
                            &buyer, 
                            &price_mint, 
                            None)?;

                        let listing_token_acc: Account<TokenAccount> = Account::try_from(&listing_token.clone().unwrap())?;
                        let amount_in_residence = listing_token_acc.amount;

                        let cpi_accounts = token::Transfer {
                            from: listing_token_acc.to_account_info(),
                            to: buyer_token_acct.to_account_info(),
                            authority: listing.to_account_info(),
                        };
                        let context =
                            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
                        token::transfer(context.with_signer(&[&listing_seeds[..]]), amount_in_residence)?;
            
                    } else { 
                        let amount_in_residence = listing.to_account_info().lamports().
                            checked_sub(Rent::get()?.minimum_balance(Listing::SIZE)).
                            ok_or(ErrorCode::NumericalOverflowError)?;

                        let ix = anchor_lang::solana_program::system_instruction::transfer(
                            &listing.key(),
                            &buyer,
                            amount_in_residence,
                        );
                        anchor_lang::solana_program::program::invoke(
                            &ix,
                            &[
                                listing.to_account_info(),
                                ctx.accounts.buyer.clone().unwrap().to_account_info(),
                            ],
                        )?;
                    }
                }
                
                listing.chosen_buyer = None;
            }
        } 

    listing.state = args.next_state.unwrap_or(listing.state);
    Ok(())
}
