import { getHeader, getRevisionMapV1, RuleSetHeader, RuleSetRevisionMapV1 } from '@metaplex-foundation/mpl-token-auth-rules';
import { decode } from '@msgpack/msgpack';
import { Connection, PublicKey } from '@solana/web3.js';

export class RuleSet {
  header: RuleSetHeader
  revMap: RuleSetRevisionMapV1
  ruleSetLocation: number
  ruleSetData: any

  constructor(data: Buffer, revNumber?: number) {
    this.header = getHeader(data);
    this.revMap = getRevisionMapV1(data);
    this.ruleSetLocation = parseInt(this.revMap.ruleSetRevisions[this.revMap.ruleSetRevisions.length - 1]);    
    this.ruleSetData = decode(
      data.slice(this.ruleSetLocation + 1, parseInt(this.header.revMapVersionLocation)),
    );
    console.log(this.ruleSetData)
  }

  static async fromAccountAddress(connection: Connection, address: PublicKey, revNumber?: number) {
    const accountInfo = await connection.getAccountInfo(address)
    return new RuleSet(accountInfo.data, revNumber)
  }
}