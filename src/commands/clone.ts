import { Command } from 'commander';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';

interface CloneOptions {
  force?: boolean;
}

type EnvMap = Record<string, string>;

function parseEnv(content: string): EnvMap {
  const env: EnvMap = {};
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function serializeEnv(env: EnvMap): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
    .join('\n')
    .concat('\n');
}

async function readEnvFile(filePath: string): Promise<EnvMap> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return parseEnv(content);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return {};
    }
    throw err;
  }
}

export function cloneCommand(program: Command): void {
  program
    .command('clone <url> [dest]')
    .description('Fetch plaintext env from URL and write to destination (.env by default)')
    .option('-f, --force', 'Overwrite local values with remote ones if present')
    .action(async (url: string, dest?: string, options: CloneOptions = {}) => {
      const target = dest ?? path.resolve(process.cwd(), '.env');

      console.log(chalk.blue('🔗 Cloning environment configuration...'));
      console.log(chalk.white(`   URL: ${url}`));
      console.log(chalk.white(`   Destination: ${target}`));
      console.log(
        options.force
          ? chalk.yellow('   Mode: force overwrite enabled')
          : chalk.gray('   Mode: preserve existing local values')
      );

      try {
        type MinimalResponse = {
          ok: boolean;
          status: number;
          statusText: string;
          text(): Promise<string>;
        };
        type MinimalFetch = (input: string) => Promise<MinimalResponse>;
        const fetchFn: MinimalFetch | undefined = (
          globalThis as unknown as { fetch?: MinimalFetch }
        ).fetch;
        if (!fetchFn) {
          console.error(
            chalk.red('❌ fetch is not available in this Node.js runtime. Please use Node 18+')
          );
          process.exitCode = 1;
          return;
        }
        const res = await fetchFn(url);
        if (!res.ok) {
          console.error(chalk.red(`❌ Failed to fetch: ${res.status} ${res.statusText}`));
          process.exitCode = 1;
          return;
        }
        const remoteText = await res.text();

        const remoteEnv = parseEnv(remoteText);
        const localEnv = await readEnvFile(target);

        const merged: EnvMap = {};
        const keys = new Set<string>([...Object.keys(remoteEnv), ...Object.keys(localEnv)]);
        for (const key of keys) {
          const remoteVal = remoteEnv[key];
          const localVal = localEnv[key];
          if (options.force) {
            merged[key] = remoteVal ?? localVal ?? '';
          } else {
            merged[key] = localVal ?? remoteVal ?? '';
          }
        }

        const output = serializeEnv(merged);
        await fs.writeFile(target, output, 'utf8');

        console.log(chalk.green(`\n✅ Successfully cloned environment to ${target}`));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`❌ Clone failed: ${message}`));
        process.exitCode = 1;
      }
    });
}
