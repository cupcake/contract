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
  pub fee_payer: Signer<'info>,

  ///
  #[account(
    mut, 
    has_one = bakery_authority,
    seeds = [
      PDA_PREFIX, 
      bakery_authority.key().as_ref()
    ], 
    bump = config.bump
  )]
  pub bakery: Account<'info, Bakery>,

  /// CHECK: SprinkleAuthority can be any account that can sign to approve a claim
  #[account(mut)]
  pub sprinkle_authority: UncheckedAccount<'info>,

  ///
  #[account(
    init_if_needed, 
    payer = fee_payer, 
    space = Sprinkle.ACCOUNT_SIZE
    seeds = [
      PDA_PREFIX, 
      bakery_authority.key().as_ref(), 
      &args.uid.to_le_bytes()
    ], 
    bump
  )]
  pub sprinkle: Account<'info, Sprinkle>,

  /// System Program ID
  pub system_program: Program<'info, System>,

  /// Token Program ID
  pub token_program: Program<'info, Token>,

  /// Rent SYSVAR address
  pub rent: Sysvar<'info, Rent>,
}

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

pub fn handler(ctx: Context<BakeSprinkle>, args: BakeSprinkleParams) -> ProgramResult {
  let sprinkle_type = args.sprinkle_type;
  let token_program = &ctx.accounts.token_program;
  let minter_pays = args.minter_pays;
  let sprinkle = &mut ctx.accounts.sprinkle;
  let bakery = &ctx.accounts.bakery;
  let bakery_pda_seeds = &[&PREFIX[..], &bakery.bakery_authority.as_ref()[..], &[bakery.bump]];

  // require that if tag has been made before, this action isnt called on a single use kind of tag
  require!(
    sprinkle.uid == 0 || sprinkle.sprinkle_type != TagType::UniqueImmutable,
    SingleUseIsImmutable
  );

  let total_supply = match sprinkle_type {
    TagType::UniqueImmutable | TagType::HotPotato => 1,
    TagType::UniqueMutable => {
      if ctx.remaining_accounts[0].key() != sprinkle.token_mint
          && sprinkle.num_claimed == sprinkle.total_supply
      {
        sprinkle.total_supply
          .checked_add(1)
          .ok_or(ErrorCode::NumericalOverflowError)?
      } else {
        sprinkle.total_supply
      }
    }
    _ => args.num_claims,
  };

  let token_mint = match sprinkle_type {
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
        let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
        approve(context, total_supply)?;
      }

      if tag_type == TagType::HotPotato {
        require!(
          sprinkle.uid == 0 || sprinkle.current_token_location == token.key() || token_account.amount == 1,
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
          || minter_pays,
        MustProvideWhitelistTokenIfMinterIsNotProvidingIt
      );

      // If payment token mint is an actual mint, and you are not providing
      // a payment account for it, you need to say minter is paying both
      require!(
        payment_token_mint.key() == system_program::ID
          || payment_token.key() != system_program::ID
          || minter_pays,
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

  sprinkle.per_user = match sprinkle_type {
    TagType::UniqueImmutable => 1,
    _ => args.per_user,
  };

  if sprinkle_type != TagType::UniqueImmutable {
    sprinkle.total_supply = total_supply;
  } else {
    tag.total_supply = 1;
  }

  sprinkle.minter_pays = minter_pays;
  sprinkle.uid = args.uid;
  sprinkle.sprinkle_authority = *ctx.accounts.sprinkle_authority.to_account_info().key;
  sprinkle.sprinkle_type = sprinkle_type;
  sprinkle.token_mint = token_mint;
  sprinkle.bakery = ctx.accounts.bakery.key();
  sprinkle.bump = *ctx.bumps.get("tag").unwrap();

  Ok(())
}