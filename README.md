# @leaperone/envx

> Languages: [English](./README.md) | [中文](./docs/README-zh.md)

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

# Clone .env from URL to local file (default: .env)
envx clone https://example.com/env.txt
envx clone -f https://example.com/env.txt               # force overwrite local values
envx clone https://example.com/env.txt ./config/.env    # custom dest path

# Export environment from URL
# Default: apply to a new subshell (Windows: PowerShell; others: current SHELL)
envx export https://example.com/env.txt
# Execute a command with variables applied (child process only)
envx export https://example.com/env.txt --exec "printenv DEBUG && node app.js"
envx export https://example.com/env.txt --shell powershell --exec "echo $Env:DEBUG"
# Only print commands
envx export https://example.com/env.txt --print                # default shell
envx export https://example.com/env.txt --shell cmd --print    # cmd format

# Unset variables from URL (keys list or KEY= lines)
# Default: start a subshell with those variables removed
envx unset https://example.com/unset.txt
# Only print unset commands
envx unset https://example.com/unset.txt --print

# Show version information
envx version
```

### Command Options

- `clone <url> [dest]` - Fetch plaintext env and write to file (default `.env`)
  - `-f, --force` - Overwrite local values with remote ones when keys conflict

- `export <url>` - Fetch env and apply/print shell commands
  - `-s, --shell <shell>` - Target shell: `sh` | `cmd` | `powershell`
  - `--apply` - Start a new subshell with variables applied (default if no `--print` and no `--exec`)
  - `--exec <command>` - Run a command with variables applied (child process)
  - `--print` - Only print commands, do not execute
  - `-v, --verbose` - Verbose output

- `unset <url>` - Fetch keys and unset them
  - `-s, --shell <shell>` - Target shell: `sh` | `cmd` | `powershell`
  - `--apply` - Start a new subshell with variables unset (default if no `--print`)
  - `--print` - Only print commands, do not execute
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
│   │   ├── export.ts
│   │   └── unset.ts
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
