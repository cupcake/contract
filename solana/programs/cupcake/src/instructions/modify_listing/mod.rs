use std::str::FromStr;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::program::{invoke_signed, invoke};
use anchor_lang::solana_program::system_program;
use anchor_spl::token::{self, Token, Mint};
use mpl_token_auth_rules::payload::Payload;
use mpl_token_metadata;
use mpl_token_metadata::instruction::{
    thaw_delegated_account, freeze_delegated_account, 
    mint_new_edition_from_master_edition_via_token
};
use mpl_token_metadata::processor::AuthorizationData;
use mpl_token_metadata::state::{Metadata, TokenMetadataAccount};
use crate::errors::ErrorCode;
use crate::state::{PDA_PREFIX, LISTING, Listing, ListingState, TOKEN};
use crate::state::{bakery::*, sprinkle::*, user_info::*};
use crate::utils::{
    create_program_token_account_if_not_present,
    assert_is_ata, assert_keys_equal, 
    create_or_allocate_account_raw, 
    sighash, grab_update_authority, 
    get_master_edition_supply,
};

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct PriceSettings {
    /// Set to None to use SOL
    price_mint: Option<Pubkey>,
    /// Set to None if you only want to use Offers, if set to something, any offer at or above price
    /// will auto accept. Like buy it now
    price: Option<u64>,
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
    pub price_mint: Option<Account<'info, Mint>>
}



pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, ModifyListing<'info>>,
    args: ModifyListingArgs
  ) -> Result<()> {   
      let tag = &mut ctx.accounts.tag;
      let config = &ctx.accounts.config;
      let payer = &ctx.accounts.payer;
      let mut listing = &mut ctx.accounts.listing;
      let system_program = &ctx.accounts.system_program;
      let rent = &ctx.accounts.rent;
      let token_program = &ctx.accounts.token_program;
      let listing_token = &ctx.accounts.listing_token;
      let price_mint = &ctx.accounts.price_mint;
      let config_seeds = &[&PDA_PREFIX[..], &config.authority.as_ref()[..], &[config.bump]];
      let config_seeds = &[&PDA_PREFIX[..], &config.authority.as_ref()[..], &[config.bump]];
      let listing_seeds = &[&PDA_PREFIX[..], &config.authority.as_ref()[..], &tag.uid.to_le_bytes()[..], &LISTING[..], &[listing.bump]];
      

      if args.next_state == Some(ListingState::Initialized) {
        listing.bump = *ctx.bumps.get("listing").unwrap();
      }


      if payer.key() != config.authority && args.next_state != Some(ListingState::Initialized) {
        return Err(ErrorCode::MustUseConfigAsPayer.into());
      }

      if payer.key() != config.authority && listing.state != ListingState::Initialized {
        return Err(ErrorCode::MustUseConfigAsPayer.into());
      }

      if let Some(settings) = args.price_settings {
        if listing.state == ListingState::Initialized || 
            listing.state == ListingState::Received {
            listing.price_mint = settings.price_mint;
            listing.price = settings.price;

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
        } else {
            return Err(ErrorCode::CannotChangePriceSettingsInThisState.into());
        }
      }

      if let Some(collection) = args.collection {
        listing.collection = collection;
      }

      let amount_in_residence = listing.to_account_info().lamports();
      if listing.price_mint.is_some() {

      }

      if let Some(next_state) = args.next_state {
        if next_state == ListingState::Received || next_state == ListingState::Initialized {
            // Since only we can move back to received, presumably we wont move it while
            require!(listing.price_mint.is_none() || listing_token_account.amount() == 0, ErrorCode::ListingAtaMustBeEmpty);
                
            
            listing.chosen_buyer = None;
          }
      } 

      
    Ok(())
}

