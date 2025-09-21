import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { ConfigManager } from '../utils/config';
import { createDatabaseManager, EnvHistoryRecord } from '../utils/db';
import { EnvConfig } from '../types/config';
import { updateEnvFileWithConfig, isEnvRequired, getEnvTargetFiles } from '../utils/env';

interface LoadOptions {
  config?: string;
  key?: string;
  tag?: string;
  all?: boolean;
  export?: boolean;
  shell?: string;
  force?: boolean;
}

export function loadCommand(program: Command): void {
  program
    .command('load')
    .description('Load environment variables from database based on envx.config.yaml configuration')
    .option(
      '-c, --config <path>',
      'Path to config file (default: ./envx.config.yaml)',
      './envx.config.yaml'
    )
    .option('-k, --key <key>', 'Load specific environment variable by key')
    .option('-t, --tag <tag>', 'Load all environment variables from a specific tag')
    .option('-a, --all', 'Load all environment variables defined in config')
    .option('-e, --export', 'Export variables to shell (print export commands)')
    .option(
      '-s, --shell <shell>',
      'Target shell for export: sh | bash | zsh | fish | cmd | powershell'
    )
    .option('--force', 'Force load from database even if variable not in config')
    .action(async (options: LoadOptions) => {
      try {
        const configPath = join(process.cwd(), options.config || './envx.config.yaml');
        const configDir = join(process.cwd(), options.config || './envx.config.yaml', '..');

        console.log(chalk.blue('📥 Loading environment variables from database...'));
        console.log(chalk.gray(`📁 Config file: ${options.config || './envx.config.yaml'}`));

        // 检查配置文件是否存在
        if (!existsSync(configPath)) {
          console.error(
            chalk.red(
              `❌ Error: Config file not found at ${options.config || './envx.config.yaml'}`
            )
          );
          console.log(chalk.yellow('💡 Tip: Run "envx init" to create a configuration file'));
          process.exit(1);
        }

        // 检查数据库是否存在
        const dbPath = join(configDir, '.envx', 'envx.db');
        if (!existsSync(dbPath)) {
          console.error(chalk.red(`❌ Error: Database not found at ${dbPath}`));
          console.log(chalk.yellow('💡 Tip: Run "envx init" to initialize the database'));
          process.exit(1);
        }

        // 加载配置文件
        const configManager = new ConfigManager(configPath);
        const config = configManager.getConfig();

        // 连接数据库
        const dbManager = createDatabaseManager(configDir);

        try {
          let variables: Array<{
            key: string;
            value: string;
            config?: EnvConfig | string | undefined;
          }> = [];

          if (options.key) {
            // 加载特定key的变量
            console.log(chalk.gray(`🔍 Loading variable: ${options.key}`));

            // 检查配置文件中是否存在该key
            const envConfig = configManager.getEnvVar(options.key);
            if (!envConfig && !options.force) {
              console.error(
                chalk.red(
                  `❌ Error: Environment variable "${options.key}" not found in configuration`
                )
              );
              console.log(
                chalk.yellow('💡 Tip: Use --force to load from database even if not in config')
              );
              process.exit(1);
            }

            // 加载最新记录
            const latestRecord = dbManager.getLatestVersion(options.key);

            if (!latestRecord) {
              console.error(chalk.red(`❌ Error: No records found for key "${options.key}"`));
              process.exit(1);
            }

            variables = [
              {
                key: latestRecord.key,
                value: latestRecord.value,
                config: envConfig,
              },
            ];

            console.log(chalk.green(`✅ Found latest record of "${options.key}"`));
          } else if (options.tag) {
            // 加载特定标签的所有变量
            console.log(chalk.gray(`🔍 Loading all environment variables from tag: ${options.tag}`));

            const tagRecords = dbManager.getHistoryByTag(options.tag);
            if (tagRecords.length === 0) {
              console.error(chalk.red(`❌ Error: No records found for tag "${options.tag}"`));
              process.exit(1);
            }

            console.log(chalk.gray(`📋 Found ${tagRecords.length} records for tag "${options.tag}"`));

            // 按key分组，只取每个key的最新记录
            const latestByKey = new Map<string, EnvHistoryRecord>();
            tagRecords.forEach(record => {
              const existing = latestByKey.get(record.key);
              if (!existing || new Date(record.timestamp) > new Date(existing.timestamp)) {
                latestByKey.set(record.key, record);
              }
            });

            for (const [key, record] of latestByKey) {
              const envConfig = configManager.getEnvVar(key);
              
              // 检查配置文件中是否存在该key（除非使用--force）
              if (!envConfig && !options.force) {
                console.log(chalk.yellow(`⚠️  Skipping ${key} (not in config, use --force to include)`));
                continue;
              }

              variables.push({
                key: record.key,
                value: record.value,
                config: envConfig,
              });
              console.log(chalk.green(`✅ Loaded ${key} from tag "${options.tag}"`));
            }

            console.log(
              chalk.green(`✅ Successfully loaded ${variables.length} environment variables from tag "${options.tag}"`)
            );
          } else if (options.all) {
            // 加载配置文件中定义的所有变量
            console.log(chalk.gray('🔍 Loading all environment variables from config...'));

            const configKeys = Object.keys(configManager.getAllEnvConfigs());
            if (configKeys.length === 0) {
              console.log(chalk.yellow('📭 No environment variables defined in configuration'));
              return;
            }

            console.log(chalk.gray(`📋 Found ${configKeys.length} variables in config`));

            for (const key of configKeys) {
              const envConfig = configManager.getEnvVar(key);
              const latestRecord = dbManager.getLatestVersion(key);

              if (latestRecord) {
                variables.push({
                  key: latestRecord.key,
                  value: latestRecord.value,
                  config: envConfig,
                });
                console.log(chalk.green(`✅ Loaded ${key}`));
              } else {
                console.log(chalk.yellow(`⚠️  No database record found for ${key}`));
              }
            }

            console.log(
              chalk.green(`✅ Successfully loaded ${variables.length} environment variables`)
            );
          } else {
            console.error(chalk.red('❌ Error: Please specify either --key <key>, --tag <tag>, or --all'));
            console.log(
              chalk.yellow(
                '💡 Tip: Use --key to load a specific variable, --tag to load from a tag, or --all to load all variables from config'
              )
            );
            process.exit(1);
          }

          if (variables.length === 0) {
            console.log(chalk.yellow('📭 No variables found to load'));
            return;
          }

          // 显示要加载的变量信息
          console.log(chalk.blue('\n📋 Variables to load:'));
          variables.forEach(variable => {
            const configInfo = variable.config
              ? typeof variable.config === 'string'
                ? `target: ${variable.config}`
                : variable.config.target
                  ? `target: ${variable.config.target}`
                  : 'default'
              : 'no config';
            console.log(
              chalk.gray(
                `   ${variable.key} = ${variable.value} (${configInfo})`
              )
            );
          });

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
            console.log(chalk.gray('Or run: eval "$(envx load --all --export)"'));
          } else {
            // 根据配置文件的设置来应用环境变量
            console.log(chalk.blue('\n🔧 Applying environment variables...'));

            // 检查配置文件的全局设置
            const shouldExport = configManager.getConfigOption('export') === true;
            const clonePath = configManager.getConfigOption('files');

            if (shouldExport || clonePath) {
              console.log(chalk.gray('📋 Configuration settings:'));
              if (shouldExport) {
                console.log(chalk.gray('   Export: enabled'));
              }
              if (clonePath) {
                console.log(chalk.gray(`   Clone path: ${clonePath}`));
              }
            }

            // 设置到当前进程环境
            variables.forEach(variable => {
              process.env[variable.key] = variable.value;
              console.log(chalk.green(`✅ Set ${variable.key} = ${variable.value}`));
            });

            // 如果配置中有 clone 路径，更新对应的环境变量文件
            if (configManager.getConfigOption('files')) {
              console.log(
                chalk.blue('🔄 Updating environment file based on clone configuration...')
              );
              try {
                // 为每个变量更新对应的环境文件
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

                  console.log(chalk.blue(`   📁 Updated ${targetPath} with ${variable.key}`));
                }
                console.log(chalk.green(`✅ Environment files updated successfully`));
              } catch (error) {
                console.warn(
                  chalk.yellow(
                    `⚠️  Warning: Failed to update environment files: ${error instanceof Error ? error.message : String(error)}`
                  )
                );
              }
            }

            console.log(chalk.blue('\n🎉 Environment variables loaded successfully!'));

            // 显示详细信息
            console.log(chalk.blue('\n📋 Summary:'));
            console.log(chalk.gray(`   Variables loaded: ${variables.length}`));

            variables.forEach(variable => {
              console.log(
                chalk.gray(`   ${variable.key} = ${variable.value}`)
              );

              // 显示配置相关信息
              if (isEnvRequired(variable.key, configManager.getConfig())) {
                console.log(chalk.yellow(`     Required: Yes`));
              }

              if (
                variable.config &&
                typeof variable.config === 'object' &&
                variable.config.target
              ) {
                console.log(chalk.blue(`     Target: ${variable.config.target}`));
              }
            });

            if (configManager.getConfigOption('files')) {
              console.log(chalk.blue(`   Clone source: ${configManager.getConfigOption('files')}`));
            }

            if (configManager.getConfigOption('export') !== undefined) {
              console.log(
                chalk.blue(
                  `   Export mode: ${configManager.getConfigOption('export') ? 'enabled' : 'disabled'}`
                )
              );
            }

            console.log(chalk.gray(`   Config file: ${options.config || './envx.config.yaml'}`));
            console.log(chalk.gray(`   Database records loaded`));

            if (shouldExport) {
              console.log(
                chalk.gray(
                  '\nNote: Variables are set in current process. Use --export for persistent shell variables.'
                )
              );
            } else if (clonePath) {
              console.log(
                chalk.gray(
                  `\nNote: Variables are set in current process and updated in ${clonePath}.`
                )
              );
            } else {
              console.log(chalk.gray('\nNote: Variables are set in current process only.'));
            }
          }
        } finally {
          dbManager.close();
        }
      } catch (error) {
        console.error(
          chalk.red(`❌ Error: ${error instanceof Error ? error.message : String(error)}`)
        );
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
