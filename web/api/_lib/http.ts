import type { VercelRequest, VercelResponse } from '@vercel/node';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

export function method(req: VercelRequest, allowed: string[]) {
  if (!req.method || !allowed.includes(req.method)) {
    throw new HttpError(405, 'method_not_allowed', `Allowed methods: ${allowed.join(', ')}`);
  }
}

export function queryString(req: VercelRequest, name: string): string {
  const value = req.query[name];
  if (typeof value !== 'string' || !value) throw new HttpError(400, 'invalid_query', `Missing ${name}`);
  return value;
}

export function handleError(res: VercelResponse, error: unknown) {
  if (error instanceof HttpError) return json(res, error.status, { error: { code: error.code, message: error.message } });
  const details = error instanceof Error ? error.message : 'Unknown error';
  console.error(details);
  return json(res, 500, { error: { code: 'internal_error', message: 'The request could not be completed.' } });
}

