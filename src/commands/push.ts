import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { ConfigManager } from '@/utils/config';
import { getEnvs } from '@/utils/com';
import { parseRef, buildPushUrl } from '@/utils/url';
import { getCredential } from '@/utils/credentials';

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
          baseUrl: devConfigResult.config.baseUrl,
          namespace: devConfigResult.config.namespace,
          project: devConfigResult.config.project,
        });

        // 构建完整的 API URL
        const remoteUrl = buildPushUrl(parsedUrl);

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
        const payload = {
          tag,
          timestamp,
          items,
        };

        if (options.verbose) {
          console.log(chalk.gray('\n📤 Payload summary:'));
          console.log(chalk.gray(`   Tag: ${tag}`));
          console.log(chalk.gray(`   Timestamp: ${timestamp}`));
          console.log(chalk.gray(`   Variables: ${items.length}`));
          for (const item of items) {
            console.log(chalk.gray(`   ${safeKey(item.key)}: ${valueMetadata(item.value)}`));
          }
        }

        // 发送 HTTP 请求
        console.log(chalk.blue('📤 Sending data to remote server...'));

        type MinimalResponse = {
          ok: boolean;
          status: number;
          statusText: string;
          json(): Promise<unknown>;
        };

        type MinimalRequestInit = {
          method?: string;
          headers?: Record<string, string>;
          body?: string;
        };

        type MinimalFetch = (input: string, init?: MinimalRequestInit) => Promise<MinimalResponse>;

        const fetchFn: MinimalFetch | undefined = (
          globalThis as unknown as { fetch?: MinimalFetch }
        ).fetch;

        if (!fetchFn) {
          throw new Error('fetch is not available in this Node.js runtime. Please use Node 18+');
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        const apiKey = devConfigResult.config.apiKey || process.env.ENVX_API_KEY || getCredential();
        if (!apiKey) {
          console.error(
            chalk.red('❌ Not authenticated. Run `envx login` first, or set ENVX_API_KEY.')
          );
          process.exit(1);
        }
        headers['Authorization'] = `Bearer ${apiKey}`;

        const response = await fetchFn(remoteUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        const responseData = (await response.json()) as {
          code: number;
          msg: string;
          data: unknown;
        };

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
          } else {
            console.error(chalk.red(`❌ Error: Remote server returned ${response.status}`));
            const message =
              typeof responseData.msg === 'string' ? responseData.msg : 'Unknown error';
            console.error(chalk.red(`Message: ${redactKnownValues(message, items)}`));
          }
          if (options.verbose && responseData.data) {
            printSafeDataSummary(responseData.data, items, true);
          }
          process.exit(1);
        }

        // 处理成功响应
        if (responseData.code === 0) {
          console.log(chalk.green('✅ Successfully pushed to remote server'));
          console.log(chalk.blue('\n📋 Summary:'));
          console.log(chalk.gray(`   Tag: ${tag}`));
          console.log(chalk.gray(`   Namespace: ${parsedUrl.namespace}`));
          console.log(chalk.gray(`   Project: ${parsedUrl.project}`));
          // 不再显示 Version
          console.log(chalk.gray(`   Variables pushed: ${items.length}`));
          console.log(chalk.gray(`   Remote URL: ${remoteUrl}`));

          if (options.verbose && responseData.data && Array.isArray(responseData.data)) {
            console.log(chalk.blue('\n📝 Remote response:'));
            printSafeDataSummary(responseData.data, items);
          }
        } else {
          const message = typeof responseData.msg === 'string' ? responseData.msg : 'Unknown error';
          console.error(chalk.red(`❌ Error: ${redactKnownValues(message, items)}`));
          if (options.verbose && responseData.data) {
            printSafeDataSummary(responseData.data, items, true);
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
