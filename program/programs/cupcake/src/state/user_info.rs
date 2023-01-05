#[account]
#[derive(Default)]
pub struct UserInfo {
    /// The number of tokens the associated user has claimed from the associated sprinkle
    pub num_claimed: u64,

    /// The bump used in the PDA address generation for this UserInfo
    pub bump: u8
}

pub const USER_INFO_SIZE: usize = 
  8 +   /// Anchor discriminator
  8 +   /// Current number of claims counter
  1;    /// PDA bump
