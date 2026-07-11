import { Command } from 'commander';
import chalk from 'chalk';
import { clearCredentials, getApiBaseUrl, loadCredentials } from '@/utils/credentials';
import { revokeCurrentControlToken } from '@/utils/http';

export function logoutCommand(program: Command): void {
  program
    .command('logout')
    .description('Revoke the stored control token and remove local credentials')
    .option('--local-only', 'Remove local credentials without remote revocation')
    .action(async (options: { localOnly?: boolean }) => {
      const credentials = loadCredentials();
      if (!options.localOnly && credentials.token?.startsWith('lpc_')) {
        try {
          await revokeCurrentControlToken(
            credentials.apiBaseUrl || getApiBaseUrl(),
            credentials.token
          );
        } catch (error) {
          console.error(
            chalk.red(
              `❌ Remote logout failed; local credentials were retained. ${(error as Error).message}`
            )
          );
          console.error(
            chalk.yellow(
              'Use `envx logout --local-only` only if you accept leaving the server token active.'
            )
          );
          process.exit(1);
        }
      } else if (!options.localOnly && credentials.token) {
        console.warn(
          chalk.yellow(
            '⚠️  This legacy credential cannot be remotely revoked; removing it locally.'
          )
        );
      }
      clearCredentials();
      console.log(chalk.green('\u2705 Logged out. Credentials removed.'));
    });
}
