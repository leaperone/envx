import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getCredential, getApiBaseUrl, getCurrentOrg, setCurrentOrg } from '@/utils/credentials';
import {
  controlPlaneHeaders,
  createIdempotencyKey,
  fetchWithLegacyFallback,
  responseErrorMessage,
} from '@/utils/http';

function requireAuth(): { token: string; apiBaseUrl: string } {
  const token = getCredential();
  if (!token) {
    console.error(chalk.red('❌ Not authenticated. Run `envx login` first.'));
    process.exit(1);
  }
  return { token, apiBaseUrl: getApiBaseUrl() };
}

function authHeaders(token: string): Record<string, string> {
  return controlPlaneHeaders(token, {
    'Content-Type': 'application/json',
  });
}

async function organizationRequest(
  apiBaseUrl: string,
  canonicalPath: string,
  legacyPath: string,
  init: RequestInit
): Promise<{ response: Response; legacy: boolean }> {
  return fetchWithLegacyFallback(
    {
      canonicalUrl: new URL(canonicalPath, apiBaseUrl).toString(),
      legacyUrl: new URL(legacyPath, apiBaseUrl).toString(),
    },
    init
  );
}

function responseItems<T>(body: unknown, namedField: 'organizations' | 'members'): T[] {
  if (!body || typeof body !== 'object') return [];
  const data = (body as Record<string, unknown>).data;
  if (Array.isArray(data)) return data as T[];
  if (!data || typeof data !== 'object') return [];
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.items)) return record.items as T[];
  if (Array.isArray(record[namedField])) return record[namedField] as T[];
  return [];
}

