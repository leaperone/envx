# Push 命令使用示例

## 配置

`.envx/dev.config.yaml`：

```yaml
apiBaseUrl: https://api.leaper.one
dashboardUrl: https://dashboard.leaper.one
namespace: production
project: myapp
```

先执行 `envx login` 获取 control token，也可以通过 `ENVX_API_KEY` 或 dev config
中的 `apiKey` 提供兼容 credential。

## 基本用法

```bash
# 使用 dev config 中的 API、namespace、project
envx push deployment-v1.2.3

# 显式指定 namespace/project/tag
envx push production/myapp:deployment-v1.2.3

# 自定义 API origin
envx push https://api.example.com/production/myapp:deployment-v1.2.3

# 仅输出 key 与 UTF-8 长度，不输出 value
envx push deployment-v1.2.3 --verbose
```

canonical 请求为：

```text
PUT https://api.leaper.one/api/v1/envx/production/myapp
```

请求体包含 `tag`、兼容 timestamp 和 `items`。请求携带版本化
`User-Agent`、`Idempotency-Key`，并按本地 remote state 发送：

- 首次创建：`If-None-Match: *`
- 已 pull/push 过：`If-Match: <etag>`

如果 canonical route 返回 `404`、`405` 或 `501`，客户端会用相同
idempotency key 回退到 legacy `POST .../push`，但不会携带 canonical revision
precondition。其他错误不会触发 alias fallback。

## 冲突与安全

- `412`：远端 revision 已变化，先执行 pull、合并并重新 push。
- `409`：namespace ownership 冲突，确认当前用户或 organization。
- `401/403`：重新登录，或确认 token scope 与 namespace 权限。
- 正常及 verbose 输出不会打印 value、完整 payload 或服务端返回的 secret。

命令选项：

- `-c, --config <path>`：业务配置，默认 `./envx.config.yaml`
- `-d, --dev-config <path>`：开发配置，默认 `.envx/dev.config.yaml`
- `-v, --verbose`：安全的详细元数据输出
