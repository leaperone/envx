/**
 * URL 解析工具
 */

export const DEFAULT_BASE_URL = 'https://2some.one';

export interface ParsedUrl {
  baseUrl: string;
  namespace: string;
  project: string;
  tag: string;
}

export interface UrlParseOptions {
  baseUrl?: string | undefined;
  namespace?: string | undefined;
  project?: string | undefined;
}

function normalizeBaseUrl(input: string): string {
  if (!input) return DEFAULT_BASE_URL;
  const trimmed = input.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  // 默认补全为 https
  return `https://${trimmed}`;
}

/**
 * 解析远程 URL
 * 支持两种格式：
 * 1. <baseurl>/<namespace>/<project>:<tag> - 完整格式
 * 2. <baseurl> - 基础格式，需要提供 namespace 和 project 参数
 */
export function parseRef(ref: string, options: UrlParseOptions = {}): ParsedUrl {
  let baseUrl: string | undefined;
  let namespace: string | undefined;
  let project: string | undefined;
  let tag: string | undefined;

  // 1) 如果包含协议（http/https），用 URL 解析避免正则误分组
  if (ref.startsWith('http://') || ref.startsWith('https://')) {
    try {
      const G = globalThis as unknown as { URL?: new (u: string) => unknown };
      if (G.URL) {
        const url = new G.URL(ref) as unknown as { protocol: string; host: string; pathname: string };
        baseUrl = normalizeBaseUrl(`${url.protocol}//${url.host}`);
        const segments = url.pathname.split('/').filter(Boolean);
      // 期望末尾两段为 namespace 与 project(:tag)
        if (segments.length >= 2) {
          namespace = segments[segments.length - 2];
          const last = segments[segments.length - 1] ?? '';
          const idx = last.indexOf(':');
          if (idx > -1) {
            project = last.slice(0, idx);
            tag = last.slice(idx + 1);
          } else if (last) {
            project = last;
          }
        }
      }
    } catch {
      // 若 URL 解析失败，退回后续分支
    }
  }

  if (!baseUrl) {
    // 2) ns/project:tag (no baseurl). baseUrl 由外部提供
    const nsProjWithTag = ref.match(/^([^/]+)\/([^:]+):(.+)$/);
    if (nsProjWithTag && nsProjWithTag[1] && nsProjWithTag[2]) {
      baseUrl = normalizeBaseUrl(options.baseUrl || '');
      namespace = nsProjWithTag[1];
      project = nsProjWithTag[2];
      tag = nsProjWithTag[3];
    } else if (!ref.includes('/') && !ref.includes(':')) {
      // 3) only tag — 由 options 提供 baseUrl/namespace/project
      baseUrl = normalizeBaseUrl(options.baseUrl || '');
      namespace = options.namespace;
      project = options.project;
      tag = ref;
    } else {
      // 4) 视为仅 baseUrl — 其余由 options 提供
      baseUrl = normalizeBaseUrl(ref);
      namespace = options.namespace;
      project = options.project;
    }
  }

  const missing: string[] = [];
  if (!baseUrl) missing.push('baseUrl');
  if (!namespace) missing.push('namespace');
  if (!project) missing.push('project');
  if (!tag) missing.push('tag');

  if (missing.length > 0) {
    throw new Error(`missing required fields: ${missing.join(', ')}`);
  }

  return { baseUrl, namespace, project, tag } as ParsedUrl;
}

/**
 * 构建 API URL
 * 格式: <baseUrl>/api/v1/envx/<namespace>/<project>/push
 */
export function buildApiUrl(parsedUrl: ParsedUrl): string {
  const baseUrl = parsedUrl.baseUrl.replace(/\/$/, '');
  return `${baseUrl}/api/v1/envx/${parsedUrl.namespace}/${parsedUrl.project}/push`;
}

export function buildPullUrl(parsedUrl: ParsedUrl): string {
  const baseUrl = parsedUrl.baseUrl.replace(/\/$/, '');
  return `${baseUrl}/api/v1/envx/${parsedUrl.namespace}/${parsedUrl.project}/pull`;
}

/**
 * 验证 URL 格式
 */
export function validateUrl(url: string): { isValid: boolean; error?: string } {
  try {
    // 使用全局 URL 以兼容 Node ESM 环境（避免直接引用类型名）
    const G = globalThis as unknown as { URL?: new (u: string) => unknown };
    if (!G.URL) throw new Error('URL not available');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    new G.URL!(url);
    return { isValid: true };
  } catch {
    return {
      isValid: false,
      error: 'Invalid URL format',
    };
  }
}

/**
 * 从配置中获取远程 URL 信息
 */
export function getRemoteUrlFromConfig(
  devConfigRemote?: string,
  options: UrlParseOptions = {}
): ParsedUrl | null {
  if (!devConfigRemote) {
    return null;
  }

  return parseRef(devConfigRemote, options);
}

/**
 * 获取默认的远程 URL 信息
 */
export function getDefaultRemoteUrl(options: UrlParseOptions = {}): ParsedUrl {
  return parseRef(DEFAULT_BASE_URL, options);
}
