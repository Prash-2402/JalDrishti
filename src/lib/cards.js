// Popup contents for the map. Built as plain DOM because map popups live
// outside React.
import { SEVERITY } from './severity.js'
import { ago, until } from './format.js'

const el = (tag, className, text) => {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text != null) e.textContent = text
  return e
}

export function reportCard(r, { active, nearbyCount, onVote }) {
  const s = SEVERITY[r.severity]
  const box = el('div', 'pop')
  if (r.photo_url) {
    const img = el('img', 'pop-photo')
    img.src = r.photo_url
    img.alt = 'Photo of the waterlogging'
    box.append(img)
  }
  const head = el('div', 'pop-head')
  const dot = el('span', 'sev-dot')
  dot.style.background = s.color
  head.append(dot, el('b', null, s.label), el('span', 'pop-depth', s.depth))
  box.append(head)
  if (r.place) box.append(el('p', 'pop-place', r.place))
  box.append(el('p', 'pop-text', s.pass))
  if (r.note) box.append(el('p', 'pop-note', `“${r.note}”`))

  const meta = active
    ? `Seen ${ago(r.observed_at)} · clears in ${until(r.expires_at)}` +
      (r.confirmations ? ` · confirmed ${r.confirmations}×` : '')
    : `Reported ${ago(r.created_at)} · no longer active`
  box.append(el('p', 'pop-meta', meta))
  if (nearbyCount > 1) box.append(el('p', 'pop-meta', `${nearbyCount} reports here in the last 30 days`))

  if (active && onVote) {
    const row = el('div', 'pop-actions')
    const still = el('button', 'btn btn-secondary btn-sm', 'Still flooded')
    const cleared = el('button', 'btn btn-secondary btn-sm', 'Cleared')
    still.addEventListener('click', () => onVote(r.id, 'still'))
    cleared.addEventListener('click', () => onVote(r.id, 'cleared'))
    row.append(still, cleared)
    box.append(row)
  }
  return box
}

export function zoneCard(zone, count) {
  const box = el('div', 'pop')
  box.append(el('b', 'pop-title', zone.name))
  box.append(el('p', 'pop-text', 'Known flood-prone spot'))
  box.append(
    el('p', 'pop-meta', count ? `${count} report${count === 1 ? '' : 's'} in the last 30 days` : 'No reports in the last 30 days'),
  )
  return box
}
