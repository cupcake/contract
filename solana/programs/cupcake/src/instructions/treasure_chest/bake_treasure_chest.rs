use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use crate::state::{PDA_PREFIX, Config, Tag, TreasureChest, TagType};

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct BakeTreasureChestParams {
    /// The unique identifier for this Sprinkle, used in PDA generation.
    uid: u64,
}

#[derive(Accounts)]
#[instruction(params: BakeTreasureChestParams)]
pub struct BakeTreasureChest<'info> {
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
              bump = bakery.bump)]
    pub bakery: Account<'info, Config>,

    /// PDA which stores data about the state of a Sprinkle.
    #[account(init_if_needed, 
              payer = payer, 
              space = Tag::SIZE,
              seeds = [
                  PDA_PREFIX, 
                  authority.key().as_ref(), 
                  &params.uid.to_le_bytes()
              ], 
              bump)]
    pub sprinkle: Account<'info, Tag>,

    /// Account which has the authority to execute claims for this Sprinkle.
    /// CHECK: TagAuthority can be any account that can sign a transaction.
    #[account(mut)]
    pub sprinkle_authority: UncheckedAccount<'info>,

    ///
    #[account(init, 
              payer = payer, 
              space = TreasureChest::SIZE,
              seeds = [
                  PDA_PREFIX, 
                  authority.key().as_ref(), 
                  &params.uid.to_le_bytes(),
                  TreasureChest::PREFIX,
              ], 
              bump)]
    pub treasure_chest: Account<'info, TreasureChest>,

    pub system_program: Program<'info, System>,

    pub token_program: Program<'info, Token>,

    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_bake_treasure_chest<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, BakeTreasureChest<'info>>, 
    params: BakeTreasureChestParams
) -> Result<()> {
    let bakery = &ctx.accounts.bakery;

    let sprinkle = &mut ctx.accounts.sprinkle;
    let treasure_chest = &mut ctx.accounts.treasure_chest;

    sprinkle.uid = params.uid;
    sprinkle.tag_authority = *ctx.accounts.sprinkle_authority.to_account_info().key;
    sprinkle.tag_type = TagType::TreasureChest;
    sprinkle.config = bakery.key();
    sprinkle.bump = *ctx.bumps.get("sprinkle").unwrap();

    treasure_chest.sprinkle = sprinkle.key();

    Ok(())
}