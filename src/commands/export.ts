import { Command } from 'commander';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { ConfigManager } from '../utils/config';
import { createDatabaseManager } from '../utils/db';

type ShellKind = 'sh' | 'cmd' | 'powershell';

interface ExportOptions {
  verbose?: boolean;
  shell?: ShellKind;
  apply?: boolean;
  exec?: string;
  print?: boolean;
  config?: string;
}

function serializeLine(key: string, value: string, shell: ShellKind): string {
  const escaped = value.replace(/"/g, '\\"');
  if (shell === 'cmd') return `set ${key}="${escaped}"`;
  if (shell === 'powershell') return `$Env:${key} = "${escaped}"`;
  return `export ${key}="${escaped}"`;
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
    // Fallback to PowerShell
    return { program: 'powershell.exe', args: ['-NoExit'] };
  }
  // POSIX
  const userShell = process.env.SHELL || '/bin/sh';
  return { program: userShell, args: ['-i'] };
}

export function exportCommand(program: Command): void {
  program
    .command('export')
    .description('Export environment variables from envx.config.yaml and print/apply shell commands (sh|cmd|powershell)')
    .option('-s, --shell <shell>', 'Target shell: sh | cmd | powershell')
    .option('--apply', 'Start a new subshell with variables applied (default if no --print)')
    .option('--exec <command>', 'Run a command with variables applied')
    .option('--print', 'Only print commands, do not execute')
    .option('-v, --verbose', 'Verbose output')
    .option('-c, --config <path>', 'Path to config file (default: ./envx.config.yaml)', './envx.config.yaml')
    .action(async (options: ExportOptions = {}) => {
      const shell: ShellKind = (options.shell as ShellKind) || detectDefaultShell();

      console.log(chalk.blue('📤 Exporting environment variables from config...'));
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
        
        // 从数据库获取环境变量的最新值
        console.log(chalk.blue('🗄️  Fetching latest environment variable values from database...'));
        const configDir = join(process.cwd(), options.config || './envx.config.yaml', '..');
        const dbManager = createDatabaseManager(configDir);
        
        // 从配置中提取环境变量，优先使用数据库中的最新值
        const envMap: Record<string, string> = {};
        for (const [key, value] of Object.entries(config.env)) {
          let finalValue = '';
          
          // 首先尝试从数据库获取最新值
          const latestRecord = dbManager.getLatestVersion(key);
          if (latestRecord && latestRecord.action !== 'deleted') {
            finalValue = latestRecord.value;
          } else {
            // 如果数据库中没有记录，使用配置文件中的值
            if (typeof value === 'string') {
              finalValue = value;
            } else if (value && typeof value === 'object' && 'default' in value) {
              finalValue = (value as any).default || '';
            }
          }
          
          if (finalValue) {
            envMap[key] = finalValue;
          }
        }
        
        dbManager.close();

        // Execute a command with these env vars
        if (options.exec) {
          const child = spawn(options.exec, {
            stdio: 'inherit',
            shell: true,
            env: { ...process.env, ...envMap },
          });
          child.on('exit', code => {
            process.exitCode = code == null ? 0 : code;
          });
          return;
        }

        // Only print if explicitly requested
        if (options.print) {
          const lines = Object.entries(envMap).map(([k, v]) => serializeLine(k, v, shell));
          const output = lines.join('\n');
          if (options.verbose) {
            console.log(chalk.gray('\n# Commands to set variables in your current shell'));
          }
          process.stdout.write(output + '\n');
          console.log(chalk.green('\n✅ Environment variables printed for shell.'));
          return;
        }

        // Start an interactive subshell with env applied (default behavior)
        if (options.apply || !options.print) {
          const { program, args } = detectInteractiveShellProgram(shell);
          const child = spawn(program, args, {
            stdio: 'inherit',
            env: { ...process.env, ...envMap },
          });
          child.on('exit', code => {
            process.exitCode = code == null ? 0 : code;
          });
          return;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`❌ Export failed: ${message}`));
        process.exitCode = 1;
      }
    });
}
