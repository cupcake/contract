import { Program, BN } from "@project-serum/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Cupcake } from '../target/types/cupcake';
import { Bakery } from "./state/bakery";
import { Sprinkle, SprinkleX } from "./state/sprinkle";
import { UserInfo } from "./state/userInfo";
import { BakeTokenApprovalSprinkleData } from "./instructions/bakeSprinkle/tokenApproval";
import { ClaimTokenTransferSprinkleData } from "./instructions/claimSprinkle/tokenTransfer";
import { ClaimEditionPrinterSprinkleData } from "./instructions/claimSprinkle/editionPrinter";
import { BakeHotPotatoSprinkleData } from "./instructions/bakeSprinkle/hotPotato";
import { ClaimHotPotatoSprinkleData } from "./instructions/claimSprinkle/hotPotato";

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
        case "hotPotato":
          const bakeHotPotatoSprinkleData = await BakeHotPotatoSprinkleData.construct(
            this.bakeryAuthorityKeypair.publicKey,
            tokenMint, 
          );
          remainingAccounts.push(...bakeHotPotatoSprinkleData.remainingAccounts);
          break;

        default:
          const bakeTokenApprovalSprinkleData = await BakeTokenApprovalSprinkleData.construct(
            this.program.provider.connection, 
            this.bakeryAuthorityKeypair.publicKey,
            tokenMint, 
          );
          remainingAccounts.push(...bakeTokenApprovalSprinkleData.remainingAccounts);
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

    async claimSprinkle(uid: string, claimerKeypair: Keypair, sprinkleAuthorityKeypair: Keypair) {
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
        claimerKeypair.publicKey,
        this.program.programId
      );

      let instructionArgs = 0;
      const remainingAccounts = [];
      const preInstructions = [];
      const extraSigners = [];

      // EditionPrinter
      if (sprinkleState.tagType.limitedOrOpenEdition) {    
        const editionPrinterClaimData = await ClaimEditionPrinterSprinkleData.construct(
          this.program.provider.connection, 
          this.bakeryAuthorityKeypair.publicKey,
          claimerKeypair.publicKey, 
          sprinkleState
        );
        remainingAccounts.push(...editionPrinterClaimData.remainingAccounts);
        preInstructions.push(...editionPrinterClaimData.preInstructions);
        extraSigners.push(...editionPrinterClaimData.extraSigners);
      } 

      // HotPotato
      else if (sprinkleState.tagType.hotPotato) {
        const hotPotatoClaimData = await ClaimHotPotatoSprinkleData.construct(
          this.program.provider.connection, 
          this.bakeryAuthorityKeypair.publicKey,
          claimerKeypair, 
          sprinkleState
        );
        instructionArgs = hotPotatoClaimData.instructionArgs;
        remainingAccounts.push(...hotPotatoClaimData.remainingAccounts);
        extraSigners.push(...hotPotatoClaimData.extraSigners);
      }

      // CandyMachine
      else if (sprinkleState.tagType.candyMachineDrop) {

      }
      
      // SingleUse Refillable Fungible Programmble
      else {
        const tokenTransferClaimData = await ClaimTokenTransferSprinkleData.construct(
          this.program.provider.connection, 
          this.bakeryAuthorityKeypair.publicKey,
          claimerKeypair.publicKey, 
          sprinkleState
        );
        remainingAccounts.push(...tokenTransferClaimData.remainingAccounts);
        preInstructions.push(...tokenTransferClaimData.preInstructions);
      }

      return this.program.methods
        .claimTag(instructionArgs)
        .accounts({
          user: claimerKeypair.publicKey,
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