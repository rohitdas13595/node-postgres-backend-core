import { createLogger, format, Logger, transports } from 'winston'
import { ContextProvider } from '@smoke-trees/smoke-context'

const contextFormat = format((info) => {
  const context = ContextProvider.getContext()
  info.traceId = context?.traceId
  return info
})

const wTransports = [
  new transports.Console({
    level: 'silly',
    handleExceptions: true,
    format: process.env.NODE_ENV === 'production'
      ? format.combine(contextFormat(), format.timestamp(), format.json())
      : format.combine(contextFormat(), format.timestamp(), format.colorize(), format.simple())
  })
]

const logger = createLogger({
  level: 'silly',
  transports: wTransports
})

class CustomLogger {
  private _logger: Logger

  public get logger (): Logger {
    return this._logger
  }

  public set logger (value: Logger) {
    this._logger = value
  }

  constructor (logger: Logger) {
    this._logger = logger
  }

  info (message: string, functionName?: string, meta?: any): void {
    this._logger.info(message, { functionName, ...meta })
  }

  debug (message: string, functionName?: string, meta?: any): void {
    this._logger.debug(message, { functionName, ...meta })
  }

  trace (message: string, functionName?: string, meta?: any): void {
    this._logger.error(message, { functionName, ...meta })
  }

  error (message: string, functionName?: string, error?: unknown, meta?: any): void {
    this._logger.error(message, {
      error: error instanceof Error && error.stack,
      functionName,
      ...meta
    })
  }

  warn (message: string, functionName?: string, meta?: any): void {
    this._logger.warn(message, { functionName, ...meta })
  }

  fatal (message: string, functionName?: string, meta?: any): void {
    this._logger.error(message, { functionName, ...meta })
  }
}

export const log =  new CustomLogger(logger)

export default log
