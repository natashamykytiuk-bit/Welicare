// Entry point. Copies the shared design tokens into CSS custom properties
// (--color-primary, --radius-sm, …) so styles.css never hardcodes a colour.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { colors, radii } from '@shared/theme';
import './styles.css';

const root = document.documentElement.style;
for (const [name, value] of Object.entries(colors)) {
  if (typeof value === 'string') root.setProperty(`--color-${name}`, value);
}
for (const [name, value] of Object.entries(radii)) root.setProperty(`--radius-${name}`, `${value}px`);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main id="main">Welicare portal</main>
  </StrictMode>
);
