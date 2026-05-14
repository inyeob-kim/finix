/**
 * Low-level HTTP helpers; feature APIs wrap this module.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function resolveUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (base === undefined || base === "") {
    return path;
  }
  return `${base.replace(/\/$/, "")}${path}`;
}

async function parseErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { detail?: unknown };
    if (typeof json.detail === "string") {
      return json.detail;
    }
    if (Array.isArray(json.detail)) {
      return JSON.stringify(json.detail);
    }
  } catch {
    /* ignore */
  }
  return text || res.statusText || `HTTP ${res.status}`;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = resolveUrl(path);
  const headers: HeadersInit = {
    Accept: "application/json",
    ...options.headers,
  };
  const hasBody = options.body !== undefined && options.body !== null;
  if (hasBody && !(headers as Record<string, string>)["Content-Type"]) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const msg = await parseErrorMessage(res);
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const ct = res.headers.get("content-type");
  if (!ct?.includes("application/json")) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export async function fetchBlob(path: string): Promise<Blob> {
  const url = resolveUrl(path);
  const res = await fetch(url);
  if (!res.ok) {
    const msg = await parseErrorMessage(res);
    throw new ApiError(res.status, msg);
  }
  return res.blob();
}
