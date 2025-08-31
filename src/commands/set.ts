import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { ConfigManager } from '../utils/config';
import { createDatabaseManager } from '../utils/db';
import { EnvConfig } from '../types/config';
import { 
  updateEnvFileWithConfig, 
  validateEnvKey, 
  getEnvTargetPath,
  isEnvRequired 
} from '../utils/env';

export function setCommand(program: Command): void {
  program
    .command('set <key> <value>')
    .description('Set or update an environment variable in configuration')
    .option('-c, --config <path>', 'Path to config file (default: ./envx.config.yaml)', './envx.config.yaml')
    .option('-d, --description <text>', 'Description for the environment variable')
    .option('-t, --target <path>', 'Target path for the environment variable')
    .option('--force', 'Force update without confirmation if variable exists')
    .action(async (key: string, value: string, options) => {
      try {
        const configPath = join(process.cwd(), options.config);

        console.log(chalk.blue(`🔧 Setting environment variable: ${key}`));
        console.log(chalk.gray(`📁 Config file: ${options.config}`));

        // 检查配置文件是否存在
        if (!existsSync(configPath)) {
          console.error(chalk.red(`❌ Error: Config file not found at ${options.config}`));
          console.log(chalk.yellow('💡 Tip: Run "envx init" to create a configuration file'));
          process.exit(1);
        }

        // 加载配置
        const configManager = new ConfigManager(configPath);
        const config = configManager.getConfig();

        // 验证环境变量键名
        if (!validateEnvKey(key)) {
          console.error(chalk.red(`❌ Error: Invalid environment variable key "${key}"`));
          console.log(chalk.yellow('💡 Tip: Environment variable keys can only contain letters, numbers, and underscores, and cannot start with a number'));
          process.exit(1);
        }

        // 检查环境变量是否已存在
        const exists = config.env[key] !== undefined;
        const oldValue = exists 
          ? (typeof config.env[key] === 'string' 
              ? config.env[key] as string 
              : (config.env[key] as any)?.default || (config.env[key] as any)?.target || '')
          : '';

        if (exists && !options.force) {
          const inquirer = await import('inquirer');
          const { confirm } = await inquirer.default.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Environment variable "${key}" already exists. Do you want to update it?`,
              default: false,
            },
          ]);

          if (!confirm) {
            console.log(chalk.yellow('❌ Update cancelled'));
            process.exit(0);
          }
        }

        // 创建或更新环境变量配置
        const envConfig: EnvConfig = {
          default: value, // 设置默认值
        };

        if (options.description) {
          envConfig.description = options.description;
        }

        if (options.target) {
          envConfig.target = options.target;
        }

        // 更新配置
        configManager.setEnvVar(key, envConfig);
        configManager.save();

        // 如果配置中有 clone URL，更新对应的环境变量文件
        if (config.clone) {
          console.log(chalk.blue('🔄 Updating environment file based on clone configuration...'));
          try {
            const targetPath = getEnvTargetPath(key, config) || '.env';
            await updateEnvFileWithConfig(targetPath, config, options.force);
            console.log(chalk.green(`✅ Environment file updated: ${targetPath}`));
          } catch (error) {
            console.warn(chalk.yellow(`⚠️  Warning: Failed to update environment file: ${error instanceof Error ? error.message : String(error)}`));
          }
        }

        // 更新数据库
        console.log(chalk.blue('🗄️  Updating database...'));
        const configDir = join(process.cwd(), options.config, '..');
        const dbManager = createDatabaseManager(configDir);

        // 记录操作到数据库
        dbManager.addHistoryRecord({
          key,
          value,
          timestamp: new Date().toISOString(),
          action: exists ? 'updated' : 'created',
          source: 'set',
        });

        dbManager.close();

        // 显示结果
        const action = exists ? 'updated' : 'created';
        console.log(chalk.green(`✅ Environment variable "${key}" ${action} successfully`));
        console.log(chalk.blue('\n📋 Summary:'));
        console.log(chalk.gray(`   Action: ${action}`));
        console.log(chalk.gray(`   Key: ${key}`));
        console.log(chalk.gray(`   Value: ${value}`));
        
        if (exists) {
          console.log(chalk.gray(`   Previous value: ${oldValue || '(empty)'}`));
        }
        
        if (options.description) {
          console.log(chalk.gray(`   Description: ${options.description}`));
        }
        
        if (options.target) {
          console.log(chalk.gray(`   Target: ${options.target}`));
        }
        
        // 显示配置相关信息
        if (isEnvRequired(key, config)) {
          console.log(chalk.yellow(`   Required: Yes`));
        }
        
        if (config.clone) {
          console.log(chalk.blue(`   Clone source: ${config.clone}`));
        }
        
        if (config.export !== undefined) {
          console.log(chalk.blue(`   Export mode: ${config.export ? 'enabled' : 'disabled'}`));
        }
        
        console.log(chalk.gray(`   Config file: ${options.config}`));
        console.log(chalk.gray(`   Database updated`));

      } catch (error) {
        console.error(
          chalk.red(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
        process.exit(1);
      }
    });
}
