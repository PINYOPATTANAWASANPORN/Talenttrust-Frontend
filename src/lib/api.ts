import { site } from './site';

export interface Milestone {
  index: number;
  title: string;
  amount: number;
  released: boolean;
}

export type Status = 'Created' | 'Funded' | 'Completed' | 'Disputed' | 'Resolved' | 'Cancelled';

export interface Stats {
  contracts: number;
  byStatus: Record<Status, number>;
  totalEscrowed: number;
  totalReleased: number;
}

export interface EscrowContract {
  id: number;
  title: string;
  client: string;
  freelancer: string;
  token: string;
  milestones: Milestone[];
  totalAmount: number;
  fundedAmount: number;
  releasedAmount: number;
  status: Status;
  reputationIssued: boolean;
}

export interface Reputation {
  address: string;
  completedContracts: number;
  totalRating: number;
  averageRating: number;
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${site.apiUrl}${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function getStats(): Promise<Stats> {
  return api<Stats>('/api/v1/stats');
}
