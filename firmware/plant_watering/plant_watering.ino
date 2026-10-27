#include <Arduino.h>
#include <EEPROM.h>

// Smart Plant Watering firmware for Arduino Nano (ATmega328P).
// Protocol: newline-delimited JSON at 115200 baud. See docs/protocol.md.

const char DEVICE_ID[] = "nano-plant-01";
const char FIRMWARE_VERSION[] = "1.0.0";
const uint8_t SENSOR_PIN = A0;
const uint8_t PUMP_PIN = 3;
const unsigned long TELEMETRY_INTERVAL_MS = 5000UL;
const unsigned long SAMPLE_INTERVAL_MS = 250UL;
const uint8_t FILTER_SIZE = 7;
const uint16_t MAX_SERIAL_LINE = 384;
const uint32_t CONFIG_MAGIC = 0x504C4E54UL;

struct Settings {
  uint32_t magic;
  uint16_t dryThreshold;
  uint16_t wetThreshold;
  uint16_t pulseMs;
  uint32_t soakMs;
  uint16_t maxRuntimeMs;
  uint8_t dryConfirmations;
  bool automationEnabled;
  bool pumpActiveHigh;
  bool moduleVerified;
};

Settings settings;
uint16_t samples[FILTER_SIZE];
uint8_t sampleIndex = 0;
uint8_t sampleCount = 0;
uint16_t moistureFiltered = 0;
uint16_t moistureRaw = 0;
uint8_t consecutiveDry = 0;
bool pumpOn = false;
unsigned long pumpStartedAt = 0;
unsigned long pumpDeadline = 0;
unsigned long lastWateringEndedAt = 0;
unsigned long lastSampleAt = 0;
unsigned long lastTelemetryAt = 0;
unsigned long sequenceNumber = 0;
char serialLine[MAX_SERIAL_LINE + 1];
uint16_t serialLength = 0;
char lastCommandId[40] = "";

bool elapsed(unsigned long now, unsigned long deadline) {
  return (long)(now - deadline) >= 0;
}

void writePumpPin(bool on) {
  // The output is never energized until moduleVerified is explicitly true.
  bool logicalOn = on && settings.moduleVerified;
  uint8_t level = logicalOn == settings.pumpActiveHigh ? HIGH : LOW;
  digitalWrite(PUMP_PIN, level);
}

void pumpStop(const char *reason) {
  if (!pumpOn) return;
  writePumpPin(false);
  pumpOn = false;
  lastWateringEndedAt = millis();
  Serial.print(F("{\"type\":\"event\",\"protocol_version\":1,\"device_id\":\""));
  Serial.print(DEVICE_ID);
  Serial.print(F("\",\"event\":\"watering_stopped\",\"reason\":\""));
  Serial.print(reason);
  Serial.print(F("\",\"runtime_ms\":"));
  Serial.print(millis() - pumpStartedAt);
  Serial.println(F("}"));
}

bool pumpStart(uint16_t requestedMs, const char *source, const char *commandId) {
  if (!settings.moduleVerified || pumpOn || requestedMs < 250 || requestedMs > settings.maxRuntimeMs) return false;
  pumpStartedAt = millis();
  pumpDeadline = pumpStartedAt + requestedMs;
  pumpOn = true;
  writePumpPin(true);
  Serial.print(F("{\"type\":\"event\",\"protocol_version\":1,\"device_id\":\""));
  Serial.print(DEVICE_ID);
  Serial.print(F("\",\"event\":\"watering_started\",\"source\":\""));
  Serial.print(source);
  Serial.print(F("\",\"duration_ms\":"));
  Serial.print(requestedMs);
  if (commandId && commandId[0]) {
    Serial.print(F(",\"command_id\":\""));
    Serial.print(commandId);
    Serial.print('"');
  }
  Serial.println(F("}"));
  return true;
}

void defaults() {
  settings.magic = CONFIG_MAGIC;
  settings.dryThreshold = 950;
  settings.wetThreshold = 750;
  settings.pulseMs = 2000;
  settings.soakMs = 300000UL;
  settings.maxRuntimeMs = 10000;
  settings.dryConfirmations = 5;
  settings.automationEnabled = false;
  settings.pumpActiveHigh = true;
  settings.moduleVerified = false;
}

bool settingsValid(const Settings &s) {
  return s.magic == CONFIG_MAGIC && s.wetThreshold >= 1 && s.dryThreshold <= 1023 &&
         s.wetThreshold + 20 < s.dryThreshold && s.pulseMs >= 250 &&
         s.pulseMs <= s.maxRuntimeMs && s.maxRuntimeMs <= 10000 &&
         s.soakMs >= 30000UL && s.soakMs <= 86400000UL &&
         s.dryConfirmations >= 2 && s.dryConfirmations <= 20;
}

