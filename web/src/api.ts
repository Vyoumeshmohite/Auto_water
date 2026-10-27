import type { Reading, Settings, Status, WateringEvent } from './types';

export const DEVICE_ID = 'nano-plant-01';

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', 'X-Dashboard-Token': token, ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body?.error?.message ?? 'Request failed');
  return body as T;
}

export const api = {
  demo: (token: string) => request<{ ok: true; mode: 'demo' }>('/api/demo', '', { method: 'POST', body: JSON.stringify({ token }) }),
  status: (token: string) => request<Status>(`/api/status?device_id=${DEVICE_ID}&tz_offset_min=${new Date().getTimezoneOffset()}`, token),
  history: (token: string, range: '24h' | '7d') => request<{ readings: Reading[] }>(`/api/history?device_id=${DEVICE_ID}&range=${range}`, token),
  events: (token: string) => request<{ events: WateringEvent[] }>(`/api/events?device_id=${DEVICE_ID}&limit=12`, token),
  saveSettings: (token: string, settings: Settings) => request<{ settings: Settings }>('/api/settings', token, { method: 'PUT', body: JSON.stringify({ device_id: DEVICE_ID, settings }) }),
  command: (token: string, command: 'water' | 'stop', duration_ms?: number) => request<{ command: { id: string; status: string } }>('/api/commands', token, {
    method: 'POST', headers: { 'X-Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ device_id: DEVICE_ID, command, ...(duration_ms ? { duration_ms } : {}) }),
  }),
};

