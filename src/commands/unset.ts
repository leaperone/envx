import { Command } from 'commander';
import chalk from 'chalk';
import { spawn } from 'child_process';

type ShellKind = 'sh' | 'cmd' | 'powershell';

interface UnsetOptions {
  verbose?: boolean;
  shell?: ShellKind;
  apply?: boolean;
  print?: boolean;
}

function parseKeys(content: string): string[] {
  const keys: string[] = [];
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    const key = eqIndex === -1 ? line : line.slice(0, eqIndex);
    const trimmedKey = key.trim();
    if (trimmedKey) keys.push(trimmedKey);
  }
  return keys;
}

function serializeUnset(key: string, shell: ShellKind): string {
  if (shell === 'cmd') return `set ${key}=`;
  if (shell === 'powershell') return `Remove-Item Env:${key} -ErrorAction SilentlyContinue`;
  return `unset ${key}`;
}

function detectDefaultShell(): ShellKind {
  if (process.platform === 'win32') {
    return 'powershell';
  }
  return 'sh';
}

function detectInteractiveShellProgram(shell: ShellKind): { program: string; args: string[] } {
  if (process.platform === 'win32') {
    if (shell === 'powershell') return { program: 'powershell.exe', args: ['-NoExit'] };
    if (shell === 'cmd') return { program: 'cmd.exe', args: ['/K'] };
    return { program: 'powershell.exe', args: ['-NoExit'] };
  }
  const userShell = process.env.SHELL || '/bin/sh';
  return { program: userShell, args: ['-i'] };
}

export function unsetCommand(program: Command): void {
  program
    .command('unset <url>')
    .description('Fetch keys from URL and unset them (apply or print)')
    .option('-s, --shell <shell>', 'Target shell: sh | cmd | powershell')
    .option('--apply', 'Start a new subshell with variables unset (default if no --print)')
    .option('--print', 'Only print commands, do not execute')
    .option('-v, --verbose', 'Verbose output')
    .action(async (url: string, options: UnsetOptions = {}) => {
      const shell: ShellKind = (options.shell as ShellKind) || detectDefaultShell();

      console.log(chalk.blue('🧹 Unsetting environment variables from remote...'));
      console.log(chalk.white(`   URL: ${url}`));
      console.log(chalk.white(`   Shell: ${shell}`));

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
        const keys = parseKeys(remoteText);

        // Only print if explicitly requested
        if (options.print) {
          const lines = keys.map(k => serializeUnset(k, shell));
          const output = lines.join('\n');
          if (options.verbose) {
            console.log(chalk.gray('\n# Commands to unset variables in your current shell'));
          }
          process.stdout.write(output + '\n');
          console.log(chalk.green('\n✅ Unset commands printed for shell.'));
          return;
        }

        // Start an interactive subshell with env UNSET (default behavior)
        if (options.apply || !options.print) {
          const { program: prog, args } = detectInteractiveShellProgram(shell);
          const newEnv = { ...process.env } as Record<string, string | undefined>;
          for (const k of keys) delete newEnv[k];
          const child = spawn(prog, args, {
            stdio: 'inherit',
            env: newEnv as Record<string, string>,
          });
          child.on('exit', code => {
            process.exitCode = code == null ? 0 : code;
          });
          return;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`❌ Unset failed: ${message}`));
        process.exitCode = 1;
      }
    });
}
