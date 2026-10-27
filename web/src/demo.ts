import type { Reading, Settings, Status, WateringEvent } from './types';

export const demoSettings: Settings = {
  dry_threshold: 950,
  wet_threshold: 735,
  watering_pulse_ms: 2000,
  soaking_interval_seconds: 300,
  max_runtime_ms: 10000,
  dry_confirmations: 5,
  automation_enabled: true,
  pump_active_high: true,
  module_verified: true,
  updated_at: new Date().toISOString(),
};

function readingAt(timestamp: number, index: number): Reading {
  const wave = Math.sin(index / 7) * 42 + Math.sin(index / 19) * 26;
  const filtered = Math.round(Math.max(610, Math.min(1000, 825 + wave)));
  return {
    received_at: new Date(timestamp).toISOString(),
    moisture_raw: Math.max(0, Math.min(1023, filtered + ((index * 7) % 13) - 6)),
    moisture_filtered: filtered,
    soil_state: filtered >= demoSettings.dry_threshold ? 'dry' : filtered <= demoSettings.wet_threshold ? 'wet' : 'normal',
    pump_on: false,
  };
}

export function makeDemoHistory(range: '24h' | '7d', now = Date.now()): Reading[] {
  const count = range === '24h' ? 96 : 168;
  const step = range === '24h' ? 15 * 60_000 : 60 * 60_000;
  return Array.from({ length: count }, (_, index) => readingAt(now - (count - 1 - index) * step, index));
}

export function makeDemoEvents(now = Date.now()): WateringEvent[] {
  return [
    { id: 3, received_at: new Date(now - 2.1 * 60 * 60_000).toISOString(), event: 'watering_stopped', source: null, reason: 'pulse_complete', duration_ms: null, runtime_ms: 2004 },
    { id: 2, received_at: new Date(now - 2.1 * 60 * 60_000 - 2000).toISOString(), event: 'watering_started', source: 'automatic', reason: null, duration_ms: 2000, runtime_ms: null },
    { id: 1, received_at: new Date(now - 20 * 60 * 60_000).toISOString(), event: 'watering_started', source: 'automatic', reason: null, duration_ms: 2000, runtime_ms: null },
  ];
}

export function makeDemoStatus(now = Date.now(), pumpOn = false, settings = demoSettings): Status {
  const latest = readingAt(now, 50);
  return {
    device: {
      device_id: 'demo-plant-01', display_name: 'Demo Plant', bridge_online: true,
      serial_connected: true, telemetry_stale: false, firmware_version: 'demo-1.0.0',
      bridge_version: 'demo-1.0.0', last_error: null,
      bridge_last_seen_at: new Date(now).toISOString(), device_last_seen_at: new Date(now).toISOString(),
    },
    latest: { ...latest, pump_on: pumpOn, automation_enabled: settings.automation_enabled,
      module_verified: true, device_uptime_ms: 4_382_000 },
    watering_events_today: 2,
    settings: { ...settings },
    latest_command: null,
  };
}

