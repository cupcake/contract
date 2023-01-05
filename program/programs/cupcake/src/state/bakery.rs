#[account]
pub struct Bakery {
    /// The authority account address for this Bakery, which must be 
    /// present as a signer to create Sprinkles, or pay the fees for claims
    pub bakery_authority: Pubkey,

    /// The bump used in the PDA address generation for this Bakery
    pub bump: u8
}

impl Bakery {
  pub const ACCOUNT_SIZE: usize = 
    8 +   // Anchor discriminator
    32 +  // Authority pubkey
    1;    // PDA bump
}