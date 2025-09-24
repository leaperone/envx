import { promises as fs } from 'fs';
import { EnvxConfig } from '@/types/config';
import { EnvMap, ShellKind } from '@/types/common';
import { spawn } from 'child_process';

/**
 * 解析环境变量文件内容
 */
export function parseEnv(content: string): EnvMap {
  const env: EnvMap = {};
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // 移除引号
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

/**
 * 序列化环境变量为文件内容
 */
export function serializeEnv(env: EnvMap): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
    .join('\n')
    .concat('\n');
}

/**
 * 读取环境变量文件
 */
export async function readEnvFile(filePath: string): Promise<EnvMap> {
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

/**
 * 写入环境变量文件
 */
export async function writeEnvFile(filePath: string, env: EnvMap): Promise<void> {
  const output = serializeEnv(env);
  await fs.writeFile(filePath, output, 'utf8');
}

/**
 * 合并环境变量，支持配置文件的 export 和 clone 设置
 */
export function mergeEnv(existEnv: EnvMap, newEnv: EnvMap, force: boolean = false): EnvMap {
  const merged: EnvMap = {};
  const keys = new Set<string>([...Object.keys(existEnv), ...Object.keys(newEnv)]);

  for (const key of keys) {
    const newVal = newEnv[key];
    const existVal = existEnv[key];

    if (force && newVal !== undefined) {
      merged[key] = newVal;
    } else {
      merged[key] = newVal ?? existVal ?? '';
    }
  }

  return merged;
}

/**
 * 根据配置更新环境变量文件
 */
export async function updateEnvFileWithConfig(
  filePath: string,
  env: EnvMap,
  config: EnvxConfig,
  force: boolean = false
): Promise<void> {
  // 如果配置中没有 clone URL，直接返回
  if (!config.files) {
    return;
  }

  try {
    // 获取远程环境变量
    const localEnv = await readEnvFile(filePath);

    // 写入文件
    await writeEnvFile(filePath, mergeEnv(localEnv, env, force));
  } catch (error) {
    throw new Error(
      `Failed to update env file with config: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * 从远程 URL 获取环境变量
 */
export async function fetchRemoteEnv(url: string): Promise<EnvMap> {
  type MinimalResponse = {
    ok: boolean;
    status: number;
    statusText: string;
    text(): Promise<string>;
  };

  type MinimalFetch = (input: string) => Promise<MinimalResponse>;

  const fetchFn: MinimalFetch | undefined = (globalThis as unknown as { fetch?: MinimalFetch })
    .fetch;

  if (!fetchFn) {
    throw new Error('fetch is not available in this Node.js runtime. Please use Node 18+');
  }

  const res = await fetchFn(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
  }

  const remoteText = await res.text();
  return parseEnv(remoteText);
}

/**
 * 验证环境变量键名是否有效
 */
export function validateEnvKey(key: string): boolean {
  // 环境变量键名规则：只能包含字母、数字和下划线，且不能以数字开头
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key);
}

/**
 * 获取环境变量的目标路径
 */
export function getEnvTargetFiles(key: string, config: EnvxConfig): string | string[] | undefined {
  const envConfig = config.env[key];
  if (envConfig && typeof envConfig === 'object') {
    return envConfig.files;
  }
  return undefined;
}

/**
 * 检查环境变量是否必需
 */
export function isEnvRequired(key: string, config: EnvxConfig): boolean {
  const envConfig = config.env[key];
  if (envConfig && typeof envConfig === 'object') {
    return envConfig.required === true;
  }
  return false;
}

export async function delEnv(key: string, filePath: string | string[]) {
  if (typeof filePath === 'string') {
    const env = await readEnvFile(filePath);
    delete env[key];
    await writeEnvFile(filePath, env);
  } else {
    for (const file of filePath) {
      const env = await readEnvFile(file);
      delete env[key];
      await writeEnvFile(file, env);
    }
  }
}

export async function exportEnv(envs: EnvMap): Promise<string[]> {
  const commands: string[] = [];
  
  const shell = detectDefaultShell();

  for (const [key, value] of Object.entries(envs)) {
    const command = generateExportCommand(key, value, shell);
    commands.push(command);
  }
  
  return commands;
}

export async function unsetEnv(key: string | string[]): Promise<void> {
  const shell = detectDefaultShell() as ShellKind;
  const { program, args } = detectInteractiveShellProgram(shell);

  // 构建取消设置环境变量的命令
  const keys = Array.isArray(key) ? key : [key];
  const unsetCommands = keys.map(k => generateUnsetCommand(k, shell));
  const command = unsetCommands.join('; ');

  const child = spawn(program, [...args, '-c', command], {
    stdio: 'inherit',
    env: { ...process.env },
  });

  child.on('exit', code => {
    process.exitCode = code == null ? 0 : code;
  });
}

/**
 * 检测默认shell
 */
export function detectDefaultShell(): string {
  const shell = process.env.SHELL || process.env.COMSPEC || 'sh';

  if (shell.includes('bash')) return 'bash';
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('fish')) return 'fish';
  if (shell.includes('cmd')) return 'cmd';
  if (shell.includes('powershell')) return 'powershell';

  return 'sh';
}

export function detectInteractiveShellProgram(shell: ShellKind): {
  program: string;
  args: string[];
} {
  if (process.platform === 'win32') {
    if (shell === 'powershell') return { program: 'powershell.exe', args: ['-NoExit'] };
    if (shell === 'cmd') return { program: 'cmd.exe', args: ['/K'] };
    return { program: 'powershell.exe', args: ['-NoExit'] };
  }
  const userShell = process.env.SHELL || '/bin/sh';
  return { program: userShell, args: ['-i'] };
}

export function generateUnsetCommand(key: string, shell: string): string {
  switch (shell) {
    case 'bash':
    case 'sh':
    case 'zsh':
      return `unset ${key}`;
    case 'fish':
      return `set -e ${key}`;
    case 'cmd':
      return `set ${key}=`;
    case 'powershell':
      return `Remove-Item Env:${key} -ErrorAction SilentlyContinue`;
    default:
      return `unset ${key}`;
  }
}

/**
 * 生成shell导出命令
 */
export function generateExportCommand(key: string, value: string, shell: string): string {
  const escapedValue = value.replace(/"/g, '\\"');

  switch (shell) {
    case 'bash':
    case 'sh':
    case 'zsh':
      return `export ${key}="${escapedValue}"`;
    case 'fish':
      return `set -gx ${key} "${escapedValue}"`;
    case 'cmd':
      return `set ${key}=${value}`;
    case 'powershell':
      return `$env:${key} = "${escapedValue}"`;
    default:
      return `export ${key}="${escapedValue}"`;
  }
}
