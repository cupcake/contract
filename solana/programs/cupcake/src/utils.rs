use crate::{
    errors::ErrorCode,
    state::{Config, Listing, Offer, Tag, LISTING, OFFER, PDA_PREFIX, TOKEN},
};
use anchor_lang::{
    error,
    prelude::{
        next_account_info, Account, AccountInfo, CpiContext, Program, Pubkey, Rent, Result,
        SolanaSysvar, System, Sysvar, UncheckedAccount,
    },
    require,
    solana_program::{
        hash, msg,
        program::{invoke, invoke_signed},
        program_pack::{IsInitialized, Pack},
        system_instruction,
    },
    Key, ToAccountInfo,
};
use anchor_spl::{
    associated_token::get_associated_token_address,
    token::{self, Mint, Token},
};
use arrayref::array_ref;
use mpl_token_metadata::{
    instruction::{freeze_delegated_account, thaw_delegated_account},
    state::{Creator, Metadata, TokenMetadataAccount},
};
use spl_token::instruction::initialize_account2;
use std::{convert::TryInto, slice::Iter, str::FromStr};

// Out of 10000, we take 0.5% of every sale.
pub const OUR_FEES: u16 = 50;
// Placeholder
pub const OUR_ADDRESS: &str = "B3JML1kMs1dRTTEWKqP5uwoTzaKAjA3gVMUFf1vTRk2U";

/// Checks if two PublicKeys are equal.
pub fn assert_keys_equal(key1: Pubkey, key2: Pubkey) -> Result<()> {
    if key1 != key2 {
        Err(error!(ErrorCode::PublicKeyMismatch))
    } else {
        Ok(())
    }
}

/// Checks if a provided account is an Associated Token Account.
pub fn assert_is_ata(
    ata: &AccountInfo,
    wallet: &Pubkey,
    mint: &Pubkey,
    delegate: Option<&Pubkey>,
) -> Result<spl_token::state::Account> {
    assert_owned_by(ata, &spl_token::id())?;
    let ata_account: spl_token::state::Account = assert_initialized(ata)?;
    assert_keys_equal(ata_account.owner, *wallet)?;
    assert_keys_equal(ata_account.mint, mint.key())?;
    assert_keys_equal(get_associated_token_address(wallet, mint), *ata.key)?;
    if delegate.is_none() {
        require!(
            ata_account.delegate.is_none(),
            ErrorCode::AtaShouldNotHaveDelegate
        );
    } else if let Some(allowed_del) = delegate {
        if ata_account.delegate.is_some() {
            let key = ata_account.delegate.unwrap();
            require!(key == *allowed_del, ErrorCode::AtaDelegateShouldBeConfig)
        }
    }
    Ok(ata_account)
}

/// Checks if one provided account is owned by a second.
pub fn assert_owned_by(account: &AccountInfo, owner: &Pubkey) -> Result<()> {
    if account.owner != owner {
        Err(error!(ErrorCode::IncorrectOwner))
    } else {
        Ok(())
    }
}

/// Checks if the provided account has already been initialized.
pub fn assert_initialized<T: Pack + IsInitialized>(account_info: &AccountInfo) -> Result<T> {
    let account: T = T::unpack_unchecked(&account_info.data.borrow())?;
    if !account.is_initialized() {
        Err(error!(ErrorCode::Uninitialized))
    } else {
        Ok(account)
    }
}

/// Grabs an NFT's update authority address from the raw account state.
pub fn grab_update_authority<'a>(metadata: &AccountInfo<'a>) -> Result<Pubkey> {
    let data = metadata.data.borrow();
    let key_bytes = array_ref![data, 1, 32];
    let key = Pubkey::new_from_array(*key_bytes);
    Ok(key)
}

/// Grabs the supply of a Master Edition NFT from the raw account state.
pub fn get_master_edition_supply(account_info: &AccountInfo) -> Result<u64> {
    // In token program, 1,8
    let data = account_info.try_borrow_data().unwrap();

    let bytes = array_ref![data, 1, 8];

    Ok(u64::from_le_bytes(*bytes))
}

