import { promises as fs } from 'fs';
import { EnvxConfig } from '../types/config';

export type EnvMap = Record<string, string>;

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
export function mergeEnvWithConfig(
  localEnv: EnvMap,
  remoteEnv: EnvMap,
  config: EnvxConfig,
  force: boolean = false
): EnvMap {
  const merged: EnvMap = {};
  const keys = new Set<string>([...Object.keys(localEnv), ...Object.keys(remoteEnv)]);
  
  for (const key of keys) {
    const remoteVal = remoteEnv[key];
    const localVal = localEnv[key];
    const envConfig = config.env[key];
    
    // 如果配置中指定了 clone 源，优先使用该源
    if (envConfig && typeof envConfig === 'object' && envConfig.clone) {
      merged[key] = remoteVal ?? localVal ?? '';
      continue;
    }
    
    // 根据全局 export 设置决定合并策略
    if (config.export) {
      // export 为 true 时，优先使用远程值
      merged[key] = remoteVal ?? localVal ?? '';
    } else {
      // export 为 false 时，优先使用本地值
      merged[key] = localVal ?? remoteVal ?? '';
    }
    
    // 如果启用了 force 模式，远程值会覆盖本地值
    if (force && remoteVal !== undefined) {
      merged[key] = remoteVal;
    }
  }
  
  return merged;
}

/**
 * 根据配置更新环境变量文件
 */
export async function updateEnvFileWithConfig(
  filePath: string,
  config: EnvxConfig,
  force: boolean = false
): Promise<void> {
  // 如果配置中没有 clone URL，直接返回
  if (!config.clone) {
    return;
  }
  
  try {
    // 获取远程环境变量
    const remoteEnv = await fetchRemoteEnv(config.clone);
    
    // 读取本地环境变量
    const localEnv = await readEnvFile(filePath);
    
    // 合并环境变量
    const merged = mergeEnvWithConfig(localEnv, remoteEnv, config, force);
    
    // 写入文件
    await writeEnvFile(filePath, merged);
  } catch (error) {
    throw new Error(`Failed to update env file with config: ${error instanceof Error ? error.message : String(error)}`);
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
  
  const fetchFn: MinimalFetch | undefined = (
    globalThis as unknown as { fetch?: MinimalFetch }
  ).fetch;
  
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
export function getEnvTargetPath(key: string, config: EnvxConfig): string | undefined {
  const envConfig = config.env[key];
  if (envConfig && typeof envConfig === 'object') {
    return envConfig.target;
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
