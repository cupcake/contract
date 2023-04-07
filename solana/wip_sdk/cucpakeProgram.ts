import { Program, BN } from "@project-serum/anchor";
import { Keypair, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { Cupcake } from '../target/types/cupcake';
import { Bakery } from "./state/bakery";
import { Sprinkle, SprinkleX } from "./state/sprinkle";
import { UserInfo } from "./state/userInfo";
import { BakeTokenApprovalSprinkleData } from "./instructions/bakeSprinkle/tokenApproval";
import { ClaimTokenTransferSprinkleData } from "./instructions/claimSprinkle/tokenTransfer";
import { ClaimEditionPrinterSprinkleData } from "./instructions/claimSprinkle/editionPrinter";

export const PDA_PREFIX = 'cupcake';

export class CupcakeProgram {
    program: Program<Cupcake>;
    bakeryAuthorityKeypair: Keypair;
    bakeryPDA: PublicKey;

    constructor(program: Program<Cupcake>, bakeryAuthorityKeypair: Keypair) {
      this.program = program;
      this.bakeryAuthorityKeypair = bakeryAuthorityKeypair;
      this.bakeryPDA = Bakery.PDA(bakeryAuthorityKeypair.publicKey, program.programId)
    }

    async createBakery() {
      return this.program.methods
        .initialize()
        .accounts({
          authority: this.bakeryAuthorityKeypair.publicKey,
          payer: this.bakeryAuthorityKeypair.publicKey,
          config: this.bakeryPDA,
        })
        .signers([this.bakeryAuthorityKeypair])
        .rpc()
    }

    async bakeSprinkle(sprinkleType: string, uid: string, tokenMint: PublicKey, numClaims: number, perUser: number, sprinkleAuthority: Keypair) {
      const sprinkleUID = new BN(`CC${uid}`, "hex");
      const sprinklePDA = await Sprinkle.PDA(
        this.bakeryAuthorityKeypair.publicKey, 
        sprinkleUID, 
        this.program.programId
      );

      const remainingAccounts = [];
      switch (sprinkleType) {        
        default:
          const tokenApprovalRemainingAccounts = await BakeTokenApprovalSprinkleData.buildRemainingAccounts(
            this.program.provider.connection, 
            this.bakeryAuthorityKeypair.publicKey,
            tokenMint, 
          );
          remainingAccounts.push(...tokenApprovalRemainingAccounts);
          break;
      }

      return this.program.methods
        .addOrRefillTag({
          uid: sprinkleUID,
          numClaims: new BN(numClaims),
          perUser: new BN(perUser),
          minterPays: false,
          pricePerMint: null,
          whitelistBurn: false,
          tagType: { [sprinkleType]: true }
        } as any)
        .accounts({
          authority: this.bakeryAuthorityKeypair.publicKey,
          payer: this.bakeryAuthorityKeypair.publicKey,
          config: this.bakeryPDA,
          tagAuthority: sprinkleAuthority.publicKey,
          tag: sprinklePDA
        })
        .remainingAccounts(remainingAccounts)
        .signers([this.bakeryAuthorityKeypair])
        .rpc()
    }

    async claimSprinkle(uid: string, user: PublicKey, sprinkleAuthorityKeypair: Keypair) {
      const sprinkleUID = new BN(`CC${uid}`, "hex");
      const sprinklePDA = await Sprinkle.PDA(
        this.bakeryAuthorityKeypair.publicKey, 
        sprinkleUID, 
        this.program.programId
      );
      const sprinkleState = await this.program.account.tag.fetch(sprinklePDA) as SprinkleX;
      const userInfoPDA = await UserInfo.PDA(
        this.bakeryAuthorityKeypair.publicKey, 
        sprinkleUID, 
        user,
        this.program.programId
      );

      const remainingAccounts = [];
      const preInstructions = [];
      const extraSigners = [];

      // EditionPrinter
      if (sprinkleState.tagType.limitedOrOpenEdition) {    
        console.log("Lol")
        const editionPrinterClaimData = await ClaimEditionPrinterSprinkleData.construct(
          this.program.provider.connection, 
          this.bakeryAuthorityKeypair.publicKey,
          user, 
          sprinkleState
        );
        remainingAccounts.push(...editionPrinterClaimData.remainingAccounts);
        preInstructions.push(...editionPrinterClaimData.preInstructions);
        extraSigners.push(...editionPrinterClaimData.extraSigners);
      } 
      
      // All other types
      else {
        const tokenTransferClaimData = await ClaimTokenTransferSprinkleData.construct(
          this.program.provider.connection, 
          this.bakeryAuthorityKeypair.publicKey,
          user, 
          sprinkleState
        );
        remainingAccounts.push(...tokenTransferClaimData.remainingAccounts);
        preInstructions.push(...tokenTransferClaimData.preInstructions);
      }

      return this.program.methods
        .claimTag(0)
        .accounts({
          user,
          authority: this.bakeryAuthorityKeypair.publicKey,
          payer: this.bakeryAuthorityKeypair.publicKey,
          config: this.bakeryPDA,
          tagAuthority: sprinkleAuthorityKeypair.publicKey,
          tag: sprinklePDA,
          userInfo: userInfoPDA,
        })
        .remainingAccounts(remainingAccounts)
        .preInstructions(preInstructions)
        .signers([...extraSigners, this.bakeryAuthorityKeypair, sprinkleAuthorityKeypair])
        .rpc()
    }


}