import { Command } from 'commander';
import chalk from 'chalk';
import { PACKAGE_INFO } from '@/utils/package-info';

export function versionCommand(program: Command): void {
  program
    .command('version')
    .description('Show detailed version information')
    .action(() => {
      console.log(chalk.blue('📦 Package Information:'));
      console.log(chalk.white(`   Name: ${PACKAGE_INFO.name}`));
      console.log(chalk.white(`   Version: ${PACKAGE_INFO.version}`));
      console.log(chalk.white(`   Description: ${PACKAGE_INFO.description}`));
      console.log(chalk.white(`   License: ${PACKAGE_INFO.license}`));

      console.log(chalk.blue('\n🔧 System Information:'));
      console.log(chalk.white(`   Node.js: ${process.version}`));
      console.log(chalk.white(`   Platform: ${process.platform}`));
      console.log(chalk.white(`   Architecture: ${process.arch}`));
    });
}
