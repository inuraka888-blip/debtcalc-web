export async function withRetry<T>(
  operation: () => Promise<T>,
  {
    attempts = 3,
    baseDelayMs = 300,
    shouldRetry = defaultShouldRetry,
  }: {
    attempts?: number;
    baseDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1 || !shouldRetry(error)) {
        break;
      }
      await delay(baseDelayMs * 2 ** attempt);
    }
  }

  throw lastError;
}

function defaultShouldRetry(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return false;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("failed to fetch") ||
    message.includes("temporarily")
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
