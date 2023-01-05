#![cfg_attr(feature = "no-entrypoint", allow(dead_code))]

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use errors::ErrorCode;
use instructions::*;
use state::*;

pub const PDA_PREFIX: &[u8] = b"cupcake";
pub const METADATA_PROGRAM_ID: &str = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

declare_id!("cakeGJxEdGpZ3MJP8sM3QypwzuzZpko1ueonUQgKLPE");

#[program]
pub mod cupcake {
  use super::*;

  pub fn create_bakery(ctx: Context<CreateBakery>) -> ProgramResult {
    instructions::create_bakery::handler(ctx)
  }

  pub fn bake_sprinkle<'info>(ctx: Context<BakeSprinkle>, args: BakeSprinkleParams) -> ProgramResult {
    instructions::bake_sprinkle::handler(ctx, args)
  }

  pub fn claim_sprinkle<'info>(ctx: Context<ClaimSprinkle>, creator_bump: u8) -> ProgramResult {
    instructions::claim_sprinkle::handler(ctx, creator_bump)
  }
}