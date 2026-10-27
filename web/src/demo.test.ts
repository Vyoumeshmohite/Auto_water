import { describe, expect, it } from 'vitest';
import { makeDemoHistory, makeDemoStatus } from './demo';

describe('demo data', () => {
  it('is clearly isolated from a real device identity', () => {
    const status = makeDemoStatus();
    expect(status.device.device_id).toBe('demo-plant-01');
    expect(status.device.firmware_version).toMatch(/^demo-/);
  });

  it('creates realistic but bounded chart readings', () => {
    const history = makeDemoHistory('24h');
    expect(history).toHaveLength(96);
    expect(history.every((item) => item.moisture_filtered >= 0 && item.moisture_filtered <= 1023)).toBe(true);
  });
});
