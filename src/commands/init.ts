import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { ConfigManager } from '../utils/config';
import { createDatabaseManager } from '../utils/db';
import { readEnvFile } from '../utils/env';

export function initCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize envx configuration from existing .env file')
    .option('-f, --file <path>', 'Path to .env file (default: ./.env)', './.env')
    .option(
      '-o, --output <path>',
      'Output path for config file (default: ./envx.config.yaml)',
      './envx.config.yaml'
    )
    .option('--force', 'Overwrite existing config file')
    .action(async options => {
      try {
        const envFilePath = join(process.cwd(), options.file);
        const configOutputPath = join(process.cwd(), options.output);

        console.log(chalk.blue('🚀 Initializing envx configuration...'));
        console.log(chalk.gray(`📁 Reading .env file: ${options.file}`));

        // 检查 .env 文件是否存在
        if (!existsSync(envFilePath)) {
          console.error(chalk.red(`❌ Error: .env file not found at ${options.file}`));
          console.log(
            chalk.yellow('💡 Tip: Make sure you have a .env file in the current directory')
          );
          process.exit(1);
        }

        // 检查输出文件是否已存在
        if (existsSync(configOutputPath) && !options.force) {
          console.error(chalk.red(`❌ Error: Config file already exists at ${options.output}`));
          console.log(chalk.yellow('💡 Tip: Use --force flag to overwrite existing file'));
          process.exit(1);
        }

        // 读取 .env 文件
        const envs = await readEnvFile(envFilePath);

        if (Object.keys(envs).length === 0) {
          console.warn(chalk.yellow('⚠️  Warning: No environment variables found in .env file'));
        } else {
          console.log(chalk.green(`✅ Found ${Object.keys(envs).length} environment variables`));
        }

        // 创建基础配置
        const configManager = new ConfigManager(configOutputPath);
        const baseConfig = configManager.createBaseConfig(envs, options.file);

        // 保存配置文件
        configManager.mergeConfig(baseConfig);
        configManager.save();

        // 初始化数据库并记录初始环境变量
        console.log(chalk.blue('🗄️  Initializing database...'));
        const configDir = join(process.cwd(), options.output, '..');
        const dbManager = createDatabaseManager(configDir);

        // 记录初始环境变量到数据库
        const initialRecords = Object.entries(envs).map(([key, value]) => ({
          key,
          value: value as string,
          timestamp: new Date().toISOString(),
          action: 'created' as const,
          source: 'init',
        }));

        dbManager.addHistoryRecords(initialRecords);

        // 获取数据库统计信息
        const dbStats = dbManager.getStats();
        dbManager.close();

        console.log(chalk.green(`✅ Configuration file created successfully: ${options.output}`));
        console.log(chalk.green(`🗄️  Database initialized successfully: .envx/envx.db`));
        console.log(chalk.blue('\n📋 Configuration summary:'));
        console.log(chalk.gray(`   Version: ${baseConfig.version}`));
        console.log(chalk.gray(`   Export: ${baseConfig.export}`));
        console.log(chalk.gray(`   Clone path: ${baseConfig.files}`));
        console.log(chalk.gray(`   Environment variables: ${Object.keys(baseConfig.env).length}`));
        console.log(chalk.gray(`   Database records: ${dbStats.totalRecords}`));

        if (Object.keys(baseConfig.env).length > 0) {
          console.log(chalk.blue('\n🔧 Next steps:'));
          console.log(chalk.gray('   1. Review and customize the generated config file'));
          console.log(chalk.gray('   2. Add descriptions, targets, and other configurations'));
          console.log(chalk.gray('   3. Use "envx clone" to sync with your .env file'));
          console.log(chalk.gray('   4. Use "envx export" to generate environment variables'));
        }

        console.log(chalk.blue('\n🎉 Initialization completed successfully!'));
      } catch (error) {
        console.error(
          chalk.red(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
        process.exit(1);
      }
    });
}
