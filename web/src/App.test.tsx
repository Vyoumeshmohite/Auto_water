import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./api', async () => {
  class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
  return { ApiError, api: { demo: vi.fn(), status: vi.fn(), history: vi.fn(), events: vi.fn(), saveSettings: vi.fn(), command: vi.fn() } };
});

import { api } from './api';

describe('dashboard states', () => {
  beforeEach(() => { sessionStorage.clear(); window.history.replaceState({}, '', '/'); vi.clearAllMocks(); });
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
  it('unlocks an isolated and clearly labeled demo from the hidden URL', async () => {
    window.history.replaceState({}, '', '/?demo=1');
    vi.mocked(api.demo).mockResolvedValue({ ok: true, mode: 'demo' });
    render(<App />);
    fireEvent.change(screen.getByLabelText('Demo access token'), { target: { value: 'private-demo-token' } });
    fireEvent.click(screen.getByRole('button', { name: /Enter simulated demo/i }));
    await waitFor(() => expect(screen.getByText('Simulated demonstration')).toBeInTheDocument());
    expect(screen.getByText(/No Arduino, pump, database, or real API command/i)).toBeInTheDocument();
  });
});
