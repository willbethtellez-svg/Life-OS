async function request<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
  const baseUrl = import.meta.env.VITE_FIREFLY_URL || "http://localhost:8080";
  const token = import.meta.env.VITE_FIREFLY_TOKEN || "";
  const url = `${baseUrl}/api/v1${endpoint}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...((options?.headers as Record<string, string>) || {}) },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Firefly API error ${res.status}: ${error}`);
  }

  return res.json();
}

function buildQuery(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return "";
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return q ? `?${q}` : "";
}

export const api = {
  accounts: {
    list: (params?: { page?: number; type?: string }) =>
      request(`/accounts${buildQuery(params as any)}`),
    get: (id: string) =>
      request(`/accounts/${id}`),
    transactions: (id: string, params?: { page?: number; limit?: number; start?: string; end?: string }) =>
      request(`/accounts/${id}/transactions${buildQuery(params as any)}`),
  },
  transactions: {
    list: (params?: { page?: number; limit?: number; start?: string; end?: string; type?: string }) =>
      request(`/transactions${buildQuery(params as any)}`),
    get: (id: string) =>
      request(`/transactions/${id}`),
    create: (data: Record<string, unknown>) =>
      request("/transactions", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request(`/transactions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request(`/transactions/${id}`, { method: "DELETE" }),
  },
  categories: {
    list: (params?: { page?: number }) =>
      request(`/categories${buildQuery(params as any)}`),
    get: (id: string) =>
      request(`/categories/${id}`),
    transactions: (id: string, params?: { page?: number; start?: string; end?: string }) =>
      request(`/categories/${id}/transactions${buildQuery(params as any)}`),
  },
  budgets: {
    list: (params?: { page?: number }) =>
      request(`/budgets${buildQuery(params as any)}`),
    get: (id: string) =>
      request(`/budgets/${id}`),
  },
  piggyBanks: {
    list: (params?: { page?: number }) =>
      request(`/piggy-banks${buildQuery(params as any)}`),
    get: (id: string) =>
      request(`/piggy-banks/${id}`),
  },
  liabilities: {
    list: (params?: { page?: number }) =>
      request(`/liabilities${buildQuery(params as any)}`),
    get: (id: string) =>
      request(`/liabilities/${id}`),
  },
  currencies: {
    list: () => request("/currencies"),
  },
  summary: {
    basic: () => request("/summary/basic"),
  },
};
