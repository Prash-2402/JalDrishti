import { Pause, Play, RotateCw, Square, Zap } from 'lucide-react'
import { t } from '../lib/i18n.js'
import { levelFor, sev } from '../lib/severity.js'
import { Segmented } from './ui.jsx'

// The panel at the bottom of the map during a drive. It turns into a choice
// before deep water, and into a red stop card when electricity blocks every route.
export default function DriveHud({ info, mode, speed, paused, gps, rerouting, onSpeed, onPause, onStop, onReroute, onWait, onGo }) {
  const vehicle = t(`mode.${mode}`)
  const reroute = (
    <button type="button" className={`icon-btn${rerouting ? ' spin' : ''}`} title={t('hud.reroute')} aria-label={t('hud.reroute')} onClick={onReroute} disabled={rerouting}>
      <RotateCw size={16} />
    </button>
  )
  const stop = (
    <button type="button" className="icon-btn" title={t('hud.stop')} aria-label={t('hud.stop')} onClick={onStop}>
      <Square size={16} />
    </button>
  )

  if (info.strict) {
    return (
      <div className="hud strict" role="alert">
        <Zap size={20} />
        <div className="hud-main">
          <b>{t('strict.title')}</b>
          <span>{t('strict.sub')}</span>
        </div>
        <div className="hud-actions">
          {reroute}
          {stop}
        </div>
      </div>
    )
  }

  const p = info.prompt
  if (p && !p.waiting) {
    return (
      <div className="hud prompt" role="alertdialog" aria-label={t('gate.title', p.cm)}>
        <div className="hud-main">
          <b>
            <span className="sev-dot" style={{ background: sev(Math.max(1, levelFor(p.cm))).color }} />
            {t('gate.title', p.cm)}
          </b>
          <span>{t('gate.sub', { vehicle, m: p.m })}</span>
        </div>
        <div className="hud-actions">
          {reroute}
          {stop}
        </div>
        <div className="hud-choice">
          <button type="button" className="btn btn-primary" onClick={onWait}>
            {t('gate.wait')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onGo}>
            {t('gate.go')}
          </button>
        </div>
      </div>
    )
  }

  const next = info.next
  let line
  let tone
  if (p?.waiting) line = t('gate.waiting', p.cm)
  else if (info.arrived) line = t('hud.arrived')
  else if (info.inWater) (line = t('hud.inWater', info.inWater)), (tone = 'hud-water')
  else if (!next) line = t('hud.clear')
  else if (next.kind === 'wire') (line = t('hud.wire', Math.round(next.m / 10) * 10)), (tone = 'hud-danger')
  else (line = t('hud.water', { cm: next.cm, m: Math.round(next.m / 10) * 10 })), (tone = 'hud-water')

  return (
    <div className="hud" role="status">
      <div className="hud-main">
        <b>{t('hud.left', { min: Math.max(0, Math.round(info.leftMin)), km: (info.leftM / 1000).toFixed(1) })}</b>
        <span className={tone}>
          {line}
          {p?.waiting && (
            <button type="button" className="link hud-link" onClick={onGo}>
              {t('gate.goNow')}
            </button>
          )}
        </span>
      </div>
      <div className="hud-actions">
        {!gps && (
          <>
            <Segmented label={t('hud.speed')} value={speed} onChange={onSpeed} options={[1, 5, 10].map((x) => ({ value: x, label: `${x}×` }))} />
            <button type="button" className="icon-btn" title={paused ? t('hud.resume') : t('hud.pause')} aria-label={paused ? t('hud.resume') : t('hud.pause')} onClick={onPause}>
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
          </>
        )}
        {reroute}
        {stop}
      </div>
    </div>
  )
}
