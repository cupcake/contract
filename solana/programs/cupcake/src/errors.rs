use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("The given tag cannot output any more tokens.")]
    TagDepleted,

    #[msg("The given user has already claimed the maximum amount of tokens from this tag.")]
    ClaimLimitExceeded,

    #[msg("The given tag can not be refilled.")]
    NotRefillable,

    #[msg("Must use candy machine specific actions")]
    CannotUseCandyMachineWithThisAction,

    #[msg("Numerical overflow")]
    NumericalOverflowError,

    #[msg("Key mismatch")]
    PublicKeyMismatch,

    #[msg("ATA should not have delegate")]
    AtaShouldNotHaveDelegate,

    #[msg("This ATA should have this config as delegate")]
    AtaDelegateShouldBeConfig,

    #[msg("Incorrect owner")]
    IncorrectOwner,

    #[msg("Uninitialized")]
    Uninitialized,

    #[msg("Cannot create a tag that does not have a whitelist token deposit if user is not required to provide it")]
    MustProvideWhitelistTokenIfMinterIsNotProvidingIt,

    #[msg("Must provide payment account if minter is not providing it")]
    MustProvidePaymentAccountIfMinterIsNotProviding,

    #[msg("Must use config as payer")]
    MustUseConfigAsPayer,

    #[msg("Single use 1/1s are not reconfigurable")]
    SingleUseIsImmutable,

    #[msg("This tag requires that someone other than config authority pay for the mint")]
    AuthorityShouldNotBePayer,

    #[msg("Hot potato is immutable unless the token is in an ATA on the config authority wallet.")]
    CanOnlyMutateHotPotatoWhenAtHome,

    #[msg("This pNFT rule is not supported by Cupcake yet.")]
    ProgrammableRuleNotSupported,

    #[msg("Hot Potatos can not be pNFTs")]
    HotPotatoCanNotBeProgrammable,

    #[msg("Invalid seeds provided")]
    InvalidSeeds,

    #[msg("Cannot claim during this state")]
    InvalidListingState,

    #[msg("Cannot change price setting during this state")]
    CannotChangePriceSettingsInThisState,

    #[msg("If you are going to use a price_mint, you need to send up the listing token account to modify this listing")]
    MustSendUpListingTokenAccount,

    #[msg("If you are going to use a price_mint, you need to send up the price mint to modify this listing")]
    MustSendUpPriceMint,

    #[msg("Numerical Overflow")]
    NumericalOverflow,

    #[msg("Listing has been scanned and is now frozen")]
    ListingFrozen,

    #[msg("Can only accept a bid from the accept endpoint")]
    CannotAcceptFromModify,

    #[msg("Can only change price, not its mint type, while in for sale mode")]
    CannotChangePriceMintInThisState,

    #[msg("Can only scan from claim")]
    CannotScanFromModify,

    #[msg("No buyer token account present")]
    NoBuyerTokenPresent,

    #[msg("No buyer present")]
    NoBuyerPresent,

    #[msg("No transfer authority present")]
    NoTransferAuthorityPresent,

    #[msg("No price mint present")]
    NoPriceMintPresent,

    #[msg("No token metadata for this tag present but is required for this transaction")]
    NoTokenMetadataPresent,

    #[msg("No seller ata present")]
    NoSellerAtaPresent,

    #[msg("No ata program present")]
    NoAtaProgramPresent,

    #[msg("Price mint mismatch")]
    PriceMintMismatch,

    #[msg("Buyer must sign when listing is active")]
    BuyerMustSign,

    #[msg("Cannot delete listing unless it is cancelled or returned")]
    CannotDeleteListingInThisState,

    #[msg("Cannot close listing if token account has a balance greater than zero")]
    ListingTokenHasBalance,

    #[msg("Seller must be token holder")]
    SellerMustBeLister,

    #[msg("Must hold token to sell")]
    MustHoldTokenToSell,

    #[msg("User must be a signer to use hot potato mode")]
    UserMustSign,

    #[msg("Need agreed price to goto scanned")]
    NeedAgreedPrice,

    #[msg("Need chosen buyer")]
    NeedBuyer,

    #[msg("Seller must initiate the listing")]
    SellerMustInitiateSale,

    #[msg("Listing not for sale")]
    ListingNotForSale,

    #[msg("Must bid at least 0.001 SOL")]
    MinimumOffer,

    #[msg("Must use seller as payer")]
    MustUseSellerAsPayer,

    #[msg("Seller does not match")]
    SellerMismatch,

    #[msg("Cannot claim a vaulted token")]
    CannotClaimVaulted,

    #[msg("Cannot vault from modify, have the user accept the offer.")]
    CannotVaultFromModify,

    #[msg("Missing one of many required fields for accepting an offer that will result in a vaulted hot potato NFT. Please check the docs.")]
    MissingVaultOfferField,
}
