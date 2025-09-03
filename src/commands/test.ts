import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { ConfigManager } from '../utils/config';

interface TestOptions {
  config?: string;
  verbose?: boolean;
  json?: boolean;
}

export function testCommand(program: Command): void {
  program
    .command('test')
    .description('Test configuration and database functionality')
    .option('-c, --config <path>', 'Path to config file (default: ./envx.config.yaml)', './envx.config.yaml')
    .option('-v, --verbose', 'Show detailed test information')
    .option('-j, --json', 'Output results in JSON format')
    .action(async (options: TestOptions) => {
      try {
        const configPath = join(process.cwd(), options.config || './envx.config.yaml');

        console.log(chalk.blue('🧪 Testing configuration and database functionality...'));
        console.log(chalk.gray(`📁 Config file: ${options.config || './envx.config.yaml'}`));

        const testResults: {
          timestamp: string;
          configPath: string;
          tests: Record<string, any>;
        } = {
          timestamp: new Date().toISOString(),
          configPath: configPath,
          tests: {}
        };

        // 测试 1: 配置文件存在性
        console.log(chalk.blue('\n📋 Test 1: Configuration file existence'));
        const configExists = existsSync(configPath);
        testResults.tests.configExists = {
          passed: configExists,
          message: configExists ? 'Config file exists' : 'Config file not found'
        };
        
        if (configExists) {
          console.log(chalk.green('✅ Config file exists'));
        } else {
          console.log(chalk.red('❌ Config file not found'));
          if (!options.json) {
            console.log(chalk.yellow('💡 Tip: Run "envx init" to create a configuration file'));
          }
        }

        if (!configExists) {
          if (options.json) {
            console.log(JSON.stringify(testResults, null, 2));
          }
          process.exit(1);
        }

        // 测试 2: 配置文件加载
        console.log(chalk.blue('\n📋 Test 2: Configuration loading'));
        let configManager: ConfigManager | undefined;
        let config: any;
        
        try {
          configManager = new ConfigManager(configPath);
          config = configManager.getConfig();
          testResults.tests.configLoad = {
            passed: true,
            message: 'Configuration loaded successfully',
            config: {
              version: config.version,
              export: config.export,
              clone: config.clone,
              envCount: Object.keys(config.env).length
            }
          };
          console.log(configManager.getAllEnvConfigs());
          console.log(chalk.green('✅ Configuration loaded successfully'));
          console.log(chalk.gray(`   Version: ${config.version}`));
          console.log(chalk.gray(`   Export: ${config.export}`));
          console.log(chalk.gray(`   Clone: ${config.clone || 'none'}`));
          console.log(chalk.gray(`   Environment variables: ${Object.keys(config.env).length}`));
        } catch (error) {
          testResults.tests.configLoad = {
            passed: false,
            message: `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`
          };
          console.log(chalk.red('❌ Failed to load configuration'));
          console.log(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
        }

      } catch (error) {
        console.error(
          chalk.red(`❌ Test execution failed: ${error instanceof Error ? error.message : String(error)}`)
        );
        process.exit(1);
      }
    });
}
