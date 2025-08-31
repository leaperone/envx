export interface EnvxConfig {
  version: number;
  export?: boolean;
  clone?: string;
  env: Record<string, EnvTarget | EnvConfig | undefined>;
}

export type EnvTarget = string;

export interface EnvConfig {
  target?: EnvTarget;
  clone?: string;
  default?: string;
  description?: string;
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
