import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireDemoToken } from './_lib/auth.js';
import { handleError, json, method } from './_lib/http.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    method(req, ['POST']);
    requireDemoToken(req.body?.token);
    return json(res, 200, { ok: true, mode: 'demo' });
  } catch (error) {
    return handleError(res, error);
  }
}
