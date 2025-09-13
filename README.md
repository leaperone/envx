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

# Show version information
envx version
```

### Configuration Management

```bash
# Initialize envx configuration from existing .env file
envx init
envx init -f .env.production                    # specify .env file path
envx init -o ./config/envx.config.yaml         # specify output config path
envx init --force                              # overwrite existing config

# Test configuration and database functionality
envx test
envx test -v                                   # verbose output
envx test -j                                   # JSON output
```

### Environment Variable Management

```bash
# Set or update an environment variable
envx set DATABASE_URL "postgresql://localhost:5432/mydb"
envx set API_KEY "abc123" -d "API authentication key"
envx set DEBUG "true" -t "./config/.env"      # specify target file
envx set NODE_ENV "production" --force        # force update without confirmation

# Delete an environment variable
envx del DATABASE_URL
envx del API_KEY --force                       # force deletion without confirmation

# Load environment variables from database
envx load --all                                # load all variables from config
envx load -k DATABASE_URL                      # load specific variable
envx load -t v1.0.0                           # load all variables from tag
envx load -v 5                                # load specific version
envx load --all --export                       # export to shell commands
envx load --all --shell bash --export          # specify shell format
```

### History and Versioning

```bash
# View environment variable history
envx history                                   # show available queries
envx history -k DATABASE_URL                   # filter by key
envx history --version 3                      # filter by version
envx history --tag v1.0.0                     # filter by tag
envx history -l 20                            # limit records shown
envx history -f json                          # JSON output format
envx history -v                               # verbose output with full values

# Create tagged versions
envx tag v1.0.0                               # create tag from current values
envx tag v2.0.0 -m "Production release"       # tag with message
envx tag v1.1.0 -v                            # verbose output
```

### Remote Operations

```bash
# Push environment variables to remote server
envx push v1.0.0                              # push tag to default remote
envx push myproject:v1.0.0                    # push to specific project
envx push https://api.example.com/ns/proj:v1.0.0  # push to full URL
envx push v1.0.0 -v                           # verbose output

# Pull environment variables from remote server
envx pull v1.0.0                              # pull tag from default remote
envx pull myproject:v1.0.0                   # pull from specific project
envx pull https://api.example.com/ns/proj:v1.0.0  # pull from full URL
envx pull v1.0.0 -k DATABASE_URL              # pull specific variable
envx pull v1.0.0 --not-load                   # don't load into current env
envx pull v1.0.0 --export                     # export to shell commands
envx pull v1.0.0 --force                      # force pull even if not in config
```

### Legacy Commands (URL-based)

```bash
# Export environment from URL
envx export https://example.com/env.txt
envx export https://example.com/env.txt --exec "printenv DEBUG && node app.js"
envx export https://example.com/env.txt --shell powershell --exec "echo $Env:DEBUG"
envx export https://example.com/env.txt --print                # default shell
envx export https://example.com/env.txt --shell cmd --print    # cmd format

