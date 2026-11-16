// Flood-prone spots, with past flood records where a dated news report exists.
// Coordinates are approximate (the area, not an exact street address).
// floods: { date (YYYY-MM-DD, or YYYY-MM when only the month is known), what }
// To replace with the digitised BBMP flood-vulnerable list, keep this shape.
const DH = 'Deccan Herald'

export const floodZones = [
  {
    name: 'Bellandur, Outer Ring Road (Ecospace)',
    lat: 12.9265,
    lng: 77.679,
    radius: 500,
    floods: [{ date: '2022-09-05', what: 'Bellandur lake overflowed; ORR near Ecospace under water, traffic advised to avoid', source: DH }],
  },
  {
    name: 'Rainbow Drive Layout, Sarjapur Road',
    lat: 12.908,
    lng: 77.687,
    radius: 400,
    floods: [{ date: '2022-09-05', what: 'Residents moved by tractors, boats and a coracle', source: 'Udayavani, Reuters' }],
  },
  {
    name: 'Sunny Brooks Layout, Sarjapur Road',
    lat: 12.9105,
    lng: 77.6935,
    radius: 300,
    floods: [{ date: '2022-09-05', what: 'Layout flooded; boats and tractors used', source: 'Udayavani' }],
  },
  {
    name: 'Yemalur',
    lat: 12.951,
    lng: 77.678,
    radius: 400,
    floods: [{ date: '2022-09-05', what: 'IT employees reached offices by tractor; water stayed for a week', source: 'Newslaundry' }],
  },
  {
    name: 'Silk Board Junction',
    lat: 12.9177,
    lng: 77.6233,
    radius: 350,
    floods: [
      { date: '2022-09-05', what: 'Traffic crippled by waterlogging', source: DH },
      { date: '2025-05-19', what: 'Junction flooded; water reached the metro station escalators', source: DH },
    ],
  },
  {
    name: 'Varthur',
    lat: 12.94,
    lng: 77.73,
    radius: 450,
    floods: [{ date: '2022-09-05', what: 'Roads waterlogged as lakes overflowed', source: DH }],
  },
  {
    name: 'Sai Layout, Horamavu',
    lat: 13.033,
    lng: 77.655,
    radius: 450,
    floods: [{ date: '2025-05-19', what: 'Streets under 4 to 5 ft of water; residents evacuated by boat', source: 'The News Minute, Business Standard' }],
  },
  {
    name: 'Manyata Tech Park',
    lat: 13.045,
    lng: 77.62,
    radius: 450,
    floods: [{ date: '2025-05-19', what: 'Tech park flooded after overnight rain', source: 'The News Minute' }],
  },
  {
    name: 'Kendriya Vihar, Yelahanka',
    lat: 13.099,
    lng: 77.59,
    radius: 350,
    floods: [{ date: '2024-10', what: 'Yelahanka lake water entered basements; residents ferried out by raft', source: 'News reports' }],
  },
  { name: 'Koramangala 4th Block', lat: 12.934, lng: 77.63, radius: 400, floods: [] },
  { name: 'Munnekolala, Marathahalli', lat: 12.955, lng: 77.701, radius: 400, floods: [] },
  { name: 'KR Puram underpass', lat: 13.0, lng: 77.675, radius: 300, floods: [] },
  { name: 'Hebbal flyover junction', lat: 13.0358, lng: 77.597, radius: 350, floods: [] },
  { name: 'Okalipuram underpass', lat: 12.983, lng: 77.57, radius: 250, floods: [] },
  { name: 'Shivananda Circle underpass', lat: 12.9905, lng: 77.579, radius: 250, floods: [] },
]
