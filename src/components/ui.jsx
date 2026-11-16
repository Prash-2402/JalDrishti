import { ArrowLeft, LocateFixed, MapPin } from 'lucide-react'
import { coords } from '../lib/format.js'
import { t } from '../lib/i18n.js'

export function PanelHeader({ title, subtitle, onBack }) {
  return (
    <header className="panel-header">
      {onBack && (
        <button type="button" className="icon-btn" aria-label={t('back')} onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
      )}
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </header>
  )
}

export function PointField({ label, value, onGps, onPick }) {
  return (
    <div className="point-field">
      <span className="pf-label">{label}</span>
      <span className={`pf-value${value ? '' : ' empty'}`}>{value ? value.name || coords(value) : t('pf.notSet')}</span>
      <span className="pf-actions">
        {onGps && (
          <button type="button" className="icon-btn" title={t('pf.gps')} aria-label={`${label}: ${t('pf.gps')}`} onClick={onGps}>
            <LocateFixed size={16} />
          </button>
        )}
        <button type="button" className="icon-btn" title={t('pf.pick')} aria-label={`${label}: ${t('pf.pick')}`} onClick={onPick}>
          <MapPin size={16} />
        </button>
      </span>
    </div>
  )
}

export function Segmented({ value, options, onChange, label }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({ label, checked, onChange }) {
  return (
    <label className="switch-row">
      <span>{label}</span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}
