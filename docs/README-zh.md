# @leaperone/envx

一个由 Node.js 与 TypeScript 构建的强大环境变量管理 CLI 工具。

## 🚀 功能特性

- ✨ 现代化命令行交互
- 🎨 彩色输出与表情符号支持
- 🔧 模块化命令系统，易于扩展
- 📦 轻松自定义与集成
- 🛡️ 完整 TypeScript 类型支持
- 🔄 依赖版本保持最新

## 📦 安装

### 全局安装

```bash
npm install -g @leaperone/envx
# 或使用 pnpm
pnpm add -g @leaperone/envx
```

### 本地开发

```bash
git clone git@github.com:leaperone/envx.git
cd envx
pnpm install
pnpm link
```

## 🎯 使用方法

### 基本命令

```bash
# 显示帮助信息
envx --help

# 查看版本信息
envx version
```

### 配置管理

```bash
# 从现有 .env 文件初始化 envx 配置
envx init
envx init -f .env.production                    # 指定 .env 文件路径
envx init -o ./config/envx.config.yaml         # 指定输出配置文件路径
envx init --force                              # 覆盖现有配置

# 测试配置和数据库功能
envx test
envx test -v                                   # 详细输出
envx test -j                                   # JSON 格式输出
```

### 环境变量管理

```bash
# 设置或更新环境变量
envx set DATABASE_URL "postgresql://localhost:5432/mydb"
envx set API_KEY "abc123" -d "API 认证密钥"
envx set DEBUG "true" -t "./config/.env"      # 指定目标文件
envx set NODE_ENV "production" --force        # 强制更新无需确认

# 删除环境变量
envx del DATABASE_URL
envx del API_KEY --force                       # 强制删除无需确认

# 从数据库加载环境变量
envx load --all                                # 加载配置中的所有变量
envx load -k DATABASE_URL                      # 加载特定变量
envx load -t v1.0.0                           # 从标签加载所有变量
envx load -v 5                                # 加载特定版本
envx load --all --export                       # 导出为 shell 命令
envx load --all --shell bash --export          # 指定 shell 格式
```

### 历史和版本管理

```bash
# 查看环境变量历史记录
envx history                                   # 显示可查询选项
envx history -k DATABASE_URL                   # 按键名过滤
envx history --version 3                      # 按版本过滤
envx history --tag v1.0.0                     # 按标签过滤
envx history -l 20                            # 限制显示记录数
envx history -f json                          # JSON 输出格式
envx history -v                               # 详细输出包含完整值

# 创建标签版本
envx tag v1.0.0                               # 从当前值创建标签
envx tag v2.0.0 -m "生产环境发布"               # 带消息的标签
envx tag v1.1.0 -v                            # 详细输出
```

### 远程操作

```bash
# 推送环境变量到远程服务器
envx push v1.0.0                              # 推送标签到默认远程
envx push myproject:v1.0.0                    # 推送到特定项目
envx push https://api.example.com/ns/proj:v1.0.0  # 推送到完整 URL
envx push v1.0.0 -v                           # 详细输出

# 从远程服务器拉取环境变量
envx pull v1.0.0                              # 从默认远程拉取标签
envx pull myproject:v1.0.0                   # 从特定项目拉取
envx pull https://api.example.com/ns/proj:v1.0.0  # 从完整 URL 拉取
envx pull v1.0.0 -k DATABASE_URL              # 拉取特定变量
envx pull v1.0.0 --not-load                   # 不加载到当前环境
envx pull v1.0.0 --export                     # 导出为 shell 命令
envx pull v1.0.0 --force                      # 强制拉取即使不在配置中
```

### 传统命令（基于 URL）

```bash
# 从 URL 导出环境变量
envx export https://example.com/env.txt
envx export https://example.com/env.txt --exec "printenv DEBUG && node app.js"
envx export https://example.com/env.txt --shell powershell --exec "echo $Env:DEBUG"
envx export https://example.com/env.txt --print                # 默认 shell
envx export https://example.com/env.txt --shell cmd --print    # cmd 格式

# 从 URL 取消设置变量
envx unset https://example.com/unset.txt
envx unset https://example.com/unset.txt --print
```

### 命令选项参考