/// Calculates the sighash of the union of two strings.
pub fn sighash(namespace: &str, name: &str) -> [u8; 8] {
    let preimage = format!("{}:{}", namespace, name);
    let mut sighash = [0u8; 8];
    sighash.copy_from_slice(&hash::hash(preimage.as_bytes()).to_bytes()[..8]);
    sighash
}

/// Create account almost from scratch, lifted from
/// https://github.com/solana-labs/solana-program-library/tree/master/associated-token-account/program/src/processor.rs#L51-L98
#[inline(always)]
pub fn create_or_allocate_account_raw<'a>(
    program_id: Pubkey,
    new_account_info: &AccountInfo<'a>,
    rent: &Sysvar<'a, Rent>,
    system_program: &Program<'a, System>,
    payer_info: &AccountInfo<'a>,
    size: usize,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    let required_lamports = rent
        .minimum_balance(size)
        .max(1)
        .saturating_sub(new_account_info.lamports());

    if required_lamports > 0 {
        msg!("Transfer {} lamports to the new account", required_lamports);
        invoke(
            &system_instruction::transfer(payer_info.key, new_account_info.key, required_lamports),
            &[
                payer_info.clone(),
                new_account_info.clone(),
                system_program.to_account_info(),
            ],
        )?;
    }

    let accounts = &[new_account_info.clone(), system_program.to_account_info()];

    msg!("Allocate space for the account");
    invoke_signed(
        &system_instruction::allocate(new_account_info.key, size.try_into().unwrap()),
        accounts,
        &[signer_seeds],
    )?;

    msg!("Assign the account to the owning program");
    invoke_signed(
        &system_instruction::assign(new_account_info.key, &program_id),
        accounts,
        &[signer_seeds],
    )?;

    Ok(())
}

pub fn create_program_token_account_if_not_present<'a>(
    program_account: &UncheckedAccount<'a>,
    system_program: &Program<'a, System>,
    fee_payer: &AccountInfo<'a>,
    token_program: &Program<'a, Token>,
    mint: &Account<'a, Mint>,
    owner: &AccountInfo<'a>,
    rent: &Sysvar<'a, Rent>,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    assert_owned_by(&mint.to_account_info(), &token_program.key())?;

    if program_account.data_is_empty() {
        create_or_allocate_account_raw(
            *token_program.key,
            &program_account.to_account_info(),
            &rent,
            system_program,
            fee_payer,
            spl_token::state::Account::LEN,
            signer_seeds,
        )?;

        invoke_signed(
            &initialize_account2(
                token_program.key,
                &program_account.key(),
                &mint.key(),
                &owner.key(),
            )
            .unwrap(),
            &[
                token_program.to_account_info(),
                mint.to_account_info(),
                program_account.to_account_info(),
                rent.to_account_info(),
                owner.clone(),
            ],
            &[signer_seeds],
        )?;
    } else {
        assert_owned_by(&program_account.to_account_info(), &token_program.key())?;
    }

    Ok(())
}

pub fn assert_derivation_with_bump(
    program_id: &Pubkey,
    account: &AccountInfo,
    seeds: &[&[u8]],
) -> Result<()> {
    let assumed_key = match Pubkey::create_program_address(seeds, program_id) {
        Ok(key) => key,
        Err(_) => return Err(ErrorCode::InvalidSeeds.into()),
    };

    assert_keys_equal(assumed_key, account.key())
}

pub fn assert_derivation(program_id: &Pubkey, account: &AccountInfo, path: &[&[u8]]) -> Result<u8> {
    let (key, bump) = Pubkey::find_program_address(&path, program_id);
    if key != *account.key {
        return Err(ErrorCode::InvalidSeeds.into());
    }
    Ok(bump)
}

