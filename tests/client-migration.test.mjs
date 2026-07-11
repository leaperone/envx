import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import Database from 'better-sqlite3';

const CLI_PATH = resolve('dist/index.js');
const tempDirs = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function createFixture(apiBaseUrl) {
  const cwd = await mkdtemp(join(tmpdir(), 'envx-client-migration-'));
  tempDirs.push(cwd);
  await mkdir(join(cwd, '.envx'), { recursive: true });
  await writeFile(
    join(cwd, 'envx.config.yaml'),
    ['version: 1', 'export: false', 'files: ./.env', 'env:', '  API_SECRET: {}', ''].join('\n')
  );
  await writeFile(
    join(cwd, '.envx', 'dev.config.yaml'),
    [
      `apiBaseUrl: ${apiBaseUrl}`,
      'dashboardUrl: https://dashboard.example.test',
      'namespace: team',
      'project: project',
      '',
    ].join('\n')
  );
  const db = new Database(join(cwd, '.envx', 'envx.db'));
  db.exec(`
    CREATE TABLE schema_version (version INTEGER NOT NULL);
    INSERT INTO schema_version (version) VALUES (2);
    CREATE TABLE env_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      tag TEXT NOT NULL
    );
    CREATE UNIQUE INDEX idx_env_history_key_tag_unique ON env_history(key, tag);
    INSERT INTO env_history (key, value, timestamp, tag)
      VALUES ('API_SECRET', 'secret-value', '2026-07-11T00:00:00.000Z', 'release');
  `);
  db.close();
  return cwd;
}

function runCli(cwd, args, env = {}) {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd,
      env: {
        ...process.env,
        HOME: cwd,
        ENVX_API_KEY: 'test-auth-token',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        ...env,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', rejectChild);
    child.on('close', code => resolveChild({ code, stdout, stderr }));
  });
}

async function listen(handler) {
  const server = createServer(handler);
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  assert(address && typeof address === 'object');
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise(resolveClose => server.close(resolveClose)),
  };
}

async function installFakeBrowser(cwd, options = {}) {
  const binDir = join(cwd, 'bin');
  await mkdir(binDir);
  const executable =
    process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const fakeOpen = join(binDir, executable);
  await writeFile(
    fakeOpen,
    `#!/usr/bin/env node
const fs = require('node:fs');
const opened = new URL(process.argv[2]);
fs.writeFileSync(process.env.HOME + '/opened-url', opened.toString());
const port = opened.searchParams.get('port');
const state = opened.searchParams.get('state');
const callbackState = ${options.mismatchState ? "'wrong-state'" : "state || ''"};
fetch('http://127.0.0.1:' + port + '/callback?code=browser-code&state=' + encodeURIComponent(callbackState)).catch(() => process.exit(1));
`
  );
  await chmod(fakeOpen, 0o755);
  return binDir;
}

test('canonical push uses PUT, versioned User-Agent and revision preconditions', async () => {
  const requests = [];
  let revision = 7;
  const service = await listen((request, response) => {
    requests.push({ method: request.method, url: request.url, headers: request.headers });
    request.resume();
    request.on('end', () => {
      response.writeHead(200, {
        'Content-Type': 'application/json',
        ETag: `"${revision}"`,
      });
      response.end(
        JSON.stringify({ success: true, data: { revision, updatedKeys: ['API_SECRET'] } })
      );
      revision += 1;
    });
  });
  const cwd = await createFixture(service.baseUrl);

  const first = await runCli(cwd, ['push', 'release']);
  const second = await runCli(cwd, ['push', 'release']);
  await service.close();

  assert.equal(first.code, 0, first.stderr);
  assert.equal(second.code, 0, second.stderr);
  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests.map(request => [request.method, request.url]),
    [
      ['PUT', '/api/v1/envx/team/project'],
      ['PUT', '/api/v1/envx/team/project'],
    ]
  );
  assert.equal(requests[0].headers['if-none-match'], '*');
  assert.equal(requests[0].headers['if-match'], undefined);
  assert.equal(requests[1].headers['if-match'], '"7"');
  assert.match(requests[0].headers['idempotency-key'], /^[0-9a-f-]{36}$/);
  assert.equal(requests[0].headers['user-agent'], '@leaperone/envx/0.2.3');

  const db = new Database(join(cwd, '.envx', 'envx.db'), { readonly: true });
  const state = db.prepare('SELECT etag FROM remote_state').get();
  db.close();
  assert.equal(state.etag, '"8"');
});

