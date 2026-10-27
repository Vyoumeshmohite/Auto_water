import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireDashboard } from './_lib/auth.js';
import { handleError, HttpError, json, method, queryString } from './_lib/http.js';
import { findDevice } from './_lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    method(req, ['GET']); requireDashboard(req);
    const range = req.query.range === '7d' ? '7d' : req.query.range === '24h' ? '24h' : null;
    if (!range) throw new HttpError(400, 'invalid_range', 'range must be 24h or 7d.');
    const { db, device } = await findDevice(queryString(req, 'device_id'));
    const since = new Date(Date.now() - (range === '7d' ? 7 : 1) * 86400000).toISOString();
    const limit = range === '7d' ? 2016 : 1440;
    const { data, error } = await db.from('sensor_readings')
      .select('received_at,moisture_raw,moisture_filtered,soil_state,pump_on')
      .eq('device_id', device.id).gte('received_at', since).order('received_at').limit(limit);
    if (error) throw error;
    return json(res, 200, { readings: data, range });
  } catch (error) { return handleError(res, error); }
}

