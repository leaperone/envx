import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ConfigManager } from '../utils/config';
import { EnvxConfig } from '../types/config';
import { createDatabaseManager } from '../utils/db';

/**
 * 解析 .env 文件内容
 */
function parseEnvFile(content: string): Record<string, string> {
  const envVars: Record<string, string> = {};

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmedLine = line.trim();

    // 跳过空行和注释
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    // 查找等号分隔符
    const equalIndex = trimmedLine.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }

    const key = trimmedLine.substring(0, equalIndex).trim();
    const value = trimmedLine.substring(equalIndex + 1).trim();

    // 移除引号
    const cleanValue = value.replace(/^["']|["']$/g, '');

    if (key) {
      envVars[key] = cleanValue;
    }
  }

  return envVars;
}

/**
 * 创建基础配置
 */
function createBaseConfig(envVars: Record<string, string>): EnvxConfig {
  const config: EnvxConfig = {
    version: 1,
    export: false,
    clone: './.env',
    env: {},
  };

  // 为每个环境变量创建空的配置项
  for (const key of Object.keys(envVars)) {
    config.env[key] = {};
  }

  return config;
}

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
        const envContent = readFileSync(envFilePath, 'utf-8');
        const envVars = parseEnvFile(envContent);

        if (Object.keys(envVars).length === 0) {
          console.warn(chalk.yellow('⚠️  Warning: No environment variables found in .env file'));
        } else {
          console.log(chalk.green(`✅ Found ${Object.keys(envVars).length} environment variables`));
        }

        // 创建基础配置
        const baseConfig = createBaseConfig(envVars);

        // 保存配置文件
        const configManager = new ConfigManager(configOutputPath);
        configManager.mergeConfig(baseConfig);
        configManager.save();

        // 手动处理 YAML 格式，移除空对象的 {} 括号
        const fs = await import('fs');
        let yamlContent = fs.readFileSync(configOutputPath, 'utf-8');

        // 替换所有的 ": {}" 为 ":"
        yamlContent = yamlContent.replace(/:\s*\{\s*\}/g, ':');

        // 写回文件
        fs.writeFileSync(configOutputPath, yamlContent, 'utf-8');

        // 初始化数据库并记录初始环境变量
        console.log(chalk.blue('🗄️  Initializing database...'));
        const configDir = join(process.cwd(), options.output, '..');
        const dbManager = createDatabaseManager(configDir);

        // 记录初始环境变量到数据库
        const initialRecords = Object.entries(envVars).map(([key, value]) => ({
          key,
          value,
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
        console.log(chalk.gray(`   Clone path: ${baseConfig.clone}`));
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
