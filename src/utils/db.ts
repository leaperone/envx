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
        version INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        source TEXT NOT NULL
      )
    `);

    // 创建索引以提高查询性能
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_env_history_key ON env_history(key);
      CREATE INDEX IF NOT EXISTS idx_env_history_version ON env_history(version);
      CREATE INDEX IF NOT EXISTS idx_env_history_timestamp ON env_history(timestamp);
      CREATE INDEX IF NOT EXISTS idx_env_history_action ON env_history(action);
    `);
  }

  /**
   * 获取指定key的当前版本号
   */
  private getCurrentVersion(key: string): number {
    const stmt = this.db.prepare(`
      SELECT MAX(version) as maxVersion FROM env_history WHERE key = ?
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
      INSERT INTO env_history (key, value, version, timestamp, action, source)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(record.key, record.value, newVersion, record.timestamp, record.action, record.source);
  }

  /**
   * 批量添加环境变量历史记录
   */
  addHistoryRecords(records: Omit<EnvHistoryRecord, 'id' | 'version'>[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO env_history (key, value, version, timestamp, action, source)
      VALUES (?, ?, ?, ?, ?, ?)
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
          record.source
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
    const stmt = this.db.prepare(`
      SELECT * FROM env_history 
      WHERE key = ? 
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
