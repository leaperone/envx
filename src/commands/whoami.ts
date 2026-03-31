import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getCredential, getAuthBaseUrl } from '@/utils/credentials';

export function whoamiCommand(program: Command): void {
  program
    .command('whoami')
    .description('Show current authenticated user')
    .action(async () => {
      const credential = getCredential();

      if (!credential) {
        console.log('Not authenticated. Run `envx login` to get started.');
        return;
      }

      const baseUrl = getAuthBaseUrl();
      const spinner = ora('Checking...').start();

      try {
        const res = await fetch(new URL('/api/v1/cli/me', baseUrl).toString(), {
          headers: {
            Authorization: `Bearer ${credential}`,
            'User-Agent': '@leaperone/envx',
          },
        });

        if (!res.ok) {
          spinner.stop();
          console.log(
            chalk.yellow(
              'Credential configured but could not verify. Try `envx login` to re-authenticate.'
            )
          );
          return;
        }

        const data = (await res.json()) as {
          success: boolean;
          data: { id: string; name?: string; email?: string; role?: string };
        };

        spinner.stop();

        if (!data.success) {
          console.log(chalk.yellow('Could not verify credentials.'));
          return;
        }

        const user = data.data;
        const source = process.env.ENVX_API_KEY ? 'api-key (env)' : 'session token';

        console.log('Authenticated:');
        console.log(chalk.gray(`  Name:   ${user.name || '-'}`));
        console.log(chalk.gray(`  Email:  ${user.email || '-'}`));
        if (user.role) {
          console.log(chalk.gray(`  Role:   ${user.role}`));
        }
        console.log(chalk.gray(`  Source: ${source}`));
        console.log(chalk.gray(`  API:    ${baseUrl}`));
      } catch {
        spinner.stop();
        console.log(
          chalk.yellow(
            'Could not reach the server. Check your network or try `envx login` again.'
          )
        );
      }
    });
}
