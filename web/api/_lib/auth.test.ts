import { describe, expect, it } from 'vitest';
import { requireBridge, requireDashboard, requireDemoToken } from './auth';

describe('authentication', () => {
  it('rejects missing and incorrect credentials', () => {
    process.env.BRIDGE_API_TOKEN = 'bridge-secret'; process.env.DASHBOARD_ADMIN_TOKEN = 'dashboard-secret'; process.env.DEMO_MODE_TOKEN = 'demo-secret';
    expect(() => requireBridge({ headers: {} } as never)).toThrow(/bridge credentials/);
    expect(() => requireDashboard({ headers: { 'x-dashboard-token': 'wrong' } } as never)).toThrow(/dashboard credentials/);
    expect(() => requireDemoToken('wrong')).toThrow(/demo access token/);
  });
  it('accepts exact credentials', () => {
    process.env.BRIDGE_API_TOKEN = 'bridge-secret'; process.env.DASHBOARD_ADMIN_TOKEN = 'dashboard-secret'; process.env.DEMO_MODE_TOKEN = 'demo-secret';
    expect(() => requireBridge({ headers: { authorization: 'Bearer bridge-secret' } } as never)).not.toThrow();
    expect(() => requireDashboard({ headers: { 'x-dashboard-token': 'dashboard-secret' } } as never)).not.toThrow();
    expect(() => requireDemoToken('demo-secret')).not.toThrow();
  });
});

