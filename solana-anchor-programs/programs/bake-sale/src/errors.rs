use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Bid size is less than the current bid + tick size.")]
    InsufficientBidError,

    #[msg("Cannot bid on a concluded auction.")]
    AuctionNotActiveError,

    #[msg("Auctions cannot be concluded before the end time.")]
    AuctionStillActiveError,
}