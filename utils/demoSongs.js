// Music is now backed by real YouTube search (see utils/youtube.js) rather
// than this catalog. DEMO_SONGS survives only as a hardcoded fallback for
// MusicSelectionScreen's "no results" empty state — tapping one re-runs a
// YouTube search for that title/artist rather than "playing" it directly,
// since these entries have no real videoId behind them.
export const DEMO_SONGS = [
  { id: '1', title: 'Fly Me to the Moon', artist: 'Frank Sinatra', year: '1964' },
  { id: '2', title: 'What a Wonderful World', artist: 'Louis Armstrong', year: '1967' },
  { id: '3', title: 'Unchained Melody', artist: 'The Righteous Brothers', year: '1965' },
  { id: '4', title: 'Moon River', artist: 'Andy Williams', year: '1961' },
  { id: '5', title: 'Stand By Me', artist: 'Ben E. King', year: '1961' },
  { id: '6', title: "Can't Help Falling in Love", artist: 'Elvis Presley', year: '1961' },
  { id: '7', title: 'Somewhere Over the Rainbow', artist: 'Judy Garland', year: '1939' },
  { id: '8', title: 'La Vie en Rose', artist: 'Édith Piaf', year: '1947' },
];
