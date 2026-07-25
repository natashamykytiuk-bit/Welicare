// Placeholder song catalog for the Music Selection / Music Player screens.
// No real audio playback yet — this just powers the browsing + player UI.
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

export function getSongById(id) {
  return DEMO_SONGS.find((s) => s.id === id) ?? DEMO_SONGS[0];
}
