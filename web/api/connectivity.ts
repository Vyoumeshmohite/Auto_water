import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireBridge, requireDashboard } from './_lib/auth.js';
import { handleError, json, method, queryString } from './_lib/http.js';
import { heartbeatSchema, parse } from './_lib/schema.js';
import { findDevice } from './_lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    method(req, ['GET', 'POST']);
    if (req.method === 'POST') {
      requireBridge(req);
      const body = parse(heartbeatSchema, req.body);
      const { db, device } = await findDevice(body.device_id);
      const { error } = await db.from('devices').update({
        bridge_last_seen_at: new Date().toISOString(), serial_connected: body.serial_connected,
        bridge_version: body.bridge_version, last_error: body.last_error ?? null, updated_at: new Date().toISOString(),
      }).eq('id', device.id);
      if (error) throw error;
      return json(res, 202, { ok: true });
    }
    requireDashboard(req);
    const { device } = await findDevice(queryString(req, 'device_id'));
    const age = device.bridge_last_seen_at ? Date.now() - new Date(device.bridge_last_seen_at).getTime() : Infinity;
    return json(res, 200, {
      connectivity: { bridge_online: age < 30000, serial_connected: age < 30000 && device.serial_connected,
        bridge_last_seen_at: device.bridge_last_seen_at, device_last_seen_at: device.last_seen_at,
        bridge_version: device.bridge_version, firmware_version: device.firmware_version, last_error: device.last_error },
    });
  } catch (error) { return handleError(res, error); }
}

