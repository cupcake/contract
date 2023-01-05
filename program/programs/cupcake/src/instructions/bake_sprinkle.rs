use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
  instruction::Instruction,
  program::{invoke, invoke_signed},
  system_program,
};
use anchor_spl::token::{
  approve, close_account, initialize_account, set_authority, transfer, Approve, CloseAccount,
  InitializeAccount, Mint, SetAuthority, Token, TokenAccount, Transfer,
};
use mpl_token_metadata::instruction::*;

use crate::utils::*;

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct BakeSprinkleParams {
  /// The unique identifier for this Sprinkle, must be unique to this Bakery 
  sprinkle_uid: u64,

  /// The distribution method type for this Sprinkle
  sprinkle_type: SprinkleType,

  /// The total number of claims this Sprinkle will allow, from all users combines
  num_claims: u64,

  /// The number of claims this Sprinkle will allow for each individual user
  per_user: u64,

  /// If true, users claiming from this Sprinkle will be required to cover the network transaction fees
  minter_pays: bool,

  ///
  price_per_mint: Option<u64>,

  ///
  whitelist_burn: bool
}

#[derive(Accounts)]
#[instruction(tag_params: BakeSprinkleParams)]
pub struct BakeSprinkle<'info> {
  ///
  #[account(mut)]
  pub bakery_authority: Signer<'info>,

  ///
  #[account(mut)]
  pub payer: Signer<'info>,

  ///
  #[account(mut, 
            has_one = bakery_authority,
            seeds = [
              PDA_PREFIX, 
              bakery_authority.key().as_ref()
            ], 
            bump = config.bump)]
  pub bakery: Account<'info, Bakery>,

  /// CHECK: SprinkleAuthority can be any account that can sign to approve a claim
  #[account(mut)]
  pub sprinkle_authority: UncheckedAccount<'info>,

  ///
  #[account(init_if_needed, 
            payer = payer, 
            space = Sprinkle::ACCOUNT_SIZE
            seeds = [
              PDA_PREFIX, 
              bakery_authority.key().as_ref(), 
              &args.uid.to_le_bytes()
            ], 
            bump)]
  pub sprinkle: Account<'info, Sprinkle>,

  /// System Program ID
  pub system_program: Program<'info, System>,

  /// Token Program ID
  pub token_program: Program<'info, Token>,

  /// Rent SYSVAR address
  pub rent: Sysvar<'info, Rent>,
}

// Remaining accounts: 
//  - UniqueImmutable or UniqueMutable or FungibleTransfer:
//    1) token_mint
//    2) token_ata  (writable) 
//
//  - HotPotato:
//    1) token_mint
//    2) token_ata  (writable)
//    3) token_edition
//    4) token_metadata_program 
//
//  - EditionPrinter:
//    1) token_mint
//
//  - CandyMachineDrop:
//    - with Whitelist:
//      1) candy_machine_id
//      2) whitelist_token_mint
//      3) whitelist_token_ata 
//      4) system_program 
//
//    - with SPL Payment:
//      1) candy_machine_id
//      2) system_program
//      3) payment_token
//      4) payment_token_ata
//
//    - with Whitelist + SPL Payment:
//      1) candy_machine_id
//      2) whitelist_token_mint
//      3) whitelist_token_ata 
//      4) payment_token_mint
//      5) payment_token_ata 

