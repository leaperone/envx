#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { versionCommand } from './commands/version.js';
import { initCommand } from './commands/init.js';
import { exportCommand } from './commands/export.js';
import { unsetCommand } from './commands/unset.js';
import { delCommand } from './commands/del.js';
import { setCommand } from './commands/set.js';
import { historyCommand } from './commands/history.js';
import { loadCommand } from './commands/load.js';
import { testCommand } from './commands/test.js';
import { tagCommand } from './commands/tag.js';
import { pushCommand } from './commands/push.js';
import { pullCommand } from './commands/pull.js';

const program = new Command();

// 设置基本信息
program
  .name('envx')
  .description(chalk.blue('A powerful environment management CLI tool'))
  .version('1.0.0');

// 添加命令
versionCommand(program);
initCommand(program);
exportCommand(program);
unsetCommand(program);
delCommand(program);
setCommand(program);
historyCommand(program);
loadCommand(program);
testCommand(program);
tagCommand(program);
pushCommand(program);
pullCommand(program);

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