test('push applies the selected organization identity to a new namespace', async () => {
  let receivedBody = null;
  const service = await listen((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => {
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/api/v1/me') {
        response.end(JSON.stringify({ success: true, data: { id: 'user-1' } }));
        return;
      }
      if (request.url === '/api/v1/organizations/team') {
        response.end(JSON.stringify({ success: true, data: { id: 'org-1', slug: 'team' } }));
        return;
      }
      receivedBody = JSON.parse(body);
      response.writeHead(201, { 'Content-Type': 'application/json', ETag: '"1"' });
      response.end(JSON.stringify({ success: true, data: { revision: 1 } }));
    });
  });
  const cwd = await createFixture(service.baseUrl);
  await writeFile(
    join(cwd, '.envx', 'credentials.json'),
    JSON.stringify({
      currentOrg: 'team',
      currentOrgId: 'org-1',
      currentOrgApiBaseUrl: service.baseUrl,
      currentOrgUserId: 'user-1',
    })
  );

  const result = await runCli(cwd, ['push', 'release']);
  await service.close();

  assert.equal(result.code, 0, result.stderr);
  assert.equal(receivedBody.organizationId, 'org-1');
});

test('push clears an organization context bound to a different API origin', async () => {
  const requests = [];
  let receivedBody = null;
  const service = await listen((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => {
      requests.push(request.url);
      receivedBody = JSON.parse(body);
      response.writeHead(201, { 'Content-Type': 'application/json', ETag: '"1"' });
      response.end(JSON.stringify({ success: true, data: { revision: 1 } }));
    });
  });
  const cwd = await createFixture(service.baseUrl);
  await writeFile(
    join(cwd, '.envx', 'credentials.json'),
    JSON.stringify({
      currentOrg: 'team',
      currentOrgId: 'org-1',
      currentOrgApiBaseUrl: 'https://stale-api.example.test',
      currentOrgUserId: 'user-1',
    })
  );

  const result = await runCli(cwd, ['push', 'release']);
  await service.close();

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(requests, ['/api/v1/envx/team/project']);
  assert.equal(receivedBody.organizationId, undefined);
  const credentials = JSON.parse(await readFile(join(cwd, '.envx', 'credentials.json'), 'utf8'));
  assert.equal(credentials.currentOrg, undefined);
  assert.equal(credentials.currentOrgId, undefined);
  assert.equal(credentials.currentOrgApiBaseUrl, undefined);
  assert.equal(credentials.currentOrgUserId, undefined);
});

test('push clears an organization context bound to a different authenticated subject', async () => {
  const requests = [];
  let receivedBody = null;
  const service = await listen((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => {
      requests.push(request.url);
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/api/v1/me') {
        response.end(JSON.stringify({ success: true, data: { id: 'user-2' } }));
        return;
      }
      receivedBody = JSON.parse(body);
      response.writeHead(201, { 'Content-Type': 'application/json', ETag: '"1"' });
      response.end(JSON.stringify({ success: true, data: { revision: 1 } }));
    });
  });
  const cwd = await createFixture(service.baseUrl);
  await writeFile(
    join(cwd, '.envx', 'credentials.json'),
    JSON.stringify({
      currentOrg: 'team',
      currentOrgId: 'org-1',
      currentOrgApiBaseUrl: service.baseUrl,
      currentOrgUserId: 'user-1',
    })
  );

  const result = await runCli(cwd, ['push', 'release']);
  await service.close();

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(requests, ['/api/v1/me', '/api/v1/envx/team/project']);
  assert.equal(receivedBody.organizationId, undefined);
  const credentials = JSON.parse(await readFile(join(cwd, '.envx', 'credentials.json'), 'utf8'));
  assert.equal(credentials.currentOrg, undefined);
  assert.equal(credentials.currentOrgUserId, undefined);
});

test('push clears organization context when membership can no longer be verified', async () => {
  const requests = [];
  let receivedBody = null;
  const service = await listen((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => {
      requests.push(request.url);
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/api/v1/me') {
        response.end(JSON.stringify({ success: true, data: { id: 'user-1' } }));
        return;
      }
      if (request.url === '/api/v1/organizations/team') {
        response.writeHead(403);
        response.end(JSON.stringify({ success: false, error: { message: 'membership revoked' } }));
        return;
      }
      receivedBody = JSON.parse(body);
      response.writeHead(201, { 'Content-Type': 'application/json', ETag: '"1"' });
      response.end(JSON.stringify({ success: true, data: { revision: 1 } }));
    });
  });
  const cwd = await createFixture(service.baseUrl);
  await writeFile(
    join(cwd, '.envx', 'credentials.json'),
    JSON.stringify({
      currentOrg: 'team',
      currentOrgId: 'org-1',
      currentOrgApiBaseUrl: service.baseUrl,
      currentOrgUserId: 'user-1',
    })
  );

  const result = await runCli(cwd, ['push', 'release']);
  await service.close();

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(requests, [
    '/api/v1/me',
    '/api/v1/organizations/team',
    '/api/v1/envx/team/project',
  ]);
  assert.equal(receivedBody.organizationId, undefined);
  const credentials = JSON.parse(await readFile(join(cwd, '.envx', 'credentials.json'), 'utf8'));
  assert.equal(credentials.currentOrg, undefined);
});