pub fn make_ata<'a>(
    ata: AccountInfo<'a>,
    wallet: AccountInfo<'a>,
    mint: AccountInfo<'a>,
    fee_payer: AccountInfo<'a>,
    ata_program: AccountInfo<'a>,
    token_program: AccountInfo<'a>,
    system_program: AccountInfo<'a>,
    rent: AccountInfo<'a>,
    fee_payer_seeds: &[&[u8]],
) -> Result<()> {
    let seeds: &[&[&[u8]]];
    let as_arr = [fee_payer_seeds];

    if fee_payer_seeds.len() > 0 {
        seeds = &as_arr;
    } else {
        seeds = &[];
    }

    invoke_signed(
        &spl_associated_token_account::instruction::create_associated_token_account(
            &fee_payer.key,
            &wallet.key,
            &mint.key,
            token_program.key,
        ),
        &[
            ata,
            wallet,
            mint,
            fee_payer,
            ata_program,
            system_program,
            rent,
            token_program,
        ],
        seeds,
    )?;

    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn pay_creator_fees<'a>(
    remaining_accounts: &mut Iter<AccountInfo<'a>>,
    metadata_info: &AccountInfo<'a>,
    escrow_payment_account: &AccountInfo<'a>,
    payment_account_owner: &AccountInfo<'a>,
    fee_payer: &AccountInfo<'a>,
    treasury_mint: &AccountInfo<'a>,
    ata_program: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    rent: &AccountInfo<'a>,
    signer_seeds: &[&[u8]],
    fee_payer_seeds: &[&[u8]],
    size: u64,
    is_native: bool,
) -> Result<u64> {
    let metadata = Metadata::from_account_info(metadata_info)?;
    let fees = metadata.data.seller_fee_basis_points;
    let total_fee = (fees as u128)
        .checked_mul(size as u128)
        .ok_or(ErrorCode::NumericalOverflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::NumericalOverflow)? as u64;
    let mut our_fee = (OUR_FEES as u128)
        .checked_mul(size as u128)
        .ok_or(ErrorCode::NumericalOverflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::NumericalOverflow)? as u64;
    if our_fee == 0 {
        our_fee = 1; //minimum fee
    }
    let mut remaining_fee = total_fee;
    let remaining_size = size
        .checked_sub(total_fee)
        .ok_or(ErrorCode::NumericalOverflow)?
        .checked_sub(our_fee)
        .ok_or(ErrorCode::NumericalOverflow)?;

    pay_creator(
        remaining_accounts,
        escrow_payment_account,
        payment_account_owner,
        fee_payer,
        treasury_mint,
        ata_program,
        token_program,
        system_program,
        rent,
        signer_seeds,
        fee_payer_seeds,
        is_native,
        Creator {
            address: Pubkey::from_str(OUR_ADDRESS).unwrap(),
            verified: true,
            share: 100,
        },
        our_fee,
    )?;

    match metadata.data.creators {
        Some(creators) => {
            for creator in creators {
                let pct = creator.share as u128;
                let creator_fee = pct
                    .checked_mul(total_fee as u128)
                    .ok_or(ErrorCode::NumericalOverflow)?
                    .checked_div(100)
                    .ok_or(ErrorCode::NumericalOverflow)? as u64;
                remaining_fee = remaining_fee
                    .checked_sub(creator_fee)
                    .ok_or(ErrorCode::NumericalOverflow)?;
                pay_creator(
                    remaining_accounts,
                    escrow_payment_account,
                    payment_account_owner,
                    fee_payer,
                    treasury_mint,
                    ata_program,
                    token_program,
                    system_program,
                    rent,
                    signer_seeds,
                    fee_payer_seeds,
                    is_native,
                    creator,
                    creator_fee,
                )?;
            }
        }
        None => {
            msg!("No creators found in metadata");
        }
    }
    // Any dust is returned to the party posting the NFT
    Ok(remaining_size
        .checked_add(remaining_fee)
        .ok_or(ErrorCode::NumericalOverflow)?)
}

