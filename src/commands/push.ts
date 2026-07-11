import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { ConfigManager } from '@/utils/config';
import { getEnvs } from '@/utils/com';
import { parseRef, buildLegacyPushUrl, buildPushUrl } from '@/utils/url';
import {
  getCredential,
  getCurrentOrgContext,
  resolveApiBaseUrl,
  setCurrentOrg,
} from '@/utils/credentials';
import { createDatabaseManagerFromConfigPath } from '@/utils/db';
import {
  controlPlaneHeaders,
  createIdempotencyKey,
  etagFromResponse,
  fetchControlPlaneUserId,
  fetchWithLegacyFallback,
  responseErrorMessage,
} from '@/utils/http';

interface PushOptions {
  verbose?: boolean;
  config?: string;
  devConfig?: string;
}

interface PushItem {
  key: string;
  value: string;
}

function safeKey(value: unknown): string {
  return String(value ?? '(unknown)')
    .replace(/[\r\n\t]/g, ' ')
    .slice(0, 120);
}

function valueMetadata(value: string): string {
  return `length=${Buffer.byteLength(value, 'utf8')}`;
}

function redactKnownValues(input: string, items: PushItem[]): string {
  const values = [...new Set(items.map(item => item.value).filter(value => value.length > 0))].sort(
    (a, b) => b.length - a.length
  );

  return values.reduce((redacted, value) => redacted.split(value).join('[REDACTED]'), input);
}

function responseDataSummary(data: unknown, items: PushItem[]): string[] {
  if (data === null || data === undefined) return ['   Data: none'];

  if (Array.isArray(data)) {
    const lines = [`   Items: ${data.length}`];
    for (const entry of data) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      if (!('key' in record)) continue;

      const key = redactKnownValues(safeKey(record.key), items);
      if (typeof record.value === 'string') {
        lines.push(`   ${key}: ${valueMetadata(record.value)}`);
      } else {
        lines.push(`   ${key}`);
      }
    }
    return lines;
  }

  if (typeof data === 'object') {
    const fields = Object.keys(data as Record<string, unknown>)
      .map(safeKey)
      .map(field => redactKnownValues(field, items));
    return [`   Type: object`, `   Fields: ${fields.length > 0 ? fields.join(', ') : '(none)'}`];
  }

  if (typeof data === 'string') {
    return [`   Type: string, ${valueMetadata(data)}`];
  }

  return [`   Type: ${typeof data}`];
}

function printSafeDataSummary(data: unknown, items: PushItem[], useError = false): void {
  const write = useError ? console.error : console.log;
  write(chalk.gray('Response data summary:'));
  for (const line of responseDataSummary(data, items)) {
    write(chalk.gray(line));
  }
}

function responseSucceeded(body: unknown, legacy: boolean): boolean {
  if (!body || typeof body !== 'object') return false;
  const record = body as Record<string, unknown>;
  return legacy ? record.code === 0 : record.success === true;
}

function responseData(body: unknown): unknown {
  return body && typeof body === 'object' ? (body as Record<string, unknown>).data : null;
}

async function resolveCurrentOrganizationId(
  apiBaseUrl: string,
  token: string
): Promise<string | undefined> {
  const context = getCurrentOrgContext();
  if (!context) return undefined;
  if (!context.apiBaseUrl || context.apiBaseUrl !== apiBaseUrl || !context.userId) {
    setCurrentOrg(undefined);
    return undefined;
  }
  const currentUserId = await fetchControlPlaneUserId(apiBaseUrl, token);
  if (currentUserId !== context.userId) {
    setCurrentOrg(undefined);
    return undefined;
  }

  const encodedSlug = encodeURIComponent(context.slug);
  const { response } = await fetchWithLegacyFallback(
    {
      canonicalUrl: new URL(`/api/v1/organizations/${encodedSlug}`, apiBaseUrl).toString(),
      legacyUrl: new URL(`/api/v1/cli/orgs/${encodedSlug}`, apiBaseUrl).toString(),
    },
    { method: 'GET', headers: controlPlaneHeaders(token, { Accept: 'application/json' }) }
  );
  const body: unknown = await response.json().catch(() => null);
  const data = responseData(body);
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  if (!response.ok || typeof record?.id !== 'string' || typeof record.slug !== 'string') {
    if (response.status === 403 || response.status === 404) {
      setCurrentOrg(undefined);
      return undefined;
    }
    throw new Error(
      responseErrorMessage(
        body,
        `Current organization "${context.slug}" could not be resolved (HTTP ${response.status})`
      )
    );
  }
  setCurrentOrg(record.slug, record.id, { apiBaseUrl, userId: currentUserId });
  return record.id;
}

