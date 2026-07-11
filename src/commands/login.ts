import { Command } from 'commander';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import {
  saveCredentials,
  loadCredentials,
  resolveApiBaseUrl,
  resolveDashboardUrl,
  CREDENTIALS_FILE,
} from '@/utils/credentials';
import {
  controlPlaneHeaders,
  createIdempotencyKey,
  fetchWithLegacyFallback,
  responseErrorMessage,
  USER_AGENT,
} from '@/utils/http';
import { loadDevConfig } from '@/utils/config';

const ENVX_CONTROL_SCOPES = [
  'profile:read',
  'orgs:read',
  'orgs:write',
  'envx:read',
  'envx:write',
] as const;

function openBrowser(url: string): void {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => undefined);
  child.unref();
}

function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function exchangeAuthorizationCode(input: {
  apiBaseUrl: string;
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<string> {
  const { response: canonicalResponse } = await fetchWithLegacyFallback(
    { canonicalUrl: new URL('/api/v1/auth/cli/exchange', input.apiBaseUrl).toString() },
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({
        code: input.code,
        codeVerifier: input.verifier,
        redirectUri: input.redirectUri,
      }),
    }
  );

  if (![404, 405, 501].includes(canonicalResponse.status)) {
    const body: unknown = await canonicalResponse.json().catch(() => null);
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
    const data =
      record?.data && typeof record.data === 'object'
        ? (record.data as Record<string, unknown>)
        : null;
    if (canonicalResponse.ok && record?.success === true && typeof data?.token === 'string') {
      return data.token;
    }
    throw new Error(
      responseErrorMessage(body, `Authorization exchange failed (HTTP ${canonicalResponse.status})`)
    );
  }

  const { response: legacyResponse } = await fetchWithLegacyFallback(
    { canonicalUrl: new URL('/api/v1/cli/auth/exchange', input.apiBaseUrl).toString() },
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ code: input.code }),
      maxRetries: 0,
    }
  );
  const legacyBody: unknown = await legacyResponse.json().catch(() => null);
  const legacyRecord =
    legacyBody && typeof legacyBody === 'object' ? (legacyBody as Record<string, unknown>) : null;
  const legacyData =
    legacyRecord?.data && typeof legacyRecord.data === 'object'
      ? (legacyRecord.data as Record<string, unknown>)
      : null;
  if (
    !legacyResponse.ok ||
    legacyRecord?.success !== true ||
    typeof legacyData?.token !== 'string'
  ) {
    throw new Error(
      responseErrorMessage(
        legacyBody,
        `Legacy authorization exchange failed (HTTP ${legacyResponse.status})`
      )
    );
  }
  return legacyData.token;
}

function browserLogin(dashboardUrl: string, apiBaseUrl: string): Promise<string> {
  const pkce = createPkcePair();
  let redirectUri = '';
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body><h2>Missing authorization code.</h2></body></html>');
          clearTimeout(timer);
          server.close();
          reject(new Error('No authorization code received'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:system-ui">
          <div style="text-align:center">
            <h2 style="color:#22c55e">Authorization successful!</h2>
            <p>You can close this tab and return to your terminal.</p>
          </div>
        </body></html>`);

        exchangeAuthorizationCode({
          apiBaseUrl,
          code,
          verifier: pkce.verifier,
          redirectUri,
        })
          .then(token => {
            clearTimeout(timer);
            server.close();
            resolve(token);
          })
          .catch(err => {
            clearTimeout(timer);
            server.close();
            reject(err);
          });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        clearTimeout(timer);
        server.close();
        reject(new Error('Failed to start local server'));
        return;
      }
      const port = addr.port;
      redirectUri = `http://127.0.0.1:${port}/callback`;
      const authUrl = new URL('/auth/cli', dashboardUrl);
      authUrl.searchParams.set('port', String(port));
      authUrl.searchParams.set('code_challenge', pkce.challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('scope', ENVX_CONTROL_SCOPES.join(' '));

      console.log(`Opening browser to authorize...`);
      console.log(`  ${chalk.underline(authUrl.toString())}`);
      console.log();

      openBrowser(authUrl.toString());
    });

    const timer = setTimeout(
      () => {
        server.close();
        reject(new Error('Authorization timed out (3 minutes)'));
      },
      3 * 60 * 1000
    );
    timer.unref();
  });
}

async function exchangeDashboardSession(apiBaseUrl: string, sessionToken: string): Promise<string> {
  const { response } = await fetchWithLegacyFallback(
    { canonicalUrl: new URL('/api/v1/auth/session/exchange', apiBaseUrl).toString() },
    {
      method: 'POST',
      headers: controlPlaneHeaders(sessionToken, {
        'Content-Type': 'application/json',
        'Idempotency-Key': createIdempotencyKey(),
      }),
      body: JSON.stringify({
        scopes: ENVX_CONTROL_SCOPES,
        tokenName: 'EnvX CLI',
      }),
    }
  );

  if ([404, 405, 501].includes(response.status)) return sessionToken;

  const body: unknown = await response.json().catch(() => null);
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const data =
    record?.data && typeof record.data === 'object'
      ? (record.data as Record<string, unknown>)
      : null;
  if (!response.ok || record?.success !== true || typeof data?.token !== 'string') {
    throw new Error(
      responseErrorMessage(body, `Session exchange failed (HTTP ${response.status})`)
    );
  }
  return data.token;
}