pub fn pay_creator<'a>(
    remaining_accounts: &mut Iter<AccountInfo<'a>>,
    escrow_payment_account: &AccountInfo<'a>,
    payment_account_owner: &AccountInfo<'a>,
    fee_payer: &AccountInfo<'a>,
    treasury_mint: &AccountInfo<'a>,
    ata_program: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    rent: &AccountInfo<'a>,
    signer_seeds: &[&[u8]],
    fee_payer_seeds: &[&[u8]],
    is_native: bool,
    creator: Creator,
    creator_fee: u64,
) -> Result<()> {
    let current_creator_info = next_account_info(remaining_accounts)?;
    assert_keys_equal(creator.address, *current_creator_info.key)?;
    if !is_native {
        let current_creator_token_account_info = next_account_info(remaining_accounts)?;
        if current_creator_token_account_info.data_is_empty() {
            make_ata(
                current_creator_token_account_info.to_account_info(),
                current_creator_info.to_account_info(),
                treasury_mint.to_account_info(),
                fee_payer.to_account_info(),
                ata_program.to_account_info(),
                token_program.to_account_info(),
                system_program.to_account_info(),
                rent.to_account_info(),
                fee_payer_seeds,
            )?;
        }
        assert_is_ata(
            current_creator_token_account_info,
            current_creator_info.key,
            &treasury_mint.key(),
            None,
        )?;
        if creator_fee > 0 {
            invoke_signed(
                &spl_token::instruction::transfer(
                    token_program.key,
                    &escrow_payment_account.key,
                    current_creator_token_account_info.key,
                    payment_account_owner.key,
                    &[],
                    creator_fee,
                )?,
                &[
                    escrow_payment_account.clone(),
                    current_creator_token_account_info.clone(),
                    token_program.clone(),
                    payment_account_owner.clone(),
                ],
                &[signer_seeds],
            )?;
        }
    } else if creator_fee > 0 {
        let new_lamps = current_creator_info
            .lamports()
            .checked_add(creator_fee)
            .ok_or(ErrorCode::NumericalOverflow)?;
        invoke_signed(
            &system_instruction::transfer(
                &escrow_payment_account.key,
                current_creator_info.key,
                creator_fee,
            ),
            &[
                escrow_payment_account.clone(),
                current_creator_info.clone(),
                system_program.clone(),
            ],
            &[signer_seeds],
        )?;
        // If not enough, we may need to top up account to get to rent free zone.
        let rent = Rent::get()?.minimum_balance(0);
        if new_lamps < rent {
            let diff = rent
                .checked_sub(new_lamps)
                .ok_or(ErrorCode::NumericalOverflow)?;
            invoke(
                &system_instruction::transfer(&fee_payer.key, current_creator_info.key, diff),
                &[
                    fee_payer.clone(),
                    current_creator_info.clone(),
                    system_program.clone(),
                ],
            )?;
        }
    }

    Ok(())
}

pub struct EmptyOfferEscrowToSellerArgs<'a, 'b, 'c, 'info, 'd> {
    pub remaining_accounts: &'c [AccountInfo<'info>],
    pub config: &'b Account<'info, Config>,
    pub tag: &'b Account<'info, Tag>,
    pub listing: &'d Account<'info, Listing>,
    pub offer: &'d Account<'info, Offer>,
    pub offer_token_account: &'c AccountInfo<'info>,
    pub offer_token_seeds: &'d [&'d [u8]],
    pub offer_seeds: &'d [&'d [u8]],
    pub token_metadata: &'c AccountInfo<'info>,
    pub payer: &'b AccountInfo<'info>,
    pub price_mint: &'c AccountInfo<'info>,
    pub ata_program: &'c AccountInfo<'info>,
    pub token_program: &'b AccountInfo<'info>,
    pub system_program: &'b AccountInfo<'info>,
    pub rent: &'d AccountInfo<'info>,
    pub seller_ata: &'c AccountInfo<'info>,
    pub seller: &'c AccountInfo<'info>,
    pub program_id: &'a Pubkey,
}

