import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import inquirer from 'inquirer';
import { ConfigManager } from '../utils/config';
import { createDatabaseManager } from '../utils/db';
import { 
  updateEnvFileWithConfig, 
  getEnvTargetFiles
} from '../utils/env';

interface TagOptions {
  verbose?: boolean;
  config?: string;
  message?: string;
  all?: boolean;
}

export function tagCommand(program: Command): void {
  program
    .command('tag <tagname>')
    .description('Create a new version of environment variables with a tag')
    .option('-c, --config <path>', 'Path to config file (default: ./envx.config.yaml)', './envx.config.yaml')
    .option('-m, --message <text>', 'Message describing this tag')
    .option('-a, --all', 'Tag all environment variables in the config')
    .option('-v, --verbose', 'Verbose output')
    .action(async (tagname: string, options: TagOptions = {}) => {
      try {
        const configPath = join(process.cwd(), options.config || './envx.config.yaml');

        console.log(chalk.blue(`🏷️  Creating tag: ${tagname}`));
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
        const envConfigs = configManager.getAllEnvConfigs();

        // 获取数据库管理器
        const configDir = join(process.cwd(), (options.config || './envx.config.yaml'), '..');
        const dbManager = createDatabaseManager(configDir);

        // 验证标签名
        if (!tagname || tagname.trim().length === 0) {
          console.error(chalk.red('❌ Error: Tag name cannot be empty'));
          process.exit(1);
        }

        const trimmedTagname = tagname.trim();

        // 检查标签是否已存在
        const existingTags = dbManager.getAllTags();
        if (existingTags.includes(trimmedTagname)) {
          console.warn(chalk.yellow(`⚠️  Warning: Tag "${trimmedTagname}" already exists`));
          
          // 询问用户是否覆盖
          const { overwrite } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'overwrite',
              message: `Do you want to overwrite the existing tag "${trimmedTagname}"?`,
              default: false
            }
          ]);

          if (!overwrite) {
            console.log(chalk.yellow('❌ Tag creation cancelled'));
            dbManager.close();
            return;
          }

          console.log(chalk.blue(`🔄 Overwriting tag: ${trimmedTagname}`));
        }

        // 获取要标记的环境变量
        if (envConfigs.length === 0) {
          console.warn(chalk.yellow('⚠️  Warning: No environment variables found in config'));
          dbManager.close();
          return;
        }

        console.log(chalk.blue(`📋 Found ${envConfigs.length} environment variables to tag`));

        // 为每个环境变量创建带标签的新版本
        let taggedCount = 0;
        const taggedVars: Array<{key: string, value: string, version: number}> = [];

        for (const { key, config: envConfig } of envConfigs) {
          const value = typeof envConfig === 'string' 
            ? envConfig 
            : envConfig?.default || envConfig?.target || '';

          if (value) {
            // 获取当前版本号
            const currentVersion = dbManager.getLatestVersion(key);
            const newVersion = currentVersion ? currentVersion.version + 1 : 1;

            // 创建带标签的版本
            dbManager.createTaggedVersion(key, value, trimmedTagname, 'tag');
            taggedCount++;
            taggedVars.push({ key, value, version: newVersion });

            if (options.verbose) {
              console.log(chalk.gray(`   ✓ Tagged: ${key} = ${value} (v${newVersion})`));
            }
          }
        }

        // 更新环境文件（如果配置了clone）
        if (config.files && taggedCount > 0) {
          console.log(chalk.blue('🔄 Updating environment files...'));
          try {
            for (const { key, value } of taggedVars) {
              const targetPath = getEnvTargetFiles(key, config);
              if (targetPath && typeof targetPath === 'string') {
                await updateEnvFileWithConfig(targetPath, { [key]: value }, config, true);
              } else if (targetPath && Array.isArray(targetPath)) {
                for (const path of targetPath) {
                  await updateEnvFileWithConfig(path, { [key]: value }, config, true);
                }
              }
            }
            console.log(chalk.green('✅ Environment files updated'));
          } catch (error) {
            console.warn(
              chalk.yellow(
                `⚠️  Warning: Failed to update environment files: ${error instanceof Error ? error.message : String(error)}`
              )
            );
          }
        }

        dbManager.close();

        // 显示结果
        console.log(chalk.green(`\n✅ Tag "${trimmedTagname}" created successfully`));
        console.log(chalk.blue('\n📋 Summary:'));
        console.log(chalk.gray(`   Tag: ${trimmedTagname}`));
        console.log(chalk.gray(`   Variables tagged: ${taggedCount}`));
        console.log(chalk.gray(`   Config file: ${options.config}`));
        
        if (options.message) {
          console.log(chalk.gray(`   Message: ${options.message}`));
        }

        if (taggedCount > 0) {
          console.log(chalk.blue('\n📝 Tagged variables:'));
          taggedVars.forEach(({ key, value, version }) => {
            console.log(chalk.gray(`   ${key} = ${value} (v${version})`));
          });
        }

        // 显示标签使用提示
        console.log(chalk.blue('\n💡 Usage tips:'));
        console.log(chalk.gray('   • View tag history: envx history --tag ' + trimmedTagname));
        console.log(chalk.gray('   • List all tags: envx history --tags'));
        console.log(chalk.gray('   • View specific variable history: envx history ' + (taggedVars[0]?.key || 'VARIABLE_NAME')));

      } catch (error) {
        console.error(
          chalk.red(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        );
        process.exit(1);
      }
    });
}
