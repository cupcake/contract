pub mod bakery;
pub mod marketplace;
pub mod sprinkle;
pub mod user_info;

pub use bakery::*;
pub use marketplace::*;
pub use sprinkle::*;
pub use user_info::*;

/// String used as the first seed for all Cupcake Protocol PDAs.
pub const PDA_PREFIX: &[u8] = b"cupcake";
pub const LISTING: &[u8] = b"listing";
pub const TOKEN: &[u8] = b"token";
pub const OFFER: &[u8] = b"offer";
