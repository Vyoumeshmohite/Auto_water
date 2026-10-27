import { z } from 'zod';
import { HttpError } from './http.js';

const deviceId = z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/);
export const telemetrySchema = z.object({
  type: z.literal('telemetry'), protocol_version: z.literal(1), device_id: deviceId,
  firmware_version: z.string().max(32), seq: z.number().int().nonnegative(),
  moisture_raw: z.number().int().min(0).max(1023), moisture_filtered: z.number().int().min(0).max(1023),
  soil_state: z.enum(['dry', 'normal', 'wet']), pump_on: z.boolean(), automation_enabled: z.boolean(),
  module_verified: z.boolean(), uptime_ms: z.number().int().nonnegative(),
}).strict();

export const diagnosticSchema = z.object({
  type: z.enum(['boot', 'error']), device_id: deviceId.optional(), protocol_version: z.literal(1).optional(),
  firmware_version: z.string().max(32).optional(), pump_on: z.boolean().optional(),
  code: z.string().max(64).optional(), message: z.string().max(240).optional(),
}).strict();

export const eventSchema = z.object({
  type: z.literal('event'), protocol_version: z.literal(1), device_id: deviceId,
  event: z.enum(['watering_started', 'watering_stopped']), source: z.enum(['automatic', 'manual']).optional(),
  reason: z.string().max(80).optional(), duration_ms: z.number().int().min(0).max(10000).optional(),
  runtime_ms: z.number().int().min(0).max(11000).optional(), command_id: z.string().uuid().optional(),
}).strict();

export const settingsSchema = z.object({
  dry_threshold: z.number().int().min(21).max(1023), wet_threshold: z.number().int().min(1).max(1002),
  watering_pulse_ms: z.number().int().min(250).max(10000), soaking_interval_seconds: z.number().int().min(30).max(86400),
  max_runtime_ms: z.number().int().min(250).max(10000), dry_confirmations: z.number().int().min(2).max(20),
  automation_enabled: z.boolean(), pump_active_high: z.boolean(), module_verified: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.wet_threshold + 20 >= value.dry_threshold) ctx.addIssue({ code: 'custom', message: 'Dry threshold must be at least 21 above wet threshold.', path: ['dry_threshold'] });
  if (value.watering_pulse_ms > value.max_runtime_ms) ctx.addIssue({ code: 'custom', message: 'Pulse duration cannot exceed maximum runtime.', path: ['watering_pulse_ms'] });
});

export const commandSchema = z.object({
  device_id: deviceId, command: z.enum(['water', 'stop']), duration_ms: z.number().int().min(250).max(10000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.command === 'water' && value.duration_ms === undefined) ctx.addIssue({ code: 'custom', message: 'duration_ms is required for watering.', path: ['duration_ms'] });
  if (value.command === 'stop' && value.duration_ms !== undefined) ctx.addIssue({ code: 'custom', message: 'duration_ms is not allowed for stop.', path: ['duration_ms'] });
});

export const heartbeatSchema = z.object({
  device_id: deviceId, bridge_version: z.string().min(1).max(32), serial_connected: z.boolean(),
  last_error: z.string().max(500).nullable().optional(),
}).strict();

export const acknowledgementSchema = z.object({
  device_id: deviceId, command_id: z.string().uuid(), status: z.enum(['acknowledged', 'failed']),
  device_message: z.string().max(240),
}).strict();

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpError(400, 'validation_error', result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }
  return result.data;
}

