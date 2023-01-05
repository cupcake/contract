#[derive(Accounts)]
pub struct CreateBakery<'info> {
  /// The account which will have authority to create and manage sprinkles for this bakery
  #[account(mut)]
  pub bakery_authority: Signer<'info>,

  /// The account which pays all compute and rent fees for the transaction
  #[account(mut)]
  pub payer: Signer<'info>,

  /// The PDA of the Bakery being created
  #[account(init, 
            payer = payer, 
            space =  Bakery::ACCOUNT_SIZE,
            seeds = [
              PDA_PREFIX.as_ref(), 
              authority.key().as_ref()
            ], 
            bump)]
  pub bakery: Account<'info, Config>,

  /// System Program ID
  pub system_program: Program<'info, System>,

  /// Rent SYSVAR address
  pub rent: Sysvar<'info, Rent>
}

pub fn handler(ctx: Context<CreateBakery>) -> ProgramResult {
  let bakery_authority_key = ctx.accounts.bakery_authority.key().as_ref();

  let mut bakery = ctx.accounts.bakery.load_mut()?;

  bakery.bakery_authority = bakery_authority_key;
  bakery.bump = *ctx.bumps.get("bakery").unwrap();

  Ok(())
}