test('push falls back to the legacy alias only when the canonical route is unavailable', async () => {
  const requests = [];
  const service = await listen((request, response) => {
    requests.push({ method: request.method, url: request.url, headers: request.headers });
    request.resume();
    request.on('end', () => {
      if (request.method === 'PUT') {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ success: false, error: { message: 'not deployed' } }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: 0, msg: 'ok', data: { updated: 1 } }));
    });
  });
  const cwd = await createFixture(service.baseUrl);
  const result = await runCli(cwd, ['push', 'release']);
  await service.close();

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(
    requests.map(request => [request.method, request.url]),
    [
      ['PUT', '/api/v1/envx/team/project'],
      ['POST', '/api/v1/envx/team/project/push'],
    ]
  );
  assert.equal(requests[1].headers['if-none-match'], undefined);
  assert.equal(requests[1].headers['user-agent'], '@leaperone/envx/0.2.3');
  assert.match(result.stdout, /API contract: legacy compatibility/);
});

test('canonical pull stores the returned ETag for the next push', async () => {
  const requests = [];
  const service = await listen((request, response) => {
    requests.push({ method: request.method, url: request.url, headers: request.headers });
    response.writeHead(200, { 'Content-Type': 'application/json', ETag: '"12"' });
    response.end(
      JSON.stringify({
        success: true,
        data: {
          records: [
            {
              id: 1,
              namespace: 'team',
              project: 'project',
              key: 'API_SECRET',
              value: 'remote-secret',
              timestamp: '2026-07-12T00:00:00.000Z',
              action: 'set',
              source: 'remote',
              tag: 'release',
            },
          ],
        },
        meta: { revision: 12 },
      })
    );
  });
  const cwd = await createFixture(service.baseUrl);
  const result = await runCli(cwd, ['pull', 'release', '--not-load']);
  await service.close();

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(
    [requests[0].method, requests[0].url],
    ['GET', '/api/v1/envx/team/project?tag=release']
  );
  assert.equal(requests[0].headers['user-agent'], '@leaperone/envx/0.2.3');
  const db = new Database(join(cwd, '.envx', 'envx.db'), { readonly: true });
  const state = db.prepare('SELECT etag FROM remote_state').get();
  const value = db
    .prepare("SELECT value FROM env_history WHERE key = 'API_SECRET' AND tag = 'release'")
    .get();
  db.close();
  assert.equal(state.etag, '"12"');
  assert.equal(value.value, 'remote-secret');
  assert.equal((result.stdout + result.stderr).includes('remote-secret'), false);
});

test('business profile requests prefer canonical API and use CLI alias as compatibility fallback', async () => {
  const requests = [];
  const service = await listen((request, response) => {
    requests.push({ method: request.method, url: request.url, headers: request.headers });
    if (request.url === '/api/v1/me') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ success: false, error: { message: 'not deployed' } }));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ success: true, data: { id: 'u1', name: 'Test User' } }));
  });
  const cwd = await mkdtemp(join(tmpdir(), 'envx-whoami-'));
  tempDirs.push(cwd);
  const result = await runCli(cwd, ['whoami'], { ENVX_API_BASE_URL: service.baseUrl });
  await service.close();

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(
    requests.map(request => request.url),
    ['/api/v1/me', '/api/v1/cli/me']
  );
  assert.equal(requests[0].headers['user-agent'], '@leaperone/envx/0.2.3');
  assert.match(result.stdout, /Test User/);
});

test('organization requests use the canonical business path', async () => {
  const requests = [];
  const service = await listen((request, response) => {
    requests.push({ method: request.method, url: request.url, headers: request.headers });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    const secondPage = request.url === '/api/v1/organizations?cursor=next-page';
    response.end(
      JSON.stringify({
        success: true,
        data: {
          items: secondPage
            ? [{ id: 'org-2', slug: 'platform', name: 'Platform', role: 'member' }]
            : [{ id: 'org-1', slug: 'team', name: 'Team', role: 'owner' }],
          nextCursor: secondPage ? null : 'next-page',
        },
      })
    );
  });
  const cwd = await mkdtemp(join(tmpdir(), 'envx-org-'));
  tempDirs.push(cwd);
  const result = await runCli(cwd, ['org', 'list'], { ENVX_API_BASE_URL: service.baseUrl });
  await service.close();

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(
    requests.map(request => [request.method, request.url]),
    [
      ['GET', '/api/v1/organizations'],
      ['GET', '/api/v1/organizations?cursor=next-page'],
    ]
  );
  assert.equal(requests[0].headers['user-agent'], '@leaperone/envx/0.2.3');
  assert.match(result.stdout, /team/);
  assert.match(result.stdout, /platform/);
});

