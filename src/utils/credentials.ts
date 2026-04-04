import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

interface Credentials {
  token?: string;
  baseUrl?: string;
  currentOrg?: string;
}

const CREDENTIALS_DIR = path.join(os.homedir(), '.envx');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.json');

function ensureDir(): void {
  if (!fs.existsSync(CREDENTIALS_DIR)) {
    fs.mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  }
}

export function loadCredentials(): Credentials {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

export function saveCredentials(credentials: Credentials): void {
  ensureDir();
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), {
    mode: 0o600,
  });
}

export function clearCredentials(): void {
  const credentials = loadCredentials();
  delete credentials.token;
  saveCredentials(credentials);
}

/**
 * Returns the credential to use for requests.
 * Priority: ENVX_API_KEY env var > stored session token.
 */
export function getCredential(): string | undefined {
  return process.env.ENVX_API_KEY || loadCredentials().token;
}

export function getAuthBaseUrl(): string {
  return process.env.ENVX_BASEURL || loadCredentials().baseUrl || 'https://leaper.one';
}

export function getCurrentOrg(): string | undefined {
  return loadCredentials().currentOrg;
}

export function setCurrentOrg(org: string | undefined): void {
  const credentials = loadCredentials();
  if (org) {
    credentials.currentOrg = org;
  } else {
    delete credentials.currentOrg;
  }
  saveCredentials(credentials);
}

export { CREDENTIALS_DIR, CREDENTIALS_FILE };
