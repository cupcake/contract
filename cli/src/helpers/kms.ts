import { KMS } from "aws-sdk";

require('dotenv/config');

export const createKeyAWS = async (
    params: any
) => {
    const awsKey = await 
        new KMS()
            .createKey(params)
            .promise();
    
    return awsKey;
}

export const addKeyAlias = async (
    params: any
) => {
    await new KMS()
        .createAlias(params)
        .promise();
    return params.AliasName;
}

export const addKeyTag = async (
    params: any
) => {
    await new KMS()
        .tagResource(params)
        .promise();
}

export const encryptData = async (
    params: any
) => {
    const encrypted = await 
        new KMS()
            .encrypt(params)
            .promise();

    return encrypted;
}

export const decryptData = async (
    params: any
) => {
    const decrypted = await 
        new KMS()
            .decrypt(params)
            .promise();

    return decrypted;
}