#### 配置命令
- `init` - 从现有 .env 文件初始化 envx 配置
  - `-f, --file <path>` - .env 文件路径（默认：`./.env`）
  - `-o, --output <path>` - 配置文件输出路径（默认：`./envx.config.yaml`）
  - `--force` - 覆盖现有配置文件

- `test` - 测试配置和数据库功能
  - `-c, --config <path>` - 配置文件路径（默认：`./envx.config.yaml`）
  - `-v, --verbose` - 显示详细测试信息
  - `-j, --json` - JSON 格式输出结果

#### 环境变量命令
- `set <key> <value>` - 设置或更新环境变量
  - `-c, --config <path>` - 配置文件路径（默认：`./envx.config.yaml`）
  - `-d, --description <text>` - 环境变量描述
  - `-t, --target <path>` - 环境变量目标路径
  - `--force` - 如果变量存在则强制更新无需确认

- `del <key>` - 删除环境变量
  - `-c, --config <path>` - 配置文件路径（默认：`./envx.config.yaml`）
  - `--force` - 强制删除无需确认

- `load` - 从数据库加载环境变量
  - `-c, --config <path>` - 配置文件路径（默认：`./envx.config.yaml`）
  - `-k, --key <key>` - 按键加载特定环境变量
  - `-v, --version <number>` - 加载变量的特定版本
  - `-t, --tag <tag>` - 从特定标签加载所有环境变量
  - `-a, --all` - 加载配置中定义的所有环境变量
  - `-e, --export` - 导出变量到 shell（打印导出命令）
  - `-s, --shell <shell>` - 目标 shell：`sh` | `bash` | `zsh` | `fish` | `cmd` | `powershell`
  - `--force` - 即使变量不在配置中也强制从数据库加载

#### 历史命令
- `history` - 查看环境变量历史记录
  - `-c, --config <path>` - 配置文件路径（默认：`./envx.config.yaml`）
  - `-k, --key <key>` - 按特定环境变量键过滤历史
  - `--version <number>` - 按特定版本号过滤历史
  - `--tag <tag>` - 按特定标签过滤历史
  - `-l, --limit <number>` - 限制显示的记录数（默认：50）
  - `-f, --format <format>` - 输出格式：`table` | `json`（默认：table）
  - `-v, --verbose` - 显示详细信息包括完整值

- `tag <tagname>` - 创建带标签的环境变量新版本
  - `-c, --config <path>` - 配置文件路径（默认：`./envx.config.yaml`）
  - `-m, --message <text>` - 描述此标签的消息
  - `-a, --all` - 标记配置中的所有环境变量
  - `-v, --verbose` - 详细输出

#### 远程命令
- `push <ref>` - 推送环境变量到远程服务器
  - `-c, --config <path>` - 配置文件路径（默认：`./envx.config.yaml`）
  - `-d, --dev-config <path>` - 开发配置文件路径（默认：`.envx/dev.config.yaml`）
  - `-v, --verbose` - 详细输出

- `pull <ref>` - 从远程服务器拉取环境变量
  - `-c, --config <path>` - 配置文件路径（默认：`./envx.config.yaml`）
  - `-d, --dev-config <path>` - 开发配置文件路径（默认：`.envx/dev.config.yaml`）
  - `-k, --key <key>` - 按键拉取特定环境变量
  - `--not-load` - 不将拉取的变量加载到当前环境
  - `-e, --export` - 导出变量到 shell（打印导出命令）
  - `-s, --shell <shell>` - 目标 shell：`sh` | `bash` | `zsh` | `fish` | `cmd` | `powershell`
  - `--force` - 即使变量不在配置中也强制拉取和加载
  - `-v, --verbose` - 详细输出

#### 传统命令
- `export <url>` - 拉取 env 并应用/打印对应 shell 命令
  - `-s, --shell <shell>` - 目标 shell：`sh` | `cmd` | `powershell`
  - `--apply` - 启动新的子 Shell 并应用变量（若未指定 `--print` 且未指定 `--exec`，默认为此）
  - `--exec <command>` - 在应用变量的子进程中执行命令
  - `--print` - 仅打印命令而不执行
  - `-v, --verbose` - 输出更详细日志

