import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface Credentials {
  token?: string;
  baseUrl?: string;
  apiBaseUrl?: string;
  dashboardUrl?: string;
  currentOrg?: string;
  currentOrgId?: string;
}

const CREDENTIALS_DIR = path.join(os.homedir(), '.envx');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.json');

function ensureDir(): void {
  if (!fs.existsSync(CREDENTIALS_DIR)) {
    fs.mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  }
  fs.chmodSync(CREDENTIALS_DIR, 0o700);
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
  fs.chmodSync(CREDENTIALS_FILE, 0o600);
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

const LEGACY_OFFICIAL_BASE_URL = 'https://leaper.one';
export const DEFAULT_API_BASE_URL = 'https://api.leaper.one';
export const DEFAULT_DASHBOARD_URL = 'https://dashboard.leaper.one';

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function mapLegacyBaseUrl(value: string | undefined, officialTarget: string): string | undefined {
  if (!value) return undefined;
  const normalized = normalizeBaseUrl(value);
  return normalized === LEGACY_OFFICIAL_BASE_URL ? officialTarget : normalized;
}

export function getApiBaseUrl(override?: string): string {
  if (override) return normalizeBaseUrl(override);
  const credentials = loadCredentials();
  return normalizeBaseUrl(
    process.env.ENVX_API_BASE_URL ||
      mapLegacyBaseUrl(process.env.ENVX_BASEURL, DEFAULT_API_BASE_URL) ||
      credentials.apiBaseUrl ||
      mapLegacyBaseUrl(credentials.baseUrl, DEFAULT_API_BASE_URL) ||
      DEFAULT_API_BASE_URL
  );
}

export function resolveApiBaseUrl(apiBaseUrl?: string, legacyBaseUrl?: string): string {
  if (apiBaseUrl) return normalizeBaseUrl(apiBaseUrl);
  if (legacyBaseUrl) {
    return mapLegacyBaseUrl(legacyBaseUrl, DEFAULT_API_BASE_URL) || DEFAULT_API_BASE_URL;
  }
  return getApiBaseUrl();
}

export function getDashboardUrl(override?: string): string {
  if (override) return normalizeBaseUrl(override);
  const credentials = loadCredentials();
  return normalizeBaseUrl(
    process.env.ENVX_DASHBOARD_URL ||
      mapLegacyBaseUrl(process.env.ENVX_BASEURL, DEFAULT_DASHBOARD_URL) ||
      credentials.dashboardUrl ||
      mapLegacyBaseUrl(credentials.baseUrl, DEFAULT_DASHBOARD_URL) ||
      DEFAULT_DASHBOARD_URL
  );
}

export function resolveDashboardUrl(dashboardUrl?: string, legacyBaseUrl?: string): string {
  if (dashboardUrl) return normalizeBaseUrl(dashboardUrl);
  if (legacyBaseUrl) {
    return mapLegacyBaseUrl(legacyBaseUrl, DEFAULT_DASHBOARD_URL) || DEFAULT_DASHBOARD_URL;
  }
  return getDashboardUrl();
}

/** @deprecated Use getDashboardUrl for browser authentication and getApiBaseUrl for API calls. */
export function getAuthBaseUrl(): string {
  return getDashboardUrl();
}

export function getCurrentOrg(): string | undefined {
  return loadCredentials().currentOrg;
}

export function getCurrentOrgId(): string | undefined {
  return loadCredentials().currentOrgId;
}

export function setCurrentOrg(org: string | undefined, orgId?: string): void {
  const credentials = loadCredentials();
  if (org) {
    credentials.currentOrg = org;
    if (orgId) credentials.currentOrgId = orgId;
    else delete credentials.currentOrgId;
  } else {
    delete credentials.currentOrg;
    delete credentials.currentOrgId;
  }
  saveCredentials(credentials);
}

export { CREDENTIALS_DIR, CREDENTIALS_FILE };
