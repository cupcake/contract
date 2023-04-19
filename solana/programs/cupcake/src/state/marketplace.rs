use anchor_lang::prelude::*;

/// Different types of claim methods that can be assigned to a Sprinkle.
/// Note: Accepted state can be permissionlessly cancelled after a time period
#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq, Debug)]
pub enum ListingState {
    /// Made but not visible, they need to ship it
    /// You need to have NFT in wallet to make this listing
    Initialized,

    /// Cupcake has received the good but has not verified it's authenticity yet.
    Received,

    /// No offer made yet
    ForSale,

    /// If this is true for two weeks, we cancel and return item.
    /// At two weeks out, this PDA can be permissionlessly destroyed and cleaned up for lamports
    CupcakeCanceled,

    /// User cancels, we need to be notified by backend app to return item
    /// At two weeks out, this PDA can be permissionlessly destroyed and cleaned up for lamports
    UserCanceled,

    /// Listing has been accepted, tokens have been moved from Offer to Listing or from Buyer to Listing directly
    /// with no intermediate offer and it is now locked up, buyer is now waiting on seller to send phygital item to
    /// Cupcake center for shipping.
    Accepted,

    /// Cupcake has verified the good and will now ship it.
    Authenticated,

    /// The good is now shipped and will be claimed at some point.
    Shipped,

    // Returned to seller for one reason or another. Normally follows Canceled state.
    Returned,

    /// The tag has been scanned and now tokens are receivable
    /// This is the only state where the seller can claim the tokens
    /// At two weeks out, this PDA can be permissionlessly destroyed and cleaned up for lamports
    Scanned,
}

/// PDA created for each sale on the Hot potato market place
/// Seed of [prefix, bakery, tag, "listing"]
/// On creation, this Listing will make make further claims of the hot potato by others impossible. It
/// will truly be frozen in the user's wallet, even from others scanning the sticker.
///
/// This system could be gamed to prevent someone from ever scanning a sticker - not sure how to get around
/// this except with listing limits. Perhaps you can only have a listing up for 2 weeks at a time with a 1 week
/// cool down. We will add this if it becomes an issue.
///
/// Further scans on the hot potato sticker will fail
/// until the Listing is in the Shipped state, when a scan by the buyer (and only them) will trigger
/// the release of the NFT, and the transfer of the tokens to the seller in a secondary async txn.
///
/// A listing can either have an offer made and accepted in one go (no offer PDA created)
/// or it is made and then accepted (offer is collapsed), either way, listing will end up
/// with the tokens escrowed on it until its time to give them to the seller when the buyer scans.
///
/// The listing will be able to give them to the seller permissionlessly on a successful buyer scan,
/// and we can do this with a clockwork lever of some kind, a worker, or they can push a website claim button.
#[account]
pub struct Listing {
    /// A version identifier for this model, which we can use to cycle out the model if we need.
    pub version: u8,

    /// Account which created and can destroy this listing.
    /// also used for give me all listings for this seller memcmp call
    pub seller: Pubkey,

    /// Collection of the tag. Not enforced. Used for quick rpc lookups. You can stick anything here to index on.
    pub collection: Pubkey,

    pub state: ListingState,

    /// Original payer of the token account and this account
    pub fee_payer: Pubkey,

    pub chosen_buyer: Option<Pubkey>,

    /// If unset, assumed to be SOL
    pub price_mint: Option<Pubkey>,

    /// If unset, only taking offers, if set, and an offer is made at or above this price, it is auto-accepted
    pub set_price: Option<u64>,

    /// Agreed upon price
    pub agreed_price: Option<u64>,

    /// Bump value used in the PDA generation for this Listing.
    pub bump: u8,
}

/// Offer with seed [cupcake, bakery, tag, buyer]
/// Can only make one offer at a time, offer can be cancelled by buyer or seller.
/// Offer escrows payment from buyer as an ATA owned by the Offer OR as SOL in the offer PDA.
#[account]
pub struct Offer {
    /// A version identifier for this model, which we can use to cycle out the model if we need.
    pub version: u8,

    /// Account which created and can destroy this offer.
    /// also used for give me all offers for this buyer memcmp call
    pub buyer: Pubkey,

    /// Tag lookup for front end
    pub tag: Pubkey,

    /// Original payer of the token account and this account
    pub fee_payer: Pubkey,

    /// If unset, assumed to be SOL, duplicative with the Listing but makes for easier data lookup by front end
    /// Also its possible for user or cupcake to have changed mint type since listing was made
    pub offer_mint: Option<Pubkey>,

    /// Offer amount
    pub offer_amount: u64,

    /// Bump value used in the PDA generation for this Offer.
    pub bump: u8,

    /// Bump value used in the PDA generation for this Listing.
    pub token_bump: u8,
}

impl Listing {
    /// The minimum required account size for a Bakery PDA.
    pub const SIZE: usize = 8 +     // Anchor discriminator
        1 + // version
        32 +    // collection pubkey
        1 + // listing state
        32 +    // original fee payer pubkey
        33 + // chosen buyer
        33 + // price mint
        9 + // price
        9 + // agreed price
        1 + // PDA bump
        50; // buffer
}

impl Offer {
    /// The minimum required account size for a Bakery PDA.
    pub const SIZE: usize = 8 +     // Anchor discriminator
        1 + // version
        32 +    // Tag pubkey
        32 +    // fee payer pubkey
        33 + // offer mint
        8 + // offer amount
        2 +  // PDA bump
        50; // buffer
}
