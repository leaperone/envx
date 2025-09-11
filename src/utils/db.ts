import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export interface EnvHistoryRecord {
  id?: number;
  key: string;
  value: string;
  version: number;
  timestamp: string;
  action: 'created' | 'updated' | 'deleted';
  source: string;
  tag?: string;
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
    // 创建环境变量历史记录表（version 允许为 NULL，用于 tag 记录）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS env_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        version INTEGER,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        source TEXT NOT NULL,
        tag TEXT
      )
    `);

    // 创建索引以提高查询性能
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_env_history_key ON env_history(key);
      CREATE INDEX IF NOT EXISTS idx_env_history_version ON env_history(version);
      CREATE INDEX IF NOT EXISTS idx_env_history_timestamp ON env_history(timestamp);
      CREATE INDEX IF NOT EXISTS idx_env_history_action ON env_history(action);
      CREATE INDEX IF NOT EXISTS idx_env_history_tag ON env_history(tag);
    `);

    // 若旧表中 version 为 NOT NULL，执行迁移以允许 NULL
    const columns = this.db.prepare(`PRAGMA table_info(env_history)`).all() as Array<{
      cid: number; name: string; type: string; notnull: number; dflt_value: unknown; pk: number;
    }>;
    const versionCol = columns.find(c => c.name === 'version');
    if (versionCol && versionCol.notnull === 1) {
      const migrate = this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS env_history_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            version INTEGER,
            timestamp TEXT NOT NULL,
            action TEXT NOT NULL,
            source TEXT NOT NULL,
            tag TEXT
          );
        `);
        this.db.exec(`
          INSERT INTO env_history_new (id, key, value, version, timestamp, action, source, tag)
          SELECT id, key, value, version, timestamp, action, source, tag FROM env_history;
        `);
        this.db.exec(`DROP TABLE env_history;`);
        this.db.exec(`ALTER TABLE env_history_new RENAME TO env_history;`);
        this.db.exec(`
          CREATE INDEX IF NOT EXISTS idx_env_history_key ON env_history(key);
          CREATE INDEX IF NOT EXISTS idx_env_history_version ON env_history(version);
          CREATE INDEX IF NOT EXISTS idx_env_history_timestamp ON env_history(timestamp);
          CREATE INDEX IF NOT EXISTS idx_env_history_action ON env_history(action);
          CREATE INDEX IF NOT EXISTS idx_env_history_tag ON env_history(tag);
        `);
      });
      migrate();
    }
  }

  /**
   * 获取指定key的当前版本号
   */
  private getCurrentVersion(key: string): number {
    const stmt = this.db.prepare(`
      SELECT MAX(version) as maxVersion FROM env_history WHERE key = ? AND version IS NOT NULL
    `);

    const result = stmt.get(key) as { maxVersion: number | null };
    return result.maxVersion || 0;
  }

  /**
   * 添加环境变量历史记录
   */
  addHistoryRecord(record: Omit<EnvHistoryRecord, 'id' | 'version'>): void {
    // 获取当前key的最新版本号
    const currentVersion = this.getCurrentVersion(record.key);
    const newVersion = currentVersion + 1;

    const stmt = this.db.prepare(`
      INSERT INTO env_history (key, value, version, timestamp, action, source, tag)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(record.key, record.value, newVersion, record.timestamp, record.action, record.source, record.tag || null);
  }

  /**
   * 批量添加环境变量历史记录
   */
  addHistoryRecords(records: Omit<EnvHistoryRecord, 'id' | 'version'>[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO env_history (key, value, version, timestamp, action, source, tag)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (const record of records) {
        const currentVersion = this.getCurrentVersion(record.key);
        const newVersion = currentVersion + 1;
        stmt.run(
          record.key,
          record.value,
          newVersion,
          record.timestamp,
          record.action,
          record.source,
          record.tag || null
        );
      }
    });

    transaction();
  }

  /**
   * 获取环境变量的历史记录
   */
  getHistoryByKey(key: string, limit: number = 50): EnvHistoryRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM env_history 
      WHERE key = ? 
      ORDER BY version DESC 
      LIMIT ?
    `);

    return stmt.all(key, limit) as EnvHistoryRecord[];
  }

  /**
   * 获取环境变量的所有版本历史
   */
  getVersionHistory(key: string): EnvHistoryRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM env_history 
      WHERE key = ? 
      ORDER BY version ASC
    `);

    return stmt.all(key) as EnvHistoryRecord[];
  }

  /**
   * 获取环境变量的最新版本
   */
  getLatestVersion(key: string): EnvHistoryRecord | null {
    // 仅返回有版本号的最新记录
    const stmt = this.db.prepare(`
      SELECT * FROM env_history 
      WHERE key = ? AND version IS NOT NULL
      ORDER BY version DESC 
      LIMIT 1
    `);

    return stmt.get(key) as EnvHistoryRecord | null;
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
   * 清理旧的历史记录
   */
  cleanupOldRecords(daysToKeep: number = 30): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const stmt = this.db.prepare(`
      DELETE FROM env_history 
      WHERE timestamp < ?
    `);

    stmt.run(cutoffDate.toISOString());
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
  getHistoryByTag(tag: string, limit: number = 50): EnvHistoryRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM env_history 
      WHERE tag = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);

    return stmt.all(tag, limit) as EnvHistoryRecord[];
  }

  /**
   * 根据版本号获取历史记录
   */
  getHistoryByVersion(version: number, limit: number = 50): EnvHistoryRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM env_history 
      WHERE version = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);

    return stmt.all(version, limit) as EnvHistoryRecord[];
  }

  /**
   * 获取所有可用的版本号
   */
  getAllVersions(): number[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT version FROM env_history 
      WHERE version IS NOT NULL
      ORDER BY version DESC
    `);

    const results = stmt.all() as { version: number }[];
    return results.map(r => r.version);
  }

  /**
   * 获取版本统计信息
   */
  getVersionStats(): Array<{
    version: number;
    totalRecords: number;
    uniqueKeys: number;
    firstCreated: string | null;
    lastUpdated: string | null;
  }> {
    const stmt = this.db.prepare(`
      SELECT 
        version,
        COUNT(*) as totalRecords,
        COUNT(DISTINCT key) as uniqueKeys,
        MIN(timestamp) as firstCreated,
        MAX(timestamp) as lastUpdated
      FROM env_history 
      WHERE version IS NOT NULL
      GROUP BY version 
      ORDER BY version DESC
    `);

    return stmt.all() as Array<{
      version: number;
      totalRecords: number;
      uniqueKeys: number;
      firstCreated: string | null;
      lastUpdated: string | null;
    }>;
  }

  /**
   * 获取所有标签列表
   */
  getAllTags(): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT tag FROM env_history 
      WHERE tag IS NOT NULL 
      ORDER BY tag ASC
    `);

    const results = stmt.all() as { tag: string }[];
    return results.map(r => r.tag);
  }

  /**
   * 为指定key创建带标签的新版本
   */
  createTaggedVersion(key: string, value: string, tag: string, source: string = 'tag'): void {
    // 为 tag 记录写入 NULL 版本号
    const stmt = this.db.prepare(`
      INSERT INTO env_history (key, value, version, timestamp, action, source, tag)
      VALUES (?, ?, NULL, ?, ?, ?, ?)
    `);

    stmt.run(key, value, new Date().toISOString(), 'updated', source, tag);
  }

  /**
   * 覆盖更新：按 tag 覆盖该 key 的 tagged 记录（version 为 NULL）。若不存在则创建一条 tagged 记录。
   */
  upsertTaggedValue(key: string, value: string, tag: string, source: string = 'pull'): void {
    const now = new Date().toISOString();
    const updateStmt = this.db.prepare(`
      UPDATE env_history
      SET value = ?, timestamp = ?, action = 'updated', source = ?
      WHERE key = ? AND tag = ?
    `);
    const res = updateStmt.run(value, now, source, key, tag);
    if (res.changes === 0) {
      this.createTaggedVersion(key, value, tag, source);
    }
  }

  /**
   * 覆盖更新：覆盖该 key 最新的有版本记录的值。若不存在任何有版本记录，则新增一条有版本记录。
   */
  upsertLatestVersionedValue(key: string, value: string, source: string = 'pull'): void {
    const now = new Date().toISOString();
    const latest = this.getLatestVersion(key);
    if (latest) {
      const updateStmt = this.db.prepare(`
        UPDATE env_history
        SET value = ?, timestamp = ?, action = 'updated', source = ?
        WHERE id = ?
      `);
      updateStmt.run(value, now, source, latest.id);
    } else {
      const record: Omit<EnvHistoryRecord, 'id' | 'version'> = {
        key,
        value,
        timestamp: now,
        action: 'updated',
        source,
      };
      this.addHistoryRecord(record);
    }
  }

  /**
   * 获取标签统计信息
   */
  getTagStats(tag: string): {
    totalRecords: number;
    uniqueKeys: number;
    firstCreated: string | null;
    lastUpdated: string | null;
    variables: Array<{key: string, value: string, version: number}>;
  } {
    const totalRecords = this.db.prepare('SELECT COUNT(*) as count FROM env_history WHERE tag = ?').get(tag) as {
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
      SELECT key, value, version FROM env_history 
      WHERE tag = ? 
      ORDER BY key ASC, version DESC
    `);
    const variables = variablesStmt.all(tag) as Array<{key: string, value: string, version: number}>;

    return {
      totalRecords: totalRecords.count,
      uniqueKeys: uniqueKeys.count,
      firstCreated: firstCreated.timestamp,
      lastUpdated: lastUpdated.timestamp,
      variables
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
      WHERE tag IS NOT NULL 
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
