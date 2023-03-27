use anchor_lang::prelude::*;
use crate::errors::ErrorCode;
use crate::{PREFIX, METADATA_PROGRAM_ID};
use crate::state::{config::*, tag::*};
use crate::utils::{assert_is_ata, assert_keys_equal};
use anchor_lang::solana_program::{program::invoke_signed, system_program};
use anchor_spl::token::*;
use mpl_token_metadata::instruction::freeze_delegated_account;
use std::str::FromStr;

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct AddOrRefillTagParams {
    uid: u64,
    tag_type: TagType,
    num_claims: u64,
    per_user: u64,
    minter_pays: bool,
    // candy only
    price_per_mint: Option<u64>,
    whitelist_burn: bool,
}

#[derive(Accounts)]
#[instruction(tag_params: AddOrRefillTagParams)]
pub struct AddOrRefillTag<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [PREFIX, authority.key().as_ref()], bump=config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    // CHECK: TagAuthority can be any account that can sign to approve a claim.
    #[account(mut)]
    pub tag_authority: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = payer, seeds = [PREFIX, authority.key().as_ref(), &tag_params.uid.to_le_bytes()], bump, space = TAG_SIZE)]
    pub tag: Account<'info, Tag>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
    // Remaining accounts - if doing wallet restricted fungible, or either 1/1 option, pass:
    // token_mint
    // token (w) - ata of token_mint type
    //
    // If doing hotpotato, pass
    // token_mint
    // token (w) - ata of token_mint type
    // edition - existing edition of current token_mint
    // token_metadata_program - token mint on the tag
    //
    // If doing limited/open edition:
    // token_mint
    //
    // If using candy machine, pass:
    // candy_machine_id
    // whitelist_mint - optional, if it's not system program, we'll do a mint check and approve tfers.
    // whitelist_token - ata of whitelist_mint type, if present, we use this to pay with.
    // payment_token_mint - if system, we assume you pay in sol. Otherwise user will need to provide this.
    // payment_token - ata of payment token type to approve use of, if not system.
}

pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, AddOrRefillTag<'info>>,
    tag_params: AddOrRefillTagParams
) -> Result<()> {   
  let tag_type = tag_params.tag_type;
  let token_program = &ctx.accounts.token_program;
  let minter_pays = tag_params.minter_pays;
  let tag = &mut ctx.accounts.tag;
  let config = &ctx.accounts.config;
  let config_seeds = &[&PREFIX[..], &config.authority.as_ref()[..], &[config.bump]];

  require!(
      // require that if tag has been made before, this action isnt called on a single use kind of tag
      tag.uid == 0 || tag.tag_type != TagType::SingleUse1Of1,
      ErrorCode::SingleUseIsImmutable
  );

  let total_supply = match tag_type {
      TagType::SingleUse1Of1 | TagType::HotPotato => 1,
      TagType::Refillable1Of1 => {
          if ctx.remaining_accounts[0].key() != tag.token_mint
              && tag.num_claimed == tag.total_supply
          {
              tag.total_supply
                  .checked_add(1)
                  .ok_or(ErrorCode::NumericalOverflowError)?
          } else {
              tag.total_supply
          }
      }
      _ => tag_params.num_claims,
  };

  let token_mint = match tag_type {
      TagType::SingleUse1Of1
      | TagType::Refillable1Of1
      | TagType::WalletRestrictedFungible
      | TagType::HotPotato => {
          let token_mint = &ctx.remaining_accounts[0];
          let token = &ctx.remaining_accounts[1];

          assert_is_ata(
              token,
              &ctx.accounts.config.authority.key(),
              &token_mint.key(),
              Some(&ctx.accounts.config.key()),
          )?;

          // Check that its a real mint
          let _mint: Account<Mint> = Account::try_from(token_mint)?;
          let token_account: Account<TokenAccount> = Account::try_from(token)?;

          if tag_type != TagType::HotPotato
              || token_account.state != spl_token::state::AccountState::Frozen
          {
              let cpi_accounts = Approve {
                  to: token.clone(),
                  delegate: ctx.accounts.config.to_account_info(),
                  authority: ctx.accounts.authority.to_account_info(),
              };
              let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);

              approve(context, total_supply)?;
          }

          if tag_type == TagType::HotPotato {
              require!(
                  tag.uid == 0
                      || tag.current_token_location == token.key()
                      || token_account.amount == 1,
                  ErrorCode::CanOnlyMutateHotPotatoWhenAtHome
              );

              tag.current_token_location = token.key();
              let edition = &ctx.remaining_accounts[2];
              let token_metadata_program = &ctx.remaining_accounts[3];

              assert_keys_equal(
                  token_metadata_program.key(),
                  Pubkey::from_str(METADATA_PROGRAM_ID).unwrap(),
              )?;

              if token_account.state != spl_token::state::AccountState::Frozen {
                  let cpi_accounts = SetAuthority {
                      current_authority: ctx.accounts.authority.to_account_info(),
                      account_or_mint: token.clone(),
                  };

                  let context = CpiContext::new(
                      ctx.accounts.token_program.to_account_info(),
                      cpi_accounts,
                  );
                  set_authority(
                      context,
                      spl_token::instruction::AuthorityType::CloseAccount,
                      Some(config.key()),
                  )?;
                  invoke_signed(
                      &freeze_delegated_account(
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
              }
          }

          token_mint.key()
      }
      TagType::CandyMachineDrop => {
          let candy_machine = &ctx.remaining_accounts[0];
          let whitelist_mint = &ctx.remaining_accounts[1];
          let whitelist_token = &ctx.remaining_accounts[2];
          let payment_token_mint = &ctx.remaining_accounts[3];
          let payment_token = &ctx.remaining_accounts[4];

          require!(
              // if WL present, you need to provide a payment account for it
              // or say minter is doing it
              whitelist_mint.key() == system_program::ID
                  || whitelist_token.key() != system_program::ID
                  || minter_pays,
              ErrorCode::MustProvideWhitelistTokenIfMinterIsNotProvidingIt
          );

          require!(
              // if payment token mint is an actual mint, and you are not providing
              // a payment account for it, you need to say minter is paying both
              payment_token_mint.key() == system_program::ID
                  || payment_token.key() != system_program::ID
                  || minter_pays,
              ErrorCode::MustProvidePaymentAccountIfMinterIsNotProviding
          );

          if whitelist_mint.key() != system_program::ID
              && whitelist_token.key() != system_program::ID
          {
              let _wl_mint: Account<Mint> = Account::try_from(&whitelist_mint)?;

              assert_is_ata(
                  &whitelist_token,
                  &ctx.accounts.config.authority.key(),
                  &whitelist_mint.key(),
                  Some(&ctx.accounts.config.key()),
              )?;

              let cpi_accounts = Approve {
                  to: whitelist_token.clone(),
                  delegate: ctx.accounts.config.to_account_info(),
                  authority: ctx.accounts.authority.to_account_info(),
              };
              let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
              approve(context, total_supply)?;
          }

          if payment_token_mint.key() != system_program::ID
              && payment_token.key() != system_program::ID
          {
              // verify it is mint
              let _mint: Account<Mint> = Account::try_from(&payment_token_mint)?;

              assert_is_ata(
                  &payment_token,
                  &ctx.accounts.config.authority.key(),
                  &payment_token_mint.key(),
                  Some(&ctx.accounts.config.key()),
              )?;

              let cpi_accounts = Approve {
                  to: payment_token.clone(),
                  delegate: ctx.accounts.config.to_account_info(),
                  authority: ctx.accounts.authority.to_account_info(),
              };
              let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
              approve(
                  context,
                  tag_params
                      .price_per_mint
                      .unwrap()
                      .checked_mul(total_supply)
                      .ok_or(ErrorCode::NumericalOverflowError)?,
              )?;
          }

          tag.whitelist_mint = whitelist_mint.key();
          tag.whitelist_burn = tag_params.whitelist_burn;
          tag.candy_machine = candy_machine.key();

          payment_token_mint.key()
      }
      TagType::LimitedOrOpenEdition => {
          let token_mint = &ctx.remaining_accounts[0];

          // Check that its a real mint
          let _mint: Account<Mint> = Account::try_from(token_mint)?;

          token_mint.key()
      }
  };

  tag.per_user = match tag_type {
      TagType::SingleUse1Of1 => 1,
      _ => tag_params.per_user,
  };
  if tag_type != TagType::SingleUse1Of1 {
      tag.total_supply = total_supply;
  } else {
      tag.total_supply = 1;
  }
  tag.minter_pays = minter_pays;
  tag.uid = tag_params.uid;
  tag.tag_authority = *ctx.accounts.tag_authority.to_account_info().key;
  tag.tag_type = tag_type;
  tag.token_mint = token_mint;
  tag.config = ctx.accounts.config.key();
  tag.bump = *ctx.bumps.get("tag").unwrap();
  Ok(())
}