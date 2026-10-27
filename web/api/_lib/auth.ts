import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import { HttpError } from './http.js';

function equalSecret(received: string | undefined, expected: string | undefined) {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function requireBridge(req: VercelRequest) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!equalSecret(token, process.env.BRIDGE_API_TOKEN)) {
    throw new HttpError(401, 'unauthorized', 'Valid bridge credentials are required.');
  }
}

export function requireDashboard(req: VercelRequest) {
  const token = typeof req.headers['x-dashboard-token'] === 'string' ? req.headers['x-dashboard-token'] : undefined;
  if (!equalSecret(token, process.env.DASHBOARD_ADMIN_TOKEN)) {
    throw new HttpError(401, 'unauthorized', 'Valid dashboard credentials are required.');
  }
}

export function requireDemoToken(received: unknown) {
  const token = typeof received === 'string' ? received : undefined;
  if (!equalSecret(token, process.env.DEMO_MODE_TOKEN)) {
    throw new HttpError(401, 'unauthorized', 'The demo access token is not valid.');
  }
}

export function requireBridgeOrDashboard(req: VercelRequest) {
  try { requireBridge(req); } catch { requireDashboard(req); }
}

