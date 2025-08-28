import chalk from 'chalk';

export class Logger {
  static info(message: string): void {
    console.log(chalk.blue('ℹ️  ' + message));
  }
  
  static success(message: string): void {
    console.log(chalk.green('✅ ' + message));
  }
  
  static warning(message: string): void {
    console.log(chalk.yellow('⚠️  ' + message));
  }
  
  static error(message: string): void {
    console.error(chalk.red('❌ ' + message));
  }
  
  static debug(message: string): void {
    if (process.env.DEBUG) {
      console.log(chalk.gray('🐛 ' + message));
    }
  }
  
  static progress(message: string): void {
    console.log(chalk.cyan('🔄 ' + message));
  }
}