test('organization create uses canonical path and an idempotency key', async () => {
  const requests = [];
  const service = await listen((request, response) => {
    requests.push({ method: request.method, url: request.url, headers: request.headers });
    request.resume();
    response.writeHead(201, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        success: true,
        data: { id: 'org-1', slug: 'team', name: 'Team' },
      })
    );
  });
  const cwd = await mkdtemp(join(tmpdir(), 'envx-org-create-'));
  tempDirs.push(cwd);
  const result = await runCli(cwd, ['org', 'create', 'team', '--name', 'Team'], {
    ENVX_API_BASE_URL: service.baseUrl,
  });
  await service.close();

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual([requests[0].method, requests[0].url], ['POST', '/api/v1/organizations']);
  assert.match(requests[0].headers['idempotency-key'], /^[0-9a-f-]{36}$/);
  const credentials = JSON.parse(await readFile(join(cwd, '.envx', 'credentials.json'), 'utf8'));
  assert.equal(credentials.currentOrg, 'team');
  assert.equal(credentials.currentOrgId, 'org-1');
});

test('idempotent canonical POST retries with the same idempotency key', async () => {
  const requests = [];
  let createAttempts = 0;
  const service = await listen((request, response) => {
    requests.push({ method: request.method, url: request.url, headers: request.headers });
    request.resume();
    if (request.url === '/api/v1/organizations') {
      createAttempts += 1;
      if (createAttempts === 1) {
        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ success: false, error: { message: 'retry' } }));
        return;
      }
      response.writeHead(201, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({ success: true, data: { id: 'org-1', slug: 'team', name: 'Team' } })
      );
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ success: true, data: { id: 'user-1' } }));
  });
  const cwd = await mkdtemp(join(tmpdir(), 'envx-org-create-retry-'));
  tempDirs.push(cwd);
  const result = await runCli(cwd, ['org', 'create', 'team', '--name', 'Team'], {
    ENVX_API_BASE_URL: service.baseUrl,
    ENVX_HTTP_RETRY_DELAY_MS: '1',
  });
  await service.close();

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(
    requests.map(request => [request.method, request.url]),
    [
      ['POST', '/api/v1/organizations'],
      ['POST', '/api/v1/organizations'],
      ['GET', '/api/v1/me'],
    ]
  );
  assert.match(requests[0].headers['idempotency-key'], /^[0-9a-f-]{36}$/);
  assert.equal(requests[0].headers['idempotency-key'], requests[1].headers['idempotency-key']);
});

test('device login keeps Dashboard authorization and API verification on distinct origins', async () => {
  const dashboardRequests = [];
  const apiRequests = [];
  const dashboard = await listen((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => {
      dashboardRequests.push({
        url: request.url,
        headers: request.headers,
        body: body ? JSON.parse(body) : null,
      });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      if (request.url === '/api/auth/device/code') {
        response.end(
          JSON.stringify({
            user_code: 'ABCD-EFGH',
            device_code: 'device-code',
            verification_uri: '/device',
            interval: 0.001,
            expires_in: 30,
          })
        );
        return;
      }
      response.end(JSON.stringify({ access_token: 'control-token' }));
    });
  });
  const api = await listen((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => {
      apiRequests.push({
        url: request.url,
        headers: request.headers,
        body: body ? JSON.parse(body) : null,
      });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      if (request.url === '/api/v1/auth/session/exchange') {
        response.end(JSON.stringify({ success: true, data: { token: 'scoped-control-token' } }));
        return;
      }
      response.end(JSON.stringify({ success: true, data: { id: 'u1', name: 'Device User' } }));
    });
  });
  const cwd = await mkdtemp(join(tmpdir(), 'envx-login-split-'));
  tempDirs.push(cwd);
  await mkdir(join(cwd, '.envx'));
  await writeFile(
    join(cwd, '.envx', 'dev.config.yaml'),
    `apiBaseUrl: ${api.baseUrl}\ndashboardUrl: ${dashboard.baseUrl}\n`
  );
  const binDir = join(cwd, 'bin');
  await mkdir(binDir);
  const fakeOpen = join(
    binDir,
    process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  );
  await writeFile(fakeOpen, '#!/bin/sh\nexit 0\n');
  await chmod(fakeOpen, 0o755);

  const result = await runCli(cwd, ['login', '--device'], {
    HOME: cwd,
    PATH: `${binDir}:${process.env.PATH}`,
    ENVX_API_KEY: '',
  });
  await dashboard.close();
  await api.close();

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(
    dashboardRequests.map(request => request.url),
    ['/api/auth/device/code', '/api/auth/device/token']
  );
  assert.deepEqual(
    apiRequests.map(request => request.url),
    ['/api/v1/auth/session/exchange', '/api/v1/me']
  );
  assert.equal(dashboardRequests[0].headers['user-agent'], '@leaperone/envx/0.2.3');
  assert.deepEqual(dashboardRequests[0].body, {
    client_id: 'envx-cli',
    scope: 'profile:read orgs:read orgs:write envx:read envx:write',
  });
  assert.equal(apiRequests[0].headers['user-agent'], '@leaperone/envx/0.2.3');
  assert.equal(apiRequests[0].headers.authorization, 'Bearer control-token');
  assert.match(apiRequests[0].headers['idempotency-key'], /^[0-9a-f-]{36}$/);
  assert.deepEqual(apiRequests[0].body, {
    scopes: ['profile:read', 'orgs:read', 'orgs:write', 'envx:read', 'envx:write'],
    tokenName: 'EnvX CLI',
  });
  assert.equal(apiRequests[1].headers.authorization, 'Bearer scoped-control-token');
  const credentials = JSON.parse(await readFile(join(cwd, '.envx', 'credentials.json'), 'utf8'));
  const credentialsStat = await stat(join(cwd, '.envx', 'credentials.json'));
  const credentialsDirStat = await stat(join(cwd, '.envx'));
  assert.equal(credentials.token, 'scoped-control-token');
  assert.equal(credentials.apiBaseUrl, api.baseUrl);
  assert.equal(credentials.dashboardUrl, dashboard.baseUrl);
  assert.equal(credentials.baseUrl, undefined);
  assert.equal(credentialsStat.mode & 0o777, 0o600);
  assert.equal(credentialsDirStat.mode & 0o777, 0o700);
});

