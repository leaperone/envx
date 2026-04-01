import { Command } from 'commander';
import chalk from 'chalk';
import { clearCredentials } from '@/utils/credentials';

export function logoutCommand(program: Command): void {
  program
    .command('logout')
    .description('Remove stored credentials')
    .action(() => {
      clearCredentials();
      console.log(chalk.green('\u2705 Logged out. Credentials removed.'));
    });
}
