import { Command } from 'commander';
import http from 'node:http';
import { exec } from 'node:child_process';
import chalk from 'chalk';
import ora from 'ora';
import {
  saveCredentials,
  loadCredentials,
  getAuthBaseUrl,
  CREDENTIALS_FILE,
} from '@/utils/credentials';

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

function browserLogin(baseUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body><h2>Missing authorization code.</h2></body></html>');
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

        fetch(new URL('/api/v1/cli/auth/exchange', baseUrl).toString(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        })
          .then(async (r) => {
            const text = await r.text();
            try {
              return JSON.parse(text);
            } catch {
              throw new Error(
                `Exchange API returned non-JSON (HTTP ${r.status}): ${text.slice(0, 200)}`
              );
            }
          })
          .then((data) => {
            server.close();
            if (data.success && data.data?.token) {
              resolve(data.data.token);
            } else {
              reject(new Error(data.error || 'Failed to exchange code'));
            }
          })
          .catch((err) => {
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
        reject(new Error('Failed to start local server'));
        return;
      }
      const port = addr.port;
      const authUrl = `${baseUrl}/auth/cli?port=${port}`;

      console.log(`Opening browser to authorize...`);
      console.log(`  ${chalk.underline(authUrl)}`);
      console.log();

      openBrowser(authUrl);
    });

    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Authorization timed out (3 minutes)'));
    }, 3 * 60 * 1000);
    timer.unref();
  });
}

async function deviceLogin(baseUrl: string): Promise<string> {
  const codeRes = await fetch(new URL('/api/auth/device/code', baseUrl).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'envx-cli' }),
  });

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
    `${baseUrl}${codeData.verification_uri}?user_code=${encodeURIComponent(codeData.user_code)}`;
  console.log(`  Open this URL to authorize:`);
  console.log(`  ${chalk.underline(verifyUrl)}`);
  console.log();

  openBrowser(verifyUrl);

  const spinner = ora('Waiting for authorization...').start();
  const interval = (codeData.interval || 5) * 1000;
  const deadline = Date.now() + codeData.expires_in * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));

    const tokenRes = await fetch(new URL('/api/auth/device/token', baseUrl).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: codeData.device_code,
        client_id: 'envx-cli',
      }),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
    };

    if (tokenData.access_token) {
      spinner.stop();
      return tokenData.access_token;
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
    .option('--base-url <url>', 'Override base URL for authentication')
    .action(async (opts: { device?: boolean; baseUrl?: string }) => {
      try {
        const baseUrl = opts.baseUrl || getAuthBaseUrl();

        let token: string;
        if (opts.device) {
          token = await deviceLogin(baseUrl);
        } else {
          token = await browserLogin(baseUrl);
        }

        // Verify the token
        const spinner = ora('Verifying...').start();

        const res = await fetch(new URL('/api/v1/cli/me', baseUrl).toString(), {
          headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': '@leaperone/envx',
          },
        });

        if (!res.ok) {
          spinner.stop();
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `Verification failed (HTTP ${res.status})`);
        }

        const data = (await res.json()) as {
          success: boolean;
          data: { id: string; name?: string; email?: string };
        };

        if (!data.success) {
          spinner.stop();
          throw new Error('Verification failed');
        }

        // Save token
        const credentials = loadCredentials();
        credentials.token = token;
        credentials.baseUrl = baseUrl;
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
    });
}
