#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { versionCommand } from './commands/version.js';
import { initCommand } from './commands/init.js';
import { cloneCommand } from './commands/clone.js';
import { exportCommand } from './commands/export.js';
import { unsetCommand } from './commands/unset.js';
import { delCommand } from './commands/del.js';
import { setCommand } from './commands/set.js';

const program = new Command();

// 设置基本信息
program
  .name('envx')
  .description(chalk.blue('A powerful environment management CLI tool'))
  .version('1.0.0');

// 添加命令
versionCommand(program);
initCommand(program);
cloneCommand(program);
exportCommand(program);
unsetCommand(program);
delCommand(program);
setCommand(program);

// 默认命令
program
  .command('help')
  .description('Show help information')
  .action(() => {
    program.help();
  });

// 解析命令行参数
program.parse(process.argv);

// 如果没有提供命令，显示帮助
if (!process.argv.slice(2).length) {
  program.help();
}
