import type { SubmissionPayload, SubmissionRecord, SubmissionKind } from "@/lib/types";

// Base URL for the backend API. Falls back to an empty string so that relative
// /api paths work when Next.js rewrites are active (development proxy).
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail;
    let message = "Something went wrong. Please try again.";
    if (typeof detail === "string") message = detail;
    else if (Array.isArray(detail)) {
      message = detail.map((item) => {
        if (item && typeof item === "object" && "msg" in item) return String(item.msg);
        return "Invalid information.";
      }).join(" ");
    }
    throw new Error(message);
  }
  return data as Record<string, unknown>;
}

export async function submitSuggestion(payload: SubmissionPayload): Promise<{ id: string; message: string }> {
  const response = await fetch(`${API_BASE}/api/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(payload),
  });
  const data = await readJson(response);
  return { id: String(data.id), message: String(data.message) };
}

export async function signIn(username: string, password: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ username, password }),
  });
  await readJson(response);
}

export async function checkAdminSession(): Promise<{ username: string }> {
  const response = await fetch(`${API_BASE}/api/admin/me`, { credentials: "same-origin", cache: "no-store" });
  const data = await readJson(response);
  return { username: String(data.username) };
}

export async function loadSubmissions(kind?: SubmissionKind): Promise<{ items: SubmissionRecord[]; storage: string }> {
  const params = new URLSearchParams({ limit: "300" });
  if (kind) params.set("kind", kind);
  const response = await fetch(`${API_BASE}/api/admin/submissions?${params.toString()}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await readJson(response);
  return {
    items: Array.isArray(data.items) ? (data.items as SubmissionRecord[]) : [],
    storage: typeof data.storage === "string" ? data.storage : "unknown",
  };
}

export async function signOut(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/admin/logout`, { method: "POST", credentials: "same-origin" });
  await readJson(response);
}
