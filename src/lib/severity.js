// What each report level means. Colours come from theme.css.
export const SEVERITY = {
  1: {
    label: 'Ankle-deep',
    depth: '~10 cm · 4 in',
    pass: 'Two-wheelers and cars can pass slowly.',
    short: 'Passable',
    color: 'var(--sev-1)',
  },
  2: {
    label: 'Knee-deep',
    depth: '~45 cm · 18 in',
    pass: 'Two-wheelers should avoid. Cars only with care.',
    short: 'Avoid on two-wheeler',
    color: 'var(--sev-2)',
  },
  3: {
    label: 'Waist-deep',
    depth: '~90 cm · 3 ft',
    pass: 'Not passable. Find another way.',
    short: 'Impassable',
    color: 'var(--sev-3)',
  },
}

// Which reports each vehicle's route steers around.
export const MODES = {
  bike: { label: 'Two-wheeler', minSeverity: 1, note: 'Avoids every reported spot.' },
  car: { label: 'Car', minSeverity: 2, note: 'Avoids knee-deep water and worse.' },
}
