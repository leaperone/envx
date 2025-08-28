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

# 从 URL 克隆 .env 到本地文件（默认：.env）
envx clone https://example.com/env.txt
envx clone -f https://example.com/env.txt               # 发生键冲突时强制以远端为准
envx clone https://example.com/env.txt ./config/.env    # 自定义目标路径

# 从 URL 导出环境变量
# 默认：在一个新的子 Shell 中生效（Windows: PowerShell；其他：当前 SHELL）
envx export https://example.com/env.txt
# 仅在子进程中应用变量并执行命令
envx export https://example.com/env.txt --exec "printenv DEBUG && node app.js"
envx export https://example.com/env.txt --shell powershell --exec "echo $Env:DEBUG"
# 仅打印命令
envx export https://example.com/env.txt --print                # 默认 shell 格式
envx export https://example.com/env.txt --shell cmd --print    # 以 cmd 格式输出

# 从 URL 读取需要移除的变量（可为键列表或 KEY= 行）
# 默认：启动一个移除这些变量的子 Shell
envx unset https://example.com/unset.txt
# 仅打印 unset 命令
envx unset https://example.com/unset.txt --print

# 查看版本信息
envx version
```

### 命令选项

- `clone <url> [dest]` - 拉取纯文本 env 并写入文件（默认 `.env`）
  - `-f, --force` - 当键冲突时，用远端值覆盖本地值

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
│   ├── index.ts         # CLI 入口
│   ├── commands/        # 命令模块
│   │   ├── version.ts
│   │   ├── clone.ts
│   │   ├── export.ts
│   │   └── unset.ts
│   └── utils/           # 工具函数
│       └── logger.ts
├── dist/                # 编译后的 JS 文件
├── package.json
├── tsconfig.json        # TypeScript 配置
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
3. 使用 `Logger` 类进行输出
4. 运行 `pnpm build` 重新构建

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


