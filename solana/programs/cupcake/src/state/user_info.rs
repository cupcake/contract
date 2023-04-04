use anchor_lang::prelude::*;

/// PDA, associated with a user, created for each unique Sprinkle they claim.
/// Maintains a counter of the total number of claims by the user for that Sprinkle.
#[account]
#[derive(Default)]
pub struct UserInfo {
    /// The number of claims this user has executed from this Sprinkle.
    pub num_claimed: u64,

    /// Bump value used in the PDA generation for this UserInfo.
    pub bump: u8,
}

impl UserInfo {
    /// The minimum required account size for a UserInfo PDA.
    pub const SIZE: usize = 
        8 +   // Anchor discriminator
        8 +   // NumClaimed
        1;    // PDA bump
}
