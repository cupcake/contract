use anchor_lang::prelude::*;

/// PDA created for each Bakery.
/// Stores information about the authorizing account within its' state.
/// Collects and executes token approvals for Sprinkle claims.
#[account]
pub struct Config {
    /// Account which has the authority to create/update sprinkles for this Bakery.
    pub authority: Pubkey,

    /// Bump value used in the PDA generation for this Bakery.
    pub bump: u8,
}

impl Config {
    /// The minimum required account size for a Bakery PDA.
    pub const SIZE: usize = 
        8 +     // Anchor discriminator
        32 +    // BakeryAuthority pubkey
        1;      // PDA bump
}