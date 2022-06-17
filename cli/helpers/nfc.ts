"use strict";
var utils = require('aes-js').utils;
var ModeOfOperation = require('aes-js').ModeOfOperation;
const CryptoJS = require("crypto-js");
require('./cmac.js');
// URL Format
export const URL_FORMAT = "cupcake.com/claim?co=*&uid=00000000000000&ctr=000000&tt=00&cmac=0000000000000000";
// Default Key 
export const ZERO_KEY = "00000000000000000000000000000000";
export const ONE_KEY = "10000000000000000000000000000000";
// Key Nums
export const APP_MASTER_KEY = "00";
export const APP_KEY = "01";
export const APP_UPDATE_KEY = "02";
export const APP_ENC_KEY = "03";
// File Names / EFIDs
export const ISO_DF_NAME = "D2760000850101";
export const CC_EF_ID = "E103";
export const NDEF_EF_ID = "E104";
export const DATA_EF_ID = "E105";
// File Nums
export const CC_FILE = "01";
export const NDEF_FILE = "02";
export const DATA_FILE = "03";
// Commands
export const GET_CARD_UID = "51";
export const SET_CONFIGURATION = "5C";
export const CHANGE_FILE_SETTINGS = "5F";
export const AUTH_EV2_FIRST = "71";
export const WRITE_DATA = "8D";
export const SELECT_FILE = "A4";
export const READ_DATA = "AD";
export const CHANGE_KEY = "C4";
export const GET_FILE_SETTINGS = "F5";
// File Select Options
export const FILE_BY_ID = "00";
export const DF_BY_NAME = "04";
// Session Key IV Prefixes
export const ENC_IV = "A55A";
export const MAC_IV = "5AA5";
// NDEF File Header
export const NDEF_HEADER = "D101605504";
export const CUPCAKE_NDEF_FILE_SETTINGS = 
        "40" + 			// SDM enabled, CommMode PLAIN					
        "00E0" + 		// AppMasterKey -> Write/ReadWrite/Change, Everyone -> Read
        "C9" + 			// UID, SDMReadCtr, TTStatus, ASCII		
        "FEE0" + 		// AppKey -> SDMFileRead, Everyone -> SDMCtrRet/SDMMetaRead
        "2B0000" + 		// UID Offset
        "3E0000" + 		// SDMReadCtrOffset
		"480000" +		// TTStatusOffset
        "070000" + 		// SDMMACInputOffset
        "500000";		// SDMMACOffset

export function padHex(hex: string, multiple: number) {
	let padded = hex + "80";
	if ((padded.length / 2) == multiple) {
		return padded;
	}
	let toAdd = 0;
	if ((padded.length / 2) < multiple) {
		toAdd = multiple - (padded.length / 2);
	} 
	else {
		toAdd = ((padded.length / 2) - ((padded.length / 2) % multiple) + multiple) - (padded.length / 2);
	}
	for (let i = 0; i < toAdd; i++) {
		padded += "00";
	}
	return padded;
}

export function xorHex(x: string, y: string) {
	const xBuffer = utils.hex.toBytes(x);
	const yBuffer = utils.hex.toBytes(y);
	var result = "";
	for (let i = 0; i < 6; i++) {
		result += utils.hex.fromBytes([xBuffer[i] ^ yBuffer[i]]);
	}
	return result;
}

export function numBytesAsHex(hex: string) { 
	return utils.hex.fromBytes([hex.length / 2]); 
}

export function bytesFromString(string:string): number[] {
	return utils.hex.toBytes(string);
}

export function stringFromBytes(bytes: number[]): string {
	return utils.hex.fromBytes(bytes);
}

export function encodeUTF8Hex(string: string) {
	return utils.hex.fromBytes(utils.utf8.toBytes(string));
}

export function decodeHexString(hex: string) {
	return utils.utf8.fromBytes(utils.hex.toBytes(hex));
}

export function leftShift(x: string) { 
	return x.slice(2, x.length) + x.slice(0, 2);
}

export function rightShift(x: string) { 
	return x.slice(x.length - 2, x.length) + x.slice(0, x.length - 2); 
}

export function truncateMAC(x: string) { 
	return x.slice(2, 4) + x.slice(6, 8) + x.slice(10, 12) + x.slice(14, 16) + x.slice(18, 20) + x.slice(22, 24) + x.slice(26, 28) + x.slice(30, 32);
}

export function encryptAES(key: string, iv: string, msg: string) {
	return utils.hex.fromBytes(
		new ModeOfOperation.cbc(
			utils.hex.toBytes(key), 
			utils.hex.toBytes(iv)
		).encrypt(utils.hex.toBytes(msg)));
}

export function decryptAES(key: string, iv: string, msg: string) {
	return utils.hex.fromBytes(
		new ModeOfOperation.cbc(
			utils.hex.toBytes(key), 
			utils.hex.toBytes(iv)
		).decrypt(utils.hex.toBytes(msg)));
}

export function getCmac(key: string, msg: string) {
	const cmacer = CryptoJS.algo.CMAC.create(CryptoJS.enc.Hex.parse(key));
    return CryptoJS.enc.Hex.stringify(cmacer.finalize(CryptoJS.enc.Hex.parse(msg)));
}

export function incrementCounter(counter: string) {
	const current = parseInt(counter.slice(2, 4) + counter.slice(0, 2), 16);
	const incremented = "00" + utils.hex.fromBytes([current + 1]);
	const hexLSB = incremented.slice(2, 4) + incremented.slice(0, 2);
	return hexLSB;
}

