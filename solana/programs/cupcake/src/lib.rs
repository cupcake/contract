use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("cakeGJxEdGpZ3MJP8sM3QypwzuzZpko1ueonUQgKLPE");

#[program]
pub mod cupcake {

    use super::*;

    /// Create a new Bakery, managed by a provided account.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::create_bakery::handler(ctx)
    }

    /// Create a new Sprinkle for a Bakery, or update an existing one.
    /// BakeryAuthority must be a signer.
    pub fn add_or_refill_tag<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, AddOrRefillTag<'info>>,
        tag_params: AddOrRefillTagParams,
    ) -> Result<()> {
        instructions::bake_sprinkle::handler(ctx, tag_params)
    }

    /// Execute the claim method of a Sprinkle for a provided account.
    /// SprinkleAuthority must be a signer.
    pub fn claim_tag<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, ClaimTag<'info>>,
        creator_bump: u8,
    ) -> Result<()> {
        instructions::claim_sprinkle::handler(ctx, creator_bump)
    }

    /// Modify or create a new listing
    pub fn modify_listing<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, ModifyListing<'info>>,
        args: ModifyListingArgs,
    ) -> Result<()> {
        instructions::modify_listing::handler(ctx, args)
    }

    /// Create a new offer
    pub fn make_offer<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, MakeOffer<'info>>,
        args: MakeOfferArgs,
    ) -> Result<()> {
        instructions::make_offer::handler(ctx, args)
    }

    /// Accept an new offer
    pub fn accept_offer<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, AcceptOffer<'info>>,
    ) -> Result<()> {
        instructions::accept_offer::handler(ctx)
    }
}
