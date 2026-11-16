import { Layers, Pause, Play, Plus } from 'lucide-react'
import { getLang, t } from '../lib/i18n.js'
import { isNarrow } from '../lib/scene.js'
import { LEVELS, sev } from '../lib/severity.js'
import { Segmented, Switch } from './ui.jsx'

const RAIN_DOT = { Green: 'var(--ok)', Yellow: 'var(--sev-1)', Orange: 'var(--sev-2)', Red: 'var(--sev-3)' }
const waterStep = (w) => (w <= 0 ? 0 : w < 0.2 ? 1 : w < 0.4 ? 2 : w < 0.7 ? 3 : 4)

export default function MapPanel({
  rain, activeCount, hourCount, live, onReport, showZones, onZones, water, playing, ready, onWater, onPlay, sim, heat, onHeat, onExitSim, is3D, on3D, onLang,
}) {
  return (
    <>
      <header className="brand">
        <div>
          <span className="brand-name">Jaldrishti</span>
          <h1>{t('area')}</h1>
        </div>
        <Segmented
          label="Language"
          value={getLang()}
          onChange={onLang}
          options={[
            { value: 'en', label: 'EN' },
            { value: 'kn', label: 'ಕನ್ನಡ' },
          ]}
        />
      </header>

      {rain && (
        <div className="rain">
          <span className="sev-dot" style={{ background: RAIN_DOT[rain.level] }} />
          <div>
            <b>{t(`rain.${rain.level}`)}</b>
            <p>{t('rain.mm', rain.mm)}</p>
          </div>
        </div>
      )}

      <button type="button" className="btn btn-primary btn-block" onClick={onReport}>
        <Plus size={18} /> {t('report.cta')}
      </button>
      <p className="small muted">
        {t('counts', { active: activeCount, hour: hourCount })} · {live ? t('live') : t('demoMode')}
      </p>

      {ready && (
        <section className="sim">
          <div className="sim-head">
            <div>
              <b>{t('sim.title')}</b>
              <p>{t(`water.${waterStep(water)}`)}</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onPlay}>
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {playing ? t('sim.pause') : t('sim.play')}
            </button>
          </div>
          <input
            type="range"
            className="range"
            min="0"
            max="1"
            step="0.01"
            value={water}
            aria-label={t('sim.title')}
            onChange={(e) => onWater(Number(e.target.value))}
          />
          <div className="depth-key" aria-hidden="true">
            <span>{t('cm', 10)}</span>
            <i />
            <span>{t('cm', 150)}</span>
          </div>
          <Switch label={t('sim.heat')} checked={heat} onChange={onHeat} />
          <p className="hint-text">{t('sim.hint')}</p>
          {sim && (
            <button type="button" className="link" onClick={onExitSim}>
              {t('sim.exit')}
            </button>
          )}
        </section>
      )}

      <details className="layers" open={!isNarrow()}>
        <summary>
          <Layers size={16} /> {t('layers')}
        </summary>
        <Switch label={t('layers.zones')} checked={showZones} onChange={onZones} />
        {!sim && <Switch label={t('layers.3d')} checked={is3D} onChange={on3D} />}
        <ul className="legend">
          {LEVELS.map((n) => {
            const s = sev(n)
            return (
              <li key={n}>
                <span className="sev-dot" style={{ background: s.color }} />
                <span>{s.label}</span>
                <span className="muted">{s.short}</span>
              </li>
            )
          })}
        </ul>
      </details>
    </>
  )
}
