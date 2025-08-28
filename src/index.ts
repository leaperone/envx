#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { greetCommand } from './commands/greet.js';
import { versionCommand } from './commands/version.js';

const program = new Command();

// 设置基本信息
program
  .name('envx')
  .description(chalk.blue('A powerful environment management CLI tool'))
  .version('1.0.0');

// 添加命令
greetCommand(program);
versionCommand(program);

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
