const BASE = "https://api.hevyapp.com/v1";

function headers(): HeadersInit {
  const key = process.env.HEVY_API_KEY;
  if (!key) {
    throw new Error("HEVY_API_KEY must be set");
  }
  return {
    "api-key": key,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export async function hevyFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...headers(),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hevy API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
