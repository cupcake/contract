use anchor_lang::prelude::*;

/// Different types of claim methods that can be assigned to a Sprinkle. 
#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq, Debug)]
pub enum TagType {
    /// Prints identical copies of a Master Edition NFT to each claimer.
    LimitedOrOpenEdition,

    /// Transfers a single NFT one time, then exists immutably forever.
    SingleUse1Of1,

    /// Mints one NFT from a Candy Machine to each claimer.
    /// Can optionally accept and use a whitelist token.
    CandyMachineDrop,

    /// Transfers a single NFT one time, then can be refilled by the Bakery.
    Refillable1Of1,

    /// Transfers a set amount of fungible tokens to each claimer.
    WalletRestrictedFungible,

    /// Passes a single frozen NFT between claimers.
    HotPotato,
}

/// PDA created for each Sprinkle.
/// Stores information about the assigned NFT/Candy Machine/etc and claim method.
/// Maintains a counter of the total number of claims executed.
#[account]
pub struct Tag {
    /// The unique identifier for this Sprinkle, used in PDA generation.
    pub uid: u64,

    /// The claim method this Sprinkle will use.
    pub tag_type: TagType,

    /// The address of the account which must sign to approve claims on this Sprinkle.
    pub tag_authority: Pubkey,

    /// The address of the Bakery PDA which owns this Sprinkle.
    pub config: Pubkey,

    /// The total amount of claims that can be executed from this Sprinkle.
    pub total_supply: u64,

    /// A counter tracking the current number of claims executed from this Sprinkle.
    pub num_claimed: u64,

    /// If this is true, claimers must pay the Candy Machine mint fees.
    pub minter_pays: bool,

    /// The total number of claims an individual user can execute from this Sprinkle.
    pub per_user: u64,

    /// The mint address of the SPL token custodied by this Sprinkle.
    pub token_mint: Pubkey,

    // I dont trust candy machine structure not to change so we pre-cache settings here
    // to avoid attempting to deserialize structure that might shift
    // I do expect them to stick to their interfaces though

    /// The address of the Candy Machine assigned to this sprinkle, if any.
    pub candy_machine: Pubkey,

    /// The mint address of the whitelist token for the Candy Machine assigned to this Sprinkle, if any.
    pub whitelist_mint: Pubkey,

    /// If this is true, whitelist tokens will be burnt after being used to mint from the Candy Machine.
    pub whitelist_burn: bool,

    /// Bump value used in the PDA generation for this Sprinkle.
    pub bump: u8,

    /// Address of the account currently holding the Hot-Potato'd token in this Sprinkle, if any.
    pub current_token_location: Pubkey,
}

impl Tag {
    /// The minimum required account size for a Sprinkle PDA.
    pub const SIZE: usize = 
        8 +     // Anchor discriminator  
        8 +     // UID
        1 +     // SprinkleType
        32 +    // TagAuthority pubkey
        32 +    // Bakery pubkey
        8 +     // TotalSupply
        8 +     // NumClaimed
        8 +     // PerUser
        1 +     // Minter pays?
        32 +    // TokenMint pubkey
                // Dont use option here so we can do offset memcmp lookups
        8 +     // Pricer per mint
        32 +    // CandyMachine pubkey
        32 +    // WhitelistToken pubkey
        1 +     // PDA bump
        32 +    // HotPotato location pubkey
        50;     // ~ Padding ~
}