- `unset <url>` - 拉取键并取消设置这些变量
  - `-s, --shell <shell>` - 目标 shell：`sh` | `cmd` | `powershell`
  - `--apply` - 启动新的子 Shell 并移除变量（若未指定 `--print`，默认为此）
  - `--print` - 仅打印命令而不执行
  - `-v, --verbose` - 输出更详细日志

## 🛠️ 开发

### 目录结构

```
envx/
├── src/                  # TypeScript 源码
│   ├── index.ts         # CLI 入口文件
│   ├── commands/        # 命令模块
│   │   ├── version.ts   # 版本信息
│   │   ├── init.ts      # 初始化配置
│   │   ├── set.ts       # 设置环境变量
│   │   ├── del.ts       # 删除环境变量
│   │   ├── load.ts      # 从数据库加载变量
│   │   ├── history.ts   # 查看历史记录
│   │   ├── test.ts      # 测试配置
│   │   ├── tag.ts       # 创建标签版本
│   │   ├── push.ts      # 推送到远程服务器
│   │   ├── pull.ts      # 从远程服务器拉取
│   │   ├── export.ts    # 从 URL 导出（传统）
│   │   └── unset.ts     # 从 URL 取消设置（传统）
│   ├── types/           # TypeScript 类型定义
│   │   ├── common.ts
│   │   └── config.ts
│   └── utils/           # 工具函数
│       ├── config/      # 配置管理
│       ├── db.ts        # 数据库操作
│       ├── env.ts       # 环境文件操作
│       ├── logger.ts    # 日志工具
│       └── url.ts       # URL 解析工具
├── docs/                # 文档
│   ├── README-zh.md     # 中文文档
│   ├── pull-command-examples.md
│   └── push-command-examples.md
├── dist/                # 编译后的 JS 文件
├── package.json
├── tsconfig.json        # TypeScript 配置
├── tsup.config.ts       # 构建配置
└── README.md
```

### 开发命令

```bash
# 安装依赖
pnpm install

# 开发模式（使用 tsx）
pnpm dev clone my-env

# 构建项目（使用 tsup）
pnpm build

# 运行构建后的版本
pnpm start clone my-env

# 清理构建文件
pnpm clean
```

### 构建系统

本项目使用 [tsup](https://github.com/egoist/tsup) 作为构建工具，具备：

- ⚡️ 极快的构建速度
- 📦 产出 ESM 格式，适配现代 Node.js
- 🎯 自动注入 CLI shebang
- 🗺️ 完整的 sourcemap 支持
- 📝 生成 TypeScript 声明文件

### 本地测试

```bash
# 链接为全局可执行
pnpm link

# 试用命令
envx clone my-env
```

### 新增命令指南

1. 在 `src/commands/` 下创建新的命令文件
2. 在 `src/index.ts` 中导入并注册新命令
3. 使用 `ConfigManager` 类进行配置管理
4. 使用 `createDatabaseManager` 函数进行数据库操作
5. 使用 `chalk` 库进行彩色输出
6. 遵循现有命令结构并提供适当的错误处理
7. 运行 `pnpm build` 重新构建

### 命令开发指南

- 每个命令都应该有全面的错误处理
- 使用 `inquirer` 进行用户确认的交互式提示
- 提供详细输出选项 `-v, --verbose`
- 支持配置文件路径自定义 `-c, --config`
- 在错误消息中包含有用的提示和建议
- 使用一致的 emoji 和颜色编码进行输出
- 在适当的地方支持表格和 JSON 输出格式

## 🔧 TypeScript 特性

- 完整的类型定义
- 严格的类型检查
- 现代 ES Module 支持
- Source map 支持

## 📋 依赖版本

### 核心依赖

- **commander**: ^14.0.0 - 命令行参数处理
- **chalk**: ^5.6.0 - 彩色输出
- **inquirer**: ^12.9.4 - 交互式命令行
- **ora**: ^8.2.0 - 加载动效

### 开发依赖

- **typescript**: ^5.9.2 - TypeScript 编译器
- **tsx**: ^4.20.5 - TypeScript 运行器
- **@types/node**: ^24.3.0 - Node.js 类型定义

### 包管理器

- **pnpm**: 10.15.0

## 📝 许可协议

ISC

## 🤝 贡献

欢迎提交 Issue 与 Pull Request！


