"""Windows USB-to-HTTPS bridge for the Smart Plant Watering system."""
from __future__ import annotations

import json
import logging
import os
import signal
import sys
import time
import uuid
from dataclasses import dataclass
from typing import Any

import requests
import serial
from dotenv import load_dotenv
from serial.tools import list_ports

BRIDGE_VERSION = "1.0.0"
PROTOCOL_VERSION = 1
ALLOWED_DEVICE_TYPES = {"telemetry", "event", "ack", "boot", "error"}


@dataclass(frozen=True)
class Config:
    serial_port: str
    serial_baud: int
    api_base_url: str
    api_token: str
    device_id: str
    poll_interval: float = 2.0
    settings_sync_interval: float = 30.0
    http_timeout: float = 10.0

    @classmethod
    def from_env(cls) -> "Config":
        load_dotenv()
        required = ["SERIAL_PORT", "API_BASE_URL", "BRIDGE_API_TOKEN", "DEVICE_ID"]
        missing = [name for name in required if not os.getenv(name)]
        if missing:
            raise ValueError(f"Missing environment variables: {', '.join(missing)}")
        return cls(
            serial_port=os.environ["SERIAL_PORT"],
            serial_baud=int(os.getenv("SERIAL_BAUD", "115200")),
            api_base_url=os.environ["API_BASE_URL"].rstrip("/"),
            api_token=os.environ["BRIDGE_API_TOKEN"],
            device_id=os.environ["DEVICE_ID"],
            poll_interval=float(os.getenv("POLL_INTERVAL_SECONDS", "2")),
            settings_sync_interval=float(os.getenv("SETTINGS_SYNC_SECONDS", "30")),
            http_timeout=float(os.getenv("HTTP_TIMEOUT_SECONDS", "10")),
        )