test('browser login uses PKCE canonical exchange and requests only EnvX business scopes', async () => {
  const apiRequests = [];
  const api = await listen((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => {
      apiRequests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: body ? JSON.parse(body) : null,
      });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      if (request.url === '/api/v1/auth/cli/exchange') {
        response.end(JSON.stringify({ success: true, data: { token: 'browser-control-token' } }));
        return;
      }
      response.end(JSON.stringify({ success: true, data: { id: 'u1', name: 'Browser User' } }));
    });
  });
  const cwd = await mkdtemp(join(tmpdir(), 'envx-browser-login-'));
  tempDirs.push(cwd);
  const binDir = await installFakeBrowser(cwd);

  const result = await runCli(
    cwd,
    ['login', '--dashboard-url', 'https://dashboard.example.test', '--api-base-url', api.baseUrl],
    {
      HOME: cwd,
      PATH: `${binDir}:${process.env.PATH}`,
      ENVX_API_KEY: '',
    }
  );
  await api.close();

  assert.equal(result.code, 0, result.stderr);
  const openedUrl = new URL(await readFile(join(cwd, 'opened-url'), 'utf8'));
  assert.equal(openedUrl.origin, 'https://dashboard.example.test');
  assert.equal(openedUrl.pathname, '/auth/cli');
  assert.equal(openedUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.match(openedUrl.searchParams.get('state'), /^[A-Za-z0-9_-]{32}$/);
  assert.deepEqual(openedUrl.searchParams.get('scope').split(' '), [
    'profile:read',
    'orgs:read',
    'orgs:write',
    'envx:read',
    'envx:write',
  ]);
  assert.deepEqual(
    apiRequests.map(request => [request.method, request.url]),
    [
      ['POST', '/api/v1/auth/cli/exchange'],
      ['GET', '/api/v1/me'],
    ]
  );
  const exchange = apiRequests[0];
  assert.match(exchange.headers['idempotency-key'], /^[0-9a-f-]{36}$/);
  assert.equal(exchange.body.code, 'browser-code');
  assert.match(exchange.body.codeVerifier, /^[A-Za-z0-9_-]{43}$/);
  assert.match(exchange.body.redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  assert.equal(
    createHash('sha256').update(exchange.body.codeVerifier).digest('base64url'),
    openedUrl.searchParams.get('code_challenge')
  );
  assert.equal(apiRequests[1].headers.authorization, 'Bearer browser-control-token');
});

test('browser login rejects a callback with a mismatched OAuth state', async () => {
  const apiRequests = [];
  const api = await listen((request, response) => {
    apiRequests.push(request.url);
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ success: false }));
  });
  const cwd = await mkdtemp(join(tmpdir(), 'envx-browser-state-mismatch-'));
  tempDirs.push(cwd);
  const binDir = await installFakeBrowser(cwd, { mismatchState: true });

  const result = await runCli(
    cwd,
    ['login', '--dashboard-url', 'https://dashboard.example.test', '--api-base-url', api.baseUrl],
    {
      HOME: cwd,
      PATH: `${binDir}:${process.env.PATH}`,
      ENVX_API_KEY: '',
    }
  );
  await api.close();

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Authorization state mismatch/);
  assert.deepEqual(apiRequests, []);
});

