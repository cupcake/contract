import fs from 'fs';
import { Keypair } from '@solana/web3.js';

export const createJSON = (file: string, data: any) => {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
  fs.appendFileSync(file, JSON.stringify(data));
};

export const readJSON = (file: string) => {
  return JSON.parse(fs.readFileSync(file).toString());
};

export const writeJSON = (file: string, data: any) => {
  fs.writeFileSync(file, JSON.stringify(data));
};
