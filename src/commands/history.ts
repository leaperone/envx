import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { createDatabaseManager, EnvHistoryRecord } from '../utils/db';

interface HistoryOptions {
  config?: string;
  key?: string;
  version?: number;
  tag?: string;
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
    .option('--version <number>', 'Filter history by specific version number')
    .option('--tag <tag>', 'Filter history by specific tag')
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
          let records: EnvHistoryRecord[] = [];
          const limit = parseInt(String(options.limit || '50'), 10);

          // 检查是否有任何过滤条件
          const hasFilters = options.key || options.version || options.tag;

          if (hasFilters) {
            // 有过滤条件时，获取过滤后的记录
            if (options.key) {
              console.log(chalk.gray(`🔍 Filtering by key: ${options.key}`));
              records = dbManager.getHistoryByKey(options.key, limit);
            } else if (options.version) {
              console.log(chalk.gray(`🔍 Filtering by version: ${options.version}`));
              records = dbManager.getHistoryByVersion(options.version, limit);
            } else if (options.tag) {
              console.log(chalk.gray(`🔍 Filtering by tag: ${options.tag}`));
              records = dbManager.getHistoryByTag(options.tag, limit);
            }

            if (records.length === 0) {
              console.log(chalk.yellow('📭 No history records found'));
              if (options.key) {
                console.log(chalk.gray(`   No records found for key: ${options.key}`));
              } else if (options.version) {
                console.log(chalk.gray(`   No records found for version: ${options.version}`));
              } else if (options.tag) {
                console.log(chalk.gray(`   No records found for tag: ${options.tag}`));
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
                  version: options.version,
                  tag: options.tag,
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

              // 显示过滤条件
              if (options.version) {
                console.log(chalk.blue(`\n🔍 Filtered by version: ${options.version}`));
              } else if (options.tag) {
                console.log(chalk.blue(`\n🔍 Filtered by tag: ${options.tag}`));
              } else if (options.key) {
                console.log(chalk.blue(`\n🔍 Filtered by key: ${options.key}`));
              }

              console.log(chalk.blue(`\n📋 History Records (${records.length} shown):`));
              
              // 显示记录表格
              if (options.verbose) {
                // 详细模式：显示完整信息
                console.log(chalk.gray('┌─────┬─────────────────────┬─────────────────────┬─────────┬─────────────┬─────────┬────────┬─────────────────────┐'));
                console.log(chalk.gray('│ ID  │ Key                 │ Value               │ Version │ Timestamp   │ Action  │ Source │ Tag                 │'));
                console.log(chalk.gray('├─────┼─────────────────────┼─────────────────────┼─────────┼─────────────┼─────────┼────────┼─────────────────────┤'));
                
                records.forEach(record => {
                  const id = String(record.id || '').padEnd(3);
                  const key = (record.key || '').padEnd(19);
                  const value = (record.value || '').padEnd(19);
                  const version = String(record.version || '').padEnd(7);
                  const timestamp = new Date(record.timestamp).toLocaleString().padEnd(11);
                  const action = (record.action || '').padEnd(7);
                  const source = (record.source || '').padEnd(6);
                  const tag = (record.tag || 'N/A').padEnd(19);
                  
                  console.log(chalk.gray(`│ ${id} │ ${key} │ ${value} │ ${version} │ ${timestamp} │ ${action} │ ${source} │ ${tag} │`));
                });
                
                console.log(chalk.gray('└─────┴─────────────────────┴─────────────────────┴─────────┴─────────────┴─────────┴────────┴─────────────────────┘'));
              } else {
                // 简洁模式：显示关键信息
                console.log(chalk.gray('┌─────────────────────┬─────────────────────┬─────────┬─────────────┬─────────┬────────┬─────────────────────┐'));
                console.log(chalk.gray('│ Key                 │ Value               │ Version │ Timestamp   │ Action  │ Source │ Tag                 │'));
                console.log(chalk.gray('├─────────────────────┼─────────────────────┼─────────┼─────────────┼─────────┼────────┼─────────────────────┤'));
                
                records.forEach(record => {
                  const key = (record.key || '').padEnd(19);
                  const value = (record.value || '').padEnd(19);
                  const version = String(record.version || '').padEnd(7);
                  const timestamp = new Date(record.timestamp).toLocaleString().padEnd(11);
                  const action = (record.action || '').padEnd(7);
                  const source = (record.source || '').padEnd(6);
                  const tag = (record.tag || 'N/A').padEnd(19);
                  
                  console.log(chalk.gray(`│ ${key} │ ${value} │ ${version} │ ${timestamp} │ ${action} │ ${source} │ ${tag} │`));
                });
                
                console.log(chalk.gray('└─────────────────────┴─────────────────────┴─────────┴─────────────┴─────────┴────────┴─────────────────────┘'));
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

              // 显示版本和标签统计
              if (options.version || options.tag) {
                const versionStats = records.reduce((acc, record) => {
                  acc[record.version] = (acc[record.version] || 0) + 1;
                  return acc;
                }, {} as Record<number, number>);

                const tagStats = records.reduce((acc, record) => {
                  const tag = record.tag || 'N/A';
                  acc[tag] = (acc[tag] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>);

                if (Object.keys(versionStats).length > 0) {
                  console.log(chalk.blue('\n🔢 Version Summary:'));
                  Object.entries(versionStats).forEach(([version, count]) => {
                    console.log(chalk.gray(`   v${version}: ${count} records`));
                  });
                }

                if (Object.keys(tagStats).length > 0) {
                  console.log(chalk.blue('\n🏷️  Tag Summary:'));
                  Object.entries(tagStats).forEach(([tag, count]) => {
                    console.log(chalk.gray(`   ${tag}: ${count} records`));
                  });
                }
              }

              if (records.length >= limit) {
                console.log(chalk.yellow(`\n⚠️  Showing first ${limit} records. Use --limit to show more.`));
              }
            }
          } else {
            // 没有过滤条件时，显示可查询的版本和标签信息
            console.log(chalk.blue('\n📋 Available Query Options:'));
            
            // 获取所有版本信息
            const versionStats = dbManager.getVersionStats();
            if (versionStats.length > 0) {
              console.log(chalk.blue('\n🔢 Available Versions:'));
              console.log(chalk.gray('┌─────────┬─────────────┬─────────────┬─────────────────────┬─────────────────────┐'));
              console.log(chalk.gray('│ Version │ Records     │ Variables   │ First Created        │ Last Updated         │'));
              console.log(chalk.gray('├─────────┼─────────────┼─────────────┼─────────────────────┼─────────────────────┤'));
              
              versionStats.forEach(versionInfo => {
                const version = String(versionInfo.version || 0).padEnd(7);
                const records = String(versionInfo.totalRecords || 0).padEnd(11);
                const variables = String(versionInfo.uniqueKeys || 0).padEnd(11);
                const firstCreated = versionInfo.firstCreated 
                  ? new Date(versionInfo.firstCreated).toLocaleString().padEnd(19)
                  : 'N/A'.padEnd(19);
                const lastUpdated = versionInfo.lastUpdated 
                  ? new Date(versionInfo.lastUpdated).toLocaleString().padEnd(19)
                  : 'N/A'.padEnd(19);
                
                console.log(chalk.gray(`│ ${version} │ ${records} │ ${variables} │ ${firstCreated} │ ${lastUpdated} │`));
              });
              
              console.log(chalk.gray('└─────────┴─────────────┴─────────────┴─────────────────────┴─────────────────────┘'));
            }

            // 获取所有标签信息
            const allTagsStats = dbManager.getAllTagsStats();
            if (allTagsStats.length > 0) {
              console.log(chalk.blue('\n🏷️  Available Tags:'));
              console.log(chalk.gray('┌─────────────────────┬─────────────┬─────────────┬─────────────────────┬─────────────────────┐'));
              console.log(chalk.gray('│ Tag                 │ Records     │ Variables   │ First Created        │ Last Updated         │'));
              console.log(chalk.gray('├─────────────────────┼─────────────┼─────────────┼─────────────────────┼─────────────────────┤'));
              
              allTagsStats.forEach(tagInfo => {
                const tag = (tagInfo.tag || '').padEnd(19);
                const records = String(tagInfo.totalRecords || 0).padEnd(11);
                const variables = String(tagInfo.uniqueKeys || 0).padEnd(11);
                const firstCreated = tagInfo.firstCreated 
                  ? new Date(tagInfo.firstCreated).toLocaleString().padEnd(19)
                  : 'N/A'.padEnd(19);
                const lastUpdated = tagInfo.lastUpdated 
                  ? new Date(tagInfo.lastUpdated).toLocaleString().padEnd(19)
                  : 'N/A'.padEnd(19);
                
                console.log(chalk.gray(`│ ${tag} │ ${records} │ ${variables} │ ${firstCreated} │ ${lastUpdated} │`));
              });
              
              console.log(chalk.gray('└─────────────────────┴─────────────┴─────────────┴─────────────────────┴─────────────────────┘'));
            }

            // 显示使用提示
            console.log(chalk.blue('\n💡 Usage Examples:'));
            console.log(chalk.gray('   • View specific version: envx history --version 1'));
            console.log(chalk.gray('   • View specific tag: envx history --tag v1.0.0'));
            console.log(chalk.gray('   • View specific key: envx history --key DATABASE_URL'));
            console.log(chalk.gray('   • View all records: envx history --key all'));
            console.log(chalk.gray('   • JSON output: envx history --version 1 --format json'));

            return;
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