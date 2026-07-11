import { randomUUID } from 'node:crypto';
import { PACKAGE_INFO } from './package-info.js';

export const USER_AGENT = `@leaperone/envx/${PACKAGE_INFO.version}`;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;

export interface RequestTarget {
  canonicalUrl: string;
  legacyUrl?: string;
}

export interface CompatibleRequestInit extends RequestInit {
  legacyMethod?: string;
  legacyHeaders?: HeadersInit;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface CompatibleResponse {
  response: Response;
  legacy: boolean;
}

export function controlPlaneHeaders(
  token: string,
  headers: Record<string, string> = {}
): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': USER_AGENT,
    ...headers,
  };
}

export async function fetchWithLegacyFallback(
  target: RequestTarget,
  init: CompatibleRequestInit = {}
): Promise<CompatibleResponse> {
  const {
    legacyMethod,
    legacyHeaders,
    timeoutMs = configuredInteger('ENVX_HTTP_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 1, 120_000),
    maxRetries = configuredInteger('ENVX_HTTP_MAX_RETRIES', DEFAULT_MAX_RETRIES, 0, 5),
    ...canonicalInit
  } = init;
  const response = await fetchWithRetry(target.canonicalUrl, canonicalInit, timeoutMs, maxRetries);
  if (!target.legacyUrl || !shouldUseLegacyFallback(response.status)) {
    return { response, legacy: false };
  }
  const legacyInit: RequestInit = { ...canonicalInit };
  const method = legacyMethod ?? canonicalInit.method;
  const headers = legacyHeaders ?? canonicalInit.headers;
  if (method !== undefined) legacyInit.method = method;
  if (headers !== undefined) legacyInit.headers = headers;
  const legacyResponse = await fetchWithRetry(target.legacyUrl, legacyInit, timeoutMs, maxRetries);
  return { response: legacyResponse, legacy: true };
}

function configuredInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const raw = process.env[name];
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function requestMethod(init: RequestInit): string {
  return (init.method || 'GET').toUpperCase();
}

function requestCanRetry(init: RequestInit): boolean {
  const method = requestMethod(init);
  return method === 'GET' || method === 'PUT';
}

function responseCanRetry(response: Response): boolean {
  return [408, 425, 429, 500, 502, 503, 504].includes(response.status);
}

function abortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  maxRetries: number
): Promise<Response> {
  const canRetry = requestCanRetry(init);
  const attempts = canRetry ? maxRetries + 1 : 1;
  const retryDelayMs = configuredInteger(
    'ENVX_HTTP_RETRY_DELAY_MS',
    DEFAULT_RETRY_DELAY_MS,
    0,
    10_000
  );
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);
      if (attempt + 1 >= attempts || !responseCanRetry(response)) return response;
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
      if (init.signal?.aborted) throw error;
      if (attempt + 1 >= attempts) {
        if (abortError(error)) {
          throw new Error(`Request timed out after ${timeoutMs}ms`);
        }
        throw error;
      }
    }

    await new Promise(resolve => {
      setTimeout(resolve, retryDelayMs * 2 ** attempt);
    });
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed');
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  const forwardAbort = (): void => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) forwardAbort();
  else callerSignal?.addEventListener('abort', forwardAbort, { once: true });

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', forwardAbort);
  }
}

export function shouldUseLegacyFallback(status: number): boolean {
  return status === 404 || status === 405 || status === 501;
}

export function createIdempotencyKey(): string {
  return randomUUID();
}

export function etagFromResponse(response: Response, body: unknown): string | null {
  const header = response.headers.get('etag');
  if (header) return header;
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const meta =
    record.meta && typeof record.meta === 'object'
      ? (record.meta as Record<string, unknown>)
      : null;
  const data =
    record.data && typeof record.data === 'object' && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : null;
  const revision = meta?.revision ?? data?.revision;
  return typeof revision === 'number' && Number.isSafeInteger(revision) && revision > 0
    ? `"${revision}"`
    : null;
}

export function responseErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const record = body as Record<string, unknown>;
  if (typeof record.msg === 'string') return record.msg;
  if (typeof record.error === 'string') return record.error;
  if (record.error && typeof record.error === 'object') {
    const message = (record.error as Record<string, unknown>).message;
    if (typeof message === 'string') return message;
  }
  return fallback;
}
