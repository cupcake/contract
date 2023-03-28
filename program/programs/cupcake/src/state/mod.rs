pub mod config;
pub mod tag;
pub mod user_info;

pub use config::*;
pub use tag::*;
pub use user_info::*;

/// String used as the first seed for all Cupcake Protocol PDAs.
pub const PDA_PREFIX: &[u8] = b"cupcake";