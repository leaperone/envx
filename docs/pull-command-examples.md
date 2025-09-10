# Pull 命令使用示例

## 基本用法

### 1. 使用完整 URL 格式
```bash
# 从指定命名空间和项目拉取特定标签的环境变量
envx pull deployment-v1.2.3 --remote https://api.example.com/production/myapp

# 实际请求会发送到: https://api.example.com/api/v1/envx/production/myapp?tag=deployment-v1.2.3
```

### 2. 使用基础 URL + 参数
```bash
# 使用基础 URL 和命令行参数
envx pull deployment-v1.2.3 --remote https://api.example.com --namespace production --project myapp

# 实际请求会发送到: https://api.example.com/api/v1/envx/production/myapp?tag=deployment-v1.2.3
```

### 3. 使用默认 base URL
```bash
# 不指定任何 URL，自动使用默认的 https://2some.one
envx pull deployment-v1.2.3 --namespace production --project myapp

# 实际请求会发送到: https://2some.one/api/v1/envx/production/myapp?tag=deployment-v1.2.3
```

### 4. 拉取特定环境变量
```bash
# 只拉取特定的环境变量
envx pull deployment-v1.2.3 --key DATABASE_URL --namespace production --project myapp

# 实际请求会发送到: https://2some.one/api/v1/envx/production/myapp?tag=deployment-v1.2.3&key=DATABASE_URL
```

## 功能特性

### 自动加载
默认情况下，pull 命令会自动加载拉取的环境变量到当前进程：

```bash
# 自动加载（默认行为）
envx pull deployment-v1.2.3 --namespace production --project myapp

# 禁用自动加载
envx pull deployment-v1.2.3 --namespace production --project myapp --no-load
```

### 导出到 Shell
```bash
# 生成 shell 导出命令
envx pull deployment-v1.2.3 --export --namespace production --project myapp

# 指定特定的 shell
envx pull deployment-v1.2.3 --export --shell bash --namespace production --project myapp
```

### 更新环境文件
如果配置文件中设置了 `files` 选项，pull 命令会自动更新对应的环境文件：

```bash
# 自动更新环境文件（如果配置了）
envx pull deployment-v1.2.3 --namespace production --project myapp
```

## 命令行选项

- `-c, --config <path>`: 配置文件路径 (默认: ./envx.config.yaml)
- `-d, --dev-config <path>`: 开发配置文件路径 (默认: .envx/dev.config.yaml)
- `-r, --remote <url>`: 远程服务器 URL
- `-n, --namespace <name>`: 命名空间名称
- `-p, --project <name>`: 项目名称
- `-k, --key <key>`: 拉取特定的环境变量
- `--load`: 自动加载拉取的变量 (默认: true)
- `-e, --export`: 导出变量到 shell (打印导出命令)
- `-s, --shell <shell>`: 目标 shell: sh | bash | zsh | fish | cmd | powershell
- `--force`: 强制拉取和加载，即使变量不在配置中
- `-v, --verbose`: 详细输出

## 工作流程

1. **解析 URL**: 根据提供的参数解析远程服务器 URL
2. **发送请求**: 向远程 API 发送 GET 请求获取环境变量
3. **保存到数据库**: 将拉取的数据保存到本地 SQLite 数据库
4. **自动加载**: 根据配置自动加载环境变量到当前进程
5. **更新文件**: 如果配置了文件路径，更新对应的环境文件

## 错误处理

- 如果标签不存在，会显示相应的错误信息
- 如果远程 URL 无法访问，会显示详细错误信息
- 如果服务器返回错误，会显示错误消息和状态码
- 如果本地数据库操作失败，会显示相应的错误信息
