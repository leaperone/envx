# @leaperone/envx

A powerful environment management CLI tool built with Node.js and TypeScript.

## 🚀 Features

- ✨ Modern command-line interface
- 🎨 Colored output and emoji support
- 🔧 Modular command system
- 📦 Easy to extend and customize
- 🛡️ Complete TypeScript type support
- 🔄 Latest dependency versions

## 📦 Installation

### Global Installation

```bash
npm install -g @leaperone/envx
# or using pnpm
pnpm add -g @leaperone/envx
```

### Local Development

```bash
git clone git@github.com:leaperone/envx.git
cd envx
pnpm install
pnpm link
```

## 🎯 Usage

### Basic Commands

```bash
# Show help information
envx --help

# Clone environment configuration
envx clone my-env
envx clone my-env ./new-env --force
envx clone my-env --recursive --depth 3

# Export environment configuration
envx export
envx export production --format yaml --output config.yaml
envx export dev --format env --include database,redis

# Show version information
envx version
```

### Command Options

- `clone <source> [destination]` - Clone environment configuration
  - `-f, --force` - Force overwrite existing target
  - `-r, --recursive` - Recursively clone including sub-environments
  - `-d, --depth <number>` - Clone depth for recursive operations

- `export [environment]` - Export environment configuration
  - `-f, --format <format>` - Export format (json, yaml, env, docker)
  - `-o, --output <file>` - Output file path
  - `-i, --include <items>` - Include specific items
  - `-e, --exclude <items>` - Exclude specific items
  - `-v, --verbose` - Verbose output

## 🛠️ Development

### Project Structure

```
envx/
├── src/                  # TypeScript source code
│   ├── index.ts         # CLI entry file
│   ├── commands/        # Command modules
│   │   ├── version.ts
│   │   ├── clone.ts
│   │   └── export.ts
│   └── utils/           # Utility functions
│       └── logger.ts
├── dist/                # Compiled JavaScript files
├── package.json
├── tsconfig.json        # TypeScript configuration
└── README.md
```

### Development Commands

```bash
# Install dependencies
pnpm install

# Run in development mode (using tsx)
pnpm dev clone my-env

# Build project (using tsup)
pnpm build

# Run built version
pnpm start clone my-env

# Clean build files
pnpm clean
```

### Build System

The project uses [tsup](https://github.com/egoist/tsup) as the build tool, which provides:

- ⚡️ Extremely fast build speed
- 📦 Generates ESM format, supporting modern Node.js
- 🎯 Automatically adds CLI shebang
- 🗺️ Complete sourcemap support
- 📝 TypeScript declaration file generation

### Local Testing

```bash
# Link to global
pnpm link

# Test commands
envx clone my-env
```

### Adding New Commands

1. Create new TypeScript command files in the `src/commands/` directory
2. Import and register new commands in `src/index.ts`
3. Use the `Logger` class for output
4. Run `pnpm build` to rebuild

## 🔧 TypeScript Features

- Complete type definitions
- Strict type checking
- Modern ES module support
- Source map support

## 📋 Dependency Versions

### Core Dependencies

- **commander**: ^14.0.0 - Command line argument processing
- **chalk**: ^5.6.0 - Colored output
- **inquirer**: ^12.9.4 - Interactive command line
- **ora**: ^8.2.0 - Loading animations

### Development Dependencies

- **typescript**: ^5.9.2 - TypeScript compiler
- **tsx**: ^4.20.5 - TypeScript executor
- **@types/node**: ^24.3.0 - Node.js type definitions

### Package Manager

- **pnpm**: 10.15.0

## 📝 License

ISC

## 🤝 Contributing

Issues and Pull Requests are welcome!
