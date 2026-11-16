import { t } from './i18n.js'

const span = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 1) return null
  if (m < 60) return t('u.min', m)
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 && h < 6 ? `${t('u.h', h)} ${t('u.min', m % 60)}` : t('u.h', h)
  return t('u.d', Math.floor(h / 24))
}

export const ago = (ts) => {
  const s = span(Date.now() - new Date(ts))
  return s ? t('u.ago', s) : t('u.now')
}

export const until = (ts) => span(new Date(ts) - Date.now()) || t('u.now')

export const coords = (p) => `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`
