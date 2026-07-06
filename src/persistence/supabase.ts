import { logger } from '../lib/logger.js';

/**
 * Minimal Supabase/PostgREST client built on fetch — no SDK dependency, mirrors
 * the hand-rolled AlpacaClient style. Uses the service-role key, so it must only
 * ever run server-side.
 */
export class SupabaseRest {
  private readonly restUrl: string;
  private readonly headers: Record<string, string>;

  constructor(url: string, serviceKey: string) {
    this.restUrl = `${url.replace(/\/$/, '')}/rest/v1`;
    this.headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.restUrl}/${path}`, {
      ...init,
      headers: { ...this.headers, ...init.headers },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase ${response.status} on ${path}: ${body}`);
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  async select<T>(table: string, query = 'select=*'): Promise<T[]> {
    return (await this.request<T[]>(`${table}?${query}`, { method: 'GET' })) ?? [];
  }

  /** Insert or update rows, merging on the given conflict column. */
  async upsert(table: string, rows: unknown[], onConflict: string): Promise<void> {
    if (rows.length === 0) return;
    await this.request(`${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    });
  }

  /** Delete rows matching a raw PostgREST filter (e.g. `symbol=not.in.(AAPL)`). */
  async delete(table: string, filter: string): Promise<void> {
    await this.request(`${table}?${filter}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  }
}

/** Build a REST client from env, or null when Supabase is not configured. */
export function createSupabaseRest(): SupabaseRest | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    logger.warn('Supabase not configured — persistence disabled (in-memory only)');
    return null;
  }
  return new SupabaseRest(url, key);
}
