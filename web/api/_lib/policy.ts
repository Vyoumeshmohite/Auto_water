export interface BridgeState { bridge_last_seen_at: string | null; serial_connected: boolean; }

export function bridgeIsOnline(device: BridgeState, now = Date.now(), maxAgeMs = 30_000) {
  if (!device.bridge_last_seen_at || !device.serial_connected) return false;
  return now - new Date(device.bridge_last_seen_at).getTime() < maxAgeMs;
}

export function commandIsExpired(expiresAt: string, now = Date.now()) {
  return new Date(expiresAt).getTime() <= now;
}

export function isDuplicate(existing: { idempotency_key: string }[], key: string) {
  return existing.some((row) => row.idempotency_key === key);
}

