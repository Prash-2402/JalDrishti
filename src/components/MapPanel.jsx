import { Layers, Pause, Play, Plus } from 'lucide-react'
import { AREA, isNarrow } from '../lib/scene.js'
import { SEVERITY } from '../lib/severity.js'
import { Switch } from './ui.jsx'

const RAIN_DOT = { Green: 'var(--ok)', Yellow: 'var(--sev-1)', Orange: 'var(--sev-2)', Red: 'var(--sev-3)' }

// Plain-words name for a level on the simulation slider.
const waterLabel = (w) =>
  w <= 0 ? 'No water' : w < 0.2 ? 'Light rain' : w < 0.4 ? 'Heavy rain' : w < 0.7 ? 'Very heavy rain' : 'Extreme rain'

export default function MapPanel({
  rain, activeCount, live, onReport, showZones, onZones, water, playing, ready, onWater, onPlay, sim, heat, onHeat, onExitSim, is3D, on3D,
}) {
  return (
    <>
      <header className="brand">
        <span className="brand-name">Jaldrishti</span>
        <h1>{AREA.name}</h1>
      </header>

      {rain && (
        <div className="rain">
          <span className="sev-dot" style={{ background: RAIN_DOT[rain.level] }} />
          <div>
            <b>{rain.en}</b>
            <p>
              {rain.mm} mm of rain in the next 24 h · {rain.kn}
            </p>
          </div>
        </div>
      )}

      <button type="button" className="btn btn-primary btn-block" onClick={onReport}>
        <Plus size={18} /> Report waterlogging
      </button>
      <p className="small muted">
        {activeCount} active report{activeCount === 1 ? '' : 's'} · {live ? 'updates live' : 'demo mode, saved in this browser only'}
      </p>

      {ready && (
        <section className="sim">
          <div className="sim-head">
            <div>
              <b>Flood simulation</b>
              <p>{waterLabel(water)}</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onPlay}>
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {playing ? 'Pause' : 'Simulate'}
            </button>
          </div>
          <input
            type="range"
            className="range"
            min="0"
            max="1"
            step="0.01"
            value={water}
            aria-label="Simulated water level"
            onChange={(e) => onWater(Number(e.target.value))}
          />
          <div className="depth-key" aria-hidden="true">
            <span>~10 cm</span>
            <i />
            <span>1 m+</span>
          </div>
          <Switch label="Heat map" checked={heat} onChange={onHeat} />
          <p className="hint-text">
            Shows which roads flood first as rain gets heavier, worked out from ground height. Hover a blue road to see how deep it is.
            An illustration, not a forecast.
          </p>
          {sim && (
            <button type="button" className="link" onClick={onExitSim}>
              Back to the normal map
            </button>
          )}
        </section>
      )}

      <details className="layers" open={!isNarrow()}>
        <summary>
          <Layers size={16} /> Map layers
        </summary>
        <Switch label="Flood-prone spots" checked={showZones} onChange={onZones} />
        {!sim && <Switch label="3D view" checked={is3D} onChange={on3D} />}
        <ul className="legend">
          {Object.entries(SEVERITY).map(([k, s]) => (
            <li key={k}>
              <span className="sev-dot" style={{ background: s.color }} />
              <span>{s.label}</span>
              <span className="muted">{s.short}</span>
            </li>
          ))}
        </ul>
      </details>
    </>
  )
}
