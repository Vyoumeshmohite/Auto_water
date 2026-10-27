import { describe, expect, it } from 'vitest';
import { requireBridge, requireDashboard } from './auth';

describe('authentication', () => {
  it('rejects missing and incorrect credentials', () => {
    process.env.BRIDGE_API_TOKEN = 'bridge-secret'; process.env.DASHBOARD_ADMIN_TOKEN = 'dashboard-secret';
    expect(() => requireBridge({ headers: {} } as never)).toThrow(/bridge credentials/);
    expect(() => requireDashboard({ headers: { 'x-dashboard-token': 'wrong' } } as never)).toThrow(/dashboard credentials/);
  });
  it('accepts exact credentials', () => {
    process.env.BRIDGE_API_TOKEN = 'bridge-secret'; process.env.DASHBOARD_ADMIN_TOKEN = 'dashboard-secret';
    expect(() => requireBridge({ headers: { authorization: 'Bearer bridge-secret' } } as never)).not.toThrow();
    expect(() => requireDashboard({ headers: { 'x-dashboard-token': 'dashboard-secret' } } as never)).not.toThrow();
  });
});

