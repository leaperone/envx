import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import inquirer from 'inquirer';
import { ConfigManager } from '@/utils/config';
import { getEnvs, saveEnvs } from '@/utils/com';

interface TagOptions {
  verbose?: boolean;
  config?: string;
  message?: string;
  all?: boolean;
}

export function tagCommand(program: Command): void {
  program
    .command('tag <tagname>')
    .description('Create a new tagged snapshot of environment variables')
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
        const envConfigs = configManager.getAllEnvConfigs();

        // 验证标签名
        if (!tagname || tagname.trim().length === 0) {
          console.error(chalk.red('❌ Error: Tag name cannot be empty'));
          process.exit(1);
        }

        const trimmedTagname = tagname.trim();

        if (trimmedTagname.length > 128) {
          console.error(chalk.red('❌ Error: Tag name must be 128 characters or less'));
          process.exit(1);
        }

        if (!/^[a-zA-Z0-9._-]+$/.test(trimmedTagname)) {
          console.error(chalk.red('❌ Error: Tag name can only contain letters, numbers, dots, hyphens, and underscores'));
          process.exit(1);
        }

        if (trimmedTagname === 'latest') {
          const { confirmLatest } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmLatest',
              message: '"latest" is the default tag name used by envx. Are you sure you want to use it?',
              default: false,
            },
          ]);
          if (!confirmLatest) {
            console.log(chalk.yellow('❌ Tag creation cancelled'));
            return;
          }
        }

        // 检查标签是否已存在（通过尝试读取该 tag 的 envs）
        const existingTagEnvs = await getEnvs(configPath, trimmedTagname);
        if (Object.keys(existingTagEnvs).length > 0) {
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
            return;
          }

          console.log(chalk.blue(`🔄 Overwriting tag: ${trimmedTagname}`));
        }

        // 获取要标记的环境变量
        if (envConfigs.length === 0) {
          console.warn(chalk.yellow('⚠️  Warning: No environment variables found in config'));
          return;
        }

        console.log(chalk.blue(`📋 Found ${envConfigs.length} environment variables to tag`));

        // 收集需要打标签的键的值：getEnvs(undefined tag) 会读取 .env 与 export 的合并，仅限配置声明键
        const envMap = await getEnvs(configPath);
        const taggedEntries: Array<[string, string]> = [];
        for (const { key } of envConfigs) {
          const value = envMap[key];
          if (value != null && value !== '') {
            taggedEntries.push([key, value]);
            if (options.verbose) {
              console.log(chalk.gray(`   ✓ Tagged: ${key} = ${value}`));
            }
          } else if (options.verbose) {
            console.log(chalk.gray(`   • Skip: ${key} has no value to tag`));
          }
        }
        const taggedCount = taggedEntries.length;
        const taggedVars = taggedEntries.map(([k, v]) => ({ key: k, value: v }));

        // 保存到 DB：一次性写入为该 tag 的键值集合
        if (taggedCount > 0) {
          await saveEnvs(configPath, Object.fromEntries(taggedEntries), trimmedTagname);
        }

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
          taggedVars.forEach(({ key, value }) => {
            console.log(chalk.gray(`   ${key} = ${value}`));
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
