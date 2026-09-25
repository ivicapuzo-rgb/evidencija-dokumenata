import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const TOKEN_KEY = "auth_token";

export async function getToken(): Promise<string | null> {
  return storage.secureGet(TOKEN_KEY, null);
}

export async function setToken(token: string): Promise<void> {
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await storage.secureRemove(TOKEN_KEY);
}

type Options = {
  method?: string;
  body?: any;
  auth?: boolean;
  isForm?: boolean;
};

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const { method = "GET", body, auth = true, isForm = false } = opts;
  const headers: Record<string, string> = {};
  if (!isForm) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    const message = typeof data?.detail === "string" ? data.detail : "Дошло је до грешке";
    throw new Error(message);
  }
  return data as T;
}

export const fileUrl = (path: string) => `${BASE}${path}`;
