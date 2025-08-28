import { Command } from 'commander';
import chalk from 'chalk';

// 这些常量会在构建时被 tsup 替换
const PACKAGE_NAME = process.env.PACKAGE_NAME || 'envx';
const PACKAGE_VERSION = process.env.PACKAGE_VERSION || '1.0.0';
const PACKAGE_DESCRIPTION =
  process.env.PACKAGE_DESCRIPTION || 'A powerful environment management CLI tool';
const PACKAGE_LICENSE = process.env.PACKAGE_LICENSE || 'ISC';

export function versionCommand(program: Command): void {
  program
    .command('version')
    .description('Show detailed version information')
    .action(() => {
      console.log(chalk.blue('📦 Package Information:'));
      console.log(chalk.white(`   Name: ${PACKAGE_NAME}`));
      console.log(chalk.white(`   Version: ${PACKAGE_VERSION}`));
      console.log(chalk.white(`   Description: ${PACKAGE_DESCRIPTION}`));
      console.log(chalk.white(`   License: ${PACKAGE_LICENSE}`));

      console.log(chalk.blue('\n🔧 System Information:'));
      console.log(chalk.white(`   Node.js: ${process.version}`));
      console.log(chalk.white(`   Platform: ${process.platform}`));
      console.log(chalk.white(`   Architecture: ${process.arch}`));
    });
}
