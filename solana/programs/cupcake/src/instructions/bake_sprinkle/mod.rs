pub mod candy_machine;
pub mod hot_potato;
pub mod metadata_delegate;
pub mod token_delegate;

use anchor_lang::prelude::*;
use crate::errors::ErrorCode;
use crate::state::PDA_PREFIX;
use crate::state::{bakery::*, sprinkle::*};
use anchor_spl::token::*;

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
    let tag = &mut ctx.accounts.tag;

    // If a Sprinkle is immutable, it can not be re-baked.
    // Currently, this is only the SingleUse1Of1 type.
    require!(
        tag.uid == 0 || tag.tag_type != TagType::SingleUse1Of1,
        ErrorCode::SingleUseIsImmutable
    );

  match tag_params.tag_type {
      TagType::SingleUse1Of1 
      | TagType::Refillable1Of1 
      | TagType::WalletRestrictedFungible 
      | TagType::ProgrammableUnique  => {
          token_delegate::handler(ctx, tag_params)
      },

      TagType::LimitedOrOpenEdition => {
          metadata_delegate::handler(ctx, tag_params)
      },

      TagType::CandyMachineDrop => {
          candy_machine::handler(ctx, tag_params)
      },

      TagType::HotPotato => {
          hot_potato::handler(ctx, tag_params)
      }
  }
}