#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { createRequire } from 'module';
import { versionCommand } from './commands/version.js';
import { initCommand } from './commands/init.js';
import { exportCommand } from './commands/export.js';
import { unsetCommand } from './commands/unset.js';
import { delCommand } from './commands/del.js';
import { setCommand } from './commands/set.js';
import { historyCommand } from './commands/history.js';
import { loadCommand } from './commands/load.js';
import { tagCommand } from './commands/tag.js';
import { pushCommand } from './commands/push.js';
import { pullCommand } from './commands/pull.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { whoamiCommand } from './commands/whoami.js';
import { orgCommand } from './commands/org.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();

// 设置基本信息
program
  .name('envx')
  .description(chalk.blue('A powerful environment management CLI tool'))
  .version(version);

// 添加命令
versionCommand(program);
initCommand(program);
exportCommand(program);
unsetCommand(program);
delCommand(program);
setCommand(program);
historyCommand(program);
loadCommand(program);
tagCommand(program);
pushCommand(program);
pullCommand(program);
loginCommand(program);
logoutCommand(program);
whoamiCommand(program);
orgCommand(program);

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
