import { describe, expect, it } from 'vitest';
import { bridgeIsOnline, commandIsExpired, isDuplicate } from './policy';

describe('command safety policy', () => {
  const now = new Date('2026-10-27T10:00:00Z').getTime();
  it('rejects an offline or stale bridge', () => {
    expect(bridgeIsOnline({ bridge_last_seen_at: null, serial_connected: false }, now)).toBe(false);
    expect(bridgeIsOnline({ bridge_last_seen_at: '2026-10-27T09:59:00Z', serial_connected: true }, now)).toBe(false);
    expect(bridgeIsOnline({ bridge_last_seen_at: '2026-10-27T09:59:50Z', serial_connected: true }, now)).toBe(true);
  });
  it('identifies expired commands', () => {
    expect(commandIsExpired('2026-10-27T09:59:59Z', now)).toBe(true);
    expect(commandIsExpired('2026-10-27T10:00:20Z', now)).toBe(false);
  });
  it('identifies duplicate idempotency keys', () => {
    expect(isDuplicate([{ idempotency_key: 'same' }], 'same')).toBe(true);
    expect(isDuplicate([{ idempotency_key: 'other' }], 'same')).toBe(false);
  });
});

