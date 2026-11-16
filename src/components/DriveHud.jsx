import { Pause, Play, Square } from 'lucide-react'
import { t } from '../lib/i18n.js'
import { Segmented } from './ui.jsx'

// Slim panel shown on the map during a drive.
export default function DriveHud({ info, speed, paused, gps, onSpeed, onPause, onStop }) {
  const next = info.next
  const nextText = info.arrived
    ? t('hud.arrived')
    : !next
      ? t('hud.clear')
      : next.kind === 'wire'
        ? t('hud.wire', Math.round(next.m / 10) * 10)
        : t('hud.water', { cm: next.cm, m: Math.round(next.m / 10) * 10 })
  return (
    <div className="hud" role="status">
      <div className="hud-main">
        <b>{t('hud.left', { min: Math.max(0, Math.round(info.leftMin)), km: (info.leftM / 1000).toFixed(1) })}</b>
        <span className={next ? (next.kind === 'wire' ? 'hud-danger' : 'hud-water') : undefined}>{nextText}</span>
      </div>
      <div className="hud-actions">
        {!gps && (
          <>
            <Segmented
              label={t('hud.speed')}
              value={speed}
              onChange={onSpeed}
              options={[1, 5, 10].map((x) => ({ value: x, label: `${x}×` }))}
            />
            <button type="button" className="icon-btn" aria-label={paused ? t('hud.resume') : t('hud.pause')} onClick={onPause}>
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
          </>
        )}
        <button type="button" className="icon-btn" aria-label={t('hud.stop')} onClick={onStop}>
          <Square size={16} />
        </button>
      </div>
    </div>
  )
}
