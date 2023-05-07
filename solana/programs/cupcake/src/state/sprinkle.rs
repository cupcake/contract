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

    /// Acts as a Refillable1Of1 for ProgrammableNonFungible tokens (pNFTs)
    ProgrammableUnique,
}

/*
   Thinking about Vaulting:
   If you send it in, you should be able to:
       - Request to move it to any wallet from the vault authority,
         which is set by the bakery authority to be the person currently
         carrying it when it is vaulted.
       - Can also be moved by current person holding it, but can be recalled
         any time by the person who is the vault authority.
       - While it's vaulted, it cannot be claimed from the tag
       - Only the bakery authority can unvault/vault it
       - We assume that vaulting == authenticating now.

   Changes to Listings:
       - We are removing the Authentication state, since we do not need it.

       - If you list a Tag that has vault = true, you skip to For Sale.
          No need for the Initialized->Received->For Sale flow.

       - If a buyer wants in their Offer, they can choose to buy as Vaulted

       - This boolean vaulted transfers over to Listing when offer is accepted.

       - New flow is:
           Initialized -> Received -> For Sale -> Vaulted.
           Tag is toggled to vaulted on Vaulted state, and NFT is transferred
           to buyer. Funds also transferred. Different end-state for Listing.
           Vaulted is end state and can be deleted by Bakery authority for lamports
           at some later date.

       - Compare this to normal flow, just as an FYI:
         Initialized -> Received -> For Sale -> Accepted -> Shipped -> Scanned
         On scanned, this NFT is unvaulted.
*/

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

    /// A vaulted hot potato can move without going through the claim endpoint
    /// that requires a lambda and tag authority sign off. Can just use
    /// vault authority, or current_token_location as signer in a different
    /// endpoint.
    pub vaulted: bool,

    /// If vaulted, who can move this token around remotely.
    pub vault_authority: Option<Pubkey>,
}

impl Tag {
    /// The minimum required account size for a Sprinkle PDA.
    pub const SIZE: usize = 8 +     // Anchor discriminator  
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
        1 +     // Vaulted
        33 +    // VaultAuthority
        16; // ~ Padding ~
}
