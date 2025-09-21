import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { ConfigManager } from '../utils/config';
import { createDatabaseManager } from '../utils/db';
import {
  parseRef,
  buildPullUrl,
} from '../utils/url';
import { updateEnvFileWithConfig, getEnvTargetFiles } from '../utils/env';

interface PullOptions {
  verbose?: boolean;
  config?: string;
  devConfig?: string;
  key?: string;
  notLoad?: boolean;
  export?: boolean;
  shell?: string;
  force?: boolean;
}

interface RemoteEnvRecord {
  id: number;
  namespace: string;
  project: string;
  key: string;
  value: string;
  timestamp: string;
  action: string;
  source: string;
  tag?: string;
}

export function pullCommand(program: Command): void {
  program
    .command('pull <ref>')
    .description(
      'Pull env vars by tag (ref can be <tag> | <ns>/<project>:<tag> | <baseurl>/<ns>/<project>:<tag>) and update local DB'
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
    .option('-k, --key <key>', 'Pull specific environment variable by key')
    .option('--not-load', 'Do not load pulled variables into current env')
    .option('-e, --export', 'Export variables to shell (print export commands)')
    .option(
      '-s, --shell <shell>',
      'Target shell for export: sh | bash | zsh | fish | cmd | powershell'
    )
    .option('--force', 'Force pull and load even if variable not in config')
    .option('-v, --verbose', 'Verbose output')
    .action(async (ref: string, options: PullOptions = {}) => {
      try {
        const configPath = join(process.cwd(), options.config || './envx.config.yaml');
        const devConfigPath = join(process.cwd(), options.devConfig || '.envx/dev.config.yaml');

        console.log(
          chalk.blue(`📥 Pulling environment variables from remote server (ref: ${ref})...`)
        );
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

        // 构建 API URL (pull endpoint)
        const apiUrl = buildPullUrl(parsedUrl);
        console.log(chalk.gray(`🌐 Remote URL: ${apiUrl}`));

        // 构建查询参数
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const searchParams = new (globalThis as any).URLSearchParams();
        const tag = parsedUrl.tag || ref;
        searchParams.set('tag', tag);
        if (options.key) {
          searchParams.set('key', options.key);
        }

        const fullUrl = `${apiUrl}?${searchParams.toString()}`;
        console.log(chalk.gray(`🔗 Full URL: ${fullUrl}`));

        // 发送 HTTP 请求
        console.log(chalk.blue('📤 Fetching data from remote server...'));

        type MinimalResponse = {
          ok: boolean;
          status: number;
          statusText: string;
          json(): Promise<unknown>;
        };

        type MinimalRequestInit = {
          method?: string;
          headers?: Record<string, string>;
        };

        type MinimalFetch = (input: string, init?: MinimalRequestInit) => Promise<MinimalResponse>;

        const fetchFn: MinimalFetch | undefined = (
          globalThis as unknown as { fetch?: MinimalFetch }
        ).fetch;

        if (!fetchFn) {
          throw new Error('fetch is not available in this Node.js runtime. Please use Node 18+');
        }

        const response = await fetchFn(fullUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const responseData = (await response.json()) as {
          code: number;
          msg: string;
          data: RemoteEnvRecord[];
        };

        if (!response.ok) {
          console.error(chalk.red(`❌ Error: Remote server returned ${response.status}`));
          console.error(chalk.red(`Message: ${responseData.msg || 'Unknown error'}`));
          if (options.verbose && responseData.data) {
            console.error(chalk.gray('Response data:'));
            console.error(chalk.gray(JSON.stringify(responseData.data, null, 2)));
          }
          process.exit(1);
        }

        // 处理成功响应
        if (responseData.code !== 0) {
          console.error(chalk.red(`❌ Error: ${responseData.msg || 'Unknown error'}`));
          if (options.verbose && responseData.data) {
            console.error(chalk.gray('Response data:'));
            console.error(chalk.gray(JSON.stringify(responseData.data, null, 2)));
          }
          process.exit(1);
        }

        const remoteRecords = responseData.data || [];

        if (remoteRecords.length === 0) {
          console.log(chalk.yellow('📭 No environment variables found on remote server'));
          return;
        }

        console.log(
          chalk.green(`✅ Successfully pulled ${remoteRecords.length} records from remote server`)
        );

        // 获取数据库管理器
        const configDir = join(process.cwd(), options.config || './envx.config.yaml', '..');
        const dbManager = createDatabaseManager(configDir);

        try {
          // 将远程数据保存到本地数据库
          console.log(chalk.blue('💾 Saving records to local database...'));

          let savedCount = 0;
          const savedRecords: Array<{
            key: string;
            value: string;
            tag?: string;
          }> = [];

          for (const record of remoteRecords) {
            // 覆盖更新：tag 记录按 tag 覆盖；非 tag 覆盖最新版本记录
            if (record.tag) {
              dbManager.upsertTaggedValue(record.key, record.value, record.tag, 'pull');
            } else {
              dbManager.upsertLatestVersionedValue(record.key, record.value, 'pull');
            }

            savedCount++;
            savedRecords.push({
              key: record.key,
              value: record.value,
              ...(record.tag && { tag: record.tag }),
            });

            if (options.verbose) {
              console.log(chalk.green(`   ✅ Saved ${record.key}${record.tag ? ` (tag: ${record.tag})` : ''}`));
            }
          }

          console.log(
            chalk.green(`✅ Successfully saved ${savedCount} new records to local database`)
          );

          // 显示拉取的变量信息
          if (savedRecords.length > 0) {
            console.log(chalk.blue('\n📋 Pulled variables:'));
            savedRecords.forEach(record => {
              const tagInfo = record.tag ? ` (tag: ${record.tag})` : '';
              console.log(chalk.gray(`   ${record.key} = ${record.value}${tagInfo}`));
            });
          }

          // 默认加载；传入 --not-load 时不加载
          if (!options.notLoad && savedRecords.length > 0) {
            console.log(chalk.blue('\n🔄 Loading pulled variables...'));

            const config = configManager.getConfig();
            // 先构建候选变量列表
            const candidateVariables = savedRecords.map(record => ({
              key: record.key,
              value: record.value,
              inConfig: configManager.hasEnvVar(record.key),
              config: configManager.getEnvVar(record.key),
            }));

            // 与 load.ts 一致：默认仅加载配置中存在的变量；使用 --force 时不过滤
            const variables = candidateVariables
              .filter(v => options.force || v.inConfig)
              .map(v => ({ key: v.key, value: v.value, config: v.config }));

            // 提示被跳过的变量
            if (!options.force) {
              const skipped = candidateVariables.filter(v => !v.inConfig);
              skipped.forEach(v =>
                console.log(
                  chalk.yellow(`⚠️  Skipping ${v.key} (not in config, use --force to include)`) 
                )
              );
            }

            if (options.export) {
              // 导出模式：打印shell命令
              const shell = options.shell || detectDefaultShell();
              console.log(chalk.blue(`\n📤 Export commands for ${shell}:`));
              console.log(chalk.gray('Copy and run these commands in your shell:'));
              console.log('');

              variables.forEach(variable => {
                const exportCmd = generateExportCommand(variable.key, variable.value, shell);
                console.log(chalk.white(exportCmd));
              });

              console.log('');
              console.log(chalk.gray('Or run: eval "$(envx pull --export)"'));
            } else {
              // 设置到当前进程环境
              variables.forEach(variable => {
                process.env[variable.key] = variable.value;
                console.log(chalk.green(`✅ Set ${variable.key} = ${variable.value}`));
              });

              // 如果配置中有 clone 路径，更新对应的环境变量文件
              if (configManager.getConfigOption('files')) {
                console.log(chalk.blue('🔄 Updating environment files...'));
                try {
                  for (const variable of variables) {
                    const targetPath =
                      getEnvTargetFiles(variable.key, config) ||
                      configManager.getConfigOption('files');

                    if (targetPath && typeof targetPath === 'string') {
                      await updateEnvFileWithConfig(
                        targetPath,
                        { [variable.key]: variable.value },
                        config,
                        options.force
                      );
                    } else if (targetPath && Array.isArray(targetPath)) {
                      for (const path of targetPath) {
                        await updateEnvFileWithConfig(
                          path,
                          { [variable.key]: variable.value },
                          config,
                          options.force
                        );
                      }
                    }
                  }
                  console.log(chalk.green('✅ Environment files updated successfully'));
                } catch (error) {
                  console.warn(
                    chalk.yellow(
                      `⚠️  Warning: Failed to update environment files: ${error instanceof Error ? error.message : String(error)}`
                    )
                  );
                }
              }

              console.log(chalk.blue('\n🎉 Environment variables loaded successfully!'));
            }
          }

          // 显示总结
          console.log(chalk.blue('\n📋 Summary:'));
          console.log(chalk.gray(`   Namespace: ${parsedUrl.namespace}`));
          console.log(chalk.gray(`   Project: ${parsedUrl.project}`));
          console.log(chalk.gray(`   Records pulled: ${remoteRecords.length}`));
          console.log(chalk.gray(`   New records saved: ${savedCount}`));
          console.log(chalk.gray(`   Remote URL: ${apiUrl}`));

          console.log(chalk.gray(`   Auto-load: ${!options.notLoad ? 'enabled' : 'disabled'}`));
        } finally {
          dbManager.close();
        }
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

/**
 * 检测默认shell
 */
function detectDefaultShell(): string {
  const shell = process.env.SHELL || process.env.COMSPEC || 'sh';

  if (shell.includes('bash')) return 'bash';
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('fish')) return 'fish';
  if (shell.includes('cmd')) return 'cmd';
  if (shell.includes('powershell')) return 'powershell';

  return 'sh';
}

/**
 * 生成shell导出命令
 */
function generateExportCommand(key: string, value: string, shell: string): string {
  const escapedValue = value.replace(/"/g, '\\"');

  switch (shell) {
    case 'bash':
    case 'sh':
    case 'zsh':
      return `export ${key}="${escapedValue}"`;

    case 'fish':
      return `set -gx ${key} "${escapedValue}"`;

    case 'cmd':
      return `set ${key}=${value}`;

    case 'powershell':
      return `$env:${key} = "${escapedValue}"`;

    default:
      return `export ${key}="${escapedValue}"`;
  }
}