# Unset variables from URL
envx unset https://example.com/unset.txt
envx unset https://example.com/unset.txt --print
```

### Command Options Reference

#### Configuration Commands
- `init` - Initialize envx configuration from existing .env file
  - `-f, --file <path>` - Path to .env file (default: `./.env`)
  - `-o, --output <path>` - Output path for config file (default: `./envx.config.yaml`)
  - `--force` - Overwrite existing config file

- `test` - Test configuration and database functionality
  - `-c, --config <path>` - Path to config file (default: `./envx.config.yaml`)
  - `-v, --verbose` - Show detailed test information
  - `-j, --json` - Output results in JSON format

#### Environment Variable Commands
- `set <key> <value>` - Set or update an environment variable
  - `-c, --config <path>` - Path to config file (default: `./envx.config.yaml`)
  - `-d, --description <text>` - Description for the environment variable
  - `-t, --target <path>` - Target path for the environment variable
  - `--force` - Force update without confirmation if variable exists

- `del <key>` - Delete an environment variable
  - `-c, --config <path>` - Path to config file (default: `./envx.config.yaml`)
  - `--force` - Force deletion without confirmation

- `load` - Load environment variables from database
  - `-c, --config <path>` - Path to config file (default: `./envx.config.yaml`)
  - `-k, --key <key>` - Load specific environment variable by key
  - `-v, --version <number>` - Load specific version of the variable
  - `-t, --tag <tag>` - Load all environment variables from a specific tag
  - `-a, --all` - Load all environment variables defined in config
  - `-e, --export` - Export variables to shell (print export commands)
  - `-s, --shell <shell>` - Target shell: `sh` | `bash` | `zsh` | `fish` | `cmd` | `powershell`
  - `--force` - Force load from database even if variable not in config

#### History Commands
- `history` - View environment variable history records
  - `-c, --config <path>` - Path to config file (default: `./envx.config.yaml`)
  - `-k, --key <key>` - Filter history by specific environment variable key
  - `--version <number>` - Filter history by specific version number
  - `--tag <tag>` - Filter history by specific tag
  - `-l, --limit <number>` - Limit number of records to show (default: 50)
  - `-f, --format <format>` - Output format: `table` | `json` (default: table)
  - `-v, --verbose` - Show detailed information including full values

- `tag <tagname>` - Create a new version of environment variables with a tag
  - `-c, --config <path>` - Path to config file (default: `./envx.config.yaml`)
  - `-m, --message <text>` - Message describing this tag
  - `-a, --all` - Tag all environment variables in the config
  - `-v, --verbose` - Verbose output

#### Remote Commands
- `push <ref>` - Push environment variables to remote server
  - `-c, --config <path>` - Path to config file (default: `./envx.config.yaml`)
  - `-d, --dev-config <path>` - Path to dev config file (default: `.envx/dev.config.yaml`)
  - `-v, --verbose` - Verbose output

- `pull <ref>` - Pull environment variables from remote server
  - `-c, --config <path>` - Path to config file (default: `./envx.config.yaml`)
  - `-d, --dev-config <path>` - Path to dev config file (default: `.envx/dev.config.yaml`)
  - `-k, --key <key>` - Pull specific environment variable by key
  - `--not-load` - Do not load pulled variables into current env
  - `-e, --export` - Export variables to shell (print export commands)
  - `-s, --shell <shell>` - Target shell: `sh` | `bash` | `zsh` | `fish` | `cmd` | `powershell`
  - `--force` - Force pull and load even if variable not in config
  - `-v, --verbose` - Verbose output

#### Legacy Commands
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
│   │   ├── version.ts   # Version information
│   │   ├── init.ts      # Initialize configuration
│   │   ├── set.ts       # Set environment variables
│   │   ├── del.ts       # Delete environment variables
│   │   ├── load.ts      # Load variables from database
│   │   ├── history.ts   # View history records
│   │   ├── test.ts      # Test configuration
│   │   ├── tag.ts       # Create tagged versions
│   │   ├── push.ts      # Push to remote server
│   │   ├── pull.ts      # Pull from remote server
│   │   ├── export.ts    # Export from URL (legacy)
│   │   └── unset.ts     # Unset from URL (legacy)
│   ├── types/           # TypeScript type definitions
│   │   ├── common.ts
│   │   └── config.ts
│   └── utils/           # Utility functions
│       ├── config/      # Configuration management
│       ├── db.ts        # Database operations
│       ├── env.ts       # Environment file operations
│       ├── logger.ts    # Logging utilities
│       └── url.ts       # URL parsing utilities
├── docs/                # Documentation
│   ├── README-zh.md     # Chinese documentation
│   ├── pull-command-examples.md
│   └── push-command-examples.md
├── dist/                # Compiled JavaScript files
├── package.json
├── tsconfig.json        # TypeScript configuration
├── tsup.config.ts       # Build configuration
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
3. Use the `ConfigManager` class for configuration management
4. Use the `createDatabaseManager` function for database operations
5. Use the `chalk` library for colored output
6. Follow the existing command structure with proper error handling
7. Run `pnpm build` to rebuild

### Command Development Guidelines

- Each command should have comprehensive error handling
- Use interactive prompts with `inquirer` for user confirmation
- Provide verbose output options with `-v, --verbose`
- Support configuration file path customization with `-c, --config`
- Include helpful tips and suggestions in error messages
- Use consistent emoji and color coding for output
- Support both table and JSON output formats where appropriate

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
