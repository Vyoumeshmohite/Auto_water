import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireDashboard } from './_lib/auth.js';
import { handleError, json, method, queryString } from './_lib/http.js';
import { findDevice } from './_lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    method(req, ['GET']); requireDashboard(req);
    const { db, device } = await findDevice(queryString(req, 'device_id'));
    const requestedOffset = Number(req.query.tz_offset_min ?? 0);
    const offsetMinutes = Number.isFinite(requestedOffset) && Math.abs(requestedOffset) <= 840 ? requestedOffset : 0;
    const localNow = new Date(Date.now() - offsetMinutes * 60000);
    localNow.setUTCHours(0, 0, 0, 0);
    const today = new Date(localNow.getTime() + offsetMinutes * 60000);
    const [readingResult, eventsResult, settingsResult, commandResult] = await Promise.all([
      db.from('sensor_readings').select('*').eq('device_id', device.id).order('received_at', { ascending: false }).limit(1).maybeSingle(),
      db.from('watering_events').select('*', { count: 'exact', head: true }).eq('device_id', device.id).eq('event', 'watering_started').gte('received_at', today.toISOString()),
      db.from('automation_settings').select('*').eq('device_id', device.id).single(),
      db.from('commands').select('id,kind,status,created_at,acknowledged_at,device_message').eq('device_id', device.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    for (const result of [readingResult, eventsResult, settingsResult, commandResult]) if (result.error) throw result.error;
    const bridgeAge = device.bridge_last_seen_at ? Date.now() - new Date(device.bridge_last_seen_at).getTime() : Infinity;
    const telemetryAge = readingResult.data ? Date.now() - new Date(readingResult.data.received_at).getTime() : Infinity;
    return json(res, 200, {
      device: { device_id: device.device_key, display_name: device.display_name,
        bridge_online: bridgeAge < 30000, serial_connected: bridgeAge < 30000 && device.serial_connected,
        telemetry_stale: telemetryAge > 20000, firmware_version: device.firmware_version,
        bridge_version: device.bridge_version, last_error: device.last_error,
        bridge_last_seen_at: device.bridge_last_seen_at, device_last_seen_at: device.last_seen_at },
      latest: readingResult.data, watering_events_today: eventsResult.count ?? 0,
      settings: settingsResult.data, latest_command: commandResult.data,
    });
  } catch (error) { return handleError(res, error); }
}

