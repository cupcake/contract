pub mod utils;

use {
    crate::utils::{
        assert_is_ata, assert_keys_equal, create_or_allocate_account_raw,
        get_master_edition_supply, grab_update_authority, sighash,
    },
    anchor_lang::prelude::*,
    anchor_lang::solana_program::{
        instruction::Instruction,
        program::{invoke, invoke_signed},
        system_program,
    },
    anchor_spl::token::{
        approve, close_account, initialize_account, set_authority, transfer, Approve, CloseAccount,
        InitializeAccount, Mint, SetAuthority, Token, TokenAccount, Transfer,
    },
    mpl_token_metadata::instruction::{
        freeze_delegated_account, mint_new_edition_from_master_edition_via_token,
        thaw_delegated_account,
    },
    std::str::FromStr,
};

declare_id!("cakeGJxEdGpZ3MJP8sM3QypwzuzZpko1ueonUQgKLPE");

pub const PREFIX: &[u8] = b"cupcake";
pub const METADATA_PROGRAM_ID: &str = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

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
}

#[program]
pub mod cupcake {

    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.config.authority = *ctx.accounts.authority.to_account_info().key;
        ctx.accounts.config.bump = *ctx.bumps.get("config").unwrap();
        Ok(())
    }

    pub fn add_or_refill_tag<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, AddOrRefillTag<'info>>,
        tag_params: AddOrRefillTagParams,
    ) -> Result<()> {
        let tag_type = tag_params.tag_type;
        let token_program = &ctx.accounts.token_program;
        let minter_pays = tag_params.minter_pays;
        let tag = &mut ctx.accounts.tag;
        let config = &ctx.accounts.config;
        let config_seeds = &[&PREFIX[..], &config.authority.as_ref()[..], &[config.bump]];

        require!(
            // require that if tag has been made before, this action isnt called on a single use kind of tag
            tag.uid == 0 || tag.tag_type != TagType::SingleUse1Of1,
            SingleUseIsImmutable
        );

        let total_supply = match tag_type {
            TagType::SingleUse1Of1 | TagType::HotPotato => 1,
            TagType::Refillable1Of1 => {
                if ctx.remaining_accounts[0].key() != tag.token_mint
                    && tag.num_claimed == tag.total_supply
                {
                    tag.total_supply
                        .checked_add(1)
                        .ok_or(ErrorCode::NumericalOverflowError)?
                } else {
                    tag.total_supply
                }
            }
            _ => tag_params.num_claims,
        };

        let token_mint = match tag_type {
            TagType::SingleUse1Of1
            | TagType::Refillable1Of1
            | TagType::WalletRestrictedFungible
            | TagType::HotPotato => {
                let token_mint = &ctx.remaining_accounts[0];
                let token = &ctx.remaining_accounts[1];

                assert_is_ata(
                    token,
                    &ctx.accounts.config.authority.key(),
                    &token_mint.key(),
                    Some(&ctx.accounts.config.key()),
                )?;

                // Check that its a real mint
                let _mint: Account<Mint> = Account::try_from(token_mint)?;
                let token_account: Account<TokenAccount> = Account::try_from(token)?;

                if tag_type != TagType::HotPotato
                    || token_account.state != spl_token::state::AccountState::Frozen
                {
                    let cpi_accounts = Approve {
                        to: token.clone(),
                        delegate: ctx.accounts.config.to_account_info(),
                        authority: ctx.accounts.authority.to_account_info(),
                    };
                    let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);

                    approve(context, total_supply)?;
                }

                if tag_type == TagType::HotPotato {
                    require!(
                        tag.uid == 0
                            || tag.current_token_location == token.key()
                            || token_account.amount == 1,
                        CanOnlyMutateHotPotatoWhenAtHome
                    );

                    tag.current_token_location = token.key();
                    let edition = &ctx.remaining_accounts[2];
                    let token_metadata_program = &ctx.remaining_accounts[3];

                    assert_keys_equal(
                        token_metadata_program.key(),
                        Pubkey::from_str(METADATA_PROGRAM_ID).unwrap(),
                    )?;

                    if token_account.state != spl_token::state::AccountState::Frozen {
                        let cpi_accounts = SetAuthority {
                            current_authority: ctx.accounts.authority.to_account_info(),
                            account_or_mint: token.clone(),
                        };

                        let context = CpiContext::new(
                            ctx.accounts.token_program.to_account_info(),
                            cpi_accounts,
                        );
                        set_authority(
                            context,
                            spl_token::instruction::AuthorityType::CloseAccount,
                            Some(config.key()),
                        )?;
                        invoke_signed(
                            &freeze_delegated_account(
                                token_metadata_program.key(),
                                config.key(),
                                token.key(),
                                edition.key(),
                                token_mint.key(),
                            ),
                            &[
                                token_metadata_program.clone(),
                                config.to_account_info(),
                                token.clone(),
                                edition.clone(),
                                token_mint.clone(),
                            ],
                            &[&config_seeds[..]],
                        )?;
                    }
                }

                token_mint.key()
            }
            TagType::CandyMachineDrop => {
                let candy_machine = &ctx.remaining_accounts[0];
                let whitelist_mint = &ctx.remaining_accounts[1];
                let whitelist_token = &ctx.remaining_accounts[2];
                let payment_token_mint = &ctx.remaining_accounts[3];
                let payment_token = &ctx.remaining_accounts[4];

                require!(
                    // if WL present, you need to provide a payment account for it
                    // or say minter is doing it
                    whitelist_mint.key() == system_program::ID
                        || whitelist_token.key() != system_program::ID
                        || minter_pays,
                    MustProvideWhitelistTokenIfMinterIsNotProvidingIt
                );

                require!(
                    // if payment token mint is an actual mint, and you are not providing
                    // a payment account for it, you need to say minter is paying both
                    payment_token_mint.key() == system_program::ID
                        || payment_token.key() != system_program::ID
                        || minter_pays,
                    MustProvidePaymentAccountIfMinterIsNotProviding
                );

                if whitelist_mint.key() != system_program::ID
                    && whitelist_token.key() != system_program::ID
                {
                    let _wl_mint: Account<Mint> = Account::try_from(&whitelist_mint)?;

                    assert_is_ata(
                        &whitelist_token,
                        &ctx.accounts.config.authority.key(),
                        &whitelist_mint.key(),
                        Some(&ctx.accounts.config.key()),
                    )?;

                    let cpi_accounts = Approve {
                        to: whitelist_token.clone(),
                        delegate: ctx.accounts.config.to_account_info(),
                        authority: ctx.accounts.authority.to_account_info(),
                    };
                    let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
                    approve(context, total_supply)?;
                }

                if payment_token_mint.key() != system_program::ID
                    && payment_token.key() != system_program::ID
                {
                    // verify it is mint
                    let _mint: Account<Mint> = Account::try_from(&payment_token_mint)?;

                    assert_is_ata(
                        &payment_token,
                        &ctx.accounts.config.authority.key(),
                        &payment_token_mint.key(),
                        Some(&ctx.accounts.config.key()),
                    )?;

                    let cpi_accounts = Approve {
                        to: payment_token.clone(),
                        delegate: ctx.accounts.config.to_account_info(),
                        authority: ctx.accounts.authority.to_account_info(),
                    };
                    let context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
                    approve(
                        context,
                        tag_params
                            .price_per_mint
                            .unwrap()
                            .checked_mul(total_supply)
                            .ok_or(ErrorCode::NumericalOverflowError)?,
                    )?;
                }

                tag.whitelist_mint = whitelist_mint.key();
                tag.whitelist_burn = tag_params.whitelist_burn;
                tag.candy_machine = candy_machine.key();

                payment_token_mint.key()
            }
            TagType::LimitedOrOpenEdition => {
                let token_mint = &ctx.remaining_accounts[0];

                // Check that its a real mint
                let _mint: Account<Mint> = Account::try_from(token_mint)?;

                token_mint.key()
            }
        };

        tag.per_user = match tag_type {
            TagType::SingleUse1Of1 => 1,
            _ => tag_params.per_user,
        };
        if tag_type != TagType::SingleUse1Of1 {
            tag.total_supply = total_supply;
        } else {
            tag.total_supply = 1;
        }
        tag.minter_pays = minter_pays;
        tag.uid = tag_params.uid;
        tag.tag_authority = *ctx.accounts.tag_authority.to_account_info().key;
        tag.tag_type = tag_type;
        tag.token_mint = token_mint;
        tag.config = ctx.accounts.config.key();
        tag.bump = *ctx.bumps.get("tag").unwrap();
        Ok(())
    }

    pub fn claim_tag<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, ClaimTag<'info>>,
        creator_bump: u8, // Ignored except in candy machine use and hotpotato use. In hotpotato is used to make the token account.
    ) -> Result<()> {
        let tag = &mut ctx.accounts.tag;
        let tag_type: TagType = tag.tag_type;
        let config = &ctx.accounts.config;
        let payer = &ctx.accounts.payer;
        let user_info = &ctx.accounts.user_info;
        let user = &ctx.accounts.user;
        let config_seeds = &[&PREFIX[..], &config.authority.as_ref()[..], &[config.bump]];

        if tag.tag_type != TagType::HotPotato
            && (tag.total_supply > 0)
            && (tag.num_claimed == tag.total_supply)
        {
            return Err(ErrorCode::TagDepleted.into());
        };

        require!(
            tag.tag_type == TagType::HotPotato || user_info.num_claimed < tag.per_user,
            ErrorCode::ClaimLimitExceeded
        );

        if tag.minter_pays {
            require!(config.authority != payer.key(), AuthorityShouldNotBePayer);
        }

        let mut amount_to_claim = 1;

        match tag_type {
            TagType::LimitedOrOpenEdition => {
                let token_mint = &ctx.remaining_accounts[0];
                let token = &ctx.remaining_accounts[1];
                let new_token_mint = &ctx.remaining_accounts[2];
                let new_metadata = &ctx.remaining_accounts[3];
                let new_edition = &ctx.remaining_accounts[4];
                let metadata = &ctx.remaining_accounts[5];
                let master_edition = &ctx.remaining_accounts[6];
                let edition_mark_pda = &ctx.remaining_accounts[7];
                let new_mint_authority = &ctx.remaining_accounts[8];
                let update_authority = &ctx.remaining_accounts[9];
                let token_metadata_program = &ctx.remaining_accounts[10];
                msg!("1");
                let update_auth = grab_update_authority(&metadata)?;
                assert_keys_equal(update_auth, update_authority.key())?;
                assert_keys_equal(tag.token_mint, token_mint.key())?;
                assert_keys_equal(
                    token_metadata_program.key(),
                    Pubkey::from_str(METADATA_PROGRAM_ID).unwrap(),
                )?;
                let edition = get_master_edition_supply(&master_edition)?
                    .checked_add(1)
                    .ok_or(ErrorCode::NumericalOverflowError)?;
                msg!("2");
                invoke(
                    &mint_new_edition_from_master_edition_via_token(
                        token_metadata_program.key(),
                        new_metadata.key(),
                        new_edition.key(),
                        master_edition.key(),
                        new_token_mint.key(),
                        new_mint_authority.key(),
                        payer.key(),
                        config.authority,
                        token.key(),
                        update_auth,
                        metadata.key(),
                        token_mint.key(),
                        edition,
                    ),
                    &[
                        token_metadata_program.clone(),
                        new_metadata.clone(),
                        new_edition.clone(),
                        master_edition.clone(),
                        new_token_mint.clone(),
                        new_mint_authority.clone(),
                        payer.to_account_info(),
                        config.to_account_info(),
                        token.clone(),
                        update_authority.clone(),
                        metadata.clone(),
                        token_mint.clone(),
                        edition_mark_pda.clone(),
                        ctx.accounts.rent.to_account_info(),
                    ],
                )?;
                msg!("3");
            }

            TagType::CandyMachineDrop => {
                let candy_machine_id = &ctx.remaining_accounts[0];
                let candy_machine_creator = &ctx.remaining_accounts[1];
                let candy_machine_wallet = &ctx.remaining_accounts[2];
                let new_token_mint = &ctx.remaining_accounts[3];
                let new_metadata = &ctx.remaining_accounts[4];
                let new_edition = &ctx.remaining_accounts[5];
                let new_mint_authority = &ctx.remaining_accounts[6];
                let token_metadata_program = &ctx.remaining_accounts[7];
                let candy_machine_program = &ctx.remaining_accounts[8];
                // no spoofing
                assert_keys_equal(
                    candy_machine_program.key(),
                    Pubkey::from_str("DsRmdpRZJwagptu4MMN7GJWaPuwPgStWPUSbfAinYCg9").unwrap(),
                )?;
                // these three are enforced by inner contract, no need to check
                let clock = &ctx.remaining_accounts[9];
                let recent_slothashes = &ctx.remaining_accounts[10];
                let instruction_sysvar_account = &ctx.remaining_accounts[11];
                let mut ctr = 12;

                let mut keys = vec![
                    AccountMeta::new(candy_machine_id.key(), false),
                    AccountMeta::new_readonly(candy_machine_creator.key(), false),
                    AccountMeta::new(payer.key(), true),
                    AccountMeta::new(candy_machine_wallet.key(), false),
                    AccountMeta::new(new_metadata.key(), false),
                    AccountMeta::new(new_token_mint.key(), false),
                    AccountMeta::new_readonly(new_mint_authority.key(), true),
                    AccountMeta::new_readonly(new_mint_authority.key(), true),
                    AccountMeta::new(new_edition.key(), false),
                    AccountMeta::new_readonly(token_metadata_program.key(), false),
                    AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
                    AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
                    AccountMeta::new_readonly(ctx.accounts.rent.key(), false),
                    AccountMeta::new_readonly(clock.key(), false),
                    AccountMeta::new_readonly(recent_slothashes.key(), false),
                    AccountMeta::new_readonly(instruction_sysvar_account.key(), false),
                ];

                let mut accounts = vec![
                    candy_machine_id.clone(),
                    candy_machine_creator.clone(),
                    payer.to_account_info(),
                    candy_machine_wallet.clone(),
                    new_metadata.clone(),
                    new_token_mint.clone(),
                    new_mint_authority.clone(),
                    user.to_account_info(),
                    new_edition.clone(),
                    token_metadata_program.clone(),
                    ctx.accounts.token_program.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                    ctx.accounts.rent.to_account_info(),
                    clock.clone(),
                    recent_slothashes.clone(),
                    instruction_sysvar_account.clone(),
                    candy_machine_program.clone(),
                ];

                if tag.whitelist_mint != system_program::ID {
                    let whitelist_token_account = &ctx.remaining_accounts[ctr];
                    keys.push(AccountMeta::new(whitelist_token_account.key(), false));
                    accounts.push(whitelist_token_account.clone());
                    ctr += 1;
                    if tag.whitelist_burn {
                        let whitelist_token_mint = &ctx.remaining_accounts[ctr];
                        keys.push(AccountMeta::new(whitelist_token_mint.key(), false));
                        accounts.push(whitelist_token_mint.clone());

                        if !tag.minter_pays {
                            // use config pda delegate for burn
                            keys.push(AccountMeta::new_readonly(config.key(), true));
                            accounts.push(config.to_account_info());
                        } else {
                            keys.push(AccountMeta::new_readonly(user.key(), true));
                        }
                        ctr += 1;
                    }
                }

                if tag.token_mint != system_program::ID {
                    let token_account = &ctx.remaining_accounts[ctr];
                    keys.push(AccountMeta::new(token_account.key(), false));
                    accounts.push(token_account.clone());

                    if !tag.minter_pays {
                        // use config pda delegate for tfer
                        keys.push(AccountMeta::new_readonly(config.key(), true));
                        accounts.push(config.to_account_info());
                    } else {
                        keys.push(AccountMeta::new_readonly(user.key(), true));
                    }
                }

                invoke_signed(
                    &Instruction {
                        program_id: candy_machine_program.key(),
                        accounts: keys,
                        data: AnchorSerialize::try_to_vec(&CandyMachineArgs {
                            instruction: sighash("global", "mint_nft"),
                            creator_bump,
                        })?,
                    },
                    &accounts,
                    &[config_seeds],
                )?;
            }

            TagType::WalletRestrictedFungible
            | TagType::Refillable1Of1
            | TagType::SingleUse1Of1 => {
                let token = &ctx.remaining_accounts[0];
                let user_ata = &ctx.remaining_accounts[1];

                assert_is_ata(
                    &token,
                    &ctx.accounts.config.authority,
                    &tag.token_mint,
                    Some(&ctx.accounts.config.key()),
                )?;

                assert_is_ata(
                    &user_ata,
                    &ctx.accounts.user.key(),
                    &tag.token_mint,
                    Some(&ctx.accounts.config.key()),
                )?;

                amount_to_claim = tag
                    .per_user
                    .checked_sub(ctx.accounts.user_info.num_claimed)
                    .ok_or(ErrorCode::NumericalOverflowError)?;

                amount_to_claim = std::cmp::min(
                    amount_to_claim,
                    tag.total_supply
                        .checked_sub(tag.num_claimed)
                        .ok_or(ErrorCode::NumericalOverflowError)?,
                );

                let cpi_accounts = Transfer {
                    from: token.clone(),
                    to: user_ata.clone(),
                    authority: ctx.accounts.config.to_account_info(),
                };
                let context =
                    CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);

                transfer(context.with_signer(&[&config_seeds[..]]), amount_to_claim)?;
            }
            TagType::HotPotato => {
                let token = &ctx.remaining_accounts[0];
                let user_token_account = &ctx.remaining_accounts[1];
                let edition = &ctx.remaining_accounts[2];
                let token_mint = &ctx.remaining_accounts[3];
                let token_metadata_program = &ctx.remaining_accounts[4];
                assert_keys_equal(
                    token_metadata_program.key(),
                    Pubkey::from_str(METADATA_PROGRAM_ID).unwrap(),
                )?;
                assert_keys_equal(token.key(), tag.current_token_location)?;

                assert_keys_equal(token_mint.key(), tag.token_mint)?;

                let user_key = user.key();
                let signer_seeds = &[
                    PREFIX,
                    config.authority.as_ref(),
                    &tag.uid.to_le_bytes(),
                    user_key.as_ref(),
                    tag.token_mint.as_ref(),
                    &[creator_bump],
                ];
                create_or_allocate_account_raw(
                    ctx.accounts.token_program.key(),
                    user_token_account,
                    &ctx.accounts.rent,
                    &ctx.accounts.system_program,
                    payer,
                    anchor_spl::token::TokenAccount::LEN,
                    signer_seeds,
                )?;

                let cpi_accounts = InitializeAccount {
                    authority: config.to_account_info(),
                    account: user_token_account.to_account_info(),
                    mint: token_mint.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                };

                let context =
                    CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);

                initialize_account(context)?;

                invoke_signed(
                    &thaw_delegated_account(
                        token_metadata_program.key(),
                        config.key(),
                        token.key(),
                        edition.key(),
                        token_mint.key(),
                    ),
                    &[
                        token_metadata_program.clone(),
                        config.to_account_info(),
                        token.clone(),
                        edition.clone(),
                        token_mint.clone(),
                    ],
                    &[&config_seeds[..]],
                )?;

                let cpi_accounts = Transfer {
                    from: token.clone(),
                    to: user_token_account.clone(),
                    authority: config.to_account_info(),
                };
                let context =
                    CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);

                transfer(context.with_signer(&[&config_seeds[..]]), 1)?;

                let cpi_accounts = SetAuthority {
                    current_authority: config.to_account_info(),
                    account_or_mint: user_token_account.clone(),
                };
                let context =
                    CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);

                set_authority(
                    context.with_signer(&[&config_seeds[..]]),
                    spl_token::instruction::AuthorityType::AccountOwner,
                    Some(user.key()),
                )?;

                let cpi_accounts = SetAuthority {
                    current_authority: user.to_account_info(),
                    account_or_mint: user_token_account.clone(),
                };

                let context =
                    CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
                set_authority(
                    context,
                    spl_token::instruction::AuthorityType::CloseAccount,
                    Some(config.key()),
                )?;

                let cpi_accounts = Approve {
                    to: user_token_account.clone(),
                    delegate: config.to_account_info(),
                    authority: user.to_account_info(),
                };
                let context =
                    CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);

                approve(context, 1)?;

                let cpi_accounts = CloseAccount {
                    account: token.clone(),
                    destination: payer.to_account_info(),
                    authority: config.to_account_info(),
                };
                let context =
                    CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);

                close_account(context.with_signer(&[&config_seeds[..]]))?;

                tag.current_token_location = user_token_account.key();

                invoke_signed(
                    &freeze_delegated_account(
                        token_metadata_program.key(),
                        config.key(),
                        user_token_account.key(),
                        edition.key(),
                        token_mint.key(),
                    ),
                    &[
                        token_metadata_program.clone(),
                        config.to_account_info(),
                        user_token_account.clone(),
                        edition.clone(),
                        token_mint.clone(),
                    ],
                    &[&config_seeds[..]],
                )?;
            }
        };

        ctx.accounts.user_info.num_claimed = ctx
            .accounts
            .user_info
            .num_claimed
            .checked_add(amount_to_claim)
            .ok_or(ErrorCode::NumericalOverflowError)?;

        ctx.accounts.tag.num_claimed = ctx
            .accounts
            .tag
            .num_claimed
            .checked_add(amount_to_claim)
            .unwrap();
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init, payer = payer, seeds = [PREFIX, authority.key().as_ref()], bump, space =  CONFIG_SIZE)]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(tag_params: AddOrRefillTagParams)]
pub struct AddOrRefillTag<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [PREFIX, authority.key().as_ref()], bump=config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    /// CHECK: TagAuthority can be any account that can sign to approve a claim.
    #[account(mut)]
    pub tag_authority: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = payer, seeds = [PREFIX, authority.key().as_ref(), &tag_params.uid.to_le_bytes()], bump, space = TAG_SIZE)]
    pub tag: Account<'info, Tag>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
    // Remaining accounts - if doing wallet restricted fungible, or either 1/1 option, pass:
    // token_mint
    // token (w) - ata of token_mint type
    //
    // If doing hotpotato, pass
    // token_mint
    // token (w) - ata of token_mint type
    // edition - existing edition of current token_mint
    // token_metadata_program - token mint on the tag
    //
    // If doing limited/open edition:
    // token_mint
    //
    // If using candy machine, pass:
    // candy_machine_id
    // whitelist_mint - optional, if it's not system program, we'll do a mint check and approve tfers.
    // whitelist_token - ata of whitelist_mint type, if present, we use this to pay with.
    // payment_token_mint - if system, we assume you pay in sol. Otherwise user will need to provide this.
    // payment_token - ata of payment token type to approve use of, if not system.
}

