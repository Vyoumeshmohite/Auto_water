import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, AlertTriangle, Check, ChevronRight, CloudOff, Droplets, Gauge, Leaf, LoaderCircle, LockKeyhole, Power, Radio, RefreshCw, Save, Settings2, ShieldCheck, ThermometerSun, Wifi, WifiOff, X } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, ApiError } from './api';
import type { Reading, Settings, Status, WateringEvent } from './types';

const time = (value?: string | null) => value ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)) : 'Never';
const ago = (value?: string | null) => {
  if (!value) return 'never'; const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 5) return 'just now'; if (seconds < 60) return `${seconds}s ago`; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; return `${Math.floor(seconds / 3600)}h ago`;
};

function Login({ onLogin, error }: { onLogin: (token: string) => void; error: string | null }) {
  const [token, setToken] = useState('');
  return <main className="login-shell">
    <section className="login-card">
      <div className="brand-mark"><Leaf size={26} /></div>
      <p className="eyebrow">VERDANT SYSTEMS</p><h1>Plant operations,<br />under control.</h1>
      <p className="muted">Enter the private dashboard token configured in Vercel. It stays in this browser session only.</p>
      <form onSubmit={(e) => { e.preventDefault(); onLogin(token); }}>
        <label htmlFor="token">Dashboard access token</label>
        <div className="token-field"><LockKeyhole size={18} /><input id="token" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoFocus required /></div>
        {error && <p className="form-error"><AlertTriangle size={15} />{error}</p>}
        <button className="primary full" type="submit">Open dashboard <ChevronRight size={17} /></button>
      </form>
      <p className="login-foot">Arduino Nano · Local safety control · Authenticated HTTPS</p>
    </section>
  </main>;
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) { return <span className={`status-pill ${ok ? 'ok' : 'bad'}`}><i />{label}</span>; }

function Metric({ icon, label, value, detail, tone = '' }: { icon: ReactNode; label: string; value: string; detail: string; tone?: string }) {
  return <article className={`metric ${tone}`}><div className="metric-head"><span className="metric-icon">{icon}</span><span>{label}</span></div><strong>{value}</strong><p>{detail}</p></article>;
}

function Chart({ readings, settings, range, setRange }: { readings: Reading[]; settings: Settings; range: '24h' | '7d'; setRange: (range: '24h' | '7d') => void }) {
  const data = useMemo(() => readings.map((r) => ({
    ...r,
    label: new Date(r.received_at).toLocaleString(
      undefined,
      range === '24h' ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short', hour: '2-digit' },
    ),
  })), [readings, range]);
  return <section className="panel chart-panel">
    <header className="panel-head"><div><p className="kicker">LIVE MONITORING</p><h2>Moisture history</h2></div><div className="segmented"><button className={range === '24h' ? 'active' : ''} onClick={() => setRange('24h')}>24 hours</button><button className={range === '7d' ? 'active' : ''} onClick={() => setRange('7d')}>7 days</button></div></header>
    {data.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 14, right: 16, left: -18, bottom: 0 }}>
      <defs><linearGradient id="moisture" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6ee7a5" stopOpacity={0.34}/><stop offset="95%" stopColor="#6ee7a5" stopOpacity={0}/></linearGradient></defs>
      <CartesianGrid stroke="#243129" vertical={false} /><XAxis dataKey="label" stroke="#748078" tickLine={false} axisLine={false} minTickGap={48} fontSize={11}/><YAxis domain={[0, 1023]} stroke="#748078" tickLine={false} axisLine={false} fontSize={11}/>
      <Tooltip contentStyle={{ background: '#121b15', border: '1px solid #2a3a30', borderRadius: 12 }} labelStyle={{ color: '#aab5ad' }} />
      <ReferenceLine y={settings.dry_threshold} stroke="#f1b861" strokeDasharray="4 5" label={{ value: 'Dry', fill: '#f1b861', fontSize: 11 }}/><ReferenceLine y={settings.wet_threshold} stroke="#60a5fa" strokeDasharray="4 5" label={{ value: 'Wet', fill: '#60a5fa', fontSize: 11 }}/>
      <Area type="monotone" dataKey="moisture_filtered" name="Filtered reading" stroke="#6ee7a5" strokeWidth={2.3} fill="url(#moisture)" isAnimationActive={false}/>
    </AreaChart></ResponsiveContainer></div> : <div className="empty"><Activity size={28}/><strong>No readings in this range</strong><span>Waiting for real telemetry from the bridge.</span></div>}
  </section>;
}

