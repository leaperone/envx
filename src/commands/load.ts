import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { ConfigManager } from '@/utils/config';
import { getEnvs, writeEnvs } from '@/utils/com';
import { EnvConfig } from '@/types/config';
import { isEnvRequired, exportEnv, detectDefaultShell } from '@/utils/env';

interface LoadOptions {
  config?: string;
  key?: string;
  export?: boolean;
  shell?: string;
  force?: boolean;
}

export function loadCommand(program: Command): void {
  program
    .command('load <tag>')
    .description('Load environment variables from database by tag')
    .option(
      '-c, --config <path>',
      'Path to config file (default: ./envx.config.yaml)',
      './envx.config.yaml'
    )
    .option('-k, --key <key>', 'Load specific environment variable by key')
    .option('-e, --export', 'Export variables to shell (print export commands)')
    .option(
      '-s, --shell <shell>',
      'Target shell for export: sh | bash | zsh | fish | cmd | powershell'
    )
    .option('--force', 'Force load from database even if variable not in config')
    .action(async (tag: string, options: LoadOptions) => {
      try {
        const configPath = join(process.cwd(), options.config || './envx.config.yaml');
        const configDir = dirname(configPath);

        console.log(chalk.blue('📥 Loading environment variables from database...'));
        console.log(chalk.gray(`📁 Config file: ${options.config || './envx.config.yaml'}`));
        console.log(chalk.gray(`🏷️  Tag: ${tag}`));

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

        let variables: Array<{
            key: string;
            value: string;
            config?: EnvConfig | string | undefined;
          }> = [];

        // 使用新的 get 函数按 tag 获取变量映射
        const allEnvMap = await getEnvs(configPath, tag);

        if (options.key) {
            // 加载特定key的变量（从指定tag中）
            console.log(chalk.gray(`🔍 Loading variable: ${options.key} from tag: ${tag}`));

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

            const val = allEnvMap[options.key];
            if (val === undefined) {
              console.error(chalk.red(`❌ Error: No records found for key "${options.key}" in tag "${tag}"`));
              process.exit(1);
            }

            variables = [
              {
                key: options.key,
                value: String(val),
                config: envConfig,
              },
            ];

            console.log(chalk.green(`✅ Found ${options.key} in tag "${tag}"`));
        } else {
            // 加载指定标签的所有变量
            console.log(chalk.gray(`🔍 Loading all environment variables from tag: ${tag}`));

            const entries = Object.entries(allEnvMap);
            if (entries.length === 0) {
              console.error(chalk.red(`❌ Error: No records found for tag "${tag}"`));
              process.exit(1);
            }

            console.log(chalk.gray(`📋 Found ${entries.length} records for tag "${tag}"`));

            for (const [key, value] of entries) {
              const envConfig = configManager.getEnvVar(key);
              
              // 检查配置文件中是否存在该key（除非使用--force）
              if (!envConfig && !options.force) {
                console.log(chalk.yellow(`⚠️  Skipping ${key} (not in config, use --force to include)`));
                continue;
              }

              variables.push({
                key,
                value: String(value),
                config: envConfig,
              });
              console.log(chalk.green(`✅ Loaded ${key} from tag "${tag}"`));
            }

            console.log(
              chalk.green(`✅ Successfully loaded ${variables.length} environment variables from tag "${tag}"`)
            );
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

          // 如果配置中有 clone 路径，写入环境变量文件（使用新的 write 函数）
          if (configManager.getConfigOption('files')) {
            console.log(
              chalk.blue('🔄 Writing environment files based on configuration...')
            );
            const envMapToWrite = variables.reduce<Record<string, string>>((acc, v) => {
              acc[v.key] = v.value;
              return acc;
            }, {});
            try {
              await writeEnvs(configPath, envMapToWrite);
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
      } catch (error) {
        console.error(
          chalk.red(`❌ Error: ${error instanceof Error ? error.message : String(error)}`)
        );
        process.exit(1);
      }
    });
}
