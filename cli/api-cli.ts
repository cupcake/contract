import { program } from 'commander';
import { getCupcakeProgram  } from 'cupcake-cli';
import AWS from 'aws-sdk';
import axios from 'axios';
import { Wallet } from '@project-serum/anchor';
import { Keypair } from '@solana/web3.js';

const LIST_COMPANIES = "https://vdbfcyjr4o2e3iqxtmkauylosy0zhrnh.lambda-url.us-east-1.on.aws/";
const CREATE_COMPANY = "https://wx6wwcnx6zpdykqsugxja4mdfe0ldquu.lambda-url.us-east-1.on.aws/";
const READ_COMPANY = "https://xtgc5do2224no3qkmd5j4twowa0bzymo.lambda-url.us-east-1.on.aws/";
const LIST_TAGS = "https://zwamfdnzi5tgdr36sqwsob3vsa0mklrx.lambda-url.us-east-1.on.aws/";
const CREATE_TAG = "https://vcru4qen4rhc7ffknamcljdluy0zmfbg.lambda-url.us-east-1.on.aws/";
const READ_TAG = "https://ploi5zg243upwazwf66epbl4c40rotve.lambda-url.us-east-1.on.aws/";
const CLAIM_TAG = "https://cl5ulfokex6qpki25sw2ax7h2i0ucrwx.lambda-url.us-east-1.on.aws/";
const MINT_NFT = "";

program.version('0.0.1');

programCommand('listCompanies')
    .action(async (_: any, cmd: any) => {
        const companies = await get(
            LIST_COMPANIES
        );
        console.log("COMPANIES:", companies);
    }
);

programCommand('createCompany')
    .option("-co --company <string>", "Company name")
    .option("-pw --password <string>", "Company password plaintext")
    .action(async (_: any, cmd: any) => {
        const { company, password } = cmd.opts();
        const newCompany = await post(
            CREATE_COMPANY,
            { company, password }
        );
        console.log("NEW COMPANY:", newCompany);
    }
);

programCommand('readCompany')
    .option("-co --company <string>", "Company name")
    .action(async (_: any, cmd: any) => {
        const { company } = cmd.opts();
        const lambdaUrl = READ_COMPANY + "?company=" + company;
        const companyData = await get(
            lambdaUrl
        );
        console.log("COMPANY DATA:", companyData);
    }
);

programCommand('listTags')
    .option("-co --company <string>", "Company name")
    .action(async (_: any, cmd: any) => {
        const { company } = cmd.opts();
        const tags = await get(
            LIST_TAGS + "?company=" + company
        );
        console.log("TAGS:", tags);
    }
);

programCommand('createTag')
    .option("-co --company <string>", "Company name")
    .option("-u, --uid <string>", "Hex encoded tag uid")
    .option("-tt, --tagType <number>", "TagType as an integer")
    .action(async (_: any, cmd: any) => {
        const { company, uid, tagType } = cmd.opts();
        const newTag = await post(
            CREATE_TAG,
            { company, uid, tagType }
        );
        console.log("NEW TAG:", newTag);
    }
);

programCommand('readTag')
    .option("-co --company <string>", "Company name")
    .option("-u, --uid <string>", "Hex encoded tag uid")
    .action(async (_: any, cmd: any) => {
        const { company, uid } = cmd.opts();
        const tagData = await get(
            READ_TAG + "?company=" + company + "&uid=" + uid
        );
        console.log("TAG DATA:", tagData);
    }
);

function programCommand(
    name: string
) {
    let cliProgram = program
        .command(name)
        .option('-e, --env <string>', 'Solana cluster env name', 'devnet')
        .option('-r, --rpc-url <string>', 'Custom Solana RPC url', 'https://psytrbhymqlkfrhudd.dev.genesysgo.net:8899/');
    return cliProgram;
}

async function get(
    url: string,
    options?: any
) {
    const apiResp = await axios.get(
        url, 
        options
    );
    return apiResp.data;
}

async function post(
    url: string,
    data?: any
) {
    const apiResp = await axios.post(
        url, 
        data
    );
    return apiResp.data;
}

program.parse();
