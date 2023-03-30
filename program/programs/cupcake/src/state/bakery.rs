use anchor_lang::prelude::*;
use mpl_token_metadata::processor::AuthorizationData;
use mpl_token_auth_rules::state::Rule;
use mpl_token_auth_rules::payload::{Payload, PayloadType, SeedsVec};

use crate::state::PDA_PREFIX;

/// PDA created for each Bakery.
/// Stores information about the authorizing account within its' state.
/// Collects and executes token approvals for Sprinkle claims.
#[account]
pub struct Config {
    /// Account which has the authority to create/update sprinkles for this Bakery.
    pub authority: Pubkey,

    /// Bump value used in the PDA generation for this Bakery.
    pub bump: u8,
}

impl Config {
    /// The minimum required account size for a Bakery PDA.
    pub const SIZE: usize = 
        8 +     // Anchor discriminator
        32 +    // BakeryAuthority pubkey
        1;      // PDA bump

    ///
    pub fn construct_auth_data(&self, bakery_key: Pubkey, rule: &Rule, amount: u64) -> Option<AuthorizationData> {
        let payload = match rule {
            Rule::Pass => None,

            Rule::Amount { amount, operator, field } => {
                let payload_fields = [(field.to_owned(), PayloadType::Number(1))];
                Some(Payload::from(payload_fields))
            }

            Rule::PubkeyMatch { pubkey, field } => {
                let payload_fields = [(field.to_owned(), PayloadType::Pubkey(bakery_key))];
                Some(Payload::from(payload_fields))
            }

            Rule::PubkeyListMatch { pubkeys, field } => {
              let payload_fields = [(field.to_owned(), PayloadType::Pubkey(bakery_key))];
              Some(Payload::from(payload_fields))              
            }

            Rule::ProgramOwned { program, field } => {
              let payload_fields = [(field.to_owned(), PayloadType::Pubkey(bakery_key))];
              Some(Payload::from(payload_fields))              
            }

            Rule::ProgramOwnedList { programs, field } => {
              let payload_fields = [(field.to_owned(), PayloadType::Pubkey(bakery_key))];
              Some(Payload::from(payload_fields))              
            }

            Rule::ProgramOwnedSet { programs, field } => {
              let payload_fields = [(field.to_owned(), PayloadType::Pubkey(bakery_key))];
              Some(Payload::from(payload_fields))              
            }

            Rule::PDAMatch { program, pda_field, seeds_field } => {
                let bakery_seeds_vec = SeedsVec {
                    seeds: vec![
                        (&PDA_PREFIX[..]).to_vec(), 
                        (&self.authority.as_ref()[..]).to_vec(), 
                        (&[self.bump]).to_vec()
                    ]
                };
                let payload_fields = [
                    (pda_field.to_owned(), PayloadType::Pubkey(bakery_key)),
                    (seeds_field.to_owned(), PayloadType::Seeds(bakery_seeds_vec))
                ];
                Some(Payload::from(payload_fields))
            }

            _ => None
        };

        let auth_data = match payload {
            Some(payload) => Some(AuthorizationData { payload }), 
            None => None
        };

        auth_data
    } 
}