import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { ConfigManager } from '@/utils/config';
import { saveEnvs, writeEnvs } from '@/utils/com';
import {
  parseRef,
  buildPullUrl,
} from '@/utils/url';
import { detectDefaultShell, exportEnv } from '@/utils/env';
// env file updates will be handled via writeEnvs

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

        // 使用 saveEnvs 保存到本地数据库
        console.log(chalk.blue('💾 Saving records to local database...'));

        const tagForSave = parsedUrl.tag || ref;
        const envMapToSave: Record<string, string> = {};
        for (const record of remoteRecords) {
          envMapToSave[record.key] = record.value;
        }

        await saveEnvs(configPath, envMapToSave, tagForSave);
        const savedCount = Object.keys(envMapToSave).length;

        console.log(
          chalk.green(`✅ Successfully saved ${savedCount} new records to local database`)
        );

        // 显示拉取的变量信息
        if (savedCount > 0) {
          console.log(chalk.blue('\n📋 Pulled variables:'));
          for (const [k, v] of Object.entries(envMapToSave)) {
            const tagInfo = tagForSave ? ` (tag: ${tagForSave})` : '';
            console.log(chalk.gray(`   ${k} = ${v}${tagInfo}`));
          }
        }

        // 默认加载；传入 --not-load 时不加载
        if (!options.notLoad && savedCount > 0) {
          console.log(chalk.blue('\n🔄 Loading pulled variables...'));

          const candidateVariables = Object.entries(envMapToSave).map(([key, value]) => ({
            key,
            value,
            inConfig: configManager.hasEnvVar(key),
          }));

          const variables = candidateVariables
            .filter(v => options.force || v.inConfig)
            .map(v => ({ key: v.key, value: v.value }));

          if (!options.force) {
            const skipped = candidateVariables.filter(v => !v.inConfig);
            skipped.forEach(v =>
              console.log(
                chalk.yellow(`⚠️  Skipping ${v.key} (not in config, use --force to include)`) 
              )
            );
          }

          if (options.export) {
            const shell = options.shell || detectDefaultShell();
            console.log(chalk.blue(`\n📤 Export commands for ${shell}:`));
            console.log(chalk.gray('Copy and run these commands in your shell:'));
            console.log('');

            // 使用 exportEnv 函数
            const envMap = variables.reduce<Record<string, string>>((acc, v) => {
              acc[v.key] = v.value;
              return acc;
            }, {});
            
            const exportCommands = await exportEnv(envMap);
            for (const command of exportCommands) {
              console.log(chalk.white(command));
            }

            console.log('');
            console.log(chalk.gray('Or run: eval "$(envx pull --export)"'));
          } else {
            for (const variable of variables) {
              process.env[variable.key] = variable.value;
              console.log(chalk.green(`✅ Set ${variable.key} = ${variable.value}`));
            }

            if (variables.length > 0) {
              console.log(chalk.blue('🔄 Updating environment files...'));
              const envMapForFiles: Record<string, string> = {};
              for (const v of variables) envMapForFiles[v.key] = v.value;
              try {
                await writeEnvs(configPath, envMapForFiles);
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
