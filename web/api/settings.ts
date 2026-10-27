import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireBridgeOrDashboard, requireDashboard } from './_lib/auth.js';
import { handleError, json, method, queryString } from './_lib/http.js';
import { parse, settingsSchema } from './_lib/schema.js';
import { findDevice } from './_lib/supabase.js';

const fields = 'dry_threshold,wet_threshold,watering_pulse_ms,soaking_interval_seconds,max_runtime_ms,dry_confirmations,automation_enabled,pump_active_high,module_verified,updated_at';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    method(req, ['GET', 'PUT']);
    if (req.method === 'PUT') requireDashboard(req); else requireBridgeOrDashboard(req);
    const deviceKey = req.method === 'GET' ? queryString(req, 'device_id') : String(req.body?.device_id ?? '');
    const { db, device } = await findDevice(deviceKey);
    if (req.method === 'PUT') {
      const body = parse(settingsSchema, req.body?.settings);
      const updatedAt = new Date().toISOString();
      const { data, error } = await db.from('automation_settings').update({ ...body, updated_at: updatedAt })
        .eq('device_id', device.id).select(fields).single();
      if (error) throw error;
      return json(res, 200, { settings: data });
    }
    const { data, error } = await db.from('automation_settings').select(fields).eq('device_id', device.id).single();
    if (error) throw error;
    return json(res, 200, { settings: data });
  } catch (error) { return handleError(res, error); }
}

