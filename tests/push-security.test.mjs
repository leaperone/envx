import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, test } from 'node:test';
import Database from 'better-sqlite3';

const CLI_PATH = resolve('dist/index.js');
const SECRET = 'phase-minus-one-secret-value';
const SECOND_SECRET = 'postgresql://user:password@db.internal/app';
const tempDirs = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function createFixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'envx-push-security-'));
  tempDirs.push(cwd);
  await mkdir(join(cwd, '.envx'), { recursive: true });
  await writeFile(
    join(cwd, 'envx.config.yaml'),
    [
      'version: 1',
      'export: false',
      'files: ./.env',
      'env:',
      '  API_SECRET: {}',
      '  DATABASE_URL: {}',
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
  `);
  const insert = db.prepare(
    'INSERT INTO env_history (key, value, timestamp, tag) VALUES (?, ?, ?, ?)'
  );
  insert.run('API_SECRET', SECRET, new Date().toISOString(), 'release');
  insert.run('DATABASE_URL', SECOND_SECRET, new Date().toISOString(), 'release');
  db.close();

  return cwd;
}

async function runPush({ verbose = false, status = 200, responseBody }) {
  const cwd = await createFixture();
  let receivedBody = '';
  const server = createServer((request, response) => {
    request.setEncoding('utf8');
    request.on('data', chunk => {
      receivedBody += chunk;
    });
    request.on('end', () => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(responseBody));
    });
  });

  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  assert(address && typeof address === 'object');
  const ref = `http://127.0.0.1:${address.port}/team/project:release`;
  const args = [CLI_PATH, 'push', ref];
  if (verbose) args.push('--verbose');

  const result = await new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: {
        ...process.env,
        HOME: cwd,
        ENVX_API_KEY: 'test-auth-token',
        ENVX_HTTP_MAX_RETRIES: '0',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
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

  await new Promise(resolveClose => server.close(resolveClose));
  const request = JSON.parse(receivedBody);
  assert.equal(request.items[0].value, SECRET);
  assert.equal(request.items[1].value, SECOND_SECRET);
  return result;
}

function assertNoSecrets(output) {
  assert.equal(output.includes(SECRET), false, 'output leaked API_SECRET');
  assert.equal(output.includes(SECOND_SECRET), false, 'output leaked DATABASE_URL');
}

test('normal push output does not expose values', async () => {
  const result = await runPush({
    responseBody: {
      success: true,
      data: [
        { key: 'API_SECRET', value: SECRET },
        { key: 'DATABASE_URL', value: SECOND_SECRET },
      ],
    },
  });

  assert.equal(result.code, 0);
  const output = result.stdout + result.stderr;
  assertNoSecrets(output);
  assert.match(output, /Variables pushed: 2/);
  assert.doesNotMatch(output, /Response data summary/);
});

test('verbose push prints only key and length metadata', async () => {
  const result = await runPush({
    verbose: true,
    responseBody: {
      success: true,
      data: [
        { key: 'API_SECRET', value: SECRET },
        { key: 'DATABASE_URL', value: SECOND_SECRET },
        { key: SECRET, value: SECOND_SECRET },
      ],
    },
  });

  assert.equal(result.code, 0);
  const output = result.stdout + result.stderr;
  assertNoSecrets(output);
  assert.match(output, /Payload summary:/);
  assert.match(output, /Response data summary:/);
  assert.match(output, /API_SECRET: length=28/);
  assert.match(output, /\[REDACTED\]: length=42/);
  assert.doesNotMatch(output, /sha256=/);
});

test('verbose HTTP errors redact messages and summarize response data', async () => {
  const result = await runPush({
    verbose: true,
    status: 500,
    responseBody: {
      code: 1,
      msg: `upstream rejected ${SECRET}`,
      data: [{ key: 'API_SECRET', value: SECRET }],
    },
  });

  assert.equal(result.code, 1);
  const output = result.stdout + result.stderr;
  assertNoSecrets(output);
  assert.match(output, /Message: upstream rejected \[REDACTED\]/);
  assert.match(output, /Response data summary:/);
  assert.match(output, /API_SECRET: length=28/);
});

test('application-level errors redact values without dumping response JSON', async () => {
  const result = await runPush({
    verbose: true,
    responseBody: {
      code: 1,
      msg: `validation failed for ${SECOND_SECRET}`,
      data: {
        value: SECOND_SECRET,
        nested: { value: SECRET },
      },
    },
  });

  assert.equal(result.code, 1);
  const output = result.stdout + result.stderr;
  assertNoSecrets(output);
  assert.match(output, /Error: validation failed for \[REDACTED\]/);
  assert.match(output, /Fields: value, nested/);
  assert.doesNotMatch(output, /"value"/);
});
