use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Bid size is less than the current bid + tick size")]
    InsufficientBidError,

    #[msg("failed to perform some math operation safely")]
    AuctionNotActiveError,
}