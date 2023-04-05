use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;
use mpl_token_auth_rules::payload::Payload;
use mpl_token_metadata::processor::AuthorizationData;
use mpl_token_metadata::state::{Metadata, TokenMetadataAccount};
use crate::errors::ErrorCode;
use crate::state::PDA_PREFIX;
use crate::state::{bakery::*, sprinkle::*};
use crate::utils::{assert_is_ata, assert_keys_equal};
use anchor_lang::solana_program::{program::invoke_signed, system_program};
use anchor_spl::token::*;
use mpl_token_metadata;
use mpl_token_metadata::instruction::freeze_delegated_account;


#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct AddOrRefillTagParams {
    /// The unique identifier for this Sprinkle, used in PDA generation.
    uid: u64,

    /// The claim method this Sprinkle will use.
    tag_type: TagType,

    /// The total amount of claims that can be executed from this Sprinkle.
    num_claims: u64,

    /// The total number of claims an individual user can execute from this Sprinkle.
    per_user: u64,

    /// If this is true, claimers must pay the Candy Machine mint fees.
    minter_pays: bool,

    // The cost to mint an NFT from the provided Candy Machine, if any.
    price_per_mint: Option<u64>,

    /// If this is true, whitelist tokens will be burnt after being used to mint from the Candy Machine.
    whitelist_burn: bool,
}

#[derive(Accounts)]
#[instruction(tag_params: AddOrRefillTagParams)]
pub struct AddOrRefillTag<'info> {
    /// Account which has the authority to create/update sprinkles for this Bakery.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Account which pays the network and rent fees, for this transaction only.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// PDA which stores token approvals for a Bakery, and executes the transfer during claims.
    #[account(mut, 
              has_one = authority,
              seeds = [
                  PDA_PREFIX, 
                  authority.key().as_ref()
              ], 
              bump = config.bump)]
    pub config: Account<'info, Config>,

    /// Account which has the authority to execute claims for this Sprinkle.
    /// CHECK: TagAuthority can be any account that can sign a transaction.
    #[account(mut)]
    pub tag_authority: UncheckedAccount<'info>,

    /// PDA which stores data about the state of a Sprinkle.
    #[account(init_if_needed, 
              payer = payer, 
              space = Tag::SIZE,
              seeds = [
                  PDA_PREFIX, 
                  authority.key().as_ref(), 
                  &tag_params.uid.to_le_bytes()
              ], 
              bump)]
    pub tag: Account<'info, Tag>,

    /// SPL System Program, required for account allocation.
    pub system_program: Program<'info, System>,

    /// SPL Token Program, required for transferring tokens.
    pub token_program: Program<'info, Token>,

    /// SPL Rent Sysvar, required for account allocation.
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

pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, AddOrRefillTag<'info>>,
    tag_params: AddOrRefillTagParams
) -> Result<()> {   
  let tag_type = tag_params.tag_type;
  let token_program = &ctx.accounts.token_program;
  let minter_pays = tag_params.minter_pays;
  let tag = &mut ctx.accounts.tag;
  let config = &ctx.accounts.config;
  let config_seeds = &[&PDA_PREFIX[..], &config.authority.as_ref()[..], &[config.bump]];

  // If a Sprinkle is immutable, it can not be re-baked.
  // Currently, this is only the SingleUse1Of1 type.
  require!(
      tag.uid == 0 || tag.tag_type != TagType::SingleUse1Of1,
      ErrorCode::SingleUseIsImmutable
  );

  // Determine the total_supply of the new or updated Sprinkle.
  let total_supply = match tag_type {
      // SingleUse1Of1s and HotPotatos can only have a total_supply of 1.
      TagType::SingleUse1Of1 | TagType::HotPotato => 1,

      // Increment total_supply for Refillable1Of1s, if 
      // they are being re-baked with a new token.
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

      // For all other cases, accept the user-provided value.
      _ => tag_params.num_claims,
  };

  // Handle the delegation / authorization changes needed to enable Sprinkle claims.
  let token_mint = match tag_type {
      TagType::SingleUse1Of1
      | TagType::Refillable1Of1
      | TagType::ProgrammableUnique
      | TagType::WalletRestrictedFungible
      | TagType::HotPotato => {
          let token_mint = &ctx.remaining_accounts[0];
          let token = &ctx.remaining_accounts[1];
          let token_metadata_info = &ctx.remaining_accounts[2];
          let token_edition = &ctx.remaining_accounts[3];
          let token_record_info = &ctx.remaining_accounts[4];
          let token_ruleset = &ctx.remaining_accounts[5];
          let token_ruleset_program = &ctx.remaining_accounts[6];
          let token_metadata_program = &ctx.remaining_accounts[7];
          let instructions_sysvar = &ctx.remaining_accounts[8];

          // Check that the provided ATA is legitimate.
          assert_is_ata(
              token,
              &ctx.accounts.config.authority.key(),
              &token_mint.key(),
              Some(&ctx.accounts.config.key()),
          )?;

          // Check that the provided token is legitimate.
          let _mint: Account<Mint> = Account::try_from(token_mint)?;
          let token_account: Account<TokenAccount> = Account::try_from(token)?;
          
          let token_metadata = Metadata::from_account_info(token_metadata_info)?;
          let is_programmable = token_metadata.programmable_config != None;
 
          require!(
              !is_programmable || tag_type != TagType::HotPotato,
              ErrorCode::HotPotatoCanNotBeProgrammable
          );

          match is_programmable {
              false => {
                  // If the Sprinkle is not a HotPotato, or if the
                  // provided HotPotato token is not yet frozen,
                  // delegate it to the BakeryPDA.
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
              },

              true => {
                  // We need to CPI to TokenMetadataProgram to call Delegate for pNFTs, 
                  // which wraps the normal TokenProgram Approve call.
                  let account_metas = vec![
                      AccountMeta::new_readonly(token_metadata_program.key(), false),
                      AccountMeta::new_readonly(config.key(), false),
                      AccountMeta::new(token_metadata_info.key(), false),
                      AccountMeta::new_readonly(token_edition.key(), false),
                      AccountMeta::new(token_record_info.key(), false),
                      AccountMeta::new_readonly(token_mint.key(), false),
                      AccountMeta::new(token.key(), false),
                      AccountMeta::new_readonly(ctx.accounts.authority.key(), true),
                      AccountMeta::new_readonly(ctx.accounts.payer.key(), true),
                      AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
                      AccountMeta::new_readonly(instructions_sysvar.key(), false),
                      AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
                      AccountMeta::new_readonly(token_ruleset_program.key(), false),
                      AccountMeta::new_readonly(token_ruleset.key(), false),
                  ];
                  let account_infos = [
                      token_metadata_program.clone(),
                      config.to_account_info(),
                      token_metadata_info.clone(),
                      token_edition.clone(),
                      token_record_info.clone(),
                      token_mint.clone(),
                      token.clone(),
                      ctx.accounts.authority.to_account_info(),
                      ctx.accounts.payer.to_account_info(),
                      ctx.accounts.system_program.to_account_info(),
                      instructions_sysvar.clone(),
                      ctx.accounts.token_program.to_account_info(),
                      token_ruleset_program.clone(),
                      token_ruleset.clone()
                  ];
                  
                  let ix_data = 
                      mpl_token_metadata::instruction::MetadataInstruction::Delegate(
                          mpl_token_metadata::instruction::DelegateArgs::TransferV1 { 
                              amount: 1, 
                              authorization_data: Some(AuthorizationData { payload: Payload::new() })
                          }
                      );
                      
                  invoke_signed(
                      &Instruction {  
                          program_id: token_metadata_program.key(),
                          accounts: account_metas,
                          data: ix_data.try_to_vec().unwrap(),
                      }, 
                      &account_infos,
                      &[&config_seeds[..]],
                  )?;
              }
          }

          // If the Sprinkle is a HotPotato, ensure that it is either a new Sprinkle,
          // or that the frozen token is still in the Bakery wallet.
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

              // Ensure the provided TokenMetadataProgramId is legitimate.
              assert_keys_equal(
                  token_metadata_program.key(),
                  mpl_token_metadata::ID,
              )?;

              // If the token isn't already frozen, freeze it now.
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

          // If the CandyMachine is whitelisted, and minter_pays is false,
          // ensure the Bakery has an ATA for the whitelist token.
          require!(
              whitelist_mint.key() == system_program::ID
                  || whitelist_token.key() != system_program::ID
                  || minter_pays,
              ErrorCode::MustProvideWhitelistTokenIfMinterIsNotProvidingIt
          );

          // If the CandyMachine required payment for mints, the payment
          // token is not native SOL, and minter_pays is false,
          // ensure the Bakery has an ATA for the payment token.
          require!(
              payment_token_mint.key() == system_program::ID
                  || payment_token.key() != system_program::ID
                  || minter_pays,
              ErrorCode::MustProvidePaymentAccountIfMinterIsNotProviding
          );

          // Verify that the provided whitelist token accounts
          // are legitimate, then delegate them to the Bakery PDA. 
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

          // Verify that the provided payment token accounts
          // are legitimate, then delegate them to the Bakery PDA. 
          if payment_token_mint.key() != system_program::ID
              && payment_token.key() != system_program::ID
          {
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

          // Set the CandyMachine-related variables in the Sprinkle's state.
          tag.whitelist_mint = whitelist_mint.key();
          tag.whitelist_burn = tag_params.whitelist_burn;
          tag.candy_machine = candy_machine.key();

          // Return the payment token mint as token_mint.
          payment_token_mint.key()
      }

      TagType::LimitedOrOpenEdition => {
          // Verify that the provided token mint is legitimate.
          let token_mint = &ctx.remaining_accounts[0];
          let _mint: Account<Mint> = Account::try_from(token_mint)?;
          token_mint.key()
      }
  };

  // If the Sprinkle is a SingleUse1Of1, the per_user and total_supply values will both always be 1.
  tag.per_user = match tag_type {
      TagType::SingleUse1Of1 => 1,
      _ => tag_params.per_user,
  };
  if tag_type != TagType::SingleUse1Of1 {
      tag.total_supply = total_supply;
  } else {
      tag.total_supply = 1;
  }

  // Store information about the claim method and underlying assets in the Sprinkle's state.
  // Currently, counters are left unchanged after re-bakes. 
  tag.minter_pays = minter_pays;
  tag.uid = tag_params.uid;
  tag.tag_authority = *ctx.accounts.tag_authority.to_account_info().key;
  tag.tag_type = tag_type;
  tag.token_mint = token_mint;
  tag.config = ctx.accounts.config.key();
  tag.bump = *ctx.bumps.get("tag").unwrap();
  
  Ok(())
}