function responseNextCursor(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const data = record.data && typeof record.data === 'object' ? record.data : null;
  const meta = record.meta && typeof record.meta === 'object' ? record.meta : null;
  const candidates = [
    data && (data as Record<string, unknown>).nextCursor,
    meta && (meta as Record<string, unknown>).nextCursor,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

async function organizationCollectionRequest<T>(
  apiBaseUrl: string,
  canonicalPath: string,
  legacyPath: string,
  namedField: 'organizations' | 'members',
  token: string
): Promise<{ response: Response; body: unknown; items: T[] }> {
  const items: T[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 100; page += 1) {
    const canonicalUrl = new URL(canonicalPath, apiBaseUrl);
    if (cursor) canonicalUrl.searchParams.set('cursor', cursor);
    const target =
      page === 0
        ? {
            canonicalUrl: canonicalUrl.toString(),
            legacyUrl: new URL(legacyPath, apiBaseUrl).toString(),
          }
        : { canonicalUrl: canonicalUrl.toString() };
    const { response, legacy } = await fetchWithLegacyFallback(target, {
      method: 'GET',
      headers: authHeaders(token),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !body || typeof body !== 'object') {
      return { response, body, items: [] };
    }
    items.push(...responseItems<T>(body, namedField));
    cursor = legacy ? null : responseNextCursor(body);
    if (!cursor) return { response, body, items };
  }

  throw new Error('Organization pagination exceeded 100 pages');
}

export function orgCommand(program: Command): void {
  const org = program.command('org').description('Manage organizations');

  // envx org create <name>
  org
    .command('create <name>')
    .description('Create a new organization')
    .option('-n, --name <name>', 'Display name for the organization')
    .action(async (slug: string, opts: { name?: string }) => {
      const { token, apiBaseUrl } = requireAuth();
      const spinner = ora('Creating organization...').start();

      try {
        const { response: res } = await organizationRequest(
          apiBaseUrl,
          '/api/v1/organizations',
          '/api/v1/cli/orgs',
          {
            method: 'POST',
            headers: {
              ...authHeaders(token),
              'Idempotency-Key': createIdempotencyKey(),
            },
            body: JSON.stringify({
              slug,
              name: opts.name || slug,
            }),
          }
        );

        const body: unknown = await res.json().catch(() => null);
        const data = body as {
          success: boolean;
          data?: { id: string; slug: string; name: string };
        };

        spinner.stop();

        if (!res.ok || !data.success) {
          console.error(
            chalk.red(
              `❌ Failed to create organization: ${responseErrorMessage(body, res.statusText)}`
            )
          );
          process.exit(1);
        }

        if (!data.data) throw new Error('Organization response did not include data');
        console.log(chalk.green(`✅ Organization "${data.data.slug}" created successfully`));
        console.log(chalk.gray(`   ID: ${data.data.id}`));

        // Auto-switch to the new org
        setCurrentOrg(data.data.slug, data.data.id);
        console.log(chalk.blue(`🔄 Switched to organization "${data.data.slug}"`));
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
      const { token, apiBaseUrl } = requireAuth();
      const spinner = ora('Fetching organizations...').start();

      try {
        const {
          response: res,
          body,
          items: orgs,
        } = await organizationCollectionRequest<{
          id: string;
          slug: string;
          name: string;
          role: string;
        }>(apiBaseUrl, '/api/v1/organizations', '/api/v1/cli/orgs', 'organizations', token);

        const data = body as {
          success: boolean;
        };

        spinner.stop();

        if (!res.ok || !data.success) {
          console.error(
            chalk.red(
              `❌ Failed to list organizations: ${responseErrorMessage(body, res.statusText)}`
            )
          );
          process.exit(1);
        }

        if (orgs.length === 0) {
          console.log(
            chalk.yellow('No organizations found. Create one with `envx org create <name>`.')
          );
          return;
        }

        const currentOrg = getCurrentOrg();
        console.log(chalk.blue('Organizations:\n'));
        for (const o of orgs) {
          const marker = o.slug === currentOrg ? chalk.green(' ← current') : '';
          console.log(`  ${chalk.bold(o.slug)}${marker}`);
          console.log(chalk.gray(`    Name: ${o.name}  Role: ${o.role}`));
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
      const { token, apiBaseUrl } = requireAuth();

      // Verify the org exists and user has access
      const spinner = ora('Verifying organization...').start();

      try {
        const encodedSlug = encodeURIComponent(slug);
        const { response: res } = await organizationRequest(
          apiBaseUrl,
          `/api/v1/organizations/${encodedSlug}`,
          `/api/v1/cli/orgs/${encodedSlug}`,
          {
            method: 'GET',
            headers: authHeaders(token),
          }
        );

        const body: unknown = await res.json().catch(() => null);
        const data = body as {
          success: boolean;
          data?: { id: string; slug: string; name: string };
        };

        spinner.stop();

        if (!res.ok || !data.success) {
          if (res.status === 403) {
            console.error(chalk.red(`❌ You don't have access to organization "${slug}".`));
          } else if (res.status === 404) {
            console.error(chalk.red(`❌ Organization "${slug}" not found.`));
          } else {
            console.error(chalk.red(`❌ Failed: ${responseErrorMessage(body, res.statusText)}`));
          }
          process.exit(1);
        }

        if (!data.data?.id || !data.data.slug) {
          throw new Error('Organization response did not include its identity');
        }
        setCurrentOrg(data.data.slug, data.data.id);
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
        console.log(
          chalk.yellow('No organization selected. Use `envx org switch <slug>` to select one.')
        );
      }
    });

  // envx org members [slug]
  org
    .command('members [slug]')
    .description('List members of an organization (defaults to current org)')
    .action(async (slug?: string) => {
      const { token, apiBaseUrl } = requireAuth();
      const orgSlug = slug || getCurrentOrg();

      if (!orgSlug) {
        console.error(
          chalk.red(
            '❌ No organization specified. Use `envx org switch <slug>` first, or provide the org slug.'
          )
        );
        process.exit(1);
      }

      const spinner = ora('Fetching members...').start();

      try {
        const encodedSlug = encodeURIComponent(orgSlug);
        const {
          response: res,
          body,
          items: members,
        } = await organizationCollectionRequest<{
          id: string;
          name?: string;
          email?: string;
          role: string;
        }>(
          apiBaseUrl,
          `/api/v1/organizations/${encodedSlug}/members`,
          `/api/v1/cli/orgs/${encodedSlug}/members`,
          'members',
          token
        );

        const data = body as {
          success: boolean;
        };

        spinner.stop();

        if (!res.ok || !data.success) {
          if (res.status === 403) {
            console.error(
              chalk.red(`❌ You don't have permission to view members of "${orgSlug}".`)
            );
          } else {
            console.error(chalk.red(`❌ Failed: ${responseErrorMessage(body, res.statusText)}`));
          }
          process.exit(1);
        }

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
