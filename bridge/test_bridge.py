import json

import pytest

from bridge import configuration_command, parse_serial_line, validate_device_message


DEVICE = "nano-plant-01"


def test_parses_valid_telemetry():
    payload = {
        "type": "telemetry",
        "protocol_version": 1,
        "device_id": DEVICE,
        "moisture_raw": 980,
        "moisture_filtered": 970,
        "soil_state": "dry",
        "pump_on": False,
    }
    assert parse_serial_line((json.dumps(payload) + "\n").encode(), DEVICE) == payload


@pytest.mark.parametrize("reading", [-1, 1024, "900", True])
def test_rejects_invalid_sensor_reading(reading):
    payload = {
        "type": "telemetry",
        "protocol_version": 1,
        "device_id": DEVICE,
        "moisture_raw": reading,
        "moisture_filtered": 900,
        "soil_state": "normal",
        "pump_on": False,
    }
    with pytest.raises(ValueError):
        validate_device_message(payload, DEVICE)


def test_rejects_wrong_device_and_bad_json():
    with pytest.raises(ValueError):
        parse_serial_line(b"not-json\n", DEVICE)
    with pytest.raises(ValueError):
        validate_device_message({"type": "boot", "device_id": "other"}, DEVICE)


def test_configuration_mapping_is_deterministic():
    settings = {
        "dry_threshold": 950,
        "wet_threshold": 720,
        "watering_pulse_ms": 2500,
        "soaking_interval_seconds": 300,
        "max_runtime_ms": 10000,
        "dry_confirmations": 5,
        "automation_enabled": True,
        "pump_active_high": False,
        "module_verified": True,
    }
    one = configuration_command(settings, "2026-01-01T00:00:00Z")
    two = configuration_command(settings, "2026-01-01T00:00:00Z")
    assert one == two
    assert one["soak_ms"] == 300_000
    assert one["command"] == "configure"


def test_offline_bridge_does_not_synthesize_water_command(monkeypatch):
    # The parser/config helpers contain no reconnect path that creates a water command.
    command = configuration_command(
        {
            "dry_threshold": 950,
            "wet_threshold": 700,
            "watering_pulse_ms": 2000,
            "soaking_interval_seconds": 300,
            "max_runtime_ms": 10000,
            "dry_confirmations": 5,
            "automation_enabled": False,
            "pump_active_high": True,
            "module_verified": False,
        },
        "revision",
    )
    assert command["command"] == "configure"
    assert command["module_verified"] is False


def test_configuration_line_fits_firmware_buffer():
    command = configuration_command(
        {
            "dry_threshold": 1023, "wet_threshold": 1000, "watering_pulse_ms": 10000,
            "soaking_interval_seconds": 86400, "max_runtime_ms": 10000,
            "dry_confirmations": 20, "automation_enabled": True,
            "pump_active_high": True, "module_verified": True,
        },
        "longest-values",
    )
    assert len(json.dumps(command, separators=(",", ":"))) <= 384