pub fn handler(ctx: Context<BakeSprinkle>, args: BakeSprinkleParams) -> ProgramResult {
  let token_program = ctx.accounts.token_program.load()?;
  let bakery = &ctx.accounts.bakery.load()?;

  let mut sprinkle = ctx.accounts.sprinkle.load_mut()?;

  let bakery_pda_seeds = &[&PREFIX[..], &bakery.bakery_authority.as_ref()[..], &[bakery.bump]];
  let sprinkle_is_unbaked = sprinkle.uid == 0
  let sprinkle_is_mutable = sprinkle.sprinkle_type != TagType::UniqueImmutable
  let sprinkle_is_being_refilled = 
    sprinkle.num_claimed == sprinkle.total_supply
    && ctx.remaining_accounts[0].key() != sprinkle.token_mint

  /// If this Sprinkle has already been baked, ensure it is mutable
  require!(
    sprinkle_is_unbaked || sprinkle_is_mutable,
    SingleUseIsImmutable
  );

  let total_supply = match args.sprinkle_type {
    /// UniqueImmutable can't be re-baked, HotPotato claim counters aren't incremented
    TagType::UniqueImmutable | TagType::HotPotato => 1,

    /// If the Sprinkle's total_supply has been hit, and the token is being changed,
    /// increment the total_supply so the Sprinkle can be claimed again
    TagType::UniqueMutable => {
      match sprinkle_is_unbaked || sprinkle_is_being_refilled {
        true => sprinkle.total_supply.checked_add(1).ok_or(ErrorCode::NumericalOverflowError)?
        false => sprinkle.total_supply
      }
    }

    _ => args.num_claims
  };

  let token_mint = match args.sprinkle_type {
    /// Candy Machine payment token mint
    TagType::CandyMachineDrop => &ctx.remaining_accounts[3].key()
    /// Normal token mint
    _ => &ctx.remaining_accounts[0].key()
  }

  let token_mint = match args.sprinkle_type {
    TagType::UniqueImmutable
      | TagType::UniqueMutable
      | TagType::FungibleTransfer
      | TagType::HotPotato 
    => {
      let token_mint = &ctx.remaining_accounts[0];
      let token = &ctx.remaining_accounts[1];

      assert_is_ata(
        token,
        &ctx.accounts.bakery.bakery_authority.key(),
        &token_mint.key(),
        Some(&ctx.accounts.bakery.key()),
      )?;

      // Check that its a real mint
      let _mint: Account<Mint> = Account::try_from(token_mint)?;
      let token_account: Account<TokenAccount> = Account::try_from(token)?;

      if tag_type != TagType::HotPotato || token_account.state != spl_token::state::AccountState::Frozen {
        let cpi_accounts = Approve {
          to: token.clone(),
          delegate: ctx.accounts.bakery.to_account_info(),
          authority: ctx.accounts.bakery_authority.to_account_info(),
        };
        approve(
          CpiContext::new(token_program.to_account_info(), cpi_accounts), 
          total_supply
        )?;
      }

      if tag_type == TagType::HotPotato {
        require!(
          sprinkle_is_unbaked 
            || sprinkle.current_token_location == token.key() 
            || token_account.amount == 1,
          CanOnlyMutateHotPotatoWhenAtHome
        );

        sprinkle.current_token_location = token.key();
        let edition = &ctx.remaining_accounts[2];
        let token_metadata_program = &ctx.remaining_accounts[3];

        assert_keys_equal(
          token_metadata_program.key(),
          Pubkey::from_str(METADATA_PROGRAM_ID).unwrap(),
        )?;

        if token_account.state != spl_token::state::AccountState::Frozen {
          let cpi_accounts = SetAuthority {
            current_authority: ctx.accounts.bakery_authority.to_account_info(),
            account_or_mint: token.clone(),
          };
          let context = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
          );
          set_authority(
            context,
            spl_token::instruction::AuthorityType::CloseAccount,
            Some(bakery.key()),
          )?;
          invoke_signed(
            &freeze_delegated_account(
              token_metadata_program.key(),
              bakery.key(),
              token.key(),
              edition.key(),
              token_mint.key(),
            ),
            &[
              token_metadata_program.clone(),
              bakery.to_account_info(),
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

      // If WL present, you need to provide a payment account for it
      // or say minter is doing it
      require!(
        whitelist_mint.key() == system_program::ID 
          || whitelist_token.key() != system_program::ID 
          || args.minter_pays,
        MustProvideWhitelistTokenIfMinterIsNotProvidingIt
      );

      // If payment token mint is an actual mint, and you are not providing
      // a payment account for it, you need to say minter is paying both
      require!(
        payment_token_mint.key() == system_program::ID
          || payment_token.key() != system_program::ID
          || args.minter_pays,
        MustProvidePaymentAccountIfMinterIsNotProviding
      );

      if whitelist_mint.key() != system_program::ID && whitelist_token.key() != system_program::ID {
        let _wl_mint: Account<Mint> = Account::try_from(&whitelist_mint)?;
        assert_is_ata(
          &whitelist_token,
          &ctx.accounts.bakery_authority.key(),
          &whitelist_mint.key(),
          Some(&ctx.accounts.bakery.key()),
        )?;
        let cpi_accounts = Approve {
          to: whitelist_token.clone(),
          delegate: ctx.accounts.bakery.to_account_info(),
          authority: ctx.accounts.bakery_authority.to_account_info(),
        };
        let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
        approve(context, total_supply)?;
      }

      if payment_token_mint.key() != system_program::ID && payment_token.key() != system_program::ID {
        // verify it is mint
        let _mint: Account<Mint> = Account::try_from(&payment_token_mint)?;
        assert_is_ata(
          &payment_token,
          &ctx.accounts.bakery_authority.key(),
          &payment_token_mint.key(),
          Some(&ctx.accounts.config.key()),
        )?;
        let cpi_accounts = Approve {
          to: payment_token.clone(),
          delegate: ctx.accounts.bakery.to_account_info(),
          authority: ctx.accounts.bakery_authority.to_account_info(),
        };
        let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
        approve(
          context,
          args.price_per_mint
            .unwrap()
            .checked_mul(total_supply)
            .ok_or(ErrorCode::NumericalOverflowError)?,
        )?;
      }
      tag.whitelist_mint = whitelist_mint.key();
      tag.whitelist_burn = args.whitelist_burn;
      tag.candy_machine = candy_machine.key();
      payment_token_mint.key()
    }
            
    TagType::EditionPrinter => {
      let token_mint = &ctx.remaining_accounts[0];
      // Check that its a real mint
      let _mint: Account<Mint> = Account::try_from(token_mint)?;
      token_mint.key()
    }
  };

  Ok(())
}