void loadSettings() {
  EEPROM.get(0, settings);
  if (!settingsValid(settings)) {
    defaults();
    EEPROM.put(0, settings);
  }
}

uint16_t medianReading() {
  if (sampleCount == 0) return analogRead(SENSOR_PIN);
  uint16_t sorted[FILTER_SIZE];
  for (uint8_t i = 0; i < sampleCount; i++) sorted[i] = samples[i];
  for (uint8_t i = 1; i < sampleCount; i++) {
    uint16_t value = sorted[i];
    int8_t j = i - 1;
    while (j >= 0 && sorted[j] > value) { sorted[j + 1] = sorted[j]; j--; }
    sorted[j + 1] = value;
  }
  return sorted[sampleCount / 2];
}

const char *soilState() {
  if (moistureFiltered >= settings.dryThreshold) return "dry";
  if (moistureFiltered <= settings.wetThreshold) return "wet";
  return "normal";
}

void emitTelemetry() {
  Serial.print(F("{\"type\":\"telemetry\",\"protocol_version\":1,\"device_id\":\""));
  Serial.print(DEVICE_ID);
  Serial.print(F("\",\"firmware_version\":\""));
  Serial.print(FIRMWARE_VERSION);
  Serial.print(F("\",\"seq\":"));
  Serial.print(++sequenceNumber);
  Serial.print(F(",\"moisture_raw\":"));
  Serial.print(moistureRaw);
  Serial.print(F(",\"moisture_filtered\":"));
  Serial.print(moistureFiltered);
  Serial.print(F(",\"soil_state\":\""));
  Serial.print(soilState());
  Serial.print(F("\",\"pump_on\":"));
  Serial.print(pumpOn ? F("true") : F("false"));
  Serial.print(F(",\"automation_enabled\":"));
  Serial.print(settings.automationEnabled ? F("true") : F("false"));
  Serial.print(F(",\"module_verified\":"));
  Serial.print(settings.moduleVerified ? F("true") : F("false"));
  Serial.print(F(",\"uptime_ms\":"));
  Serial.print(millis());
  Serial.println(F("}"));
}

void emitAck(const char *id, const char *command, const char *status, const char *message) {
  Serial.print(F("{\"type\":\"ack\",\"protocol_version\":1,\"device_id\":\""));
  Serial.print(DEVICE_ID);
  Serial.print(F("\",\"command_id\":\""));
  Serial.print(id);
  Serial.print(F("\",\"command\":\""));
  Serial.print(command);
  Serial.print(F("\",\"status\":\""));
  Serial.print(status);
  Serial.print(F("\",\"message\":\""));
  Serial.print(message);
  Serial.println(F("\"}"));
}

bool jsonString(const char *line, const char *key, char *out, size_t outSize) {
  char needle[32];
  snprintf(needle, sizeof(needle), "\"%s\":\"", key);
  const char *start = strstr(line, needle);
  if (!start) return false;
  start += strlen(needle);
  const char *end = strchr(start, '"');
  if (!end || end == start || (size_t)(end - start) >= outSize) return false;
  memcpy(out, start, end - start);
  out[end - start] = '\0';
  return true;
}

bool jsonLong(const char *line, const char *key, long &value) {
  char needle[32];
  snprintf(needle, sizeof(needle), "\"%s\":", key);
  const char *start = strstr(line, needle);
  if (!start) return false;
  start += strlen(needle);
  char *end;
  value = strtol(start, &end, 10);
  return end != start;
}

bool jsonBool(const char *line, const char *key, bool &value) {
  char needle[32];
  snprintf(needle, sizeof(needle), "\"%s\":", key);
  const char *start = strstr(line, needle);
  if (!start) return false;
  start += strlen(needle);
  while (*start == ' ') start++;
  if (strncmp(start, "true", 4) == 0) { value = true; return true; }
  if (strncmp(start, "false", 5) == 0) { value = false; return true; }
  return false;
}