function SettingsPanel({ settings, onSave, saving }: { settings: Settings; onSave: (s: Settings) => Promise<void>; saving: boolean }) {
  const [draft, setDraft] = useState(settings); const [message, setMessage] = useState<string | null>(null);
  useEffect(() => setDraft(settings), [settings]);
  const number = (key: keyof Settings, value: string) => setDraft((d) => ({ ...d, [key]: Number(value) }));
  async function submit(e: FormEvent) { e.preventDefault(); setMessage(null); try { await onSave(draft); setMessage('Saved. The bridge will send this revision to the Nano.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save settings.'); } }
  return <section className="panel settings-panel"><header className="panel-head"><div><p className="kicker">AUTOMATION</p><h2>Safety & thresholds</h2></div><Settings2 size={20}/></header>
    <form onSubmit={submit}><div className="form-grid">
      <label>Dry threshold<input type="number" min="21" max="1023" value={draft.dry_threshold} onChange={(e) => number('dry_threshold', e.target.value)} /></label>
      <label>Wet threshold<input type="number" min="1" max="1002" value={draft.wet_threshold} onChange={(e) => number('wet_threshold', e.target.value)} /></label>
      <label>Watering pulse (ms)<input type="number" min="250" max="10000" step="250" value={draft.watering_pulse_ms} onChange={(e) => number('watering_pulse_ms', e.target.value)} /></label>
      <label>Soaking interval (sec)<input type="number" min="30" max="86400" value={draft.soaking_interval_seconds} onChange={(e) => number('soaking_interval_seconds', e.target.value)} /></label>
      <label>Maximum runtime (ms)<input type="number" min="250" max="10000" step="250" value={draft.max_runtime_ms} onChange={(e) => number('max_runtime_ms', e.target.value)} /></label>
      <label>Dry confirmations<input type="number" min="2" max="20" value={draft.dry_confirmations} onChange={(e) => number('dry_confirmations', e.target.value)} /></label>
    </div><div className="toggles">
      <label><span><strong>Automatic watering</strong><small>Runs locally without internet</small></span><input type="checkbox" checked={draft.automation_enabled} onChange={(e) => setDraft((d) => ({ ...d, automation_enabled: e.target.checked }))}/></label>
      <label><span><strong>MOSFET verified</strong><small>Enable only after the bench test</small></span><input type="checkbox" checked={draft.module_verified} onChange={(e) => setDraft((d) => ({ ...d, module_verified: e.target.checked }))}/></label>
      <label><span><strong>Active-high trigger</strong><small>Off means active-low</small></span><input type="checkbox" checked={draft.pump_active_high} onChange={(e) => setDraft((d) => ({ ...d, pump_active_high: e.target.checked }))}/></label>
    </div>{message && <p className="save-note">{message}</p>}<button className="secondary" disabled={saving}><Save size={16}/>{saving ? 'Saving…' : 'Save validated settings'}</button></form>
  </section>;
}

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('plant-dashboard-token') ?? '');
  const [status, setStatus] = useState<Status | null>(null); const [history, setHistory] = useState<Reading[]>([]); const [events, setEvents] = useState<WateringEvent[]>([]);
  const [range, setRange] = useState<'24h' | '7d'>('24h'); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  const [duration, setDuration] = useState(2000); const [confirm, setConfirm] = useState(false); const [commandNote, setCommandNote] = useState<string | null>(null); const [commandBusy, setCommandBusy] = useState(false);

  const load = useCallback(async (quiet = false) => { if (!token) return; if (!quiet) setLoading(true); try { const [s, h, e] = await Promise.all([api.status(token), api.history(token, range), api.events(token)]); setStatus(s); setHistory(h.readings); setEvents(e.events); setError(null); } catch (err) { const message = err instanceof Error ? err.message : 'Dashboard unavailable'; setError(message); if (err instanceof ApiError && err.status === 401) { sessionStorage.removeItem('plant-dashboard-token'); setToken(''); } } finally { setLoading(false); } }, [token, range]);
  useEffect(() => { void load(); const id = window.setInterval(() => void load(true), 5000); return () => window.clearInterval(id); }, [load]);
  function login(value: string) { sessionStorage.setItem('plant-dashboard-token', value); setToken(value); }
  async function saveSettings(next: Settings) { setSaving(true); try { const result = await api.saveSettings(token, next); setStatus((s) => s ? { ...s, settings: result.settings } : s); } finally { setSaving(false); } }
  async function send(command: 'water' | 'stop') { setCommandBusy(true); setCommandNote(null); try { const result = await api.command(token, command, command === 'water' ? duration : undefined); setConfirm(false); setCommandNote(`Command ${result.command.status}. Waiting for device acknowledgement…`); await load(true); } catch (err) { setCommandNote(err instanceof Error ? err.message : 'Command failed'); } finally { setCommandBusy(false); } }

  if (!token) return <Login onLogin={login} error={error} />;
  if (loading && !status) return <main className="center"><LoaderCircle className="spin"/><span>Contacting plant controller…</span></main>;
  if (!status) return <main className="center"><CloudOff/><strong>Dashboard unavailable</strong><span>{error}</span><button className="secondary" onClick={() => load()}>Try again</button></main>;

  const online = status.device.bridge_online && status.device.serial_connected; const latest = status.latest; const soil = latest?.soil_state ?? 'unknown';
  const command = status.latest_command; const confirmed = command?.status === 'acknowledged'; const commandFailed = command?.status === 'failed' || command?.status === 'expired';
  return <div className="app-shell"><header className="topbar"><div className="brand"><span className="brand-mark small"><Leaf size={19}/></span><div><strong>VERDANT</strong><small>PLANT OPERATIONS</small></div></div><div className="top-actions"><StatusDot ok={online} label={online ? 'DEVICE ONLINE' : 'DEVICE OFFLINE'}/><button className="icon-button" aria-label="Refresh" onClick={() => load()}><RefreshCw size={18}/></button></div></header>
    <main className="dashboard"><section className="hero"><div><p className="eyebrow">{status.device.display_name.toUpperCase()}</p><h1>Good soil. Good growth.</h1><p>Live supervision with safety enforced at the device.</p></div><div className={`soil-badge ${soil}`}><span>{latest ? latest.moisture_filtered : '—'}</span><small>{soil} · RAW ADC</small></div></section>
      {error && <div className="alert"><AlertTriangle size={18}/><span>{error}</span></div>}
      <section className="metrics">
        <Metric icon={<Gauge/>} label="SOIL CONDITION" value={soil.toUpperCase()} detail={latest ? `Raw ${latest.moisture_raw} · updated ${ago(latest.received_at)}` : 'No telemetry received'} tone={soil}/>
        <Metric icon={<Droplets/>} label="PUMP" value={latest?.pump_on ? 'RUNNING' : 'OFF'} detail={latest?.pump_on ? 'Firmware timer active' : 'Fail-safe state'} tone={latest?.pump_on ? 'wet' : ''}/>
        <Metric icon={online ? <Wifi/> : <WifiOff/>} label="CONNECTION" value={online ? 'ONLINE' : 'OFFLINE'} detail={`Bridge seen ${ago(status.device.bridge_last_seen_at)}`} tone={online ? 'normal' : 'dry'}/>
        <Metric icon={<ThermometerSun/>} label="TODAY" value={String(status.watering_events_today)} detail="Watering cycles started" />
      </section>
      <div className="content-grid"><Chart readings={history} settings={status.settings} range={range} setRange={setRange}/>
        <section className="panel control-panel"><header className="panel-head"><div><p className="kicker">PUMP CONTROL</p><h2>Manual watering</h2></div><ShieldCheck size={21}/></header>
          <div className={`connection-callout ${online ? 'online' : ''}`}>{online ? <Radio size={18}/> : <WifiOff size={18}/>}<div><strong>{online ? 'Bridge ready' : 'Commands unavailable'}</strong><span>{online ? 'A command can reach the Nano now.' : 'Reconnect the bridge and Arduino first.'}</span></div></div>
          <label className="duration">Pulse duration <strong>{(duration / 1000).toFixed(1)} seconds</strong><input type="range" min="500" max={Math.min(status.settings.max_runtime_ms, 10000)} step="500" value={duration} onChange={(e) => setDuration(Number(e.target.value))}/><span><small>0.5s</small><small>{status.settings.max_runtime_ms / 1000}s safety limit</small></span></label>
          <button className="primary full water-button" disabled={!online || !status.settings.module_verified || commandBusy || latest?.pump_on} onClick={() => setConfirm(true)}><Droplets size={18}/>Start watering pulse</button>
          <button className="ghost full" disabled={!online || commandBusy} onClick={() => send('stop')}><Power size={16}/>Emergency stop</button>
          {!status.settings.module_verified && <p className="form-error"><AlertTriangle size={15}/>MOSFET module verification is required.</p>}
          {commandNote && <p className="command-note">{confirmed ? <Check size={15}/> : commandFailed ? <AlertTriangle size={15}/> : <LoaderCircle size={15}/>} {confirmed ? `Device confirmed: ${command?.device_message ?? 'command completed'}` : commandFailed ? `Command ${command?.status}: ${command?.device_message ?? 'not executed'}` : commandNote}</p>}
          {command && <div className="command-state"><span>Latest command</span><strong className={command.status}>{command.kind} · {command.status}</strong><small>{command.device_message ?? 'No device acknowledgement yet'}</small></div>}
        </section>
      </div>
      <div className="lower-grid"><SettingsPanel settings={status.settings} onSave={saveSettings} saving={saving}/>
        <section className="panel"><header className="panel-head"><div><p className="kicker">DIAGNOSTICS</p><h2>System health</h2></div><Activity size={20}/></header><dl className="diagnostics">
          <div><dt>Serial connection</dt><dd><StatusDot ok={status.device.serial_connected} label={status.device.serial_connected ? 'CONNECTED' : 'DISCONNECTED'}/></dd></div>
          <div><dt>Telemetry</dt><dd>{status.device.telemetry_stale ? 'Stale' : 'Current'} · {ago(latest?.received_at)}</dd></div><div><dt>Firmware</dt><dd>{status.device.firmware_version ?? 'Unknown'}</dd></div><div><dt>Bridge</dt><dd>{status.device.bridge_version ?? 'Unknown'}</dd></div><div><dt>Last device uptime</dt><dd>{latest ? `${Math.floor(latest.device_uptime_ms / 60000)} min` : '—'}</dd></div><div><dt>Backend</dt><dd>Connected</dd></div>
        </dl>{status.device.last_error && <div className="error-box"><AlertTriangle size={17}/><div><strong>Recent error</strong><span>{status.device.last_error}</span></div></div>}
          <h3 className="events-title">Recent watering events</h3><div className="events">{events.length ? events.slice(0, 6).map((event) => <div key={event.id}><i className={event.event === 'watering_started' ? 'start' : ''}/><span><strong>{event.event.replace('_', ' ')}</strong><small>{event.source ?? event.reason ?? 'device'} · {time(event.received_at)}</small></span></div>) : <p className="muted">No confirmed events yet.</p>}</div>
        </section>
      </div><footer><span>Local firmware remains in control during internet loss.</span><button onClick={() => { sessionStorage.removeItem('plant-dashboard-token'); setToken(''); }}>Lock dashboard</button></footer>
    </main>
    {confirm && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal"><button className="modal-close" onClick={() => setConfirm(false)} aria-label="Close"><X/></button><span className="modal-icon"><Droplets/></span><p className="kicker">CONFIRM MANUAL ACTION</p><h2>Water for {(duration / 1000).toFixed(1)} seconds?</h2><p>The request expires in 20 seconds. The Nano will independently enforce its {status.settings.max_runtime_ms / 1000}-second maximum.</p><div><button className="ghost" onClick={() => setConfirm(false)}>Cancel</button><button className="primary" disabled={commandBusy} onClick={() => send('water')}>{commandBusy ? 'Sending…' : 'Confirm watering'}</button></div></div></div>}
  </div>;
}

export default App;
