import { useState } from 'react'
import { ago } from '../lib/format.js'
import { isActiveAlert } from '../lib/hazards.js'
import { t } from '../lib/i18n.js'
import { sev } from '../lib/severity.js'
import { PanelHeader, Segmented } from './ui.jsx'

const WINDOW = { hour: 3600e3, today: 24 * 3600e3, week: 7 * 24 * 3600e3 }
const FRESH_MS = 15000 // items this new slide in with a "New" label
const DOT = { water: 'var(--flood-2)', wire: 'var(--sev-3)', rain: 'var(--text-3)' }

// One list from reports, alerts, votes and rain changes, newest first.
function feed(history, alerts, rainEvent, activeIds) {
  const items = history.map((h) => ({
    key: h.id,
    at: h.created_at,
    color: sev(h.severity).color,
    title: sev(h.severity).label,
    place: h.place,
    meta: activeIds.has(h.id) ? (h.confirmations ? t('st.confirmed', h.confirmations) : t('st.active')) : t('st.inactive'),
    faded: !activeIds.has(h.id),
    demo: h.is_demo,
    target: h,
  }))
  for (const a of alerts) {
    const vote = a.kind === 'still' || a.kind === 'cleared'
    const on = isActiveAlert(a)
    items.push({
      key: a.id,
      at: a.created_at,
      color: vote ? sev(a.severity || 1).color : DOT[a.kind],
      title: t(`ev.${a.kind}`) + (a.kind === 'water' && a.cm ? ` · ${t('cm', Math.round(a.cm))}` : ''),
      place: a.place,
      meta: [vote ? null : on ? t('st.active') : t('st.inactive'), a.is_simulated ? t('st.sim') : null].filter(Boolean).join(' · '),
      faded: !vote && !on,
      target: a,
    })
  }
  if (rainEvent) items.push({ key: 'rain', at: rainEvent.at, color: DOT.rain, title: t('ev.rain', rainEvent.level), meta: '' })
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

export default function ActivityPanel({ history, alerts, rainEvent, activeIds, zones, onSelect, onSelectZone }) {
  const [range, setRange] = useState('today')
  const now = Date.now()
  const items = feed(history, alerts, rainEvent, activeIds).filter((i) => now - Date.parse(i.at) < WINDOW[range])
  const often = zones.filter((z) => z.count > 0).sort((a, b) => b.count - a.count).slice(0, 3)

  return (
    <div className="stack">
      <PanelHeader title={t('act.title')} subtitle={t('act.sub')} />
      <Segmented
        label={t('act.title')}
        value={range}
        onChange={setRange}
        options={[
          { value: 'hour', label: t('f.hour') },
          { value: 'today', label: t('f.today') },
          { value: 'week', label: t('f.week') },
        ]}
      />
      {items.some((i) => i.demo) && <p className="badge">{t('act.demo')}</p>}

      {items.length ? (
        <ul className="list">
          {items.map((i) => {
            const fresh = now - Date.parse(i.at) < FRESH_MS
            return (
              <li key={i.key} className={fresh ? 'fresh' : undefined}>
                <button type="button" className={`list-item${i.faded ? ' faded' : ''}`} onClick={() => i.target && onSelect(i.target)}>
                  <span className="sev-dot" style={{ background: i.color }} />
                  <span className="li-main">
                    <span className="li-title">
                      {i.title}
                      {i.place ? ` · ${i.place}` : ''}
                    </span>
                    <span className="li-meta">{[ago(i.at), i.meta].filter(Boolean).join(' · ')}</span>
                  </span>
                  {fresh && <span className="new-tag">{t('st.new')}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="empty">{t('act.empty')}</p>
      )}

      <h3 className="section-title">{t('act.often')}</h3>
      {often.length ? (
        <ul className="list">
          {often.map((z) => (
            <li key={z.name}>
              <button type="button" className="list-item" onClick={() => onSelectZone(z)}>
                <span className="li-main">
                  <span className="li-title">{z.name}</span>
                </span>
                <span className="li-count">{t('act.reports', z.count)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">{t('act.notEnough')}</p>
      )}
    </div>
  )
}