test('re-login revokes the previous control token before overwriting local credentials', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'envx-browser-relogin-'));
  tempDirs.push(cwd);
  await mkdir(join(cwd, '.envx'));
  const apiRequests = [];
  const api = await listen((request, response) => {
    request.resume();
    request.on('end', async () => {
      const stored = JSON.parse(await readFile(join(cwd, '.envx', 'credentials.json'), 'utf8'));
      apiRequests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        storedToken: stored.token,
      });
      if (request.url === '/api/v1/auth/cli/exchange') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ success: true, data: { token: 'lpc_new_token' } }));
        return;
      }
      if (request.url === '/api/v1/me') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ success: true, data: { id: 'user-1', name: 'User' } }));
        return;
      }
      response.writeHead(204);
      response.end();
    });
  });
  const originalCredentials = {
    token: 'lpc_old_token',
    apiBaseUrl: api.baseUrl,
    dashboardUrl: 'https://old-dashboard.example.test',
    userId: 'user-1',
  };
  await writeFile(join(cwd, '.envx', 'credentials.json'), JSON.stringify(originalCredentials));
  const binDir = await installFakeBrowser(cwd);

  const result = await runCli(
    cwd,
    ['login', '--dashboard-url', 'https://dashboard.example.test', '--api-base-url', api.baseUrl],
    {
      HOME: cwd,
      PATH: `${binDir}:${process.env.PATH}`,
      ENVX_API_KEY: '',
    }
  );
  await api.close();

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(
    apiRequests.map(request => [request.method, request.url]),
    [
      ['POST', '/api/v1/auth/cli/exchange'],
      ['GET', '/api/v1/me'],
      ['DELETE', '/api/v1/control-tokens/current'],
    ]
  );
  assert.equal(apiRequests[2].authorization, 'Bearer lpc_old_token');
  assert.equal(apiRequests[2].storedToken, 'lpc_old_token');
  const credentials = JSON.parse(await readFile(join(cwd, '.envx', 'credentials.json'), 'utf8'));
  assert.equal(credentials.token, 'lpc_new_token');
  assert.equal(credentials.userId, 'user-1');
});

test('re-login retains previous credentials when old-token revocation fails', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'envx-browser-relogin-failure-'));
  tempDirs.push(cwd);
  await mkdir(join(cwd, '.envx'));
  const apiRequests = [];
  const api = await listen((request, response) => {
    request.resume();
    request.on('end', () => {
      apiRequests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
      });
      if (request.url === '/api/v1/auth/cli/exchange') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ success: true, data: { token: 'lpc_new_token' } }));
        return;
      }
      if (request.url === '/api/v1/me') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ success: true, data: { id: 'user-1', name: 'User' } }));
        return;
      }
      if (request.headers.authorization === 'Bearer lpc_old_token') {
        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ success: false, error: { message: 'unavailable' } }));
        return;
      }
      response.writeHead(204);
      response.end();
    });
  });
  const originalCredentials = {
    token: 'lpc_old_token',
    apiBaseUrl: api.baseUrl,
    dashboardUrl: 'https://old-dashboard.example.test',
    userId: 'user-1',
    currentOrg: 'team',
    currentOrgId: 'org-1',
    currentOrgApiBaseUrl: api.baseUrl,
    currentOrgUserId: 'user-1',
  };
  await writeFile(join(cwd, '.envx', 'credentials.json'), JSON.stringify(originalCredentials));
  const binDir = await installFakeBrowser(cwd);

  const result = await runCli(
    cwd,
    ['login', '--dashboard-url', 'https://dashboard.example.test', '--api-base-url', api.baseUrl],
    {
      HOME: cwd,
      PATH: `${binDir}:${process.env.PATH}`,
      ENVX_API_KEY: '',
      ENVX_HTTP_MAX_RETRIES: '0',
    }
  );
  await api.close();

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Previous control token could not be revoked/);
  assert.deepEqual(
    apiRequests.map(request => [request.method, request.url, request.authorization]),
    [
      ['POST', '/api/v1/auth/cli/exchange', undefined],
      ['GET', '/api/v1/me', 'Bearer lpc_new_token'],
      ['DELETE', '/api/v1/control-tokens/current', 'Bearer lpc_old_token'],
      ['DELETE', '/api/v1/control-tokens/current', 'Bearer lpc_new_token'],
    ]
  );
  const credentials = JSON.parse(await readFile(join(cwd, '.envx', 'credentials.json'), 'utf8'));
  assert.deepEqual(credentials, originalCredentials);
});

test('browser login falls back to legacy PUT only when canonical exchange is unavailable', async () => {
  const apiRequests = [];
  const api = await listen((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => {
      apiRequests.push({
        method: request.method,
        url: request.url,
        body: body ? JSON.parse(body) : null,
      });
      response.writeHead(request.url === '/api/v1/auth/cli/exchange' ? 404 : 200, {
        'Content-Type': 'application/json',
      });
      if (request.url === '/api/v1/auth/cli/exchange') {
        response.end(JSON.stringify({ success: false, error: { message: 'not deployed' } }));
        return;
      }
      if (request.url === '/api/v1/cli/auth/exchange') {
        response.end(JSON.stringify({ success: true, data: { token: 'legacy-control-token' } }));
        return;
      }
      response.end(JSON.stringify({ success: true, data: { id: 'u1', name: 'Legacy Browser' } }));
    });
  });
  const cwd = await mkdtemp(join(tmpdir(), 'envx-browser-legacy-'));
  tempDirs.push(cwd);
  const binDir = await installFakeBrowser(cwd);

  const result = await runCli(
    cwd,
    ['login', '--dashboard-url', 'https://dashboard.example.test', '--api-base-url', api.baseUrl],
    {
      HOME: cwd,
      PATH: `${binDir}:${process.env.PATH}`,
      ENVX_API_KEY: '',
    }
  );
  await api.close();

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(
    apiRequests.map(request => [request.method, request.url]),
    [
      ['POST', '/api/v1/auth/cli/exchange'],
      ['PUT', '/api/v1/cli/auth/exchange'],
      ['GET', '/api/v1/me'],
    ]
  );
  assert.deepEqual(apiRequests[1].body, { code: 'browser-code' });
});

