import { EnvMap } from '@/types/common';
import { ConfigManager } from './config/config-manager';
import { createDatabaseManagerFromConfigPath } from './db';
import { mergeEnv, readEnvFile, writeEnvFile } from './env';
import { dirname, isAbsolute, join } from 'path';

export async function getEnvs(configPath: string, tag?: string): Promise<EnvMap> {
  const configManager = new ConfigManager(configPath);
  const isExport = configManager.isExport();
  const globalFiles = configManager.getEnvFilesConfig();
  const configDir = dirname(configPath);

  // 允许键集合来自配置文件定义
  const configKeys = Object.keys(configManager.getConfig().env);
  const allConfigs = configManager.getAllEnvConfigs();

  let envMap: EnvMap = {};

  if (tag) {
    const dbManager = createDatabaseManagerFromConfigPath(configPath);
    try {
      envMap = dbManager.getTaggedValues(tag);
      return envMap;
    } finally {
      dbManager.close();
    }
  }

  // 收集所有需要读取的文件
  const allFiles = new Set<string>(globalFiles);
  for (const conf of allConfigs) {
    if (conf.config.files) {
      const files = Array.isArray(conf.config.files) ? conf.config.files : [conf.config.files];
      files.forEach(f => allFiles.add(f));
    }
  }

  // 读取所有相关文件到缓存
  const fileContents: Record<string, EnvMap> = {};
  for (const file of allFiles) {
    const filePath = isAbsolute(file) ? file : join(configDir, file);
    fileContents[file] = await readEnvFile(filePath);
  }

  // 按变量从其配置的目标文件中读取值
  for (const conf of allConfigs) {
    const key = conf.key;
    let targetFiles: string[];
    if (conf.config.files) {
      targetFiles = Array.isArray(conf.config.files) ? conf.config.files : [conf.config.files];
    } else {
      targetFiles = globalFiles;
    }

    for (const file of targetFiles) {
      const fileEnv = fileContents[file];
      if (fileEnv && key in fileEnv) {
        envMap[key] = fileEnv[key];
      }
    }
  }

  // 如果开启 export，则从当前进程环境中读取并合并（仅限已定义键）
  if (isExport) {
    for (const key of configKeys) {
      const val = process.env[key];
      if (val !== undefined) {
        envMap[key] = String(val);
      }
    }
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
  try {
    dbManager.batchUpsertTaggedValues(envMap, tag);
  } finally {
    dbManager.close();
  }
}

export async function writeEnvs(configPath: string, envMap: EnvMap) {
  const configManager = new ConfigManager(configPath);
  const globalFiles = configManager.getEnvFilesConfig();
  const configDir = dirname(configPath);
  const allConfigs = configManager.getAllEnvConfigs();

  // 按目标文件分组变量
  const fileEnvMap: Record<string, EnvMap> = {};
  for (const file of globalFiles) {
    fileEnvMap[file] = {};
  }

  for (const [key, value] of Object.entries(envMap)) {
    const envConf = allConfigs.find(c => c.key === key);
    let targetFiles: string[];

    if (envConf?.config.files) {
      targetFiles = Array.isArray(envConf.config.files)
        ? envConf.config.files
        : [envConf.config.files];
    } else {
      targetFiles = globalFiles; // fallback 到全局 files
    }

    for (const file of targetFiles) {
      if (!fileEnvMap[file]) fileEnvMap[file] = {};
      fileEnvMap[file][key] = value;
    }
  }

  // 按文件写入
  for (const [file, envs] of Object.entries(fileEnvMap)) {
    const filePath = isAbsolute(file) ? file : join(configDir, file);
    await writeEnvFile(filePath, envs);
  }
}
