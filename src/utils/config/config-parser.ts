import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { EnvxConfig, ConfigParseResult, ConfigValidationResult, EnvConfig, EnvTarget } from '.';

export class ConfigParser {
  /**
   * 从文件路径解析配置文件
   */
  static parseFromFile(filePath: string): ConfigParseResult {
    try {
      const content = readFileSync(filePath, 'utf-8');
      return this.parseFromString(content);
    } catch (error) {
      return {
        config: this.getDefaultConfig(),
        validation: {
          isValid: false,
          errors: [`无法读取配置文件: ${error instanceof Error ? error.message : '未知错误'}`],
          warnings: [],
        },
      };
    }
  }

  /**
   * 从字符串解析配置文件
   */
  static parseFromString(content: string): ConfigParseResult {
    try {
      const parsed = parse(content) as EnvxConfig;
      const validation = this.validateConfig(parsed);

      return {
        config: parsed,
        validation,
      };
    } catch (error) {
      return {
        config: this.getDefaultConfig(),
        validation: {
          isValid: false,
          errors: [`配置文件格式错误: ${error instanceof Error ? error.message : '未知错误'}`],
          warnings: [],
        },
      };
    }
  }

  /**
   * 验证配置文件
   */
  static validateConfig(config: EnvxConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查必需字段
    if (!config.version) {
      errors.push('缺少必需的 version 字段');
    }

    if (!config.env || typeof config.env !== 'object') {
      errors.push('缺少必需的 env 字段或格式错误');
    }

    // 验证版本
    if (config.version && config.version !== 1) {
      warnings.push(`当前版本 ${config.version} 可能不被支持`);
    }

    // 验证环境变量配置
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        if (typeof value === 'object' && value !== null) {
          const envConfig = value as EnvConfig;

          // 验证 target 格式
          if (envConfig.target && typeof envConfig.target === 'string') {
            if (envConfig.target.startsWith('@') && !envConfig.target.includes('/')) {
              warnings.push(`环境变量 ${key} 的 target 格式可能不正确: ${envConfig.target}`);
            }
          }

          // 验证 clone 路径
          if (envConfig.clone && typeof envConfig.clone === 'string') {
            if (!envConfig.clone.startsWith('./') && !envConfig.clone.startsWith('/')) {
              warnings.push(`环境变量 ${key} 的 clone 路径建议使用相对路径: ${envConfig.clone}`);
            }
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 获取默认配置
   */
  static getDefaultConfig(): EnvxConfig {
    return {
      version: 1,
      export: false,
      clone: './.env',
      env: {},
    };
  }

  /**
   * 获取所有环境变量配置
   */
  static getEnvConfigs(config: EnvxConfig): Array<{ key: string; config: EnvConfig }> {
    const result: Array<{ key: string; config: EnvConfig }> = [];

    for (const [key, value] of Object.entries(config.env)) {
      if (typeof value === 'object' && value !== null) {
        result.push({ key, config: value as EnvConfig });
      }
    }

    return result;
  }

  /**
   * 获取简单环境变量（直接赋值的）
   */
  static getSimpleEnvVars(config: EnvxConfig): Array<{ key: string; value: string }> {
    const result: Array<{ key: string; value: string }> = [];

    for (const [key, value] of Object.entries(config.env)) {
      if (typeof value !== 'object' || value === null) {
        if (value === undefined) {
          // 如果值为 undefined，使用 key 作为值
          result.push({ key, value: key });
        } else {
          result.push({ key, value: value as string });
        }
      } else {
        // 处理配置对象
        const config = value as EnvConfig;
        if (config.default !== undefined) {
          // 如果有默认值，使用默认值
          result.push({ key, value: String(config.default) });
        } else if (config.target) {
          // 如果有 target，使用 target
          result.push({ key, value: config.target });
        } else {
          // 如果没有 target 且没有默认值，使用 key 作为值
          result.push({ key, value: key });
        }
      }
    }

    return result;
  }

  /**
   * 检查环境变量是否存在
   */
  static hasEnvVar(config: EnvxConfig, key: string): boolean {
    return key in config.env;
  }

  /**
   * 获取环境变量配置
   */
  static getEnvVar(config: EnvxConfig, key: string): EnvTarget | EnvConfig | undefined {
    return config.env[key];
  }

  /**
   * 获取环境变量的目标源
   */
  static getEnvVarTarget(config: EnvxConfig, key: string): string | undefined {
    const envVar = config.env[key];
    if (typeof envVar === 'object' && envVar !== null && 'target' in envVar) {
      return (envVar as EnvConfig).target;
    }
    return undefined;
  }

  /**
   * 获取环境变量的默认值
   */
  static getEnvVarDefault(config: EnvxConfig, key: string): string | undefined {
    const envVar = config.env[key];
    if (typeof envVar === 'object' && envVar !== null && 'default' in envVar) {
      return (envVar as EnvConfig).default;
    }
    return undefined;
  }
}
