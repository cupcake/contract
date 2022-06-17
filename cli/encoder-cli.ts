const { NFC } = require("nfc-pcsc");
var utils = require('aes-js').utils;
import { 
	isoSelectFile,
	isoReadBinary,
	DF_BY_NAME,
	FILE_BY_ID,
	ISO_DF_NAME,
	NDEF_EF_ID, 
	authenticateEV2Part1,
	authenticateEV2Part2,
	ZERO_KEY,
	decodeHexString,
	getConnectionData,
	getURLWithCompanyId,
	encodeUTF8Hex,
	writeData,
	NDEF_FILE,
	wrapNDEFData,
	incrementCounter,
	changeFileSettings,
	CUPCAKE_NDEF_FILE_SETTINGS,
	setConfiguration
} from "./helpers/nfc";

const nfc = new NFC(); 
console.log("Looking for USB reader...");

nfc.on('reader', (reader: any) => {
	console.log(`${reader.reader.name}  device attached`);

	reader.autoProcessing = false;

	reader.on('card', async (card: any) => {
		console.log(`${reader.reader.name}  card detected`, card);

		console.log("Select App File:");
		const selectAppFile = isoSelectFile(
			DF_BY_NAME,
			ISO_DF_NAME
		);
		await sendCommand(
			reader,
			selectAppFile
		);

		console.log("Select NDEF File:");
		const selectNdefFile = isoSelectFile(
			FILE_BY_ID, 
			NDEF_EF_ID
		);
		await sendCommand(
			reader,
			selectNdefFile
		);

		console.log("Read NDEF File:");
		const readNdef = isoReadBinary();
		const encodedNdef = await sendCommand(
			reader,
			readNdef
		);
		const decodedNdef = decodeHexString(encodedNdef);
		console.log("NDEF:", decodedNdef, "\n");

		console.log("Authenticate Pt 1:");
		const authEv2P1 = authenticateEV2Part1("00");
		const authEv2P1Resp = await sendCommand(
			reader,
			authEv2P1
		);

		console.log("Authenticate Pt 2:");
		const [authEv2P2, rndB] = authenticateEV2Part2(
			ZERO_KEY,
			authEv2P1Resp
		);
		const authEv2P2Resp = await sendCommand(
			reader,
			authEv2P2
		);

		const connection = getConnectionData(
			"00",
			ZERO_KEY,
			authEv2P2Resp,
			rndB
		);
		console.log("Connected:", connection, "\n");

		console.log("Enable Tag Tamper in config:");
		const setConfig = setConfiguration(
			connection, 
			"07", 
			"010E"
		);
		await sendCommand(
			reader,
			setConfig
		);
		connection.counter = incrementCounter(connection.counter);

		const dynamicUrl = getURLWithCompanyId("abcdefghij");
		const urlHex = encodeUTF8Hex(dynamicUrl);
		const ndefData = wrapNDEFData(urlHex);
		console.log("NDEF URL:", dynamicUrl, "\n");

		console.log("Write NDEF File Data:");
		const writeNdefData = writeData(
			NDEF_FILE,
			ndefData,
			connection
		);
		await sendCommand(
			reader,
			writeNdefData
		);
		connection.counter = incrementCounter(connection.counter);

		console.log("Change NDEF File Settings:")
		const changeNdefSettings = changeFileSettings(
			NDEF_FILE,
			CUPCAKE_NDEF_FILE_SETTINGS,
			connection
		);
		await sendCommand(
			reader,
			changeNdefSettings
		);
		connection.counter = incrementCounter(connection.counter);
	});

	reader.on('card.off', (card: any) => {
		console.log(`${reader.reader.name}  card removed`);
	});

	reader.on('error', (err: any) => {
		console.log(`${reader.reader.name}  an error occurred`, err);
	});

	reader.on('end', () => {
		console.log(`${reader.reader.name}  device removed`);
	});

});

nfc.on('error', (err: any) => {
	console.log('an error occurred', err);
});

async function sendCommand(
	reader: any,
	command: string
) {
	console.log("\tCommand:", command);
	const resp = await reader.transmit(
		Buffer.from(command, "hex"),
		999
	);
	const hexResp = utils.hex.fromBytes(resp);
	console.log("\tResp:", hexResp, "\n");
	await new Promise(r => setTimeout(r, 500));
	return hexResp;
}