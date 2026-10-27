import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireBridge, requireDashboard } from './_lib/auth.js';
import { acknowledgementSchema, commandSchema, parse } from './_lib/schema.js';
import { handleError, HttpError, json, method, queryString } from './_lib/http.js';
import { findDevice } from './_lib/supabase.js';
import { bridgeIsOnline } from './_lib/policy.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    method(req, ['GET', 'POST', 'PATCH']);
    if (req.method === 'GET') {
      requireBridge(req);
      const { db, device } = await findDevice(queryString(req, 'device_id'));
      const { data, error } = await db.rpc('claim_next_command', { p_device_id: device.id });
      if (error) throw error;
      const row = data?.[0];
      const command = row ? { type: 'command', command: row.kind, command_id: row.id,
        ...(row.duration_ms ? { duration_ms: row.duration_ms } : {}) } : null;
      return json(res, 200, { command });
    }
    if (req.method === 'PATCH') {
      requireBridge(req);
      const body = parse(acknowledgementSchema, req.body);
      const { db, device } = await findDevice(body.device_id);
      const { data, error } = await db.from('commands').update({ status: body.status,
        acknowledged_at: new Date().toISOString(), device_message: body.device_message })
        .eq('id', body.command_id).eq('device_id', device.id).eq('status', 'delivered').select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(409, 'invalid_command_state', 'Command was not awaiting acknowledgement.');
      return json(res, 200, { ok: true });
    }

    requireDashboard(req);
    const body = parse(commandSchema, req.body);
    const key = req.headers['x-idempotency-key'];
    if (typeof key !== 'string' || !/^[0-9a-f-]{36}$/i.test(key)) throw new HttpError(400, 'idempotency_key_required', 'A UUID X-Idempotency-Key header is required.');
    const { db, device } = await findDevice(body.device_id);

    const { data: duplicate } = await db.from('commands').select('*').eq('device_id', device.id).eq('idempotency_key', key).maybeSingle();
    if (duplicate) return json(res, 200, { command: duplicate, duplicate: true });

    if (body.command === 'water' && !bridgeIsOnline(device)) {
      throw new HttpError(409, 'bridge_offline', 'The bridge or Arduino is offline; watering was not queued.');
    }
    const { data: settings, error: settingsError } = await db.from('automation_settings').select('max_runtime_ms,module_verified').eq('device_id', device.id).single();
    if (settingsError) throw settingsError;
    if (body.command === 'water' && !settings.module_verified) throw new HttpError(409, 'module_not_verified', 'Verify the MOSFET trigger polarity before remote watering.');
    if (body.command === 'water' && body.duration_ms! > settings.max_runtime_ms) throw new HttpError(400, 'duration_too_long', 'Duration exceeds the saved firmware safety limit.');

    const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
    const minuteAgo = new Date(Date.now() - 60000).toISOString();
    const { count, error: rateError } = await db.from('commands').select('*', { count: 'exact', head: true })
      .eq('device_id', device.id).eq('kind', 'water').gte('created_at', minuteAgo);
    if (rateError) throw rateError;
    const { data: recent } = await db.from('commands').select('created_at').eq('device_id', device.id)
      .eq('kind', 'water').gte('created_at', tenSecondsAgo).limit(1);
    if ((count ?? 0) >= 3 || (recent?.length ?? 0) > 0) throw new HttpError(429, 'rate_limited', 'Wait before requesting another watering pulse.');

    const now = Date.now();
    const { data, error } = await db.from('commands').insert({
      device_id: device.id, kind: body.command, duration_ms: body.duration_ms ?? null,
      idempotency_key: key, expires_at: new Date(now + 20000).toISOString(),
    }).select('*').single();
    if (error) throw error;
    return json(res, 202, { command: data, duplicate: false });
  } catch (error) { return handleError(res, error); }
}

