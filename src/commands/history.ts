import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { createDatabaseManagerFromConfigPath, EnvHistoryRecord } from '@/utils/db';

interface HistoryOptions {
  config?: string;
  key?: string;
  format?: 'table' | 'json';
  verbose?: boolean;
  list?: boolean;
  limit?: string;
}

export function historyCommand(program: Command): void {
  program
    .command('history [tag]')
    .description('View environment variable history records from database by tag or list tags')
    .option(
      '-c, --config <path>',
      'Path to config file (default: ./envx.config.yaml)',
      './envx.config.yaml'
    )
    .option('-k, --key <key>', 'Filter history by specific environment variable key')
    .option('-f, --format <format>', 'Output format: table | json (default: table)', 'table')
    .option('-v, --verbose', 'Show detailed information including full values')
    .option('-l, --list', 'List all available tags')
    .option('-n, --limit <number>', 'Maximum number of records to show')
    .action(async (tag: string | undefined, options: HistoryOptions) => {
      try {
        const configPath = join(process.cwd(), options.config || './envx.config.yaml');
        const configDir = dirname(configPath);

        console.log(chalk.blue('📚 Viewing environment variable history...'));
        console.log(chalk.gray(`📁 Config file: ${options.config}`));
        console.log(chalk.gray(`🏷️  Tag: ${tag ?? '(all)'}`));

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
        const dbManager = createDatabaseManagerFromConfigPath(configPath);

        try {
          // 如果指定了 --list 选项或者没有提供 tag 参数，则列出所有 tag
          if (options.list || !tag) {
            console.log(chalk.blue('📋 Listing all available tags...'));
            
            const allTags = dbManager.getAllTags();
            const allTagsStats = dbManager.getAllTagsStats();
            
            if (allTags.length === 0) {
              console.log(chalk.yellow('📭 No tags found in database'));
              console.log(chalk.gray('💡 Tip: Run "envx set" or "envx load" to create some environment variable records'));
              return;
            }

            if (options.format === 'json') {
              // JSON 格式输出
              console.log(
                JSON.stringify(
                  {
                    tags: allTags,
                    stats: allTagsStats,
                    totalTags: allTags.length,
                  },
                  null,
                  2
                )
              );
            } else {
              // 表格格式输出
              console.log(chalk.blue(`\n📊 Found ${allTags.length} tags:`));
              
              // 显示标签统计表格
              console.log(
                chalk.gray(
                  '┌─────────────────────┬─────────────┬─────────────┬─────────────────────┬─────────────────────┐'
                )
              );
              console.log(
                chalk.gray(
                  '│ Tag                 │ Records     │ Unique Keys │ First Created       │ Last Updated        │'
                )
              );
              console.log(
                chalk.gray(
                  '├─────────────────────┼─────────────┼─────────────┼─────────────────────┼─────────────────────┤'
                )
              );

              allTagsStats.forEach(stat => {
                const tag = (stat.tag || '').padEnd(19);
                const records = String(stat.totalRecords).padEnd(11);
                const uniqueKeys = String(stat.uniqueKeys).padEnd(11);
                const firstCreated = stat.firstCreated 
                  ? new Date(stat.firstCreated).toLocaleString().padEnd(19)
                  : 'N/A'.padEnd(19);
                const lastUpdated = stat.lastUpdated 
                  ? new Date(stat.lastUpdated).toLocaleString().padEnd(19)
                  : 'N/A'.padEnd(19);

                console.log(chalk.gray(`│ ${tag} │ ${records} │ ${uniqueKeys} │ ${firstCreated} │ ${lastUpdated} │`));
              });

              console.log(
                chalk.gray(
                  '└─────────────────────┴─────────────┴─────────────┴─────────────────────┴─────────────────────┘'
                )
              );

              console.log(chalk.blue('\n💡 Usage:'));
              console.log(chalk.gray('   envx history <tag>           - View history for specific tag'));
              console.log(chalk.gray('   envx history <tag> -k <key> - View history for specific key in tag'));
              console.log(chalk.gray('   envx history -l             - List all available tags (this view)'));
            }
            
            return;
          }

          let records: EnvHistoryRecord[] = [];
          const limit = options.limit ? parseInt(options.limit, 10) : undefined;

          if (options.key) {
            console.log(chalk.gray(`🔍 Filtering by key: ${options.key} in tag: ${tag}`));
            const tagRecords = dbManager.getHistoryByTag(tag);
            records = tagRecords.filter(record => record.key === options.key);
          } else {
            console.log(chalk.gray(`🔍 Getting all records for tag: ${tag}`));
            records = dbManager.getHistoryByTag(tag);
          }

          if (limit && limit > 0) {
            records = records.slice(0, limit);
          }

          if (records.length === 0) {
            console.log(chalk.yellow('📭 No history records found'));
            if (options.key) {
              console.log(
                chalk.gray(`   No records found for key: ${options.key} in tag: ${tag}`)
              );
            } else {
              console.log(chalk.gray(`   No records found for tag: ${tag}`));
            }
            return;
          }

          // 获取数据库统计信息
          const stats = dbManager.getStats();

          if (options.format === 'json') {
            // JSON 格式输出
            console.log(
              JSON.stringify(
                {
                  stats,
                  records,
                  filters: {
                    key: options.key,
                    tag: tag,
                    // limit removed
                  },
                },
                null,
                2
              )
            );
          } else {
            // 表格格式输出
            console.log(chalk.blue('\n📊 Database Statistics:'));
            console.log(chalk.gray(`   Total records: ${stats.totalRecords}`));
            console.log(chalk.gray(`   Unique keys: ${stats.uniqueKeys}`));
            if (stats.oldestRecord) {
              console.log(
                chalk.gray(`   Oldest record: ${new Date(stats.oldestRecord).toLocaleString()}`)
              );
            }
            if (stats.newestRecord) {
              console.log(
                chalk.gray(`   Newest record: ${new Date(stats.newestRecord).toLocaleString()}`)
              );
            }

            // 显示过滤条件
            if (options.key) {
              console.log(chalk.blue(`\n🔍 Filtered by key: ${options.key} in tag: ${tag}`));
            } else {
              console.log(chalk.blue(`\n🔍 Filtered by tag: ${tag}`));
            }

            console.log(chalk.blue(`\n📋 History Records (${records.length} shown):`));

            // 显示记录表格
            if (options.verbose) {
              // 详细模式：显示完整信息
              console.log(
                chalk.gray(
                  '┌─────┬─────────────────────┬─────────────────────┬─────────────┬─────────────────────┐'
                )
              );
              console.log(
                chalk.gray(
                  '│ ID  │ Key                 │ Value               │ Timestamp   │ Tag                 │'
                )
              );
              console.log(
                chalk.gray(
                  '├─────┼─────────────────────┼─────────────────────┼─────────────┼─────────────────────┤'
                )
              );

              records.forEach(record => {
                const id = String(record.id || '').padEnd(3);
                const key = (record.key || '').padEnd(19);
                const value = (record.value || '').padEnd(19);
                const timestamp = new Date(record.timestamp).toLocaleString().padEnd(11);
                const tag = (record.tag || '').padEnd(19);

                console.log(chalk.gray(`│ ${id} │ ${key} │ ${value} │ ${timestamp} │ ${tag} │`));
              });

              console.log(
                chalk.gray(
                  '└─────┴─────────────────────┴─────────────────────┴─────────────┴─────────────────────┘'
                )
              );
            } else {
              // 简洁模式：显示关键信息
              console.log(
                chalk.gray(
                  '┌─────────────────────┬─────────────────────┬─────────────┬─────────────────────┐'
                )
              );
              console.log(
                chalk.gray(
                  '│ Key                 │ Value               │ Timestamp   │ Tag                 │'
                )
              );
              console.log(
                chalk.gray(
                  '├─────────────────────┼─────────────────────┼─────────────┼─────────────────────┤'
                )
              );

              records.forEach(record => {
                const key = (record.key || '').padEnd(19);
                const value = (record.value || '').padEnd(19);
                const timestamp = new Date(record.timestamp).toLocaleString().padEnd(11);
                const tag = (record.tag || '').padEnd(19);

                console.log(chalk.gray(`│ ${key} │ ${value} │ ${timestamp} │ ${tag} │`));
              });

              console.log(
                chalk.gray(
                  '└─────────────────────┴─────────────────────┴─────────────┴─────────────────────┘'
                )
              );
            }

            // 显示标签统计
            const tagStats = records.reduce(
              (acc, record) => {
                const recordTag = record.tag || 'N/A';
                acc[recordTag] = (acc[recordTag] || 0) + 1;
                return acc;
              },
              {} as Record<string, number>
            );

            if (Object.keys(tagStats).length > 0) {
              console.log(chalk.blue('\n🏷️  Tag Summary:'));
              Object.entries(tagStats).forEach(([recordTag, count]) => {
                console.log(chalk.gray(`   ${recordTag}: ${count} records`));
              });
            }

            // limit removed
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
