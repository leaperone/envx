export interface EnvxConfig {
  version: number;
  export?: boolean;
  files?: string | string[] | undefined;
  env: Record<string, EnvTarget | EnvConfig | undefined>;
}

export type EnvTarget = string;

export interface EnvConfig {
  target?: EnvTarget;
  files?: string | string[] | undefined;
  default?: string | undefined;
  description?: string | undefined;
  required?: boolean;
}

export interface ParsedEnvConfig {
  key: string;
  config: EnvConfig;
}

export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConfigParseResult {
  config: EnvxConfig;
  validation: ConfigValidationResult;
}
