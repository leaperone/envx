import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { stringify } from 'yaml';
import { ConfigParser } from './config-parser';
import { EnvxConfig, EnvConfig, EnvTarget, DevConfig, DevConfigParseResult } from '.';

export class ConfigManager {
  private config: EnvxConfig;
  private configPath: string;

  constructor(configPath: string = './envx.config.yaml') {
    this.configPath = configPath;
    this.config = this.loadConfig();
  }

  /**
   * 加载配置文件
   */
  private loadConfig(): EnvxConfig {
    if (existsSync(this.configPath)) {
      const result = ConfigParser.parseFromFile(this.configPath);
      if (result.validation.isValid) {
        return result.config;
      } else {
        const errors = result.validation.errors.join(', ');
        throw new Error(`配置文件验证失败: ${errors}`);
      }
    }
    throw new Error(`配置文件不存在: ${this.configPath}`);
  }

  /**
   * 保存配置文件
   */
  save(): void {
    try {
      // 确保目录存在
      const dir = this.configPath.substring(0, this.configPath.lastIndexOf('/'));
      if (dir && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const yamlContent = stringify(this.config, {
        indent: 2,
        lineWidth: 120,
        minContentWidth: 20,
      });

      // 手动处理YAML格式，移除空对象的 {} 括号和null值
      let processedYaml = yamlContent;

      // 替换所有的 ": {}" 为 ":"
      processedYaml = processedYaml.replace(/:\s*\{\s*\}/g, ':');

      // 替换所有的 ": null" 为 ":"
      processedYaml = processedYaml.replace(/:\s*null\s*$/gm, ':');

      // 替换所有的 ": undefined" 为 ":"
      processedYaml = processedYaml.replace(/:\s*undefined\s*$/gm, ':');

      // 替换所有的 ": "" 为 ":"
      processedYaml = processedYaml.replace(/:\s*""\s*$/gm, ':');

      writeFileSync(this.configPath, processedYaml, 'utf-8');
    } catch (error) {
      throw new Error(`保存配置文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  getEnvFilesConfig(): string[] {
    const files = this.config.files;
    if (!files) return [];
    return Array.isArray(files) ? files : [files];
  }

  isExport(): boolean {
    return this.config.export === true;
  }

  /**
   * 获取当前配置
   */
  getConfig(): EnvxConfig {
    return { ...this.config };
  }

  /**
   * 设置环境变量
   */
  setEnvVar(key: string, value: EnvTarget | EnvConfig): void {
    this.config.env[key] = value;
  }

  /**
   * 删除环境变量
   */
  deleteEnvVar(key: string): boolean {
    if (key in this.config.env) {
      delete this.config.env[key];
      return true;
    }
    return false;
  }

  /**
   * 更新环境变量配置
   */
  updateEnvVar(key: string, updates: Partial<EnvConfig>): boolean {
    const current = this.config.env[key];
    if (typeof current === 'object' && current !== null) {
      this.config.env[key] = { ...current, ...updates } as EnvConfig;
      return true;
    }
    return false;
  }

  /**
   * 设置配置选项
   */
  setConfigOption<K extends keyof EnvxConfig>(key: K, value: EnvxConfig[K]): void {
    this.config[key] = value;
  }

  /**
   * 获取配置选项
   */
  getConfigOption<K extends keyof EnvxConfig>(key: K): EnvxConfig[K] {
    return this.config[key];
  }

  /**
   * 添加环境变量组
   */
  addEnvGroup(groupName: string, envVars: Record<string, EnvTarget | EnvConfig | undefined>): void {
    if (!this.config.env[groupName]) {
      this.config.env[groupName] = {};
    }

    const group = this.config.env[groupName];
    if (typeof group === 'object' && group !== null) {
      Object.assign(group, envVars);
    }
  }

  /**
   * 获取环境变量组
   */
  getEnvGroup(groupName: string): Record<string, EnvTarget | EnvConfig | undefined> | undefined {
    const group = this.config.env[groupName];
    if (typeof group === 'object' && group !== null) {
      return { ...group } as Record<string, EnvTarget | EnvConfig | undefined>;
    }
    return undefined;
  }

  /**
   * 检查环境变量是否存在
   */
  hasEnvVar(key: string): boolean {
    return ConfigParser.hasEnvVar(this.config, key);
  }

  /**
   * 获取环境变量
   */
  getEnvVar(key: string): EnvTarget | EnvConfig | string {
    const value = ConfigParser.getEnvVar(this.config, key);

    if (value === undefined) {
      // 如果值为 undefined，返回 key 本身
      return key;
    } else if (typeof value === 'object' && value !== null) {
      const config = value as EnvConfig;
      if (config.default !== undefined) {
        // 如果有默认值，返回默认值
        return config.default;
      } else if (config.target) {
        // 如果有 target，返回 target
        return config.target;
      } else {
        // 如果没有 target 且没有默认值，返回 key 本身
        return key;
      }
    } else {
      // 如果是简单值，直接返回
      return value;
    }
  }

  /**
   * 获取所有环境变量配置
   */
  getAllEnvConfigs(): Array<{ key: string; config: EnvConfig }> {
    return ConfigParser.getEnvConfigs(this.config);
  }

  /**
   * 验证当前配置
   */
  validate(): ReturnType<typeof ConfigParser.validateConfig> {
    return ConfigParser.validateConfig(this.config);
  }

  /**
   * 重置为默认配置
   */
  resetToDefault(): void {
    this.config = ConfigParser.getDefaultConfig();
  }

  /**
   * 合并配置
   */
  mergeConfig(otherConfig: Partial<EnvxConfig>): void {
    this.config = { ...this.config, ...otherConfig };

    // 深度合并 env 对象
    if (otherConfig.env) {
      this.config.env = { ...this.config.env, ...otherConfig.env };
    }
  }

  /**
   * 导出为对象（用于环境变量）
   */
  exportToEnv(): Record<string, string> {
    const envVars: Record<string, string> = {};

    for (const [key, value] of Object.entries(this.config.env)) {
      if (typeof value === 'object' && value !== null) {
        const config = value as EnvConfig;
        if (config.default !== undefined) {
          envVars[key] = String(config.default);
        } else if (config.target) {
          // 如果有 target，使用 target 作为值
          envVars[key] = config.target;
        } else {
          // 如果没有 target 且没有默认值，使用 key 作为值
          envVars[key] = key;
        }
      } else if (value === undefined) {
        // 如果值为 undefined，使用 key 作为值
        envVars[key] = key;
      } else {
        envVars[key] = String(value);
      }
    }

    return envVars;
  }

  /**
   * 创建基础配置
   */
  createBaseConfig(
    envVars: Record<string, string>,
    files: string | string[] = './.env'
  ): EnvxConfig {
    if (typeof files === 'string') {
      files = [files];
    }

    const config: EnvxConfig = {
      version: 1,
      export: false,
      files: files as string | string[],
      env: {},
    };

    // 为每个环境变量创建空的配置项
    for (const key of Object.keys(envVars)) {
      config.env[key] = {};
    }

    return config;
  }

  /**
   * 获取 dev 默认配置
   */
  getDefaultDevConfig(): DevConfig {
    return {};
  }

  /**
   * 读取 dev 配置，默认路径为 .envx/dev.config.yaml
   * 若文件不存在或内容无效，则回退到默认配置并提供 warning。
   */
  getDevConfig(devConfigPath: string = '.envx/dev.config.yaml'): DevConfigParseResult {
    if (!existsSync(devConfigPath)) {
      return {
        config: this.getDefaultDevConfig(),
        validation: {
          isValid: true,
          errors: [],
          warnings: ['dev config not found, using defaults'],
        },
      };
    }

    try {
      const content = readFileSync(devConfigPath, 'utf-8');
      const result = ConfigParser.parseDevFromString(content);
      if (result.validation.isValid) {
        return result;
      }
      return {
        config: this.getDefaultDevConfig(),
        validation: {
          isValid: true,
          errors: [],
          warnings: [...result.validation.warnings, 'invalid dev config, using defaults', ...result.validation.errors],
        },
      };
    } catch (error) {
      return {
        config: this.getDefaultDevConfig(),
        validation: {
          isValid: true,
          errors: [],
          warnings: [`failed to read dev config: ${error instanceof Error ? error.message : 'unknown error'}`, 'using defaults'],
        },
      };
    }
  }
}
