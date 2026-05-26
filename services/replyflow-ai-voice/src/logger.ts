/**
 * Logger for AI Voice Service (Phase 1A POC)
 */

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export function log(level: LogLevel, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    service: 'ai-voice-poc',
    message,
    ...(data && { data }),
  };

  console.log(`[AI POC] ${level}: ${message}`, data || '');
}
