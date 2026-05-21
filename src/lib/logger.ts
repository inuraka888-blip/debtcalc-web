type LogLevel = "debug" | "info" | "warn" | "error";

function shouldLog(level: LogLevel): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  return level === "warn" || level === "error";
}

export const logger = {
  debug(message: string, context?: unknown) {
    if (shouldLog("debug")) {
      console.debug(`[DebtCalc] ${message}`, context);
    }
  },
  info(message: string, context?: unknown) {
    if (shouldLog("info")) {
      console.info(`[DebtCalc] ${message}`, context);
    }
  },
  warn(message: string, context?: unknown) {
    if (shouldLog("warn")) {
      console.warn(`[DebtCalc] ${message}`, context);
    }
  },
  error(message: string, context?: unknown) {
    if (shouldLog("error")) {
      console.error(`[DebtCalc] ${message}`, context);
    }
  },
};
