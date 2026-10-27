import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireBridge } from './_lib/auth.js';
import { handleError, json, method } from './_lib/http.js';
import { diagnosticSchema, parse, telemetrySchema } from './_lib/schema.js';
import { findDevice } from './_lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    method(req, ['POST']); requireBridge(req);
    const body = req.body?.type === 'telemetry' ? parse(telemetrySchema, req.body) : parse(diagnosticSchema, req.body);
    const deviceKey = body.device_id ?? req.query.device_id;
    if (typeof deviceKey !== 'string') return json(res, 400, { error: { code: 'validation_error', message: 'device_id is required.' } });
    const { db, device } = await findDevice(deviceKey);
    if (body.type === 'telemetry') {
      const { error } = await db.from('sensor_readings').insert({
        device_id: device.id, sequence_number: body.seq, device_uptime_ms: body.uptime_ms,
        moisture_raw: body.moisture_raw, moisture_filtered: body.moisture_filtered,
        soil_state: body.soil_state, pump_on: body.pump_on,
        automation_enabled: body.automation_enabled, module_verified: body.module_verified,
      });
      if (error) throw error;
    }
    const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (body.firmware_version) patch.firmware_version = body.firmware_version;
    if (body.type === 'error') patch.last_error = `${body.code ?? 'device_error'}: ${body.message ?? ''}`.slice(0, 500);
    const { error: updateError } = await db.from('devices').update(patch).eq('id', device.id);
    if (updateError) throw updateError;
    return json(res, 202, { ok: true });
  } catch (error) { return handleError(res, error); }
}

