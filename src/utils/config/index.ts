// 类型定义
export * from '../../types/config';

// 工具类
export { ConfigParser } from './config-parser';
export { ConfigManager } from './config-manager';
export { ConfigValidator } from './config-validator';

// 便利别名 - 提供更清晰的命名
export { ConfigParser as ConfigParserUtils } from './config-parser';
export { ConfigValidator as ConfigValidatorUtils } from './config-validator';

// 重新导出常用静态方法作为便利函数
import { ConfigParser } from './config-parser';
import { ConfigValidator } from './config-validator';

export const getDefaultConfig = ConfigParser.getDefaultConfig;
export const getEnvConfigs = ConfigParser.getEnvConfigs;
export const getSimpleEnvVars = ConfigParser.getSimpleEnvVars;
export const hasEnvVar = ConfigParser.hasEnvVar;
export const getEnvVar = ConfigParser.getEnvVar;
export const getEnvVarTarget = ConfigParser.getEnvVarTarget;
export const getEnvVarDefault = ConfigParser.getEnvVarDefault;
export const validateFull = ConfigValidator.validateFull;
