import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { 
  parseEnv, 
  serializeEnv, 
  readEnvFile,
  mergeEnvWithConfig
} from '../utils/env';

interface CloneOptions {
  force?: boolean;
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

        // 使用新的合并逻辑，支持配置文件
        const merged = mergeEnvWithConfig(localEnv, remoteEnv, { 
          version: 1, 
          env: {} 
        }, options.force);

        const output = serializeEnv(merged);
        const { promises: fs } = await import('fs');
        await fs.writeFile(target, output, 'utf8');

        console.log(chalk.green(`\n✅ Successfully cloned environment to ${target}`));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`❌ Clone failed: ${message}`));
        process.exitCode = 1;
      }
    });
}
