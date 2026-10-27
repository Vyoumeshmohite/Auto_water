# Serial protocol v1

The bridge and Nano exchange one compact JSON object per line at **115200 baud**. Lines are UTF-8/ASCII and end with `\n`. The firmware rejects malformed, oversized, unknown, or unsafe commands.

## Nano to bridge

- `telemetry`: `protocol_version`, `device_id`, `firmware_version`, `seq`, `moisture_raw`, `moisture_filtered`, `soil_state`, `pump_on`, `automation_enabled`, `module_verified`, `uptime_ms`.
- `event`: `event` (`watering_started` or `watering_stopped`), source/reason, duration/runtime, and optional `command_id`.
- `ack`: `command_id`, `command`, `status` (`accepted` or `rejected`), and `message`.
- `boot` and `error`: lifecycle and parser diagnostics.

## Bridge to Nano

```json
{"type":"command","command":"water","command_id":"UUID","duration_ms":2000}
{"type":"command","command":"stop","command_id":"UUID"}
{"type":"command","command":"status","command_id":"UUID"}
{"type":"command","command":"configure","command_id":"UUID","dry_threshold":950,"wet_threshold":750,"pulse_ms":2000,"soak_ms":300000,"max_runtime_ms":10000,"dry_confirmations":5,"automation_enabled":true,"pump_active_high":true,"module_verified":true}
```

`wet_threshold` must be lower than `dry_threshold` because this resistive module produces higher readings as soil gets drier. The firmware caps `max_runtime_ms` at 10 seconds and will not energize the pump until `module_verified` is true.