#[derive(Accounts)]
pub struct ClaimTag<'info> {
    /// CHECK: User can be any account receiving the sprinkle token.
    pub user: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub config: Box<Account<'info, Config>>,
    pub tag_authority: Signer<'info>,
    #[account(mut, seeds = [PREFIX, config.authority.key().as_ref(), &tag.uid.to_le_bytes()], bump=tag.bump, has_one = tag_authority)]
    pub tag: Box<Account<'info, Tag>>,
    #[account(init_if_needed, payer = payer, seeds = [PREFIX, config.authority.as_ref(), &tag.uid.to_le_bytes(), user.key().as_ref()], bump, space = USER_INFO_SIZE)]
    pub user_info: Box<Account<'info, UserInfo>>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
    // Remaining accounts - if doing a wallet fungible or a 1/1, pass:
    // token (w) - ata of token_mint type owned by config authority wallet
    // user_ata (w) - ata of token_mint type for user
    //
    // If doing hot potato:
    // token (w) - current location of token (as set in tag field)
    // user_token_account (w) - token account with seed [PREFIX, config.authority.as_ref(), &tag.uid.to_le_bytes(), user.key().as_ref(), tag.token_mint.to_le_bytes()]
    // will be initialized if not setup.
    // edition - existing edition of current token_mint
    // token_mint - token mint on the tag
    // token_metadata_program - token mint on the tag
    //
    // If doing a minting from master edition, pass:
    // token_mint - token mint on the tag
    // token (w) - ata of config authority containing the token
    // new_token_mint (w) - new token mint, must be supply = 1, decimals = 0
    // new_metadata (w) - precomputed new metadata key(will be set by inner CPI here)
    // new_edition (w) - precomputed new edition key
    // metadata - existing metadata of current token_mint
    // master_edition (w) - existing master edition of current token_mint
    // edition_mark_pda (w) - What edition page this edition you are trying to mint is on
    // new_mint_authority (s) - Authority of new mint
    // update_authority - Authority of metadata
    // token_metadata_program
    //
    // If using candy machine, pass:
    // candy_machine_id (w)
    // candy_machine_creator (pda of candy_machine [PREFIX.as_bytes(), candy_machine.key().as_ref()])
    // new_token_mint (w) - new token mint, must be supply = 1, decimals = 0
    // new_metadata (w) - precomputed new metadata key(will be set by inner CPI here)
    // new_edition (w) - precomputed new edition key
    // new_mint_authority (s) - authority for freeze and mint on the mint object.
    // token_metadata_program
    // cmv2 program
    // clock sysvar
    // recent_slothashes
    // instruction_sysvar_account
    // > Only needed if candy machine has whitelist_mint_settings
    // whitelist_token_account (w) - either configs or yours depending on who pays
    // > Only needed if candy machine has whitelist_mint_settings and mode is BurnEveryTime
    // whitelist_token_mint (w)
    // > Only needed if candy machine has token mint
    // token_account_info (w) - either configs or yours depending on who pays
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq, Debug)]
pub enum TagType {
    LimitedOrOpenEdition,
    SingleUse1Of1,
    CandyMachineDrop,
    Refillable1Of1,
    WalletRestrictedFungible,
    HotPotato,
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct AddOrRefillTagParams {
    pub uid: u64,
    pub tag_type: TagType,
    pub num_claims: u64,
    pub per_user: u64,
    pub minter_pays: bool,
    // candy only
    pub price_per_mint: Option<u64>,
    pub whitelist_burn: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct CandyMachineArgs {
    instruction: [u8; 8],
    creator_bump: u8,
}

pub const CONFIG_SIZE: usize = 8 + // discriminator
32 + // config
1; // bump;

#[account]
pub struct Config {
    pub authority: Pubkey,
    pub bump: u8,
}

pub const TAG_SIZE: usize = 8 + // discriminator  
8 + // uid
1 + //tag_type
32 + //tag_authority
32 + //config
8 + // total_supply
8 + // num_claimed
8 + // per_user
1 + // minter pays type
32 + // token_mint
// Dont use option here so we can do offset memcmp lookups
8 + // price
32 + // candy_machine
32 + // wl_mint
1 + //bump;
32 + // current token location
50; //padding

#[account]
pub struct Tag {
    pub uid: u64,
    pub tag_type: TagType,
    pub tag_authority: Pubkey,
    pub config: Pubkey,
    pub total_supply: u64,
    pub num_claimed: u64,
    pub minter_pays: bool,
    pub per_user: u64,
    pub token_mint: Pubkey,
    // I dont trust candy machine structure not to change so we pre-cache settings here
    // to avoid attempting to deserialize structure that might shift
    // I do expect them to stick to their interfaces though
    pub candy_machine: Pubkey,
    pub whitelist_mint: Pubkey,
    pub whitelist_burn: bool,
    pub bump: u8,
    // Only set in hot potato mode
    pub current_token_location: Pubkey,
}

pub const USER_INFO_SIZE: usize = 8 + // discriminator
 8 + // num_claimed
1; // bump;

#[account]
#[derive(Default)]
pub struct UserInfo {
    pub num_claimed: u64,
    pub bump: u8,
}
