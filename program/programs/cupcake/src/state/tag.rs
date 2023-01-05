#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq, Debug)]
pub enum TagType {
    /// Print new NFT Editions from a delegated Master Edition
    LimitedOrOpenEdition,

    /// Transfer a single NFT, then remain immutable forever
    SingleUse1Of1,

    /// Mint from a Candy Machine by proxy for users
    ///   - Pays minting costs if needed
    ///   - Provides whitelist tokens if needed
    CandyMachineDrop,

    /// Transfer a single NFT, optionally refill it with a new one and repeat
    Refillable1Of1,

    /// Transfer any number of fungible tokens for each claim
    WalletRestrictedFungible,

    /// Transfer a single frozen NFT to the most recent claimer, infinitely
    HotPotato,
}

#[account]
pub struct Tag {
    /// The unique identifier for this Sprinkle
    pub uid: u64,

    /// The distribution method type for this Sprinkle
    pub tag_type: TagType,

    /// The authority account for this Sprinkle, must be present as a signer for all claims
    pub tag_authority: Pubkey,

    /// The PDA address of the Bakery which created this Sprinkle
    pub config: Pubkey,

    /// The total number of claims this Sprinkle will allow
    ///   - If the Sprinkle is a SingleUseUnique or RefillableUnique type, this will always be 1
    ///   - If the Sprinkle is an EditionPrinter or CandyMachine type, setting this to 0 will allow 
    ///     for infinite claims
    pub total_supply: u64,

    /// The current number of claims preformed on this Sprinkle
    pub num_claimed: u64,

    /// If true, users claiming from this Sprinkle will be required to cover the txn network fees
    pub minter_pays: bool,

    /// The total number of claims each individual user is permitted to preform on this Sprinkle
    pub per_user: u64,

    /// The mint address of the token to be transferred (or printed from) during claims
    ///   - If the Sprinkle is a CandyMachineDrop type, this will never be set
    pub token_mint: Pubkey,

    /// I dont trust candy machine structure not to change so we pre-cache settings here
    /// to avoid attempting to deserialize structure that might shift
    /// I do expect them to stick to their interfaces though

    /// The address of the Candy Machine to mint from during claims
    ///   - If the Sprinkle is NOT a CandyMachineDrop type, this will never be set
    pub candy_machine: Pubkey,

    /// The whitelist token mint account, delegated to the program to allow proxy Candy Machine minting
    /// If the Sprinkle is NOT a CandyMachineDrop type, this will never be set
    pub whitelist_mint: Pubkey,

    /// If this is true, the Candy Machine whitelist tokens will be burned for each successful claim
    ///   - If the Sprinkle is NOT a CandyMachineDrop type, this will always be false
    pub whitelist_burn: bool,

    /// The bump used in the PDA address generation for this Sprinkle
    pub bump: u8,

    /// The current ATA of a Sprinkle's token
    ///   - If the Sprinkle is NOT a HotPotato type, this will never be set
    pub current_token_location: Pubkey,
}

pub const TAG_SIZE: usize = 
  8 +   /// Anchor discriminator  
  8 +   /// Sprinkle UID
  1 +   /// TagType
  32 +  /// Sprinkle authority address
  32 +  /// Config PDA address
  8 +   /// Total number of claims
  8 +   /// Current number claimed counter
  8 +   /// Number of claims per user
  1 +   /// Minter pays?
  32 +  /// Token mint address
        /// Dont use Option<> here, so we can do offset memcmp lookups
  8 +   /// price
  32 +  /// Candy Machine address
  32 +  /// Whitelist token mint address
  1 +   /// PDA bump
  32 +  /// Current hot-potato location
  50;   /// Padding