export function isoWrapCommand(cmd: string, data: string, cls="90", params="0000") {
	const dataLength = data.length > 0 ? numBytesAsHex(data) : "";
	return cls + cmd + params + dataLength + data + "00";
}

function wrapCommandCommModeFull(connection: any, cmd: string, header: string, data: string) {
	const paddedData = padHex(data, 16);
	if (data.length > 0) {
		data = paddedData;
	}
	const ivcData = ENC_IV + connection.ti + connection.counter + "0000000000000000";
	const ivc = encryptAES(connection.encKey, ZERO_KEY, ivcData);
	const encData = encryptAES(connection.encKey, ivc, data);
	const encodedMACCommand = wrapCommandCommModeMAC(connection, cmd, header, encData);
	return encodedMACCommand;
}

function wrapCommandCommModeMAC(connection: any, cmd: string, header: string, data: string) {
	const macData = cmd + connection.counter + connection.ti + header + data;
	const mac = getCmac(connection.macKey, macData);
	const macCommand = header + data + truncateMAC(mac);
	return macCommand;
}

export function wrapNDEFData(hexData: string) {
	return "00" + numBytesAsHex(NDEF_HEADER + hexData) + NDEF_HEADER + hexData;
}

export function decodeResponse(connection: any, response: string) {
	const responseSlices = {
		status: response.slice(response.length - 4, response.length),
		mac: response.slice(response.length - 20, response.length - 4),
		encodedResponseData: response.slice(0, response.length - 20)
	};
	const ivrData = MAC_IV + connection.ti + connection.counter + "0000000000000000";
	const ivr = encryptAES(connection.encKey, ZERO_KEY, ivrData);
	const decodedResponse = decryptAES(connection.encKey, ivr, responseSlices.encodedResponseData);
	return decodedResponse;
}

export function isoSelectFile(selectType: string, data: string) {
	return isoWrapCommand(SELECT_FILE, data, "00", selectType + "0C");
}

export function isoReadBinary() {
	return "00B0000000";
}

export function authenticateEV2Part1(keyId: string) {
	return isoWrapCommand(AUTH_EV2_FIRST, keyId + "00");
}

export function authenticateEV2Part2(key: string, partOneResponse: string) {
	const rndB = decryptAES(key, ZERO_KEY, partOneResponse.slice(0, 32));
	const rndA = "00000000000000000000000000000000";
	const data = rndA + leftShift(rndB);
	const encData = encryptAES(key, ZERO_KEY, data);
	return [isoWrapCommand("AF", encData), rndB];
}

export function getConnectionData(keyId: string, key: string, partTwoResponse: string, rndB: string) {
	const connectionData = decryptAES(key, ZERO_KEY, partTwoResponse.slice(0, 64));
	const rndAPrime = connectionData.slice(8, 40);
	const rndA = rightShift(rndAPrime);
	const xorKeys = xorHex(rndA.slice(4, 16), rndB.slice(0, 12));
	const stream = "00010080" + rndA.slice(0, 4) + xorKeys + rndB.slice(12, 32) + rndA.slice(16, 32);
	const connection = { 
		keyNum: keyId,
		encKey: getCmac(key, ENC_IV + stream), 
		macKey: getCmac(key, MAC_IV + stream), 
		ti: connectionData.slice(0, 8), 
		counter: "0000",
		pdCap: connectionData.slice(40, 52),
		pcdCap: connectionData.slice(52, 64) 
	};
	return connection;
}

export function changeFileSettings(fileNum: string, newSettings: string, connection: any) {
	const encodedMACCommand = wrapCommandCommModeFull(connection, CHANGE_FILE_SETTINGS, fileNum, newSettings);
	return isoWrapCommand(CHANGE_FILE_SETTINGS, encodedMACCommand);
}

export function writeData(fileNum: string, newData: string, connection: any, comm="PLAIN") {
	const header = fileNum + "000000" + numBytesAsHex(newData) + "0000";
	let command = header + newData;
	if (comm == "FULL") {
		command = wrapCommandCommModeFull(connection, WRITE_DATA, header, newData);
	}
	return isoWrapCommand(WRITE_DATA, command);
}

export function getURLWithCompanyId(companyId: string) {
	const companyIdIndex = URL_FORMAT.lastIndexOf("*");
	const dynamicUrl = 
		URL_FORMAT.slice(0, companyIdIndex) +
		companyId +
		URL_FORMAT.slice(companyIdIndex + 1);
	return dynamicUrl;
}

export function getCardUID(connection: any) {
	const encodedMACCommand = wrapCommandCommModeFull(connection, GET_CARD_UID, "", "");
	return isoWrapCommand(GET_CARD_UID, encodedMACCommand);
}

export function changeKey(keyNum: string, newKey: string, connection: any, oldKey="") {
	const data = (keyNum === connection.keyNum) 
		? newKey + "01"
		: xorHex(newKey, oldKey) + "01" + _CRC32NK(newKey)
	const encodedMACCommand = wrapCommandCommModeFull(connection, CHANGE_KEY, keyNum, data);
	return isoWrapCommand(CHANGE_KEY, encodedMACCommand);
}

export function setConfiguration(connection: any, option: string, data: string) {
	const encodedMACCommand = wrapCommandCommModeFull(connection, SET_CONFIGURATION, option, data);
	return isoWrapCommand(SET_CONFIGURATION, encodedMACCommand);
}

export function setTagReadOnly() {
	return "908D000019010E0000120000FF0506E1050080828300000000000000000000";
}

export function _CRC32NK(key: string) {
	return "";
}