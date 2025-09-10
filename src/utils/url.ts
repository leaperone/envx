/**
 * URL 解析工具
 */

export const DEFAULT_BASE_URL = 'https://2some.one';

export interface ParsedUrl {
  baseUrl: string;
  namespace: string;
  project: string;
  tag?: string;
}

export interface UrlParseOptions {
  namespace?: string | undefined;
  project?: string | undefined;
}

/**
 * 解析远程 URL
 * 支持两种格式：
 * 1. <baseurl>/<namespace>/<project>:<tag> - 完整格式
 * 2. <baseurl> - 基础格式，需要提供 namespace 和 project 参数
 */
export function parseRemoteUrl(
  url: string, 
  options: UrlParseOptions = {}
): ParsedUrl {
  // 解析完整格式: <baseurl>/<namespace>/<project>:<tag>
  const fullFormatMatch = url.match(/^(.+?)\/([^/]+)\/([^:]+):(.+)$/);
  if (fullFormatMatch && fullFormatMatch[1] && fullFormatMatch[2] && fullFormatMatch[3]) {
    return {
      baseUrl: fullFormatMatch[1],
      namespace: fullFormatMatch[2],
      project: fullFormatMatch[3],
      tag: fullFormatMatch[4]
    };
  }

  // 基础格式: <baseurl>
  return {
    baseUrl: url,
    namespace: options.namespace || 'default',
    project: options.project || 'default'
  };
}

/**
 * 构建 API URL
 * 格式: <baseUrl>/api/v1/envx/<namespace>/<project>/push
 */
export function buildApiUrl(parsedUrl: ParsedUrl): string {
  const baseUrl = parsedUrl.baseUrl.replace(/\/$/, '');
  return `${baseUrl}/api/v1/envx/${parsedUrl.namespace}/${parsedUrl.project}/push`;
}

/**
 * 验证 URL 格式
 */
export function validateUrl(url: string): { isValid: boolean; error?: string } {
  try {
    new URL(url);
    return { isValid: true };
  } catch {
    return { 
      isValid: false, 
      error: 'Invalid URL format' 
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

  return parseRemoteUrl(devConfigRemote, options);
}

/**
 * 获取默认的远程 URL 信息
 */
export function getDefaultRemoteUrl(options: UrlParseOptions = {}): ParsedUrl {
  return parseRemoteUrl(DEFAULT_BASE_URL, options);
}
