import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { ConfigManager } from '../utils/config';
import { createDatabaseManager } from '../utils/db';
import { parseRef, buildPushUrl } from '../utils/url';

interface PushOptions {
  verbose?: boolean;
  config?: string;
  devConfig?: string;
}

export function pushCommand(program: Command): void {
  program
    .command('push <ref>')
    .description('Push environment variables to remote server (ref can be <tag> | <ns>/<project>:<tag> | <baseurl>/<ns>/<project>:<tag>)')
    .option('-c, --config <path>', 'Path to config file (default: ./envx.config.yaml)', './envx.config.yaml')
    .option('-d, --dev-config <path>', 'Path to dev config file (default: .envx/dev.config.yaml)', '.envx/dev.config.yaml')
    .option('-v, --verbose', 'Verbose output')
    .action(async (ref: string, options: PushOptions = {}) => {
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

        // 获取数据库管理器
        const configDir = join(process.cwd(), (options.config || './envx.config.yaml'), '..');
        const dbManager = createDatabaseManager(configDir);

        // 验证标签是否存在
        const allTags = dbManager.getAllTags();
        if (!allTags.includes(tag)) {
          console.error(chalk.red(`❌ Error: Tag "${tag}" not found`));
          console.log(chalk.yellow('Available tags:'));
          allTags.forEach(t => console.log(chalk.gray(`  - ${t}`)));
          dbManager.close();
          process.exit(1);
        }

        // 获取标签下的环境变量
        const tagStats = dbManager.getTagStats(tag);
        if (tagStats.variables.length === 0) {
          console.warn(chalk.yellow(`⚠️  Warning: No variables found for tag "${tag}"`));
          dbManager.close();
          return;
        }

        console.log(chalk.blue(`📋 Found ${tagStats.variables.length} variables for tag "${tag}"`));

        // 准备推送数据
        const items = tagStats.variables.map(variable => ({
          key: variable.key,
          value: variable.value
        }));

        // 获取当前时间戳
        const timestamp = new Date().toISOString();
        
        // 构建无版本号的 payload（服务端不再需要 version）
        const payload = {
          tag,
          timestamp,
          items
        };

        if (options.verbose) {
          console.log(chalk.gray('\n📤 Payload:'));
          console.log(chalk.gray(JSON.stringify(payload, null, 2)));
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

        const fetchFn: MinimalFetch | undefined = (globalThis as unknown as { fetch?: MinimalFetch })
          .fetch;

        if (!fetchFn) {
          throw new Error('fetch is not available in this Node.js runtime. Please use Node 18+');
        }
        
        const response = await fetchFn(remoteUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        });

        const responseData = await response.json() as {
          code: number;
          msg: string;
          data: unknown;
        };

        if (!response.ok) {
          console.error(chalk.red(`❌ Error: Remote server returned ${response.status}`));
          console.error(chalk.red(`Message: ${responseData.msg || 'Unknown error'}`));
          if (options.verbose && responseData.data) {
            console.error(chalk.gray('Response data:'));
            console.error(chalk.gray(JSON.stringify(responseData.data, null, 2)));
          }
          dbManager.close();
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
            console.log(chalk.blue('\n📝 Response data:'));
            (responseData.data as Array<{ key: string; value: string; version: number }>).forEach((item) => {
              console.log(chalk.gray(`   ${item.key} = ${item.value} (v${item.version})`));
            });
          }
        } else {
          console.error(chalk.red(`❌ Error: ${responseData.msg || 'Unknown error'}`));
          if (options.verbose && responseData.data) {
            console.error(chalk.gray('Response data:'));
            console.error(chalk.gray(JSON.stringify(responseData.data, null, 2)));
          }
          dbManager.close();
          process.exit(1);
        }

        dbManager.close();

      } catch (error) {
        console.error(
          chalk.red(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
        if (options.verbose) {
          console.error(chalk.gray('Stack trace:'));
          console.error(chalk.gray(error instanceof Error ? error.stack : String(error)));
        }
        process.exit(1);
      }
    });
}
