use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_program;

use crate::PDA_PREFIX;

#[account]
pub struct BakeSale {
    ///
    pub bakery_authority: Pubkey,

    /// The total length of the auction, in seconds
    pub auction_length: u64,

    /// The minimum bid the auction must start at, in 
    pub reserve_price: u64,

    /// The minimum increase in price between bids, in
    pub tick_size: u64, 

    /// The mint address of the token used to bid in the auction
    pub payment_mint: Pubkey,

    /// The mint address of the POAP token to be distributed to bidders
    pub poap_mint: Pubkey,

    /// The mint address of the token rewarded to the winning bidder
    pub prize_mint: Pubkey,

    /// If this is true, bidders must pay the transaction fees.
    pub bidders_pay: bool,

    /// 
    pub current_bid: u64,

    /// 
    pub current_winner: Pubkey,

    ///
    pub auction_id_bytes: [u8; 8],

    ///
    pub pda_bump: [u8; 1]
}

impl BakeSale {
    pub const SIZE: usize = 8 + 64 + 32 + 64 + 64 + 64 + 32 + 32 + 32 + 1 + 1 + 64 + 32 + 8;

    pub fn has_previous_bid(&self) -> bool {
      self.current_bid > 0
    }

    pub fn has_spl_payment(&self) -> bool {
      self.payment_mint != system_program::ID
    }

    pub fn pda_seeds(&self) -> [&[u8]; 4] {
        [PDA_PREFIX, self.bakery_authority.as_ref(), &self.auction_id_bytes,  &self.pda_bump]
    }
}