export function pushCommand(program: Command): void {
  program
    .command('push <ref>')
    .description(
      'Push environment variables to remote server (ref can be <tag> | <ns>/<project>:<tag> | <baseurl>/<ns>/<project>:<tag>)'
    )
    .option(
      '-c, --config <path>',
      'Path to config file (default: ./envx.config.yaml)',
      './envx.config.yaml'
    )
    .option(
      '-d, --dev-config <path>',
      'Path to dev config file (default: .envx/dev.config.yaml)',
      '.envx/dev.config.yaml'
    )
    .option('-v, --verbose', 'Verbose output')
    .action(async (ref: string, options: PushOptions = {}) => {
      let pushedItems: PushItem[] = [];
      try {
        const configPath = join(process.cwd(), options.config || './envx.config.yaml');
        const devConfigPath = join(process.cwd(), options.devConfig || '.envx/dev.config.yaml');

        console.log(chalk.blue(`🚀 Pushing ref: ${ref}`));
        console.log(chalk.gray(`📁 Config file: ${options.config}`));
        console.log(chalk.gray(`📁 Dev config file: ${options.devConfig}`));

        // 检查配置文件是否存在
        if (!existsSync(configPath)) {
          console.error(chalk.red(`❌ Error: Config file not found at ${options.config}`));
          console.log(chalk.yellow('💡 Tip: Run "envx init" to create a configuration file'));
          process.exit(1);
        }

        // 加载配置
        const configManager = new ConfigManager(configPath);
        const devConfigResult = configManager.getDevConfig(devConfigPath);

        // 解析远程服务器 URL 和参数
        const parsedUrl = parseRef(ref, {
          apiBaseUrl: resolveApiBaseUrl(
            devConfigResult.config.apiBaseUrl,
            devConfigResult.config.baseUrl
          ),
          namespace: devConfigResult.config.namespace,
          project: devConfigResult.config.project,
        });

        // 构建完整的 API URL
        const remoteUrl = buildPushUrl(parsedUrl);
        const legacyRemoteUrl = buildLegacyPushUrl(parsedUrl);

        console.log(chalk.gray(`🌐 Remote URL: ${remoteUrl}`));

        // 解析 tag
        const tag = parsedUrl.tag || ref;

        // 使用 getEnvs 读取指定 tag 的变量
        const envMap = await getEnvs(configPath, tag);

        const entries = Object.entries(envMap);
        if (entries.length === 0) {
          console.warn(chalk.yellow(`⚠️  Warning: No variables found for tag "${tag}"`));
          return;
        }

        console.log(chalk.blue(`📋 Found ${entries.length} variables for tag "${tag}"`));

        // 准备推送数据
        const items: PushItem[] = entries.map(([key, value]) => ({ key, value }));
        pushedItems = items;

        // 获取当前时间戳
        const timestamp = new Date().toISOString();

        // 构建无版本号的 payload（服务端不再需要 version）
        const apiKey = devConfigResult.config.apiKey || process.env.ENVX_API_KEY || getCredential();
        if (!apiKey) {
          console.error(
            chalk.red('❌ Not authenticated. Run `envx login` first, or set ENVX_API_KEY.')
          );
          process.exit(1);
        }
        const organizationId = await resolveCurrentOrganizationId(parsedUrl.baseUrl, apiKey);
        const payload = {
          tag,
          timestamp,
          items,
          ...(organizationId ? { organizationId } : {}),
        };

        if (options.verbose) {
          console.log(chalk.gray('\n📤 Payload summary:'));
          console.log(chalk.gray(`   Tag: ${tag}`));
          console.log(chalk.gray(`   Timestamp: ${timestamp}`));
          console.log(chalk.gray(`   Variables: ${items.length}`));
          for (const item of items) {
            const key = redactKnownValues(safeKey(item.key), items);
            console.log(chalk.gray(`   ${key}: ${valueMetadata(item.value)}`));
          }
        }

        // 发送 HTTP 请求
        console.log(chalk.blue('📤 Sending data to remote server...'));

        const db = createDatabaseManagerFromConfigPath(configPath);
        let state: ReturnType<typeof db.getRemoteState>;
        try {
          state = db.getRemoteState(parsedUrl.baseUrl, parsedUrl.namespace, parsedUrl.project);
        } finally {
          db.close();
        }
        const conditionalHeader = state ? { 'If-Match': state.etag } : { 'If-None-Match': '*' };
        const idempotencyKey = createIdempotencyKey();
        const headers = controlPlaneHeaders(apiKey, {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': idempotencyKey,
          ...conditionalHeader,
        });
        const legacyHeaders = controlPlaneHeaders(apiKey, {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': idempotencyKey,
        });

        const { response, legacy } = await fetchWithLegacyFallback(
          {
            canonicalUrl: remoteUrl,
            legacyUrl: legacyRemoteUrl,
          },
          {
            method: 'PUT',
            legacyMethod: 'POST',
            headers,
            legacyHeaders,
            body: JSON.stringify(payload),
          }
        );

        const responseBody: unknown = await response.json().catch(() => null);
        const returnedData = responseData(responseBody);

        if (!response.ok) {
          if (response.status === 401) {
            console.error(
              chalk.red('❌ Authentication failed. Run `envx login` to re-authenticate.')
            );
          } else if (response.status === 403) {
            console.error(
              chalk.red(
                `❌ Permission denied: You don't have access to namespace "${parsedUrl.namespace}".`
              )
            );
            console.error(
              chalk.yellow(
                '💡 Tip: Check that you have push permission, or ask the namespace owner to grant access.'
              )
            );
            console.error(chalk.yellow('💡 Tip: Use `envx org list` to see your organizations.'));
          } else if (response.status === 412) {
            console.error(
              chalk.red(
                '❌ Remote revision changed. Run `envx pull`, merge the changes, then retry.'
              )
            );
          } else if (response.status === 409) {
            console.error(
              chalk.red(
                '❌ Namespace ownership conflict. Verify the selected user or organization before retrying.'
              )
            );
          } else {
            console.error(chalk.red(`❌ Error: Remote server returned ${response.status}`));
            const message = responseErrorMessage(
              responseBody,
              response.statusText || 'Unknown error'
            );
            console.error(chalk.red(`Message: ${redactKnownValues(message, items)}`));
          }
          if (options.verbose && returnedData) {
            printSafeDataSummary(returnedData, items, true);
          }
          process.exit(1);
        }

        // 处理成功响应
        if (responseSucceeded(responseBody, legacy)) {
          const etag = etagFromResponse(response, responseBody);
          if (etag) {
            const stateDb = createDatabaseManagerFromConfigPath(configPath);
            try {
              stateDb.saveRemoteState(
                parsedUrl.baseUrl,
                parsedUrl.namespace,
                parsedUrl.project,
                etag
              );
            } finally {
              stateDb.close();
            }
          }
          console.log(chalk.green('✅ Successfully pushed to remote server'));
          console.log(chalk.blue('\n📋 Summary:'));
          console.log(chalk.gray(`   Tag: ${tag}`));
          console.log(chalk.gray(`   Namespace: ${parsedUrl.namespace}`));
          console.log(chalk.gray(`   Project: ${parsedUrl.project}`));
          // 不再显示 Version
          console.log(chalk.gray(`   Variables pushed: ${items.length}`));
          console.log(chalk.gray(`   Remote URL: ${remoteUrl}`));
          console.log(
            chalk.gray(`   API contract: ${legacy ? 'legacy compatibility' : 'canonical'}`)
          );
          if (etag) console.log(chalk.gray(`   Revision: ${etag}`));

          if (options.verbose && returnedData) {
            console.log(chalk.blue('\n📝 Remote response:'));
            printSafeDataSummary(returnedData, items);
          }
        } else {
          const message = responseErrorMessage(responseBody, 'Unknown error');
          console.error(chalk.red(`❌ Error: ${redactKnownValues(message, items)}`));
          if (options.verbose && returnedData) {
            printSafeDataSummary(returnedData, items, true);
          }
          process.exit(1);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(chalk.red(`❌ Error: ${redactKnownValues(message, pushedItems)}`));
        if (options.verbose) {
          console.error(chalk.gray('Stack trace:'));
          const stack = error instanceof Error ? (error.stack ?? error.message) : String(error);
          console.error(chalk.gray(redactKnownValues(stack, pushedItems)));
        }
        process.exit(1);
      }
    });
}
