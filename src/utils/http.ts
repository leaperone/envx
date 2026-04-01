import chalk from 'chalk';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;

interface FetchWithRetryOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxRetries?: number;
  verbose?: boolean;
}

interface FetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 && status < 600;
}

function getDelayMs(attempt: number): number {
  return BASE_DELAY_MS * Math.pow(2, attempt);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<FetchResponse> {
  const {
    method = 'GET',
    headers,
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = MAX_RETRIES,
    verbose = false,
  } = options;

  const fetchFn = (globalThis as unknown as { fetch?: typeof fetch }).fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available in this Node.js runtime. Please use Node 18+');
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      // 5xx 错误且还有重试次数时，进行重试
      if (isRetryableStatus(response.status) && attempt < maxRetries) {
        const delay = getDelayMs(attempt);
        if (verbose) {
          console.log(
            chalk.yellow(
              `⚠️  Server returned ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`
            )
          );
        }
        await sleep(delay);
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timer);

      const isTimeout =
        error instanceof DOMException && error.name === 'AbortError';
      const isNetworkError = error instanceof TypeError;

      if (isTimeout) {
        lastError = new Error(`Request timed out after ${timeoutMs}ms`);
      } else if (isNetworkError) {
        lastError = new Error(`Network error: ${(error as Error).message}`);
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      if (attempt < maxRetries) {
        const delay = getDelayMs(attempt);
        if (verbose) {
          console.log(
            chalk.yellow(
              `⚠️  ${lastError.message}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`
            )
          );
        }
        await sleep(delay);
        continue;
      }
    }
  }

  throw lastError ?? new Error('Request failed after retries');
}
