# Push 命令使用示例

## URL 解析工具

Push 命令现在使用独立的 URL 解析工具 (`src/utils/url.ts`)，支持以下功能：

- 解析完整格式 URL：`<baseurl>/<namespace>/<project>:<tag>`
- 解析基础格式 URL：`<baseurl>` (配合命令行参数)
- 自动构建 API 路径：`/api/v1/envx/<namespace>/<project>/push`
- 从配置文件获取远程 URL 信息
- **默认 base URL**: `https://2some.one` (当没有配置时自动使用)

## 基本用法

### 1. 使用完整 URL 格式
```bash
# 推送标签到指定命名空间和项目
envx push deployment-v1.2.3 --remote https://api.example.com/production/myapp:deployment-v1.2.3

# 实际请求会发送到: https://api.example.com/api/v1/envx/production/myapp/push
```

### 2. 使用基础 URL + 参数
```bash
# 使用基础 URL 和命令行参数
envx push deployment-v1.2.3 --remote https://api.example.com --namespace production --project myapp

# 实际请求会发送到: https://api.example.com/api/v1/envx/production/myapp/push
```

### 3. 使用配置文件
```bash
# 在 .envx/dev.config.yaml 中配置
# remote: https://api.example.com
# 然后使用命令行参数指定命名空间和项目
envx push deployment-v1.2.3 --namespace production --project myapp
```

### 4. 使用默认 base URL
```bash
# 不指定任何 URL，自动使用默认的 https://2some.one
envx push deployment-v1.2.3 --namespace production --project myapp

# 实际请求会发送到: https://2some.one/api/v1/envx/production/myapp/push
```

## 请求体格式

命令会发送以下格式的 JSON 数据：

```json
{
  "tag": "deployment-v1.2.3",
  "version": 100,
  "timestamp": "2024-01-01T00:00:00Z",
  "items": [
    {
      "key": "DATABASE_URL",
      "value": "postgresql://user:pass@localhost:5432/mydb"
    },
    {
      "key": "API_KEY",
      "value": "sk-1234567890abcdef"
    }
  ]
}
```

## 命令行选项

- `-c, --config <path>`: 配置文件路径 (默认: ./envx.config.yaml)
- `-d, --dev-config <path>`: 开发配置文件路径 (默认: .envx/dev.config.yaml)
- `-r, --remote <url>`: 远程服务器 URL
- `-n, --namespace <name>`: 命名空间名称
- `-p, --project <name>`: 项目名称
- `-v, --verbose`: 详细输出

## 错误处理

- 如果标签不存在，会显示可用标签列表
- 如果远程 URL 无法访问，会显示详细错误信息
- 如果服务器返回错误，会显示错误消息和状态码
