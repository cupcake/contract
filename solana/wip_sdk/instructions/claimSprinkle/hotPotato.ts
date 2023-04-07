import { AccountMeta, Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getMasterEditionPDA } from "../../programmableAssets";
import * as TokenMetadata from "@metaplex-foundation/mpl-token-metadata"
import { SprinkleX } from "../../state/sprinkle";
import { HotPotato } from "../../state/hotPotato";

export class ClaimHotPotatoSprinkleData {
  instructionArgs: number;
  remainingAccounts: AccountMeta[];
  extraSigners: Keypair[];

  static async construct(connection: Connection, bakeryAuthority: PublicKey, claimerKeypair: Keypair, sprinkleState: SprinkleX) {
    //
    const masterEditionPDA = await getMasterEditionPDA(sprinkleState.tokenMint);
    const claimerHotPotatoATA = await HotPotato.PDA(
      bakeryAuthority, 
      sprinkleState.uid, 
      claimerKeypair.publicKey, 
      sprinkleState.tokenMint
    );

    //
    const instructionArgs = claimerHotPotatoATA[1]
    const remainingAccounts = [
      { pubkey: sprinkleState.currentTokenLocation, isWritable: true, isSigner: false },
      { pubkey: claimerHotPotatoATA[0], isWritable: true, isSigner: false },
      { pubkey: masterEditionPDA, isWritable: true, isSigner: false },
      { pubkey: sprinkleState.tokenMint, isWritable: false, isSigner: false },
      { pubkey: TokenMetadata.PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: claimerKeypair.publicKey, isWritable: false, isSigner: true },
    ];
    const extraSigners = [claimerKeypair];

    return { instructionArgs, remainingAccounts, extraSigners } as ClaimHotPotatoSprinkleData
  }
}