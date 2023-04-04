use crate::errors::ErrorCode;
use anchor_lang::{
  error,
  prelude::{AccountInfo, Program, Pubkey, Rent, Result, System, Sysvar},
  require,
  solana_program::{
      hash, msg,
      program::{invoke, invoke_signed},
      program_pack::{IsInitialized, Pack},
      system_instruction,
  },
  Key, ToAccountInfo,
};
use anchor_spl::associated_token::get_associated_token_address;
use arrayref::array_ref;
use std::convert::TryInto;

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
        require!(ata_account.delegate.is_none(), ErrorCode::AtaShouldNotHaveDelegate);
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