pub fn empty_offer_escrow_to_seller<'a, 'b, 'c, 'info, 'd>(
    args: EmptyOfferEscrowToSellerArgs<'a, 'b, 'c, 'info, 'd>,
) -> Result<()> {
    let EmptyOfferEscrowToSellerArgs {
        config,
        tag,
        remaining_accounts,
        listing,
        offer,
        offer_token_account,
        offer_seeds,
        token_metadata,
        payer,
        price_mint,
        ata_program,
        token_program,
        system_program,
        rent,
        program_id,
        seller_ata,
        seller,
        offer_token_seeds,
    } = args;
    if let Some(mint) = listing.price_mint {
        assert_keys_equal(price_mint.key(), mint)?;
        let listing_price_sans_royalties = pay_creator_fees(
            &mut remaining_accounts.into_iter(),
            token_metadata,
            offer_token_account,
            &offer.to_account_info(),
            payer,
            price_mint,
            ata_program,
            token_program,
            system_program,
            &rent.to_account_info(),
            offer_seeds,
            &[],
            offer.offer_amount,
            false,
        )?;
        // Make sure offer ata is correct
        assert_derivation(
            program_id,
            offer_token_account,
            &[
                &PDA_PREFIX[..],
                &config.authority.as_ref()[..],
                &tag.uid.to_le_bytes()[..],
                &LISTING[..],
                &OFFER[..],
                &offer.buyer.as_ref()[..],
                &TOKEN[..],
            ],
        )?;

        if seller_ata.data_is_empty() {
            make_ata(
                seller_ata.to_account_info(),
                seller.to_account_info(),
                price_mint.to_account_info(),
                payer.to_account_info(),
                ata_program.to_account_info(),
                token_program.to_account_info(),
                system_program.to_account_info(),
                rent.to_account_info(),
                &[],
            )?;
        }

        assert_is_ata(&seller_ata, &listing.seller, &mint, None)?;

        // Transfer the tokens.
        let cpi_accounts = token::Transfer {
            from: offer_token_account.clone(),
            to: seller_ata.clone(),
            authority: offer.to_account_info(),
        };
        let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
        token::transfer(
            context.with_signer(&[&offer_seeds[..]]),
            listing_price_sans_royalties,
        )?;

        let cpi_accounts = token::CloseAccount {
            account: offer_token_account.clone(),
            destination: payer.to_account_info(),
            authority: offer.to_account_info(),
        };
        let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
        token::close_account(context.with_signer(&[&offer_seeds[..]]))?;
    } else {
        let listing_price_sans_royalties = pay_creator_fees(
            &mut remaining_accounts.into_iter(),
            token_metadata,
            &offer_token_account.to_account_info(),
            &listing.to_account_info(),
            payer,
            price_mint,
            ata_program,
            &token_program,
            &system_program,
            &rent.to_account_info(),
            offer_token_seeds,
            &[],
            listing.agreed_price.unwrap(),
            true,
        )?;
        assert_keys_equal(listing.seller, seller_ata.key())?;
        // remaining lamports go to seller.

        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &offer_token_account.key(),
            &listing.seller,
            listing_price_sans_royalties,
        );
        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &[
                offer_token_account.to_account_info(),
                // Not actually an ata in this case, is just the seller's account
                seller_ata.to_account_info(),
            ],
            &[offer_token_seeds],
        )?;
    }

    Ok(())
}

pub struct MoveHotPotatoArgs<'b, 'c, 'd, 'info> {
    pub token_metadata: &'c AccountInfo<'info>,
    pub token_metadata_program: &'c AccountInfo<'info>,
    pub ata_program: &'c AccountInfo<'info>,
    pub token_mint: &'c AccountInfo<'info>,
    pub edition: &'c AccountInfo<'info>,
    pub user_token_account: &'c AccountInfo<'info>,
    pub token: &'c AccountInfo<'info>,
    pub tag: &'b mut Account<'info, Tag>,
    pub config: &'b Account<'info, Config>,
    pub user: &'b UncheckedAccount<'info>,
    pub rent: &'b Sysvar<'info, Rent>,
    pub system_program: &'b Program<'info, System>,
    pub token_program: &'b Program<'info, Token>,
    pub payer: &'b anchor_lang::prelude::Signer<'info>,
    pub creator_bump: u8,
    pub config_seeds: &'d [&'d [u8]; 3],
}

