import packageJson from '../../package.json';

export const PACKAGE_INFO = {
  name: packageJson.name,
  version: packageJson.version,
  description: packageJson.description,
  license: packageJson.license,
} as const;