test('device login uses the Dashboard bearer only when session exchange is unavailable', async () => {
  const apiRequests = [];
  const dashboard = await listen((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    if (request.url === '/api/auth/device/code') {
      response.end(
        JSON.stringify({
          user_code: 'ABCD-EFGH',
          device_code: 'device-code',
          verification_uri: '/device',
          interval: 0.001,
          expires_in: 30,
        })
      );
      return;
    }
    response.end(JSON.stringify({ access_token: 'compat-session-token' }));
  });
  const api = await listen((request, response) => {
    apiRequests.push({ url: request.url, headers: request.headers });
    response.writeHead(request.url === '/api/v1/auth/session/exchange' ? 404 : 200, {
      'Content-Type': 'application/json',
    });
    if (request.url === '/api/v1/auth/session/exchange') {
      response.end(JSON.stringify({ success: false, error: { message: 'not deployed' } }));
      return;
    }
    response.end(JSON.stringify({ success: true, data: { id: 'u1', name: 'Compat User' } }));
  });
  const cwd = await mkdtemp(join(tmpdir(), 'envx-login-compat-'));
  tempDirs.push(cwd);
  const binDir = join(cwd, 'bin');
  await mkdir(binDir);
  const fakeOpen = join(
    binDir,
    process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  );
  await writeFile(fakeOpen, '#!/bin/sh\nexit 0\n');
  await chmod(fakeOpen, 0o755);

  const result = await runCli(
    cwd,
    ['login', '--device', '--dashboard-url', dashboard.baseUrl, '--api-base-url', api.baseUrl],
    {
      HOME: cwd,
      PATH: `${binDir}:${process.env.PATH}`,
      ENVX_API_KEY: '',
    }
  );
  await dashboard.close();
  await api.close();

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(
    apiRequests.map(request => request.url),
    ['/api/v1/auth/session/exchange', '/api/v1/me']
  );
  assert.equal(apiRequests[1].headers.authorization, 'Bearer compat-session-token');
  const credentials = JSON.parse(await readFile(join(cwd, '.envx', 'credentials.json'), 'utf8'));
  assert.equal(credentials.token, 'compat-session-token');
});

test('legacy custom base URL overrides stored split URLs without guessing subdomains', async () => {
  const requests = [];
  const service = await listen((request, response) => {
    requests.push({ url: request.url, headers: request.headers });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ success: true, data: { id: 'u1', name: 'Legacy Custom' } }));
  });
  const cwd = await mkdtemp(join(tmpdir(), 'envx-legacy-base-'));
  tempDirs.push(cwd);
  await mkdir(join(cwd, '.envx'));
  await writeFile(
    join(cwd, '.envx', 'credentials.json'),
    JSON.stringify({
      token: 'stored-token',
      apiBaseUrl: 'https://stored-api.example.test',
      dashboardUrl: 'https://stored-dashboard.example.test',
    })
  );

  const result = await runCli(cwd, ['whoami'], {
    HOME: cwd,
    ENVX_API_KEY: '',
    ENVX_BASEURL: service.baseUrl,
  });
  await service.close();

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(
    requests.map(request => request.url),
    ['/api/v1/me']
  );
  assert.equal(result.stdout.includes(service.baseUrl), true);
});

test('logout remotely revokes the current control token with an idempotency key', async () => {
  const requests = [];
  const service = await listen((request, response) => {
    requests.push({ method: request.method, url: request.url, headers: request.headers });
    request.resume();
    response.writeHead(204);
    response.end();
  });
  const cwd = await mkdtemp(join(tmpdir(), 'envx-logout-'));
  tempDirs.push(cwd);
  await mkdir(join(cwd, '.envx'));
  await writeFile(
    join(cwd, '.envx', 'credentials.json'),
    JSON.stringify({
      token: 'lpc_current_token',
      apiBaseUrl: service.baseUrl,
      dashboardUrl: 'https://dashboard.example.test',
      userId: 'user-1',
      currentOrg: 'team',
      currentOrgId: 'org-1',
      currentOrgApiBaseUrl: service.baseUrl,
      currentOrgUserId: 'user-1',
    })
  );

  const result = await runCli(cwd, ['logout'], { HOME: cwd, ENVX_API_KEY: '' });
  await service.close();

  assert.equal(result.code, 0, result.stderr);
  assert.equal(requests.length, 1);
  assert.deepEqual(
    [requests[0].method, requests[0].url],
    ['DELETE', '/api/v1/control-tokens/current']
  );
  assert.equal(requests[0].headers.authorization, 'Bearer lpc_current_token');
  assert.match(requests[0].headers['idempotency-key'], /^[0-9a-f-]{36}$/);
  const credentials = JSON.parse(await readFile(join(cwd, '.envx', 'credentials.json'), 'utf8'));
  assert.equal(credentials.token, undefined);
  assert.equal(credentials.userId, undefined);
  assert.equal(credentials.currentOrg, undefined);
  assert.equal(credentials.apiBaseUrl, service.baseUrl);
  assert.equal(credentials.dashboardUrl, 'https://dashboard.example.test');
});

