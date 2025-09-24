import { EnvMap } from '@/types/common';
import { ConfigManager } from './config/config-manager';
import { createDatabaseManagerFromConfigPath } from './db';
import { mergeEnv, readEnvFile, writeEnvFile } from './env';
import { dirname, isAbsolute, join } from 'path';

export async function getEnvs(configPath: string, tag?: string): Promise<EnvMap> {
  const configManager = new ConfigManager(configPath);
  const isExport = configManager.isExport();
  const files = configManager.getEnvFilesConfig();

  // 允许键集合来自配置文件定义
  const configKeys = Object.keys(configManager.getConfig().env);

  let envMap: EnvMap = {};

  // 数据库目录应为配置文件所在目录
  const configDir = dirname(configPath);

  if (tag) {
    const dbManager = createDatabaseManagerFromConfigPath(configPath);
    envMap = dbManager.getTaggedValues(tag);
    dbManager.close();
    return envMap;
  }

  // 合并 .env 文件内容
  for (const file of files) {
    const filePath = isAbsolute(file) ? file : join(configDir, file);
    const fileEnvs = await readEnvFile(filePath);
    envMap = mergeEnv(envMap, fileEnvs, true);
  }

  // 如果开启 export，则从当前进程环境中读取并合并（仅限已定义键）
  if (isExport) {
    const processingEnv: EnvMap = {};
    for (const key of configKeys) {
      const val = process.env[key];
      if (val !== undefined) {
        processingEnv[key] = String(val);
      }
    }
    envMap = mergeEnv(envMap, processingEnv, true);
  }

  // 只保留配置里声明过的键
  const allowedKeys = new Set(configKeys);
  for (const key of Object.keys(envMap)) {
    if (!allowedKeys.has(key)) {
      delete envMap[key];
    }
  }

  return envMap;
}

export async function saveEnvs(configPath: string, envMap: EnvMap, tag?: string) {
  const dbManager = createDatabaseManagerFromConfigPath(configPath);

  dbManager.batchUpsertTaggedValues(envMap, tag);

  dbManager.close();
}

export async function writeEnvs(configPath: string, envMap: EnvMap) {
  const configManager = new ConfigManager(configPath);
  const files = configManager.getEnvFilesConfig();
  const configDir = dirname(configPath);
  for (const file of files) {
    const filePath = isAbsolute(file) ? file : join(configDir, file);
    await writeEnvFile(filePath, envMap);
  }
}
