use anchor_lang::prelude::*;

pub const CONFIG_SIZE: usize = 8      // discriminator
                              + 32    // config
                              + 1;    // bump

#[account]
pub struct Config {
    pub authority: Pubkey,
    pub bump: u8,
}