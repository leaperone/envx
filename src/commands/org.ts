import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  getCredential,
  getAuthBaseUrl,
  getCurrentOrg,
  setCurrentOrg,
} from '@/utils/credentials';

function requireAuth(): { token: string; baseUrl: string } {
  const token = getCredential();
  if (!token) {
    console.error(chalk.red('❌ Not authenticated. Run `envx login` first.'));
    process.exit(1);
  }
  return { token, baseUrl: getAuthBaseUrl() };
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': '@leaperone/envx',
  };
}

export function orgCommand(program: Command): void {
  const org = program
    .command('org')
    .description('Manage organizations');

  // envx org create <name>
  org
    .command('create <name>')
    .description('Create a new organization')
    .option('-d, --display-name <name>', 'Display name for the organization')
    .action(async (name: string, opts: { displayName?: string }) => {
      const { token, baseUrl } = requireAuth();
      const spinner = ora('Creating organization...').start();

      try {
        const res = await fetch(new URL('/api/v1/cli/orgs', baseUrl).toString(), {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            slug: name,
            displayName: opts.displayName || name,
          }),
        });

        const data = (await res.json()) as {
          success: boolean;
          data?: { id: string; slug: string; displayName: string };
          error?: string;
        };

        spinner.stop();

        if (!res.ok || !data.success) {
          console.error(chalk.red(`❌ Failed to create organization: ${data.error || res.statusText}`));
          process.exit(1);
        }

        console.log(chalk.green(`✅ Organization "${data.data!.slug}" created successfully`));
        console.log(chalk.gray(`   ID: ${data.data!.id}`));

        // Auto-switch to the new org
        setCurrentOrg(data.data!.slug);
        console.log(chalk.blue(`🔄 Switched to organization "${data.data!.slug}"`));
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(`❌ Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // envx org list
  org
    .command('list')
    .alias('ls')
    .description('List organizations you belong to')
    .action(async () => {
      const { token, baseUrl } = requireAuth();
      const spinner = ora('Fetching organizations...').start();

      try {
        const res = await fetch(new URL('/api/v1/cli/orgs', baseUrl).toString(), {
          method: 'GET',
          headers: authHeaders(token),
        });

        const data = (await res.json()) as {
          success: boolean;
          data?: Array<{ id: string; slug: string; displayName: string; role: string }>;
          error?: string;
        };

        spinner.stop();

        if (!res.ok || !data.success) {
          console.error(chalk.red(`❌ Failed to list organizations: ${data.error || res.statusText}`));
          process.exit(1);
        }

        const orgs = data.data || [];
        if (orgs.length === 0) {
          console.log(chalk.yellow('No organizations found. Create one with `envx org create <name>`.'));
          return;
        }

        const currentOrg = getCurrentOrg();
        console.log(chalk.blue('Organizations:\n'));
        for (const o of orgs) {
          const marker = o.slug === currentOrg ? chalk.green(' ← current') : '';
          console.log(`  ${chalk.bold(o.slug)}${marker}`);
          console.log(chalk.gray(`    Name: ${o.displayName}  Role: ${o.role}`));
        }
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(`❌ Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // envx org switch <slug>
  org
    .command('switch <slug>')
    .description('Switch to a different organization context')
    .action(async (slug: string) => {
      const { token, baseUrl } = requireAuth();

      // Verify the org exists and user has access
      const spinner = ora('Verifying organization...').start();

      try {
        const res = await fetch(new URL(`/api/v1/cli/orgs/${encodeURIComponent(slug)}`, baseUrl).toString(), {
          method: 'GET',
          headers: authHeaders(token),
        });

        const data = (await res.json()) as {
          success: boolean;
          data?: { id: string; slug: string; displayName: string };
          error?: string;
        };

        spinner.stop();

        if (!res.ok || !data.success) {
          if (res.status === 403) {
            console.error(chalk.red(`❌ You don't have access to organization "${slug}".`));
          } else if (res.status === 404) {
            console.error(chalk.red(`❌ Organization "${slug}" not found.`));
          } else {
            console.error(chalk.red(`❌ Failed: ${data.error || res.statusText}`));
          }
          process.exit(1);
        }

        setCurrentOrg(slug);
        console.log(chalk.green(`✅ Switched to organization "${slug}"`));
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(`❌ Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // envx org current
  org
    .command('current')
    .description('Show current organization context')
    .action(() => {
      const currentOrg = getCurrentOrg();
      if (currentOrg) {
        console.log(`Current organization: ${chalk.bold(currentOrg)}`);
      } else {
        console.log(chalk.yellow('No organization selected. Use `envx org switch <slug>` to select one.'));
      }
    });

  // envx org members [slug]
  org
    .command('members [slug]')
    .description('List members of an organization (defaults to current org)')
    .action(async (slug?: string) => {
      const { token, baseUrl } = requireAuth();
      const orgSlug = slug || getCurrentOrg();

      if (!orgSlug) {
        console.error(chalk.red('❌ No organization specified. Use `envx org switch <slug>` first, or provide the org slug.'));
        process.exit(1);
      }

      const spinner = ora('Fetching members...').start();

      try {
        const res = await fetch(
          new URL(`/api/v1/cli/orgs/${encodeURIComponent(orgSlug)}/members`, baseUrl).toString(),
          {
            method: 'GET',
            headers: authHeaders(token),
          }
        );

        const data = (await res.json()) as {
          success: boolean;
          data?: Array<{ id: string; name?: string; email?: string; role: string }>;
          error?: string;
        };

        spinner.stop();

        if (!res.ok || !data.success) {
          if (res.status === 403) {
            console.error(chalk.red(`❌ You don't have permission to view members of "${orgSlug}".`));
          } else {
            console.error(chalk.red(`❌ Failed: ${data.error || res.statusText}`));
          }
          process.exit(1);
        }

        const members = data.data || [];
        if (members.length === 0) {
          console.log(chalk.yellow('No members found.'));
          return;
        }

        console.log(chalk.blue(`Members of "${orgSlug}":\n`));
        for (const m of members) {
          console.log(`  ${chalk.bold(m.name || m.email || m.id)} ${chalk.gray(`(${m.role})`)}`);
        }
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(`❌ Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });
}
