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

    #[msg("Listing ATA must be empty to move")]
    ListingAtaMustBeEmpty,

    #[msg("If you are going to use a price_mint, you need to send up the listing token account to modify this listing")]
    MustSendUpListingTokenAccount,

    #[msg("If you are going to use a price_mint, you need to send up the price mint to modify this listing")]
    MustSendUpPriceMint,

    #[msg("Numerical Overflow")]
    NumericalOverflow,
}
