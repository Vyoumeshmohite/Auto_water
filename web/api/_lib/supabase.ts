import { createClient } from '@supabase/supabase-js';
import { HttpError } from './http.js';

export function database() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(500, 'server_configuration', 'Database credentials are not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function findDevice(deviceKey: string) {
  const db = database();
  const { data, error } = await db.from('devices').select('*').eq('device_key', deviceKey).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'device_not_found', 'Device is not registered.');
  return { db, device: data };
}