void processLine(const char *line) {
  char type[12], command[12], id[40];
  if (!jsonString(line, "type", type, sizeof(type)) || strcmp(type, "command") != 0 ||
      !jsonString(line, "command", command, sizeof(command)) ||
      !jsonString(line, "command_id", id, sizeof(id))) {
    Serial.println(F("{\"type\":\"error\",\"code\":\"invalid_command\",\"message\":\"Required command fields missing\"}"));
    return;
  }
  if (strcmp(id, lastCommandId) == 0) {
    emitAck(id, command, "rejected", "duplicate_command");
    return;
  }
  strncpy(lastCommandId, id, sizeof(lastCommandId) - 1);
  lastCommandId[sizeof(lastCommandId) - 1] = '\0';

  if (strcmp(command, "water") == 0) {
    long duration;
    if (!jsonLong(line, "duration_ms", duration) || duration < 250 || duration > settings.maxRuntimeMs) {
      emitAck(id, command, "rejected", "duration_out_of_range");
    } else if (pumpStart((uint16_t)duration, "manual", id)) {
      emitAck(id, command, "accepted", "pump_started");
    } else {
      emitAck(id, command, "rejected", settings.moduleVerified ? "pump_busy" : "module_not_verified");
    }
  } else if (strcmp(command, "stop") == 0) {
    pumpStop("remote_stop");
    emitAck(id, command, "accepted", "pump_off");
  } else if (strcmp(command, "configure") == 0) {
    long dry, wet, pulse, soak, maxRun, confirms;
    bool automatic, activeHigh, verified;
    if (!jsonLong(line, "dry_threshold", dry) || !jsonLong(line, "wet_threshold", wet) ||
        !jsonLong(line, "pulse_ms", pulse) || !jsonLong(line, "soak_ms", soak) ||
        !jsonLong(line, "max_runtime_ms", maxRun) || !jsonLong(line, "dry_confirmations", confirms) ||
        !jsonBool(line, "automation_enabled", automatic) || !jsonBool(line, "pump_active_high", activeHigh) ||
        !jsonBool(line, "module_verified", verified)) {
      emitAck(id, command, "rejected", "missing_configuration_field");
      return;
    }
    Settings candidate = settings;
    candidate.dryThreshold = dry; candidate.wetThreshold = wet; candidate.pulseMs = pulse;
    candidate.soakMs = soak; candidate.maxRuntimeMs = maxRun; candidate.dryConfirmations = confirms;
    candidate.automationEnabled = automatic; candidate.pumpActiveHigh = activeHigh; candidate.moduleVerified = verified;
    if (!settingsValid(candidate)) {
      emitAck(id, command, "rejected", "invalid_configuration");
      return;
    }
    pumpStop("configuration_change");
    settings = candidate;
    writePumpPin(false);
    EEPROM.put(0, settings);
    consecutiveDry = 0;
    emitAck(id, command, "accepted", "configuration_saved");
  } else if (strcmp(command, "status") == 0) {
    emitAck(id, command, "accepted", "status_follows");
    emitTelemetry();
  } else {
    emitAck(id, command, "rejected", "unknown_command");
  }
}

void readSerial() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n') {
      serialLine[serialLength] = '\0';
      if (serialLength) processLine(serialLine);
      serialLength = 0;
    } else if (c != '\r') {
      if (serialLength < MAX_SERIAL_LINE) serialLine[serialLength++] = c;
      else {
        serialLength = 0;
        Serial.println(F("{\"type\":\"error\",\"code\":\"line_too_long\",\"message\":\"Serial line discarded\"}"));
      }
    }
  }
}

void setup() {
  loadSettings();
  // Load the inactive latch before making the pin an output to minimize reset glitches,
  // including on verified active-low modules.
  digitalWrite(PUMP_PIN, settings.pumpActiveHigh ? LOW : HIGH);
  pinMode(PUMP_PIN, OUTPUT);
  writePumpPin(false); // Fail-safe: pump is OFF before serial/network activity.
  Serial.begin(115200);
  delay(300);
  // A restart begins with a full soak/cooldown interval; it cannot immediately
  // turn a dry reading into an unattended pump start.
  lastWateringEndedAt = millis();
  Serial.print(F("{\"type\":\"boot\",\"protocol_version\":1,\"device_id\":\""));
  Serial.print(DEVICE_ID);
  Serial.print(F("\",\"firmware_version\":\""));
  Serial.print(FIRMWARE_VERSION);
  Serial.println(F("\",\"pump_on\":false}"));
}

void loop() {
  unsigned long now = millis();
  readSerial();

  if (pumpOn && (elapsed(now, pumpDeadline) || now - pumpStartedAt >= settings.maxRuntimeMs)) {
    pumpStop(elapsed(now, pumpDeadline) ? "pulse_complete" : "safety_limit");
  }

  if (now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
    lastSampleAt = now;
    moistureRaw = analogRead(SENSOR_PIN);
    samples[sampleIndex] = moistureRaw;
    sampleIndex = (sampleIndex + 1) % FILTER_SIZE;
    if (sampleCount < FILTER_SIZE) sampleCount++;
    moistureFiltered = medianReading();

    if (moistureFiltered >= settings.dryThreshold) {
      if (consecutiveDry < 255) consecutiveDry++;
    } else if (moistureFiltered <= settings.wetThreshold) {
      consecutiveDry = 0; // Hysteresis: reset only at the wet threshold.
    }

    bool soakComplete = lastWateringEndedAt == 0 || now - lastWateringEndedAt >= settings.soakMs;
    if (settings.automationEnabled && settings.moduleVerified && !pumpOn && soakComplete &&
        consecutiveDry >= settings.dryConfirmations) {
      if (pumpStart(settings.pulseMs, "automatic", "")) consecutiveDry = 0;
    }
  }

  if (now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = now;
    emitTelemetry();
  }
}

