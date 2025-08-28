import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

interface PackageJson {
  name: string;
  version: string;
  description: string;
  license: string;
}

export function versionCommand(program: Command): void {
  program
    .command('version')
    .description('Show detailed version information')
    .action(() => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const packagePath = join(__dirname, '../../package.json');
      
      try {
        const packageJson: PackageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
        
        console.log(chalk.blue('📦 Package Information:'));
        console.log(chalk.white(`   Name: ${packageJson.name}`));
        console.log(chalk.white(`   Version: ${packageJson.version}`));
        console.log(chalk.white(`   Description: ${packageJson.description}`));
        console.log(chalk.white(`   License: ${packageJson.license}`));
        
        console.log(chalk.blue('\n🔧 System Information:'));
        console.log(chalk.white(`   Node.js: ${process.version}`));
        console.log(chalk.white(`   Platform: ${process.platform}`));
        console.log(chalk.white(`   Architecture: ${process.arch}`));
        
      } catch (error) {
        console.error(chalk.red('Error reading package.json:', (error as Error).message));
      }
    });
}