test('logout retains local credentials when remote revocation fails', async () => {
  const requests = [];
  const service = await listen((request, response) => {
    requests.push({ method: request.method, url: request.url, headers: request.headers });
    request.resume();
    response.writeHead(503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ success: false, error: { message: 'temporarily unavailable' } }));
  });
  const cwd = await mkdtemp(join(tmpdir(), 'envx-logout-failure-'));
  tempDirs.push(cwd);
  const originalCredentials = {
    token: 'lpc_current_token',
    apiBaseUrl: service.baseUrl,
    dashboardUrl: 'https://dashboard.example.test',
    userId: 'user-1',
    currentOrg: 'team',
    currentOrgId: 'org-1',
    currentOrgApiBaseUrl: service.baseUrl,
    currentOrgUserId: 'user-1',
  };
  await mkdir(join(cwd, '.envx'));
  await writeFile(join(cwd, '.envx', 'credentials.json'), JSON.stringify(originalCredentials));

  const result = await runCli(cwd, ['logout'], {
    HOME: cwd,
    ENVX_API_KEY: '',
    ENVX_HTTP_MAX_RETRIES: '0',
  });
  await service.close();

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Remote logout failed; local credentials were retained/);
  assert.equal(requests.length, 1);
  assert.match(requests[0].headers['idempotency-key'], /^[0-9a-f-]{36}$/);
  const credentials = JSON.parse(await readFile(join(cwd, '.envx', 'credentials.json'), 'utf8'));
  assert.deepEqual(credentials, originalCredentials);
});

test('logout --local-only explicitly skips remote revocation', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'envx-logout-local-only-'));
  tempDirs.push(cwd);
  await mkdir(join(cwd, '.envx'));
  await writeFile(
    join(cwd, '.envx', 'credentials.json'),
    JSON.stringify({
      token: 'lpc_current_token',
      apiBaseUrl: 'http://127.0.0.1:9',
      dashboardUrl: 'https://dashboard.example.test',
      userId: 'user-1',
    })
  );

  const result = await runCli(cwd, ['logout', '--local-only'], {
    HOME: cwd,
    ENVX_API_KEY: '',
    ENVX_HTTP_TIMEOUT_MS: '20',
  });

  assert.equal(result.code, 0, result.stderr);
  const credentials = JSON.parse(await readFile(join(cwd, '.envx', 'credentials.json'), 'utf8'));
  assert.equal(credentials.token, undefined);
  assert.equal(credentials.userId, undefined);
  assert.equal(credentials.apiBaseUrl, 'http://127.0.0.1:9');
});

test('idempotent canonical PUT retries with the same precondition and idempotency key', async () => {
  const requests = [];
  const service = await listen((request, response) => {
    requests.push({ method: request.method, url: request.url, headers: request.headers });
    request.resume();
    request.on('end', () => {
      if (requests.length === 1) {
        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ success: false, error: { message: 'retry' } }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json', ETag: '"1"' });
      response.end(JSON.stringify({ success: true, data: { revision: 1 } }));
    });
  });
  const cwd = await createFixture(service.baseUrl);
  const result = await runCli(cwd, ['push', 'release'], { ENVX_HTTP_RETRY_DELAY_MS: '1' });
  await service.close();

  assert.equal(result.code, 0, result.stderr);
  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests.map(request => request.method),
    ['PUT', 'PUT']
  );
  assert.equal(requests[0].headers['idempotency-key'], requests[1].headers['idempotency-key']);
  assert.equal(requests[0].headers['if-none-match'], '*');
  assert.equal(requests[1].headers['if-none-match'], '*');
});

test('control-plane requests stop at the configured timeout', async () => {
  const service = await listen(request => {
    request.resume();
  });
  const cwd = await mkdtemp(join(tmpdir(), 'envx-timeout-'));
  tempDirs.push(cwd);
  const startedAt = Date.now();
  const result = await runCli(cwd, ['whoami'], {
    ENVX_API_BASE_URL: service.baseUrl,
    ENVX_HTTP_TIMEOUT_MS: '20',
    ENVX_HTTP_MAX_RETRIES: '0',
  });
  await service.close();

  assert.equal(result.code, 0, result.stderr);
  assert.equal(Date.now() - startedAt < 2_000, true);
  assert.match(result.stdout, /Could not reach the server/);
});
