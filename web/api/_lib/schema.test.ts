import { describe, expect, it } from 'vitest';
import { parse, settingsSchema, telemetrySchema } from './schema';

describe('validation', () => {
  it('rejects crossed sensor thresholds', () => {
    expect(() => parse(settingsSchema, { dry_threshold: 700, wet_threshold: 750, watering_pulse_ms: 2000,
      soaking_interval_seconds: 300, max_runtime_ms: 10000, dry_confirmations: 5,
      automation_enabled: true, pump_active_high: true, module_verified: true })).toThrow(/threshold/);
  });
  it('rejects invalid telemetry', () => {
    expect(() => parse(telemetrySchema, { type: 'telemetry', protocol_version: 1, device_id: 'nano-plant-01',
      firmware_version: '1.0', seq: 1, moisture_raw: 2000, moisture_filtered: 800,
      soil_state: 'normal', pump_on: false, automation_enabled: false, module_verified: false, uptime_ms: 10 })).toThrow();
  });
});

