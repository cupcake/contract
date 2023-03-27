use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod errors;
pub mod utils;

use instructions::*;

declare_id!("cakeGJxEdGpZ3MJP8sM3QypwzuzZpko1ueonUQgKLPE");

/// String used as the first seed for all Cupcake Protocol PDAs.
pub const PREFIX: &[u8] = b"cupcake";

/// Address for the Metaplex Token Metadata Program.
pub const METADATA_PROGRAM_ID: &str = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

#[program]
pub mod cupcake {

    use super::*;

    /// Create a new Bakery, managed by a provided account.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    /// Create a new Sprinkle for a Bakery, or update an existing one.
    /// BakeryAuthority must be a signer.
    pub fn add_or_refill_tag<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, AddOrRefillTag<'info>>,
        tag_params: AddOrRefillTagParams,
    ) -> Result<()> {
        instructions::add_or_refill_tag::handler(ctx, tag_params)
    }

    /// Execute the claim method of a Sprinkle for a provided account.
    /// SprinkleAuthority must be a signer.
    pub fn claim_tag<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, ClaimTag<'info>>,
        creator_bump: u8,
    ) -> Result<()> {
        instructions::claim_tag::handler(ctx, creator_bump)
    }
}
