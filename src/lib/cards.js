// Popup contents for the map. Built as plain DOM because map popups live
// outside React.
import { ago, until } from './format.js'
import { getLang, t } from './i18n.js'
import { levelFor, sev } from './severity.js'

const el = (tag, className, text) => {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text != null) e.textContent = text
  return e
}
const head = (color, ...parts) => {
  const h = el('div', 'pop-head')
  const dot = el('span', 'sev-dot')
  dot.style.background = color
  h.append(dot, ...parts)
  return h
}
const actions = (buttons) => {
  const row = el('div', 'pop-actions')
  for (const [label, fn] of buttons) {
    const b = el('button', 'btn btn-secondary btn-sm', label)
    b.addEventListener('click', fn)
    row.append(b)
  }
  return row
}

export function reportCard(r, { active, nearbyCount, onVote }) {
  const s = sev(r.severity)
  const box = el('div', 'pop')
  if (r.photo_url) {
    const img = el('img', 'pop-photo')
    img.src = r.photo_url
    img.alt = t('card.photoAlt')
    box.append(img)
  }
  box.append(head(s.color, el('b', null, s.label), el('span', 'pop-depth', s.depth)))
  if (r.place) box.append(el('p', 'pop-place', r.place))
  box.append(el('p', 'pop-text', s.pass))
  if (r.note) box.append(el('p', 'pop-note', `“${r.note}”`))
  const meta = active
    ? t('card.seen', { ago: ago(r.observed_at), until: until(r.expires_at) }) + (r.confirmations ? t('card.confirmed', r.confirmations) : '')
    : t('card.reported', ago(r.created_at))
  box.append(el('p', 'pop-meta', meta))
  if (nearbyCount > 1) box.append(el('p', 'pop-meta', t('card.nearby', nearbyCount)))
  if (active && onVote) {
    box.append(actions([[t('card.still'), () => onVote(r.id, 'still')], [t('card.cleared'), () => onVote(r.id, 'cleared')]]))
  }
  return box
}

// Hover card for a flooded road in the simulation.
export function roadCard(name, depth, cls) {
  const s = sev(Math.max(1, levelFor(depth)))
  const box = el('div', 'pop')
  box.append(el('b', 'pop-title', name || t(`road.${cls}`) || t('road.road')))
  box.append(head(s.color, el('span', null, `${t('road.depth', depth)} · ${s.label}`)))
  box.append(el('p', 'pop-meta', `${s.pass} ${t('road.sim')}`))
  return box
}

const floodDate = (d) =>
  new Date(d.length === 7 ? `${d}-01` : d).toLocaleDateString(getLang() === 'kn' ? 'kn-IN' : 'en-IN', {
    day: d.length === 7 ? undefined : 'numeric',
    month: 'short',
    year: 'numeric',
  })

export function zoneCard(zone, count) {
  const box = el('div', 'pop')
  box.append(el('b', 'pop-title', zone.name))
  box.append(el('p', 'pop-text', t('zone.known')))
  box.append(el('p', 'pop-meta', t('zone.count', count)))
  const list = el('ul', 'pop-floods')
  list.append(el('li', null, t('zone.past')))
  for (const f of zone.floods || []) {
    const row = el('li')
    row.append(el('b', null, floodDate(f.date)), el('span', null, `${f.what} · ${f.source}`))
    list.append(row)
  }
  if (!zone.floods?.length) list.append(el('li', null, t('zone.none')))
  box.append(list)
  return box
}

// Sensor popup. water: active water alert or null; wire: active wire alert or null.
export function sensorCard(sensor, { water, wire, cm, onWire, onSafe }) {
  const box = el('div', 'pop')
  box.append(el('b', 'pop-title', sensor.name))
  box.append(el('p', 'pop-text', t('sensor.title')))
  box.append(head(cm ? 'var(--flood-2)' : 'var(--ok)', el('span', null, cm ? t('sensor.water', cm) : t('sensor.dry'))))
  box.append(head(wire ? 'var(--sev-3)' : 'var(--ok)', el('span', null, wire ? t('sensor.live') : t('sensor.ok'))))
  const last = wire || water
  box.append(el('p', 'pop-meta', last ? `${t('sensor.sim')} · ${ago(last.created_at)}` : t('sensor.sim')))
  // Electricity is only a danger where there is floodwater.
  if (wire) box.append(actions([[t('sensor.safe'), onSafe]]))
  else if (cm >= 10 && onWire) box.append(actions([[t('sensor.wire'), onWire]]))
  else if (onWire) box.append(el('p', 'pop-meta', t('sensor.needWater')))
  return box
}
