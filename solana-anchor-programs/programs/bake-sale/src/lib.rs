#![cfg_attr(feature = "no-entrypoint", allow(dead_code))]

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use errors::ErrorCode;
use instructions::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub const PDA_PREFIX: &[u8] = b"bake-sale";

#[program]
mod bake_sale {
    use super::*;

    pub fn create_bake_sale(ctx: Context<CreateBakeSale>, args: CreateBakeSaleArgs) -> Result<()> {
        instructions::create_bake_sale::handler(ctx, args)
    }

    pub fn place_bid(ctx: Context<PlaceBid>, args: PlaceBidArgs) -> Result<()> {
        instructions::place_bid::handler(ctx, args)
    }

    pub fn end_bake_sale(ctx: Context<EndBakeSale>) -> Result<()> {
        instructions::end_bake_sale::handler(ctx)
    }
}
