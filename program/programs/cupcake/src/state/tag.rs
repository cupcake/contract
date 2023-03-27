use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq, Debug)]
pub enum TagType {
    LimitedOrOpenEdition,
    SingleUse1Of1,
    CandyMachineDrop,
    Refillable1Of1,
    WalletRestrictedFungible,
    HotPotato,
}

pub const TAG_SIZE: usize = 8 +     // discriminator  
                            8 +     // uid
                            1 +     //tag_type
                            32 +    //tag_authority
                            32 +    //config
                            8 +     // total_supply
                            8 +     // num_claimed
                            8 +     // per_user
                            1 +     // minter pays type
                            32 +    // token_mint
                                    // Dont use option here so we can do offset memcmp lookups
                            8 +     // price
                            32 +    // candy_machine
                            32 +    // wl_mint
                            1 +     //bump;
                            32 +    // current token location
                            50;     //padding

#[account]
pub struct Tag {
    pub uid: u64,
    pub tag_type: TagType,
    pub tag_authority: Pubkey,
    pub config: Pubkey,
    pub total_supply: u64,
    pub num_claimed: u64,
    pub minter_pays: bool,
    pub per_user: u64,
    pub token_mint: Pubkey,
    // I dont trust candy machine structure not to change so we pre-cache settings here
    // to avoid attempting to deserialize structure that might shift
    // I do expect them to stick to their interfaces though
    pub candy_machine: Pubkey,
    pub whitelist_mint: Pubkey,
    pub whitelist_burn: bool,
    pub bump: u8,
    // Only set in hot potato mode
    pub current_token_location: Pubkey,
}