def validate_device_message(value: Any, expected_device_id: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("Serial payload must be a JSON object")
    message_type = value.get("type")
    if message_type not in ALLOWED_DEVICE_TYPES:
        raise ValueError("Unknown serial message type")
    if message_type not in {"error"}:
        if value.get("device_id") != expected_device_id:
            raise ValueError("Unexpected device_id")
        if message_type != "boot" and value.get("protocol_version") != PROTOCOL_VERSION:
            raise ValueError("Unsupported protocol_version")
    if message_type == "telemetry":
        for field in ("moisture_raw", "moisture_filtered"):
            reading = value.get(field)
            if not isinstance(reading, int) or isinstance(reading, bool) or not 0 <= reading <= 1023:
                raise ValueError(f"Invalid {field}")
        if value.get("soil_state") not in {"dry", "normal", "wet"}:
            raise ValueError("Invalid soil_state")
        if not isinstance(value.get("pump_on"), bool):
            raise ValueError("Invalid pump_on")
    return value


def parse_serial_line(line: bytes, expected_device_id: str) -> dict[str, Any]:
    if len(line) > 1024:
        raise ValueError("Serial message is too long")
    try:
        decoded = line.decode("utf-8").strip()
        return validate_device_message(json.loads(decoded), expected_device_id)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid serial JSON") from exc


class ApiClient:
    def __init__(self, config: Config):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {config.api_token}",
                "Content-Type": "application/json",
                "User-Agent": f"plant-bridge/{BRIDGE_VERSION}",
            }
        )

    def request(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        response = self.session.request(
            method,
            f"{self.config.api_base_url}{path}",
            timeout=self.config.http_timeout,
            **kwargs,
        )
        response.raise_for_status()
        return response

    def post_device_message(self, message: dict[str, Any]) -> None:
        endpoint = "/api/telemetry" if message["type"] in {"telemetry", "boot", "error"} else "/api/events"
        self.request("POST", endpoint, json=message)

    def heartbeat(self, serial_connected: bool, last_error: str | None = None) -> None:
        self.request(
            "POST",
            "/api/connectivity",
            json={
                "device_id": self.config.device_id,
                "bridge_version": BRIDGE_VERSION,
                "serial_connected": serial_connected,
                "last_error": last_error,
            },
        )

    def next_command(self) -> dict[str, Any] | None:
        response = self.request("GET", "/api/commands", params={"device_id": self.config.device_id})
        return response.json().get("command")

    def acknowledge(self, message: dict[str, Any]) -> None:
        self.request(
            "PATCH",
            "/api/commands",
            json={
                "device_id": self.config.device_id,
                "command_id": message["command_id"],
                "status": "acknowledged" if message.get("status") == "accepted" else "failed",
                "device_message": message.get("message", ""),
            },
        )

    def settings(self) -> dict[str, Any]:
        response = self.request("GET", "/api/settings", params={"device_id": self.config.device_id})
        return response.json()["settings"]


def configuration_command(settings: dict[str, Any], revision: str) -> dict[str, Any]:
    return {
        "type": "command",
        "command": "configure",
        "command_id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"plant-settings:{revision}")),
        "dry_threshold": settings["dry_threshold"],
        "wet_threshold": settings["wet_threshold"],
        "pulse_ms": settings["watering_pulse_ms"],
        "soak_ms": settings["soaking_interval_seconds"] * 1000,
        "max_runtime_ms": settings["max_runtime_ms"],
        "dry_confirmations": settings["dry_confirmations"],
        "automation_enabled": settings["automation_enabled"],
        "pump_active_high": settings["pump_active_high"],
        "module_verified": settings["module_verified"],
    }


class Bridge:
    def __init__(self, config: Config):
        self.config = config
        self.api = ApiClient(config)
        self.running = True
        self.port: serial.Serial | None = None
        self.last_poll = 0.0
        self.last_heartbeat = 0.0
        self.last_settings_sync = 0.0
        self.settings_revision: str | None = None
        self.last_error: str | None = None

    def stop(self, *_: object) -> None:
        self.running = False

    def send_serial(self, payload: dict[str, Any]) -> None:
        if not self.port or not self.port.is_open:
            raise RuntimeError("Serial port is not connected")
        line = json.dumps(payload, separators=(",", ":")) + "\n"
        self.port.write(line.encode("utf-8"))
        self.port.flush()

    def service_network(self) -> None:
        now = time.monotonic()
        if now - self.last_heartbeat >= 10:
            self.api.heartbeat(True, self.last_error)
            self.last_heartbeat = now
        if now - self.last_poll >= self.config.poll_interval:
            command = self.api.next_command()
            self.last_poll = now
            if command:
                # Commands are claimed by the API before delivery. They are not replayed
                # automatically after reconnect, which avoids surprise pump starts.
                self.send_serial(command)
                logging.info("Delivered command %s (%s)", command["command_id"], command["command"])
        if now - self.last_settings_sync >= self.config.settings_sync_interval:
            result = self.api.settings()
            revision = result["updated_at"]
            if revision != self.settings_revision:
                self.send_serial(configuration_command(result, revision))
                self.settings_revision = revision
                logging.info("Sent settings revision %s", revision)
            self.last_settings_sync = now

    def run_connected(self) -> None:
        assert self.port is not None
        self.api.heartbeat(True)
        while self.running and self.port.is_open:
            line = self.port.readline()
            if line:
                try:
                    message = parse_serial_line(line, self.config.device_id)
                    if message["type"] == "ack" and message.get("command_id"):
                        if message.get("command") in {"water", "stop"}:
                            self.api.acknowledge(message)
                        elif message.get("command") == "configure":
                            if message.get("status") == "accepted":
                                logging.info("Nano accepted settings: %s", message.get("message"))
                            else:
                                self.settings_revision = None
                                self.last_error = f"settings rejected: {message.get('message', '')}"
                                logging.error("Nano rejected settings: %s", message.get("message"))
                    else:
                        self.api.post_device_message(message)
                    self.last_error = None
                except ValueError as exc:
                    self.last_error = str(exc)
                    logging.warning("Discarded serial input: %s", exc)
                except requests.RequestException as exc:
                    # Keep local firmware operating; data resumes when HTTPS recovers.
                    self.last_error = f"backend: {exc}"
                    logging.error("Backend request failed: %s", exc)
            try:
                self.service_network()
            except requests.RequestException as exc:
                self.last_error = f"backend: {exc}"
                logging.error("Backend unavailable: %s", exc)

    def run(self) -> None:
        backoff = 1.0
        while self.running:
            try:
                logging.info("Connecting to %s at %d baud", self.config.serial_port, self.config.serial_baud)
                self.port = serial.Serial(self.config.serial_port, self.config.serial_baud, timeout=0.5)
                time.sleep(2.0)  # Nano resets when the serial port opens.
                self.port.reset_input_buffer()
                logging.info("Serial connected; pump state is never restored by the bridge")
                backoff = 1.0
                self.run_connected()
            except (serial.SerialException, OSError) as exc:
                self.last_error = f"serial: {exc}"
                logging.error("Serial disconnected: %s", exc)
                try:
                    self.api.heartbeat(False, self.last_error)
                except requests.RequestException:
                    pass
            finally:
                if self.port:
                    try:
                        self.port.close()
                    except serial.SerialException:
                        pass
                self.port = None
            if self.running:
                time.sleep(backoff)
                backoff = min(backoff * 2, 30)


def print_ports() -> None:
    ports = list(list_ports.comports())
    if not ports:
        print("No serial ports found. Connect the Nano and install its USB driver if needed.")
        return
    for port in ports:
        print(f"{port.device}: {port.description} [{port.hwid}]")


def main() -> int:
    if "--list-ports" in sys.argv:
        print_ports()
        return 0
    try:
        config = Config.from_env()
    except (ValueError, TypeError) as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2
    logging.basicConfig(
        level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    bridge = Bridge(config)
    signal.signal(signal.SIGINT, bridge.stop)
    signal.signal(signal.SIGTERM, bridge.stop)
    bridge.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