async function deviceLogin(dashboardUrl: string, apiBaseUrl: string): Promise<string> {
  const { response: codeRes } = await fetchWithLegacyFallback(
    { canonicalUrl: new URL('/api/auth/device/code', dashboardUrl).toString() },
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({
        client_id: 'envx-cli',
        scope: ENVX_CONTROL_SCOPES.join(' '),
      }),
    }
  );

  if (!codeRes.ok) {
    const body = (await codeRes.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message || `Failed to request device code (HTTP ${codeRes.status})`);
  }

  const codeData = (await codeRes.json()) as {
    user_code: string;
    device_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    interval: number;
    expires_in: number;
  };

  console.log();
  console.log(`  Your device code: ${chalk.bold(codeData.user_code)}`);
  console.log();
  const verifyUrl =
    codeData.verification_uri_complete ||
    `${dashboardUrl}${codeData.verification_uri}?user_code=${encodeURIComponent(codeData.user_code)}`;
  console.log(`  Open this URL to authorize:`);
  console.log(`  ${chalk.underline(verifyUrl)}`);
  console.log();

  openBrowser(verifyUrl);

  const spinner = ora('Waiting for authorization...').start();
  const interval = (codeData.interval || 5) * 1000;
  const deadline = Date.now() + codeData.expires_in * 1000;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, interval));

    const { response: tokenRes } = await fetchWithLegacyFallback(
      { canonicalUrl: new URL('/api/auth/device/token', dashboardUrl).toString() },
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
        body: JSON.stringify({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: codeData.device_code,
          client_id: 'envx-cli',
        }),
      }
    );

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
    };

    if (tokenData.access_token) {
      spinner.stop();
      return exchangeDashboardSession(apiBaseUrl, tokenData.access_token);
    }

    if (tokenData.error === 'authorization_pending' || tokenData.error === 'slow_down') {
      continue;
    }

    spinner.stop();

    if (tokenData.error === 'expired_token') {
      throw new Error('Device code expired. Please try again.');
    }
    if (tokenData.error === 'access_denied') {
      throw new Error('Authorization was denied.');
    }
    if (tokenData.error) {
      throw new Error(`Device flow error: ${tokenData.error}`);
    }
  }

  spinner.stop();
  throw new Error('Device code expired. Please try again.');
}

export function loginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate with LEAPERone to enable push/pull')
    .option('--device', 'Use device flow (no localhost server needed)')
    .option('--api-base-url <url>', 'Override API base URL')
    .option('--dashboard-url <url>', 'Override Dashboard authentication URL')
    .option('--base-url <url>', 'Deprecated single-domain override')
    .option(
      '-d, --dev-config <path>',
      'Path to dev config file (default: .envx/dev.config.yaml)',
      '.envx/dev.config.yaml'
    )
    .action(
      async (opts: {
        device?: boolean;
        apiBaseUrl?: string;
        dashboardUrl?: string;
        baseUrl?: string;
        devConfig?: string;
      }) => {
        try {
          const devConfig = loadDevConfig(
            join(process.cwd(), opts.devConfig || '.envx/dev.config.yaml')
          ).config;
          const apiBaseUrl = opts.apiBaseUrl
            ? resolveApiBaseUrl(opts.apiBaseUrl)
            : opts.baseUrl
              ? resolveApiBaseUrl(undefined, opts.baseUrl)
              : resolveApiBaseUrl(devConfig.apiBaseUrl, devConfig.baseUrl);
          const dashboardUrl = opts.dashboardUrl
            ? resolveDashboardUrl(opts.dashboardUrl)
            : opts.baseUrl
              ? resolveDashboardUrl(undefined, opts.baseUrl)
              : resolveDashboardUrl(devConfig.dashboardUrl, devConfig.baseUrl);

          let token: string;
          if (opts.device) {
            token = await deviceLogin(dashboardUrl, apiBaseUrl);
          } else {
            token = await browserLogin(dashboardUrl, apiBaseUrl);
          }

          // Verify the token
          const spinner = ora('Verifying...').start();

          const { response: res } = await fetchWithLegacyFallback(
            {
              canonicalUrl: new URL('/api/v1/me', apiBaseUrl).toString(),
              legacyUrl: new URL('/api/v1/cli/me', apiBaseUrl).toString(),
            },
            { headers: controlPlaneHeaders(token) }
          );

          const body: unknown = await res.json().catch(() => null);

          if (!res.ok) {
            spinner.stop();
            throw new Error(responseErrorMessage(body, `Verification failed (HTTP ${res.status})`));
          }

          const data = body as {
            success: boolean;
            data: { id: string; name?: string; email?: string };
          };

          if (!data?.success || !data.data) {
            spinner.stop();
            throw new Error('Verification failed');
          }

          // Save token
          const credentials = loadCredentials();
          credentials.token = token;
          credentials.apiBaseUrl = apiBaseUrl;
          credentials.dashboardUrl = dashboardUrl;
          delete credentials.baseUrl;
          saveCredentials(credentials);

          spinner.stop();

          console.log(
            chalk.green(
              `\u2705 Authenticated as ${data.data.name || data.data.email || data.data.id}`
            )
          );
          console.log(`  Credentials saved to ${chalk.dim(CREDENTIALS_FILE)}`);
        } catch (err) {
          console.error(chalk.red(`\u274c Login failed: ${(err as Error).message}`));
          process.exit(1);
        }
      }
    );
}
