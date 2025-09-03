import { EnvxConfig, EnvConfig, ConfigValidationResult } from '.';

export class ConfigValidator {
  /**
   * 验证配置文件的完整性和正确性
   */
  static validateFull(config: EnvxConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 基础验证
    const basicValidation = this.validateBasic(config);
    errors.push(...basicValidation.errors);
    warnings.push(...basicValidation.warnings);

    // 环境变量验证
    const envValidation = this.validateEnvironmentVariables(config);
    errors.push(...envValidation.errors);
    warnings.push(...envValidation.warnings);

    // 路径验证
    const pathValidation = this.validatePaths(config);
    errors.push(...pathValidation.errors);
    warnings.push(...pathValidation.warnings);

    // 引用验证
    const referenceValidation = this.validateReferences(config);
    errors.push(...referenceValidation.errors);
    warnings.push(...referenceValidation.warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 基础验证
   */
  private static validateBasic(config: EnvxConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 版本验证
    if (!config.version) {
      errors.push('缺少必需的 version 字段');
    } else if (typeof config.version !== 'number') {
      errors.push('version 字段必须是数字类型');
    } else if (config.version !== 1) {
      warnings.push(`当前版本 ${config.version} 可能不被支持，建议使用版本 1`);
    }

    // export 字段验证
    if (config.export !== undefined && typeof config.export !== 'boolean') {
      errors.push('export 字段必须是布尔类型');
    }

    // clone 字段验证
    if (config.files !== undefined && typeof config.files !== 'string') {
      errors.push('clone 字段必须是字符串类型');
    }

    // env 字段验证
    if (!config.env) {
      errors.push('缺少必需的 env 字段');
    } else if (typeof config.env !== 'object' || Array.isArray(config.env)) {
      errors.push('env 字段必须是对象类型');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * 环境变量验证
   */
  private static validateEnvironmentVariables(config: EnvxConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.env) return { isValid: true, errors, warnings };

    for (const [key, value] of Object.entries(config.env)) {
      // 键名验证
      if (!this.isValidEnvKey(key)) {
        errors.push(`环境变量键名 "${key}" 格式不正确，只能包含字母、数字、下划线和连字符`);
      }

      if (typeof value === 'object' && value !== null) {
        const envConfig = value as EnvConfig;

        // 必需字段验证
        if (envConfig.required === true && envConfig.default === undefined && !envConfig.target) {
          warnings.push(`环境变量 "${key}" 标记为必需，但没有提供默认值或目标源`);
        }

        // 描述长度验证
        if (envConfig.description && envConfig.description.length > 200) {
          warnings.push(`环境变量 "${key}" 的描述过长，建议不超过 200 字符`);
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * 路径验证
   */
  private static validatePaths(config: EnvxConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 验证全局 clone 路径
    if (config.files) {
      if (Array.isArray(config.files)) {
        for (const p of config.files) {
          if (!this.isValidPath(p)) {
            errors.push(`全局 clone 路径 "${p}" 格式不正确`);
          }
        }
      } else {
        if (!this.isValidPath(config.files)) {
          errors.push(`全局 clone 路径 "${config.files}" 格式不正确`);
        }
      }
    }

    // 验证环境变量的 clone 路径
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        if (typeof value === 'object' && value !== null) {
          const envConfig = value as EnvConfig;

          if (envConfig.files) {
            if (Array.isArray(envConfig.files)) {
              for (const p of envConfig.files) {
                if (!this.isValidPath(p)) {
                  errors.push(`环境变量 "${key}" 的 clone 路径 "${p}" 格式不正确`);
                }
              }
            } else {
              if (!this.isValidPath(envConfig.files)) {
                errors.push(`环境变量 "${key}" 的 clone 路径 "${envConfig.files}" 格式不正确`);
              }
            }

            // 检查路径冲突（仅在全局与局部都为字符串时检查完全相等）
            if (
              typeof config.files === 'string' &&
              typeof envConfig.files === 'string' &&
              envConfig.files === config.files
            ) {
              warnings.push(`环境变量 "${key}" 的 clone 路径与全局 clone 路径相同，可能造成冲突`);
            }
          }
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * 引用验证
   */
  private static validateReferences(config: EnvxConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.env) return { isValid: true, errors, warnings };

    for (const [key, value] of Object.entries(config.env)) {
      if (typeof value === 'object' && value !== null) {
        const envConfig = value as EnvConfig;

        if (envConfig.target) {
          // 验证 target 格式
          if (!this.isValidTarget(envConfig.target)) {
            errors.push(`环境变量 "${key}" 的 target "${envConfig.target}" 格式不正确`);
          }

          // 检查循环引用
          if (this.hasCircularReference(config, key, new Set())) {
            errors.push(`环境变量 "${key}" 存在循环引用`);
          }
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * 验证环境变量键名
   */
  private static isValidEnvKey(key: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(key);
  }

  /**
   * 验证路径格式
   */
  private static isValidPath(path: string): boolean {
    // 允许相对路径、绝对路径和特殊路径
    return /^[./]|^[a-zA-Z]:|^\/|^~/.test(path);
  }

  /**
   * 验证 target 格式
   */
  private static isValidTarget(target: string): boolean {
    // 支持多种格式：
    // @username/project/key
    // @username/project
    // local
    // <target_url>
    return /^@[^/]+\/[^/]+(\/[^/]+)?$|^local$|^<.*>$/.test(target);
  }

  /**
   * 检查循环引用
   */
  private static hasCircularReference(
    config: EnvxConfig,
    currentKey: string,
    visited: Set<string>
  ): boolean {
    if (visited.has(currentKey)) {
      return true;
    }

    visited.add(currentKey);
    const current = config.env[currentKey];

    if (typeof current === 'object' && current !== null && current.target) {
      // 这里可以添加更复杂的循环引用检测逻辑
      // 目前只是简单的检查
    }

    visited.delete(currentKey);
    return false;
  }

  /**
   * 获取配置摘要信息
   */
  static getConfigSummary(config: EnvxConfig): {
    totalEnvVars: number;
    simpleVars: number;
    complexVars: number;
    groups: number;
    hasErrors: boolean;
    hasWarnings: boolean;
  } {
    if (!config.env) {
      return {
        totalEnvVars: 0,
        simpleVars: 0,
        complexVars: 0,
        groups: 0,
        hasErrors: false,
        hasWarnings: false,
      };
    }

    let simpleVars = 0;
    let complexVars = 0;
    let groups = 0;

    for (const value of Object.values(config.env)) {
      if (typeof value === 'object' && value !== null) {
        if (Object.keys(value).length === 0) {
          groups++;
        } else {
          complexVars++;
        }
      } else {
        simpleVars++;
      }
    }

    const validation = this.validateFull(config);

    return {
      totalEnvVars: simpleVars + complexVars + groups,
      simpleVars,
      complexVars,
      groups,
      hasErrors: validation.errors.length > 0,
      hasWarnings: validation.warnings.length > 0,
    };
  }
}
