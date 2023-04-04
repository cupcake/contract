pub mod bakery;
pub mod sprinkle;
pub mod user_info;

pub use bakery::*;
pub use sprinkle::*;
pub use user_info::*;

/// String used as the first seed for all Cupcake Protocol PDAs.
pub const PDA_PREFIX: &[u8] = b"cupcake";