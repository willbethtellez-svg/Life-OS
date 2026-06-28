const BASE_URL = process.env.NEXT_PUBLIC_FIREFLY_URL || 'http://localhost:8080';
const TOKEN = process.env.NEXT_PUBLIC_FIREFLY_TOKEN || '';

interface ApiResponse<T> {
  data: T[];
  meta?: {
    pagination: {
      total: number;
      count: number;
      perPage: number;
      currentPage: number;
      totalPages: number;
    };
  };
  links?: {
    first: string;
    last: string;
    prev: string | null;
    next: string | null;
  };
}

interface SingleApiResponse<T> {
  data: T;
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}/api/v1${endpoint}`;
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...(TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {}),
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
  if (!params) return '';
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

export const api = {
  accounts: {
    list: (params?: { page?: number; type?: string }) =>
      request<import('@/types').Account>(`/accounts${buildQuery(params as Record<string, string | number | boolean | undefined>)}`),
    get: (id: string) =>
      request<import('@/types').Account>(`/accounts/${id}`),
    transactions: (id: string, params?: { page?: number; limit?: number; start?: string; end?: string }) =>
      request<import('@/types').Transaction>(`/accounts/${id}/transactions${buildQuery(params as Record<string, string | number | boolean | undefined>)}`),
  },
  transactions: {
    list: (params?: { page?: number; limit?: number; start?: string; end?: string; type?: string }) =>
      request<import('@/types').Transaction>(`/transactions${buildQuery(params as Record<string, string | number | boolean | undefined>)}`),
    get: (id: string) =>
      request<import('@/types').Transaction>(`/transactions/${id}`),
    create: (data: Record<string, unknown>) =>
      request<import('@/types').Transaction>('/transactions', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Record<string, unknown>) =>
      request<import('@/types').Transaction>(`/transactions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`/transactions/${id}`, { method: 'DELETE' }),
  },
  categories: {
    list: (params?: { page?: number }) =>
      request<import('@/types').Category>(`/categories${buildQuery(params as Record<string, string | number | boolean | undefined>)}`),
    get: (id: string) =>
      request<import('@/types').Category>(`/categories/${id}`),
    transactions: (id: string, params?: { page?: number; start?: string; end?: string }) =>
      request<import('@/types').Transaction>(`/categories/${id}/transactions${buildQuery(params as Record<string, string | number | boolean | undefined>)}`),
  },
  budgets: {
    list: (params?: { page?: number }) =>
      request<import('@/types').Budget>(`/budgets${buildQuery(params as Record<string, string | number | boolean | undefined>)}`),
    get: (id: string) =>
      request<import('@/types').Budget>(`/budgets/${id}`),
  },
  piggyBanks: {
    list: (params?: { page?: number }) =>
      request<import('@/types').PiggyBank>(`/piggy-banks${buildQuery(params as Record<string, string | number | boolean | undefined>)}`),
    get: (id: string) =>
      request<import('@/types').PiggyBank>(`/piggy-banks/${id}`),
  },
  liabilities: {
    list: (params?: { page?: number }) =>
      request<import('@/types').Liability>(`/liabilities${buildQuery(params as Record<string, string | number | boolean | undefined>)}`),
    get: (id: string) =>
      request<import('@/types').Liability>(`/liabilities/${id}`),
  },
  currencies: {
    list: () => request<{ id: string; code: string; name: string; symbol: string; decimalPlaces: number }[]>('/currencies'),
  },
  summary: {
    basic: () => request<Record<string, string>>('/summary/basic'),
  },
};
