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

type ErrorDetail =
  | string
  | { msg?: string; loc?: Array<string | number> }
  | Array<string | { msg?: string; loc?: Array<string | number> }>;

function formatErrorDetail(detail: ErrorDetail | undefined): string {
  if (!detail) return "Something went wrong";
  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        const msg = item.msg ?? "Invalid input";
        const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : null;
        return field ? `${String(field)}: ${msg}` : msg;
      })
      .filter(Boolean);
    return messages.length > 0 ? messages.join("; ") : "Something went wrong";
  }

  if (typeof detail === "object" && detail.msg) {
    return detail.msg;
  }

  return "Something went wrong";
}

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
      const json = (await res.json()) as { detail?: ErrorDetail };
      detail = formatErrorDetail(json?.detail);
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
