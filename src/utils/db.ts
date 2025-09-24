import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { EnvMap } from '@/types/common';

export interface EnvHistoryRecord {
  id?: number;
  key: string;
  value: string;
  timestamp: string;
  tag: string;
}

export class DatabaseManager {
  private db: Database.Database;
  private dbPath: string;

  constructor(configDir: string) {
    // 确保 .envx 目录存在
    const envxDir = join(configDir, '.envx');
    if (!existsSync(envxDir)) {
      mkdirSync(envxDir, { recursive: true });
    }

    this.dbPath = join(envxDir, 'envx.db');
    this.db = new Database(this.dbPath);
    this.initDatabase();
  }

  /**
   * 初始化数据库表结构
   */
  private initDatabase(): void {
    // 创建环境变量历史记录表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS env_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        tag TEXT NOT NULL
      )
    `);

    // 创建索引以提高查询性能
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_env_history_key ON env_history(key);
      CREATE INDEX IF NOT EXISTS idx_env_history_timestamp ON env_history(timestamp);
      CREATE INDEX IF NOT EXISTS idx_env_history_tag ON env_history(tag);
      -- 为实现基于 (key, tag) 的 UPSERT，增加唯一索引
      CREATE UNIQUE INDEX IF NOT EXISTS idx_env_history_key_tag_unique ON env_history(key, tag);
    `);
  }

  /**
   * 获取下一个可用的 auto 标签编号
   */
  private getNextAutoTagNumber(): number {
    const stmt = this.db.prepare(`
        SELECT tag FROM env_history 
        WHERE tag LIKE 'auto-%' 
        ORDER BY CAST(SUBSTR(tag, 6) AS INTEGER) DESC 
        LIMIT 1
      `);

    const result = stmt.get() as { tag: string } | undefined;
    if (!result) {
      return 1;
    }

    const match = result.tag.match(/^auto-(\d+)$/);
    if (!match || !match[1]) {
      return 1;
    }

    return parseInt(match[1], 10) + 1;
  }

  batchUpsertTaggedValues(envs: EnvMap, tag?: string): void {
    const stmt = this.db.prepare(`
        INSERT INTO env_history (key, value, timestamp, tag)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key, tag) DO UPDATE SET
          value = excluded.value,
          timestamp = excluded.timestamp
      `);

    const transaction = this.db.transaction(() => {
      // 如果 tag 为空，生成 auto-xxx 标签
      let currentTag = tag;
      if (!currentTag) {
        currentTag = `auto-${this.getNextAutoTagNumber()}`;
      }

      const timestamp = new Date().toISOString();
      for (const [key, value] of Object.entries(envs)) {
        if (value === undefined || value === null) continue;
        stmt.run(key, String(value), timestamp, currentTag);
      }
    });
    transaction();
  }

  getTaggedValues(tag: string): EnvMap {
    const stmt = this.db.prepare(`
      SELECT key, value FROM env_history 
      WHERE tag = ?
    `);
    const envMap: EnvMap = {};
    const results = stmt.all(tag) as { key: string; value: string }[];
    for (const result of results) {
      envMap[result.key] = result.value;
    }
    return envMap;
  }

  /**
   * 获取环境变量的历史记录
   */
  getHistoryByKey(key: string, limit: number = 50): EnvHistoryRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM env_history 
      WHERE key = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);

    return stmt.all(key, limit) as EnvHistoryRecord[];
  }

  /**
   * 获取所有历史记录
   */
  getAllHistory(limit: number = 100): EnvHistoryRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM env_history 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);

    return stmt.all(limit) as EnvHistoryRecord[];
  }

  /**
   * 获取数据库统计信息
   */
  getStats(): {
    totalRecords: number;
    uniqueKeys: number;
    oldestRecord: string | null;
    newestRecord: string | null;
  } {
    const totalRecords = this.db.prepare('SELECT COUNT(*) as count FROM env_history').get() as {
      count: number;
    };
    const uniqueKeys = this.db
      .prepare('SELECT COUNT(DISTINCT key) as count FROM env_history')
      .get() as { count: number };
    const oldestRecord = this.db
      .prepare('SELECT MIN(timestamp) as timestamp FROM env_history')
      .get() as { timestamp: string | null };
    const newestRecord = this.db
      .prepare('SELECT MAX(timestamp) as timestamp FROM env_history')
      .get() as { timestamp: string | null };

    return {
      totalRecords: totalRecords.count,
      uniqueKeys: uniqueKeys.count,
      oldestRecord: oldestRecord.timestamp,
      newestRecord: newestRecord.timestamp,
    };
  }

  /**
   * 根据tag获取历史记录
   */
  getHistoryByTag(tag: string): EnvHistoryRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM env_history 
      WHERE tag = ? 
      ORDER BY timestamp DESC;
    `);

    return stmt.all(tag) as EnvHistoryRecord[];
  }

  /**
   * 获取所有标签列表
   */
  getAllTags(): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT tag FROM env_history 
      ORDER BY tag ASC
    `);

    const results = stmt.all() as { tag: string }[];
    return results.map(r => r.tag);
  }

  /**
   * 获取标签统计信息
   */
  getTagStats(tag: string): {
    totalRecords: number;
    uniqueKeys: number;
    firstCreated: string | null;
    lastUpdated: string | null;
    variables: Array<{ key: string; value: string }>;
  } {
    const totalRecords = this.db
      .prepare('SELECT COUNT(*) as count FROM env_history WHERE tag = ?')
      .get(tag) as {
      count: number;
    };
    const uniqueKeys = this.db
      .prepare('SELECT COUNT(DISTINCT key) as count FROM env_history WHERE tag = ?')
      .get(tag) as { count: number };
    const firstCreated = this.db
      .prepare('SELECT MIN(timestamp) as timestamp FROM env_history WHERE tag = ?')
      .get(tag) as { timestamp: string | null };
    const lastUpdated = this.db
      .prepare('SELECT MAX(timestamp) as timestamp FROM env_history WHERE tag = ?')
      .get(tag) as { timestamp: string | null };

    // 获取该标签下的所有变量
    const variablesStmt = this.db.prepare(`
      SELECT key, value FROM env_history 
      WHERE tag = ? 
      ORDER BY key ASC, timestamp DESC
    `);
    const variables = variablesStmt.all(tag) as Array<{ key: string; value: string }>;

    return {
      totalRecords: totalRecords.count,
      uniqueKeys: uniqueKeys.count,
      firstCreated: firstCreated.timestamp,
      lastUpdated: lastUpdated.timestamp,
      variables,
    };
  }

  /**
   * 获取所有标签的统计信息
   */
  getAllTagsStats(): Array<{
    tag: string;
    totalRecords: number;
    uniqueKeys: number;
    firstCreated: string | null;
    lastUpdated: string | null;
  }> {
    const stmt = this.db.prepare(`
      SELECT 
        tag,
        COUNT(*) as totalRecords,
        COUNT(DISTINCT key) as uniqueKeys,
        MIN(timestamp) as firstCreated,
        MAX(timestamp) as lastUpdated
      FROM env_history 
      GROUP BY tag 
      ORDER BY lastUpdated DESC
    `);

    return stmt.all() as Array<{
      tag: string;
      totalRecords: number;
      uniqueKeys: number;
      firstCreated: string | null;
      lastUpdated: string | null;
    }>;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
  }
}

/**
 * 创建数据库管理器的工厂函数
 */
export function createDatabaseManager(configDir: string): DatabaseManager {
  return new DatabaseManager(configDir);
}

/**
 * 基于配置文件路径创建数据库管理器
 * 传入完整的配置文件路径，例如 /path/to/envx.config.yaml
 * 将自动取其所在目录作为数据库根目录（即 ${dir}/.envx/envx.db）
 */
export function createDatabaseManagerFromConfigPath(configPath: string): DatabaseManager {
  const configDir = dirname(configPath);
  return new DatabaseManager(configDir);
}
