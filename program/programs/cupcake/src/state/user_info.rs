use anchor_lang::prelude::*;

pub const USER_INFO_SIZE: usize = 8 +   // discriminator
                                  8 +   // num_claimed
                                  1;    // bump;

#[account]
#[derive(Default)]
pub struct UserInfo {
    pub num_claimed: u64,
    pub bump: u8,
}
