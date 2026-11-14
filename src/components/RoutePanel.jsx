import { Bike, Car } from 'lucide-react'
import { MODES } from '../lib/severity.js'
import { PanelHeader, PointField, Segmented } from './ui.jsx'

const ICONS = { bike: <Bike size={16} />, car: <Car size={16} /> }

export default function RoutePanel({ start, end, mode, onMode, route, busy, onPick, onGps, onClear }) {
  return (
    <div className="stack">
      <PanelHeader title="Safer route" subtitle="Steers around reported waterlogging" />

      <div className="point-group">
        <PointField label="From" value={start} onGps={() => onGps('start')} onPick={() => onPick('start')} />
        <PointField label="To" value={end} onPick={() => onPick('end')} />
      </div>

      <div className="field">
        <Segmented
          label="Vehicle"
          value={mode}
          onChange={onMode}
          options={Object.entries(MODES).map(([k, m]) => ({ value: k, label: m.label, icon: ICONS[k] }))}
        />
        <p className="hint-text">{MODES[mode].note}</p>
      </div>

      {busy && <p className="muted">Finding a route…</p>}
      {route && !busy && <RouteResult route={route} />}
      {!start && !end && <p className="muted small">Set where you are starting and where you are going.</p>}

      {(start || end) && (
        <button type="button" className="btn btn-secondary" onClick={onClear}>
          Clear route
        </button>
      )}
    </div>
  )
}

function RouteResult({ route }) {
  const { safe, fastest } = route
  let text
  if (safe.hits) text = `No clear way around: this route still passes ${safe.hits} reported spot${safe.hits === 1 ? '' : 's'}.`
  else if (fastest)
    text = `Avoids ${fastest.hits} reported spot${fastest.hits === 1 ? '' : 's'} on the fastest route (dashed), ${Math.max(0, Math.round(safe.min - fastest.min))} min longer.`
  else text = 'No reported waterlogging on this route.'
  return (
    <div className={`result${safe.hits ? ' warn' : ''}`}>
      <div className="result-main">
        <b>{Math.round(safe.min)} min</b>
        <span>{safe.km.toFixed(1)} km</span>
      </div>
      <p>{text}</p>
    </div>
  )
}
