import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { createDatabaseManager } from '../utils/db';

interface HistoryOptions {
  config?: string;
  key?: string;
  limit?: number;
  format?: 'table' | 'json';
  verbose?: boolean;
}

export function historyCommand(program: Command): void {
  program
    .command('history')
    .description('View environment variable history records from database')
    .option('-c, --config <path>', 'Path to config file (default: ./envx.config.yaml)', './envx.config.yaml')
    .option('-k, --key <key>', 'Filter history by specific environment variable key')
    .option('-l, --limit <number>', 'Limit number of records to show (default: 50)', '50')
    .option('-f, --format <format>', 'Output format: table | json (default: table)', 'table')
    .option('-v, --verbose', 'Show detailed information including full values')
    .action(async (options: HistoryOptions) => {
      try {
        const configPath = join(process.cwd(), options.config || './envx.config.yaml');
        const configDir = join(process.cwd(), (options.config || './envx.config.yaml'), '..');

        console.log(chalk.blue('📚 Viewing environment variable history...'));
        console.log(chalk.gray(`📁 Config file: ${options.config}`));

        // 检查配置文件是否存在
        if (!existsSync(configPath)) {
          console.error(chalk.red(`❌ Error: Config file not found at ${options.config}`));
          console.log(chalk.yellow('💡 Tip: Run "envx init" to create a configuration file'));
          process.exit(1);
        }

        // 检查数据库是否存在
        const dbPath = join(configDir, '.envx', 'envx.db');
        if (!existsSync(dbPath)) {
          console.error(chalk.red(`❌ Error: Database not found at ${dbPath}`));
          console.log(chalk.yellow('💡 Tip: Run "envx init" to initialize the database'));
          process.exit(1);
        }

        // 连接数据库
        const dbManager = createDatabaseManager(configDir);

        try {
          let records;
          const limit = parseInt(String(options.limit || '50'), 10);

          if (options.key) {
            // 获取特定key的历史记录
            console.log(chalk.gray(`🔍 Filtering by key: ${options.key}`));
            records = dbManager.getHistoryByKey(options.key, limit);
          } else {
            // 获取所有历史记录
            records = dbManager.getAllHistory(limit);
          }

          if (records.length === 0) {
            console.log(chalk.yellow('📭 No history records found'));
            if (options.key) {
              console.log(chalk.gray(`   No records found for key: ${options.key}`));
            }
            return;
          }

          // 获取数据库统计信息
          const stats = dbManager.getStats();

          if (options.format === 'json') {
            // JSON 格式输出
            console.log(JSON.stringify({
              stats,
              records,
              filters: {
                key: options.key,
                limit: limit
              }
            }, null, 2));
          } else {
            // 表格格式输出
            console.log(chalk.blue('\n📊 Database Statistics:'));
            console.log(chalk.gray(`   Total records: ${stats.totalRecords}`));
            console.log(chalk.gray(`   Unique keys: ${stats.uniqueKeys}`));
            if (stats.oldestRecord) {
              console.log(chalk.gray(`   Oldest record: ${new Date(stats.oldestRecord).toLocaleString()}`));
            }
            if (stats.newestRecord) {
              console.log(chalk.gray(`   Newest record: ${new Date(stats.newestRecord).toLocaleString()}`));
            }

            console.log(chalk.blue(`\n📋 History Records (${records.length} shown):`));
            
            // 显示记录表格
            if (options.verbose) {
              // 详细模式：显示完整信息
              console.log(chalk.gray('┌─────┬─────────────────────┬─────────────────────┬─────────┬─────────────┬─────────┬────────┐'));
              console.log(chalk.gray('│ ID  │ Key                 │ Value               │ Version │ Timestamp   │ Action  │ Source │'));
              console.log(chalk.gray('├─────┼─────────────────────┼─────────────────────┼─────────┼─────────────┼─────────┼────────┤'));
              
              records.forEach(record => {
                const id = String(record.id || '').padEnd(3);
                const key = (record.key || '').padEnd(19);
                const value = (record.value || '').padEnd(19);
                const version = String(record.version || '').padEnd(7);
                const timestamp = new Date(record.timestamp).toLocaleString().padEnd(11);
                const action = (record.action || '').padEnd(7);
                const source = (record.source || '').padEnd(6);
                
                console.log(chalk.gray(`│ ${id} │ ${key} │ ${value} │ ${version} │ ${timestamp} │ ${action} │ ${source} │`));
              });
              
              console.log(chalk.gray('└─────┴─────────────────────┴─────────────────────┴─────────┴─────────────┴─────────┴────────┘'));
            } else {
              // 简洁模式：显示关键信息
              console.log(chalk.gray('┌─────────────────────┬─────────────────────┬─────────┬─────────────┬─────────┬────────┐'));
              console.log(chalk.gray('│ Key                 │ Value               │ Version │ Timestamp   │ Action  │ Source │'));
              console.log(chalk.gray('├─────────────────────┼─────────────────────┼─────────┼─────────────┼─────────┼────────┤'));
              
              records.forEach(record => {
                const key = (record.key || '').padEnd(19);
                const value = (record.value || '').padEnd(19);
                const version = String(record.version || '').padEnd(7);
                const timestamp = new Date(record.timestamp).toLocaleString().padEnd(11);
                const action = (record.action || '').padEnd(7);
                const source = (record.source || '').padEnd(6);
                
                console.log(chalk.gray(`│ ${key} │ ${value} │ ${version} │ ${timestamp} │ ${action} │ ${source} │`));
              });
              
              console.log(chalk.gray('└─────────────────────┴─────────────────────┴─────────┴─────────────┴─────────┴────────┘'));
            }

            // 显示操作类型统计
            const actionStats = records.reduce((acc, record) => {
              acc[record.action] = (acc[record.action] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            if (Object.keys(actionStats).length > 0) {
              console.log(chalk.blue('\n📈 Action Summary:'));
              Object.entries(actionStats).forEach(([action, count]) => {
                const emoji = action === 'created' ? '🆕' : action === 'updated' ? '🔄' : '🗑️';
                console.log(chalk.gray(`   ${emoji} ${action}: ${count}`));
              });
            }

            if (records.length >= limit) {
              console.log(chalk.yellow(`\n⚠️  Showing first ${limit} records. Use --limit to show more.`));
            }
          }

        } finally {
          dbManager.close();
        }

      } catch (error) {
        console.error(
          chalk.red(`❌ Error: ${error instanceof Error ? error.message : String(error)}`)
        );
        process.exit(1);
      }
    });
}
