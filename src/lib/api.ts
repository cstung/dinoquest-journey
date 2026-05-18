export class ApiError extends Error {
  detail: string;
  status: number;

  constructor(detail: string, status: number) {
    super(detail);
    this.detail = detail;
    this.status = status;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let detail = "Something went wrong";
    try {
      const json = (await res.json()) as { detail?: string };
      if (json?.detail) detail = json.detail;
    } catch {
      // ignored
    }
    throw new ApiError(detail, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

