export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const requestTimeoutMs = 20000;

// AI Assisted Logic
export async function apiFetch(apiBaseUrl: string, path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), requestTimeoutMs);
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(0, `Request timed out after ${requestTimeoutMs / 1000}s`);
    }
    throw new ApiError(0, `Backend unreachable at ${apiBaseUrl}`);
  } finally {
    window.clearTimeout(timer);
  }
  if (!response.ok) {
    throw new ApiError(response.status, await describeErrorResponse(response));
  }
  return response;
}

export async function apiJson<T>(apiBaseUrl: string, path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(apiBaseUrl, path, token, init);
  return (await response.json()) as T;
}

export async function describeErrorResponse(response: Response): Promise<string> {
  const prefix = `HTTP ${response.status}`;
  if (response.status === 401) {
    return `${prefix}: operator token missing or invalid`;
  }
  if (response.status === 429) {
    return `${prefix}: rate limit reached, wait a minute`;
  }
  try {
    const body = (await response.json()) as { detail?: unknown };
    const detail = body.detail;
    if (typeof detail === "string") {
      return `${prefix}: ${detail}`;
    }
    if (detail && typeof detail === "object" && "message" in detail) {
      return `${prefix}: ${String((detail as { message: unknown }).message)}`;
    }
    return `${prefix}: ${JSON.stringify(detail ?? body).slice(0, 160)}`;
  } catch {
    return prefix;
  }
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return error instanceof Error ? error.message : "Unexpected error";
}
