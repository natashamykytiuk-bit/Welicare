// Entry point. Copies the shared design tokens into CSS custom properties
// (--color-primary, --radius-sm, …) so styles.css never hardcodes a colour.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { colors, radii } from '@shared/theme';
import App from './App';
import './styles.css';

const root = document.documentElement.style;
for (const [name, value] of Object.entries(colors)) {
  if (typeof value === 'string') root.setProperty(`--color-${name}`, value);
}
// Activity accents (--act-music-bg, --act-music-icon, …) for the landing
// page's feature cards and drawn app screens.
for (const [name, pair] of Object.entries(colors.activities)) {
  root.setProperty(`--act-${name}-bg`, pair.bg);
  root.setProperty(`--act-${name}-icon`, pair.icon);
}
for (const [name, value] of Object.entries(radii)) root.setProperty(`--radius-${name}`, `${value}px`);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
