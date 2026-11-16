// What each report level means. Text lives in i18n.js, colours in theme.css.
import { t } from './i18n.js'

// cm: typical water depth for the level, used for routing and display.
export const SEVERITY = {
  1: { cm: 10, color: 'var(--sev-1)' },
  2: { cm: 45, color: 'var(--sev-2)' },
  3: { cm: 90, color: 'var(--sev-3)' },
}
export const LEVELS = [1, 2, 3]

export const sev = (n) => ({
  ...SEVERITY[n],
  label: t(`sev.${n}.label`),
  depth: `~${t('cm', SEVERITY[n].cm)}`,
  pass: t(`sev.${n}.pass`),
  short: t(`sev.${n}.short`),
})

// Report level for a depth in cm: 0 dry, 1 ankle, 2 knee, 3 waist.
export const levelFor = (cm) => (cm >= 60 ? 3 : cm >= 30 ? 2 : cm >= 10 ? 1 : 0)

// avoidCm: water this deep or deeper is steered around.
// maxCm: water this deep or deeper cannot be driven through.
export const MODES = {
  bike: { avoidCm: 10, maxCm: 30 },
  car: { avoidCm: 30, maxCm: 60 },
}
