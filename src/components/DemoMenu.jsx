import { useEffect, useRef, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { t } from '../lib/i18n.js'

// The one extra button on the map: demo triggers for judging and testing.
export default function DemoMenu({ driving, onReplay, onRaise, onWater, onPlace, onClear }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const item = (label, fn, disabled, hint) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={disabled ? hint : undefined}
      onClick={() => {
        setOpen(false)
        fn()
      }}
    >
      {label}
    </button>
  )
  return (
    <div className="demo" ref={ref}>
      <button type="button" className="demo-btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        <FlaskConical size={15} /> {t('demo')}
      </button>
      {open && (
        <div className="demo-menu" role="menu">
          {item(t('demo.replay'), onReplay)}
          {item(t('demo.raise'), onRaise, !driving, t('demo.needDrive'))}
          {item(t('demo.water'), onWater)}
          {item(t('demo.place'), onPlace)}
          {item(t('demo.clear'), onClear)}
        </div>
      )}
    </div>
  )
}
