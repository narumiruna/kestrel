type LogLevel = 'ERROR' | 'LOG' | 'WARN';

export class Logger {
  constructor(private readonly context: string) {}

  error(message: string, detail?: string): void {
    Logger.write('ERROR', message, this.context, detail);
  }

  log(message: string, detail?: string): void {
    Logger.write('LOG', message, this.context, detail);
  }

  warn(message: string, detail?: string): void {
    Logger.write('WARN', message, this.context, detail);
  }

  static log(message: string, context: string): void {
    Logger.write('LOG', message, context);
  }

  private static write(
    level: LogLevel,
    message: string,
    context: string,
    detail?: string,
  ): void {
    const line = `${new Date().toISOString()} ${level} [${context}] ${message}${
      detail == null ? '' : `\n${detail}`
    }`;

    if (level === 'ERROR') {
      console.error(line);
    } else {
      console.log(line);
    }
  }
}
