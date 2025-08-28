import { defineConfig } from 'tsup'
import { readFileSync } from 'fs'

// 读取 package.json 信息
const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'))

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  target: 'ES2022',
  platform: 'node',
  external: ['commander', 'chalk', 'inquirer', 'ora'],
  noExternal: [],
  treeshake: true,
  minify: false,
  env: {
    PACKAGE_NAME: packageJson.name,
    PACKAGE_VERSION: packageJson.version,
    PACKAGE_DESCRIPTION: packageJson.description,
    PACKAGE_LICENSE: packageJson.license,
  },
})
