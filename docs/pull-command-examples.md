# Pull 命令使用示例

## 基本用法

```bash
# 使用 .envx/dev.config.yaml 中的 API、namespace、project
envx pull deployment-v1.2.3

# 显式指定 namespace/project/tag
envx pull production/myapp:deployment-v1.2.3

# 自定义 API origin
envx pull https://api.example.com/production/myapp:deployment-v1.2.3

# 只拉取一个 key
envx pull deployment-v1.2.3 --key DATABASE_URL

# 只保存到本地 DB，不加载到当前进程或环境文件
envx pull deployment-v1.2.3 --not-load

# 明确输出包含 secret value 的 shell export 命令
envx pull deployment-v1.2.3 --export --shell bash
```

canonical 请求为：

```text
GET https://api.leaper.one/api/v1/envx/production/myapp?tag=deployment-v1.2.3
```

canonical route 返回 `404`、`405` 或 `501` 时，客户端回退到 legacy
`GET .../pull` alias。成功响应的 `ETag` / revision 会写入本地 SQLite
`remote_state`，供下一次 push 使用 `If-Match` 做并发保护。

## 加载行为

- 拉取结果始终先保存到本地 SQLite。
- 默认只加载 `envx.config.yaml` 已声明的 key；`--force` 可包含其他 key。
- 配置了 `files` 时会同步更新对应环境文件。
- 普通输出仅显示 key 与值长度，不回显 value。
- `--export` 是显式 secret 输出通道，其 stdout 必须按敏感信息处理。

命令选项：

- `-c, --config <path>`：业务配置，默认 `./envx.config.yaml`
- `-d, --dev-config <path>`：开发配置，默认 `.envx/dev.config.yaml`
- `-k, --key <key>`：只拉取指定 key
- `--not-load`：不加载到当前进程和环境文件
- `-e, --export`：输出 shell export 命令
- `-s, --shell <shell>`：`sh | bash | zsh | fish | cmd | powershell`
- `--force`：加载配置中未声明的 key
- `-v, --verbose`：显示请求/错误元数据，不打印响应 body
