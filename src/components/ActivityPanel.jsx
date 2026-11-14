import { SEVERITY } from '../lib/severity.js'
import { ago } from '../lib/format.js'
import { PanelHeader } from './ui.jsx'

const DAY = 24 * 3600 * 1000

export default function ActivityPanel({ history, activeIds, zones, onSelect, onSelectZone }) {
  const today = history.filter((h) => Date.now() - new Date(h.created_at) < DAY)
  const often = zones.filter((z) => z.count > 0).sort((a, b) => b.count - a.count).slice(0, 3)

  return (
    <div className="stack">
      <PanelHeader title="Activity" subtitle="Reports from the last 24 hours" />

      {today.length ? (
        <ul className="list">
          {today.map((h) => {
            const s = SEVERITY[h.severity]
            const isActive = activeIds.has(h.id)
            return (
              <li key={h.id}>
                <button type="button" className={`list-item${isActive ? '' : ' faded'}`} onClick={() => onSelect(h)}>
                  <span className="sev-dot" style={{ background: s.color }} />
                  <span className="li-main">
                    <span className="li-title">
                      {s.label}
                      {h.place ? ` · ${h.place}` : ''}
                    </span>
                    <span className="li-meta">
                      {ago(h.created_at)} ·{' '}
                      {isActive ? (h.confirmations ? `${h.confirmations} confirmed` : 'active') : 'no longer active'}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="empty">No reports in the last 24 hours.</p>
      )}

      <h3 className="section-title">Often flooded · last 30 days</h3>
      {often.length ? (
        <ul className="list">
          {often.map((z) => (
            <li key={z.name}>
              <button type="button" className="list-item" onClick={() => onSelectZone(z)}>
                <span className="li-main">
                  <span className="li-title">{z.name}</span>
                </span>
                <span className="li-count">
                  {z.count} report{z.count === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Not enough reports yet.</p>
      )}
    </div>
  )
}
