#[derive(Accounts)]
pub struct Initialize<'info> {
    ///
    #[account(mut)]
    pub authority: Signer<'info>,

    ///
    #[account(mut)]
    pub payer: Signer<'info>,

    ///
    #[account(init, 
              payer = payer, 
              space =  CONFIG_SIZE,
              seeds = [PREFIX, 
                      authority.key().as_ref()], 
              bump)]
    pub config: Account<'info, Config>,

    ///
    pub system_program: Program<'info, System>,

    ///
    pub rent: Sysvar<'info, Rent>
}

pub fn handler(ctx: Context<Initialize>) -> ProgramResult {
  let authority_key = ctx.accounts.authority.key().as_ref();

  let mut config = ctx.accounts.config.load_mut()?;

  config.authority = authority_key;
  config.bump = *ctx.bumps.get("config").unwrap();

  Ok(())
}