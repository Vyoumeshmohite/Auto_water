export type SoilState = 'dry' | 'normal' | 'wet';
export interface Reading { received_at: string; moisture_raw: number; moisture_filtered: number; soil_state: SoilState; pump_on: boolean; }
export interface Settings {
  dry_threshold: number; wet_threshold: number; watering_pulse_ms: number; soaking_interval_seconds: number;
  max_runtime_ms: number; dry_confirmations: number; automation_enabled: boolean;
  pump_active_high: boolean; module_verified: boolean; updated_at?: string;
}
export interface Status {
  device: { device_id: string; display_name: string; bridge_online: boolean; serial_connected: boolean; telemetry_stale: boolean;
    firmware_version: string | null; bridge_version: string | null; last_error: string | null;
    bridge_last_seen_at: string | null; device_last_seen_at: string | null; };
  latest: (Reading & { automation_enabled: boolean; module_verified: boolean; device_uptime_ms: number }) | null;
  watering_events_today: number; settings: Settings;
  latest_command: { id: string; kind: 'water' | 'stop'; status: string; created_at: string; acknowledged_at: string | null; device_message: string | null } | null;
}
export interface WateringEvent { id: number; received_at: string; event: string; source: string | null; reason: string | null; duration_ms: number | null; runtime_ms: number | null; }

