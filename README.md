# envx

一个强大的环境管理CLI工具，基于Node.js和TypeScript开发。

## 🚀 特性

- ✨ 现代化的命令行界面
- 🎨 彩色输出和emoji支持
- 🔧 模块化命令系统
- 📦 易于扩展和定制
- 🛡️ 完整的TypeScript类型支持
- 🔄 最新的依赖版本

## 📦 安装

### 全局安装
```bash
npm install -g envx
# 或者使用pnpm
pnpm add -g envx
```

### 本地开发
```bash
git clone <your-repo>
cd envx
pnpm install
pnpm link
```

## 🎯 使用方法

### 基本命令
```bash
# 显示帮助信息
envx --help

# 问候命令
envx greet World
envx greet World --formal
envx greet World --color red

# 显示版本信息
envx version
```

### 命令选项
- `greet <name>` - 问候某人
  - `-f, --formal` - 使用正式问候语
  - `-c, --color <color>` - 选择问候语颜色 (支持: red, blue, yellow, magenta, cyan, green)

## 🛠️ 开发

### 项目结构
```
envx/
├── src/                  # TypeScript源代码
│   ├── index.ts         # CLI入口文件
│   ├── commands/        # 命令模块
│   │   ├── greet.ts
│   │   └── version.ts
│   └── utils/           # 工具函数
│       └── logger.ts
├── dist/                # 编译后的JavaScript文件
├── package.json
├── tsconfig.json        # TypeScript配置
└── README.md
```

### 开发命令
```bash
# 安装依赖
pnpm install

# 开发模式运行（使用tsx）
pnpm dev greet World

# 构建项目
pnpm build

# 运行构建后的版本
pnpm start greet World

# 清理构建文件
pnpm clean
```

### 本地测试
```bash
# 链接到全局
pnpm link

# 测试命令
envx greet World
```

### 添加新命令
1. 在 `src/commands/` 目录下创建新的TypeScript命令文件
2. 在 `src/index.ts` 中导入并注册新命令
3. 使用 `Logger` 类进行输出
4. 运行 `pnpm build` 重新构建

## 🔧 TypeScript特性

- 完整的类型定义
- 严格的类型检查
- 现代化的ES模块支持
- 源码映射支持

## 📋 依赖版本

### 核心依赖
- **commander**: ^14.0.0 - 命令行参数处理
- **chalk**: ^5.6.0 - 彩色输出
- **inquirer**: ^12.9.4 - 交互式命令行
- **ora**: ^8.2.0 - 加载动画

### 开发依赖
- **typescript**: ^5.9.2 - TypeScript编译器
- **tsx**: ^4.20.5 - TypeScript执行器
- **@types/node**: ^24.3.0 - Node.js类型定义

### 包管理器
- **pnpm**: 10.15.0

## 📝 许可证

ISC

## 🤝 贡献

欢迎提交Issue和Pull Request！
