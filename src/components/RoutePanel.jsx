import { useState } from 'react'
import { Bike, Bookmark, Car, Navigation, X } from 'lucide-react'
import { t } from '../lib/i18n.js'
import { PanelHeader, PointField, Segmented } from './ui.jsx'

const ICONS = { bike: <Bike size={16} />, car: <Car size={16} /> }
const TONE = { danger: 'var(--sev-3)', warn: 'var(--sev-2)', ok: 'var(--ok)' }

export default function RoutePanel({
  start, end, mode, onMode, route, busy, onPick, onGps, onClear, onDrive, driving, trips, tripStatus, onTrip, onRemoveTrip, onSave,
}) {
  const [naming, setNaming] = useState(null) // trip name being typed, or null
  const short = (p) => p?.name?.split(',')[0] || ''

  return (
    <div className="stack">
      <PanelHeader title={t('rt.title')} subtitle={t('rt.sub')} />

      {trips.length > 0 && (
        <div className="field">
          <span className="field-label">{t('rt.saved')}</span>
          <ul className="list trips">
            {trips.map((trip) => {
              const st = tripStatus(trip)
              return (
                <li key={trip.id}>
                  <button type="button" className="list-item" onClick={() => onTrip(trip)}>
                    <span className="sev-dot" style={{ background: TONE[st.tone] }} />
                    <span className="li-main">
                      <span className="li-title">{trip.name}</span>
                      <span className="li-meta">{st.text}</span>
                    </span>
                  </button>
                  <button type="button" className="icon-btn" aria-label={t('trip.remove')} onClick={() => onRemoveTrip(trip.id)}>
                    <X size={14} />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="point-group">
        <PointField label={t('from')} value={start} onGps={() => onGps('start')} onPick={() => onPick('start')} />
        <PointField label={t('to')} value={end} onPick={() => onPick('end')} />
      </div>

      <div className="field">
        <Segmented
          label={t('rt.vehicle')}
          value={mode}
          onChange={onMode}
          options={['bike', 'car'].map((k) => ({ value: k, label: t(`mode.${k}`), icon: ICONS[k] }))}
        />
        <p className="hint-text">{t(`mode.${mode}.note`)}</p>
      </div>

      {busy && <p className="muted">{t('rt.busy')}</p>}
      {route && !busy && (
        <>
          <RouteResult route={route} mode={mode} onSave={() => setNaming(`${short(start)} → ${short(end)}`)} />
          {naming !== null && (
            <form
              className="save-row"
              onSubmit={(e) => {
                e.preventDefault()
                onSave(naming.trim() || t('rt.save'))
                setNaming(null)
              }}
            >
              <input className="input" aria-label={t('rt.name')} value={naming} autoFocus maxLength={40} onChange={(e) => setNaming(e.target.value)} />
              <button className="btn btn-secondary">{t('rt.saveBtn')}</button>
            </form>
          )}
          {!driving && (
            <>
              <button type="button" className="btn btn-primary btn-block" onClick={() => onDrive(false)}>
                <Navigation size={16} /> {t('rt.drive')}
              </button>
              <button type="button" className="link" onClick={() => onDrive(true)}>
                {t('rt.gps')}
              </button>
            </>
          )}
          {!route.simulated && <p className="hint-text">{t('rt.tip')}</p>}
        </>
      )}
      {!start && !end && <p className="muted small">{t('rt.empty')}</p>}

      {(start || end) && (
        <button type="button" className="btn btn-secondary" onClick={onClear}>
          {t('rt.clear')}
        </button>
      )}
    </div>
  )
}

function RouteResult({ route, mode, onSave }) {
  const { safe, fastest, status } = route
  const { maxCm, spots } = safe.prof
  let text
  if (status === 'wire') text = t('res.wire')
  else if (status === 'blocked') text = t('res.blocked', { vehicle: t(`mode.${mode}`), cm: maxCm })
  else if (status === 'wet') text = t('res.least', { cm: maxCm, n: spots.length })
  else if (fastest) text = t('res.avoids', { n: fastest.prof.spots.length || 1, extra: Math.max(0, Math.round(safe.min - fastest.min)) })
  else text = t('res.clear')
  return (
    <div className={`result${status === 'dry' ? '' : status === 'wet' ? ' caution' : ' warn'}`}>
      <div className="result-main">
        <b>{t('min', Math.round(safe.min))}</b>
        <span>{t('km', safe.km.toFixed(1))}</span>
        <button type="button" className="icon-btn result-save" title={t('rt.save')} aria-label={t('rt.save')} onClick={onSave}>
          <Bookmark size={16} />
        </button>
      </div>
      <p>{text}</p>
    </div>
  )
}
