pub mod bakery;
pub mod sprinkle;
pub mod treasure_chest;
pub mod user_info;

pub use bakery::*;
pub use sprinkle::*;
pub use treasure_chest::*;
pub use user_info::*;

/// String used as the first seed for all Cupcake Protocol PDAs.
pub const PDA_PREFIX: &[u8] = b"cupcake";