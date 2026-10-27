import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireBridge, requireDashboard } from './_lib/auth.js';
import { handleError, json, method, queryString } from './_lib/http.js';
import { eventSchema, parse } from './_lib/schema.js';
import { findDevice } from './_lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    method(req, ['GET', 'POST']);
    if (req.method === 'POST') {
      requireBridge(req);
      const body = parse(eventSchema, req.body);
      const { db, device } = await findDevice(body.device_id);
      const { error } = await db.from('watering_events').insert({
        device_id: device.id, command_id: body.command_id ?? null, event: body.event,
        source: body.source ?? null, reason: body.reason ?? null,
        duration_ms: body.duration_ms ?? null, runtime_ms: body.runtime_ms ?? null,
      });
      if (error) throw error;
      return json(res, 202, { ok: true });
    }
    requireDashboard(req);
    const { db, device } = await findDevice(queryString(req, 'device_id'));
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
    const { data, error } = await db.from('watering_events').select('*').eq('device_id', device.id)
      .order('received_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return json(res, 200, { events: data });
  } catch (error) { return handleError(res, error); }
}

