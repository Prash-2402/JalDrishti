import { useState } from 'react'
import { Camera, X } from 'lucide-react'
import { reverseGeocode } from '../lib/places.js'
import { t } from '../lib/i18n.js'
import { LEVELS, sev } from '../lib/severity.js'
import { addReport, shrinkPhoto } from '../lib/store.js'
import { PanelHeader, PointField } from './ui.jsx'

const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)

export default function ReportForm({ pin, onPick, onGps, onDone, onCancel, onError }) {
  const [severity, setSeverity] = useState(null)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState(null)
  const [time, setTime] = useState(null) // null means "now"
  const [busy, setBusy] = useState(false)

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setPhoto(await shrinkPhoto(file))
    } catch (err) {
      onError(err.message)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!pin) return onError(t('err.noPin'))
    if (!severity) return onError(t('err.noDepth'))
    const observedAt = time ? new Date(time) : new Date()
    const age = Date.now() - observedAt.getTime()
    if (Number.isNaN(age) || age < -5 * 60000 || age > 60 * 60000) {
      return onError(t('err.time'))
    }
    setBusy(true)
    try {
      const place = pin.name || (await reverseGeocode(pin))
      await addReport({ ...pin, severity, note: note.trim(), place, observedAt, photoDataUrl: photo })
      onError('')
      onDone()
    } catch (err) {
      onError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <PanelHeader title={t('report.cta')} subtitle={t('rf.sub')} onBack={onCancel} />

      <PointField label={t('rf.where')} value={pin} onGps={onGps} onPick={onPick} />

      <fieldset className="options">
        <legend className="field-label">{t('rf.depth')}</legend>
        {LEVELS.map((n) => {
          const s = sev(n)
          return (
            <label key={n} className={`option${severity === n ? ' on' : ''}`}>
              <input type="radio" name="severity" checked={severity === n} onChange={() => setSeverity(n)} />
              <span className="sev-dot" style={{ background: s.color }} />
              <span className="option-main">
                <b>{s.label}</b>
                <span>{s.depth}</span>
              </span>
              <span className="option-side">{s.short}</span>
            </label>
          )
        })}
      </fieldset>

      <div className="field">
        <span className="field-label">{t('rf.photo')}</span>
        {photo ? (
          <div className="thumb">
            <img src={photo} alt="Selected" />
            <button type="button" className="icon-btn thumb-remove" aria-label={t('rf.removePhoto')} onClick={() => setPhoto(null)}>
              <X size={16} />
            </button>
          </div>
        ) : (
          <label className="btn btn-secondary btn-block">
            <Camera size={16} /> {t('rf.addPhoto')}
            <input type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
          </label>
        )}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="note">
          {t('rf.note')}
        </label>
        <input id="note" className="input" maxLength={280} placeholder={t('rf.notePh')} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {time === null ? (
        <button type="button" className="link" onClick={() => setTime(localNow())}>
          {t('rf.earlier')}
        </button>
      ) : (
        <div className="field">
          <label className="field-label" htmlFor="time">
            {t('rf.time')}
          </label>
          <input id="time" className="input" type="datetime-local" value={time} max={localNow()} onChange={(e) => setTime(e.target.value)} />
        </div>
      )}

      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? t('rf.sending') : t('rf.send')}
      </button>
    </form>
  )
}
