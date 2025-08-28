import { Command } from 'commander';
import chalk from 'chalk';

interface GreetOptions {
  formal?: boolean;
  color?: string;
}

export function greetCommand(program: Command): void {
  program
    .command('greet <name>')
    .description('Say hello to someone')
    .option('-f, --formal', 'Use formal greeting')
    .option('-c, --color <color>', 'Choose greeting color', 'green')
    .action((name: string, options: GreetOptions) => {
      const greeting = options.formal 
        ? `Good day, ${name}! It's a pleasure to meet you.`
        : `Hello, ${name}! 👋`;
      
      const color = options.color || 'green';
      
      // 安全地使用chalk颜色
      let coloredGreeting: string;
      if (color === 'red') {
        coloredGreeting = chalk.red(greeting);
      } else if (color === 'blue') {
        coloredGreeting = chalk.blue(greeting);
      } else if (color === 'yellow') {
        coloredGreeting = chalk.yellow(greeting);
      } else if (color === 'magenta') {
        coloredGreeting = chalk.magenta(greeting);
      } else if (color === 'cyan') {
        coloredGreeting = chalk.cyan(greeting);
      } else {
        coloredGreeting = chalk.green(greeting);
      }
      
      console.log(coloredGreeting);
      
      if (!options.formal) {
        console.log(chalk.gray('Use --formal for a more professional greeting'));
      }
    });
}
