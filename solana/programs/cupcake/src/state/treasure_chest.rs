use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, Default)]
pub struct StorageSpace {
    pub token_mint: Pubkey,
    pub retrieved: bool,
}

impl StorageSpace {
    // The minimum required account size for each StorageSpace inside a TreasureChest PDA.
    pub const SIZE: usize =
        32 +  // Stored token mint
        1;    // Token was retrieved?
}

#[account]
pub struct TreasureChest {
    pub sprinkle: Pubkey,

    pub storage: [StorageSpace; 10],
}

impl TreasureChest {
    pub const PREFIX: &'static [u8] = b"treasure-chest";

    /// The minimum required account size for a TreasureChest PDA.
    pub const SIZE: usize = 
        8 +                       // Anchor discriminator
        32 +                      // Sprinkle pubkey
        StorageSpace::SIZE * 10;  //
}