pub fn move_hot_potato(args: MoveHotPotatoArgs) -> Result<()> {
    let MoveHotPotatoArgs {
        token_metadata,
        token_metadata_program,
        ata_program,
        token_mint,
        edition,
        user_token_account,
        token,
        tag,
        config,
        user,
        rent,
        system_program,
        token_program,
        payer,
        creator_bump,
        config_seeds,
    } = args;
    assert_derivation(
        &mpl_token_metadata::id(),
        &token_metadata.to_account_info(),
        &[
            mpl_token_metadata::state::PREFIX.as_bytes(),
            mpl_token_metadata::id().as_ref(),
            tag.token_mint.as_ref(),
        ],
    )?;

    // Ensure the provided Token Metadata Program, and token accounts are legitimate.
    assert_keys_equal(token_metadata_program.key(), mpl_token_metadata::ID)?;
    assert_keys_equal(token.key(), tag.current_token_location)?;
    assert_keys_equal(token_mint.key(), tag.token_mint)?;
    assert_keys_equal(ata_program.key(), spl_associated_token_account::id())?;

    // Initialize a new account, to be used as an ATA.
    let user_key = user.key();
    let signer_seeds = &[
        PDA_PREFIX,
        config.authority.as_ref(),
        &tag.uid.to_le_bytes(),
        user_key.as_ref(),
        tag.token_mint.as_ref(),
        &[creator_bump],
    ];
    create_or_allocate_account_raw(
        token_program.key(),
        user_token_account,
        &rent,
        &system_program,
        payer,
        anchor_spl::token::TokenAccount::LEN,
        signer_seeds,
    )?;

    // Initialize the new account into an ATA for the user and the HotPotato token.
    let cpi_accounts = token::InitializeAccount {
        authority: config.to_account_info(),
        account: user_token_account.to_account_info(),
        mint: token_mint.to_account_info(),
        rent: rent.to_account_info(),
    };
    let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
    token::initialize_account(context)?;

    // Before we can transfer the frozen HotPotato
    // token to the new claimer, we need to thaw it.
    invoke_signed(
        &thaw_delegated_account(
            token_metadata_program.key(),
            config.key(),
            token.key(),
            edition.key(),
            token_mint.key(),
        ),
        &[
            token_metadata_program.clone(),
            config.to_account_info(),
            token.clone(),
            edition.clone(),
            token_mint.clone(),
        ],
        &[&config_seeds[..]],
    )?;

    // Now that the HotPotato token is thawed,
    // the BakeryPDA can transfer it freely.
    let cpi_accounts = token::Transfer {
        from: token.clone(),
        to: user_token_account.clone(),
        authority: config.to_account_info(),
    };
    let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
    token::transfer(context.with_signer(&[&config_seeds[..]]), 1)?;

    // Set the new ATA's owner authority to the BakeryPDA.
    let cpi_accounts = token::SetAuthority {
        current_authority: config.to_account_info(),
        account_or_mint: user_token_account.clone(),
    };

    let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
    token::set_authority(
        context.with_signer(&[&config_seeds[..]]),
        spl_token::instruction::AuthorityType::AccountOwner,
        Some(user.key()),
    )?;

    // Set the new ATA's close authority to the BakeryPDA.
    let cpi_accounts = token::SetAuthority {
        current_authority: user.to_account_info(),
        account_or_mint: user_token_account.clone(),
    };
    let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
    token::set_authority(
        context,
        spl_token::instruction::AuthorityType::CloseAccount,
        Some(config.key()),
    )?;

    // Delegate the new ATA to the BakeryPDA.
    let cpi_accounts = token::Approve {
        to: user_token_account.clone(),
        delegate: config.to_account_info(),
        authority: user.to_account_info(),
    };
    let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
    token::approve(context, 1)?;

    // With the HotPotato token transferred to the new ATA,
    // we can safely close the previous ATA and reclaim the rent.
    let cpi_accounts = token::CloseAccount {
        account: token.clone(),
        destination: payer.to_account_info(),
        authority: config.to_account_info(),
    };
    let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
    token::close_account(context.with_signer(&[&config_seeds[..]]))?;

    // Update current_token_location to reflect the new ATA in the Sprinkle's state.
    tag.current_token_location = user_token_account.key();

    // Finish by freezing the HotPotato token inside the new ATA.
    invoke_signed(
        &freeze_delegated_account(
            token_metadata_program.key(),
            config.key(),
            user_token_account.key(),
            edition.key(),
            token_mint.key(),
        ),
        &[
            token_metadata_program.clone(),
            config.to_account_info(),
            user_token_account.clone(),
            edition.clone(),
            token_mint.clone(),
        ],
        &[&config_seeds[..]],
    )?;

    Ok(())
}
