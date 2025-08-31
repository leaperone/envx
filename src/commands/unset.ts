import { Command } from 'commander';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { ConfigManager } from '../utils/config';

type ShellKind = 'sh' | 'cmd' | 'powershell';

interface UnsetOptions {
  verbose?: boolean;
  shell?: ShellKind;
  apply?: boolean;
  print?: boolean;
  config?: string;
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
    .command('unset')
    .description('Unset environment variables from envx.config.yaml (apply or print)')
    .option('-s, --shell <shell>', 'Target shell: sh | cmd | powershell')
    .option('--apply', 'Start a new subshell with variables unset (default if no --print)')
    .option('--print', 'Only print commands, do not execute')
    .option('-v, --verbose', 'Verbose output')
    .option('-c, --config <path>', 'Path to config file (default: ./envx.config.yaml)', './envx.config.yaml')
    .action(async (options: UnsetOptions = {}) => {
      const shell: ShellKind = (options.shell as ShellKind) || detectDefaultShell();

      console.log(chalk.blue('🧹 Unsetting environment variables from config...'));
      console.log(chalk.white(`   Config file: ${options.config}`));

      try {
        // 读取配置文件
        const configPath = join(process.cwd(), options.config || './envx.config.yaml');
        
        if (!existsSync(configPath)) {
          console.error(chalk.red(`❌ Error: Config file not found at ${options.config || './envx.config.yaml'}`));
          console.log(chalk.yellow('💡 Tip: Run "envx init" to create a configuration file'));
          process.exit(1);
        }

        const configManager = new ConfigManager(configPath);
        const config = configManager.getConfig();
        
        // 从配置中提取环境变量键名
        const keys = Object.keys(config.env);

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
