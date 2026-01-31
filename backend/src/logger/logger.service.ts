import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';
import WinstonCloudWatch from 'winston-cloudwatch';

@Injectable()
export class LoggerService implements NestLoggerService {
  private logger: winston.Logger;

  constructor() {
    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
            return `${timestamp} [${level}] ${context ? `[${context}]` : ''} ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
          }),
        ),
      }),
    ];

    // Add CloudWatch transport if AWS credentials are configured
    if (process.env.AWS_REGION && process.env.CLOUDWATCH_LOG_GROUP) {
      const cloudWatchTransport = new WinstonCloudWatch({
        logGroupName: process.env.CLOUDWATCH_LOG_GROUP,
        logStreamName: process.env.CLOUDWATCH_LOG_STREAM || `${process.env.SERVICE_NAME || 'magician-props-api'}-${new Date().toISOString().split('T')[0]}`,
        awsRegion: process.env.AWS_REGION,
        messageFormatter: ({ level, message, ...meta }) => {
          return JSON.stringify({ level, message, ...meta, timestamp: new Date().toISOString() });
        },
      });

      transports.push(cloudWatchTransport);
      console.log('CloudWatch logging enabled');
    } else {
      console.log('CloudWatch logging disabled - set AWS_REGION and CLOUDWATCH_LOG_GROUP to enable');
    }

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      transports,
    });
  }

  log(message: string, context?: string) {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error(message, { trace, context });
  }

  warn(message: string, context?: string) {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string) {
    this.logger.debug(message, { context });
  }

  verbose(message: string, context?: string) {
    this.logger.verbose(message, { context });
  }
}
