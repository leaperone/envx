import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { EnvxConfig, ConfigParseResult, ConfigValidationResult, EnvConfig, DevConfig, DevConfigParseResult } from '.';

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
   * 从字符串解析 dev 配置
   */
  static parseDevFromString(content: string): DevConfigParseResult {
    try {
      const parsed = parse(content) as DevConfig;
      const validation = this.validateDevConfig(parsed);
      return { config: parsed, validation };
    } catch (error) {
      return {
        config: {},
        validation: {
          isValid: false,
          errors: [`dev 配置文件格式错误: ${error instanceof Error ? error.message : '未知错误'}`],
          warnings: [],
        },
      };
    }
  }

  /**
   * 验证 dev 配置
   */
  static validateDevConfig(config: DevConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config || typeof config !== 'object') {
      errors.push('dev 配置缺失或格式错误');
      return { isValid: false, errors, warnings };
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  // dev 默认配置不在 parser 层提供，由 manager 层负责

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
          if (envConfig.files && typeof envConfig.files === 'string') {
            if (!envConfig.files.startsWith('./') && !envConfig.files.startsWith('/')) {
              warnings.push(`环境变量 ${key} 的 clone 路径建议使用相对路径: ${envConfig.files}`);
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
      files: './.env',
      env: {},
    };
  }

  static getDefaultEnvConfig(key: string): EnvConfig {
    return {
      target: key,
      files: undefined,
      default: undefined,
      description: undefined,
      required: false,
    };
  }

  /**
   * 获取所有环境变量配置
   */
  static getEnvConfigs(config: EnvxConfig): Array<{ key: string; config: EnvConfig }> {
    const result: Array<{ key: string; config: EnvConfig }> = [];

    for (const [key, value] of Object.entries(config.env)) {
      result.push({ key, config: this.normalizeEnvValue(value, key) });
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
   * 将 env 配置项的各种格式（string / EnvConfig / undefined / null）
   * 统一转换为 EnvConfig 对象
   */
  static normalizeEnvValue(value: EnvTarget | EnvConfig | undefined | null, key: string): EnvConfig {
    if (value === null || value === undefined) {
      return this.getDefaultEnvConfig(key);
    }
    if (typeof value === 'string') {
      // 简写格式: KEY: ".env" — string 作为 target
      return { ...this.getDefaultEnvConfig(key), target: value };
    }
    // 完整对象格式
    return {
      target: value.target || key,
      files: value.files || undefined,
      default: value.default || undefined,
      description: value.description || undefined,
      required: value.required || false,
    };
  }

  /**
   * 获取环境变量配置（兼容旧调用）
   */
  static getEnvVar(config: EnvxConfig, key: string): EnvConfig {
    return this.normalizeEnvValue(config.env[key], key);
  }

  /**
   * 获取环境变量的目标源
   */
  static getEnvVarTarget(config: EnvxConfig, key: string): string | undefined {
    return this.getEnvVar(config, key).target;
  }

  /**
   * 获取环境变量的默认值
   */
  static getEnvVarDefault(config: EnvxConfig, key: string): string | undefined {
    return this.getEnvVar(config, key).default;
  }
}
