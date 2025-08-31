import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { ConfigManager } from '../utils/config';
import { createDatabaseManager } from '../utils/db';

export function delCommand(program: Command): void {
  program
    .command('del <key>')
    .description('Delete an environment variable from configuration')
    .option('-c, --config <path>', 'Path to config file (default: ./envx.config.yaml)', './envx.config.yaml')
    .option('--force', 'Force deletion without confirmation')
    .action(async (key: string, options) => {
      try {
        const configPath = join(process.cwd(), options.config);

        console.log(chalk.blue(`🗑️  Deleting environment variable: ${key}`));
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

        // 检查环境变量是否存在
        if (!(key in config.env)) {
          console.error(chalk.red(`❌ Error: Environment variable "${key}" not found in configuration`));
          console.log(chalk.yellow('💡 Tip: Use "envx list" to see available environment variables'));
          process.exit(1);
        }

        // 确认删除
        if (!options.force) {
          const inquirer = await import('inquirer');
          const { confirm } = await inquirer.default.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Are you sure you want to delete "${key}"?`,
              default: false,
            },
          ]);

          if (!confirm) {
            console.log(chalk.yellow('❌ Deletion cancelled'));
            process.exit(0);
          }
        }

        // 获取当前值用于数据库记录
        const currentValue = typeof config.env[key] === 'string' 
          ? config.env[key] as string 
          : (config.env[key] as any)?.default || (config.env[key] as any)?.target || '';

        // 从配置中删除环境变量
        const deleted = configManager.deleteEnvVar(key);
        if (!deleted) {
          console.error(chalk.red(`❌ Error: Failed to delete environment variable "${key}"`));
          process.exit(1);
        }
        configManager.save();

        // 更新数据库
        console.log(chalk.blue('🗄️  Updating database...'));
        const configDir = join(process.cwd(), options.config, '..');
        const dbManager = createDatabaseManager(configDir);

        // 记录删除操作到数据库
        dbManager.addHistoryRecord({
          key,
          value: currentValue,
          timestamp: new Date().toISOString(),
          action: 'deleted',
          source: 'del',
        });

        dbManager.close();

        console.log(chalk.green(`✅ Environment variable "${key}" deleted successfully`));
        console.log(chalk.blue('\n📋 Summary:'));
        console.log(chalk.gray(`   Deleted: ${key}`));
        console.log(chalk.gray(`   Previous value: ${currentValue || '(empty)'}`));
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
