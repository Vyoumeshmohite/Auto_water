import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./api', async () => {
  class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
  return { ApiError, api: { status: vi.fn(), history: vi.fn(), events: vi.fn(), saveSettings: vi.fn(), command: vi.fn() } };
});

import { api } from './api';

describe('dashboard states', () => {
  beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks(); });
  it('shows the secure login when no token exists', () => {
    render(<App />); expect(screen.getByText(/Plant operations/i)).toBeInTheDocument();
  });
  it('shows an API failure without inventing readings', async () => {
    sessionStorage.setItem('plant-dashboard-token', 'token');
    vi.mocked(api.status).mockRejectedValue(new Error('Database unavailable'));
    vi.mocked(api.history).mockRejectedValue(new Error('Database unavailable'));
    vi.mocked(api.events).mockRejectedValue(new Error('Database unavailable'));
    render(<App />);
    await waitFor(() => expect(screen.getByText('Dashboard unavailable')).toBeInTheDocument());
    expect(screen.getByText('Database unavailable')).toBeInTheDocument();
  });
});
