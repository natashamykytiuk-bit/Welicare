import { useWindowDimensions } from 'react-native';

const TABLET_BREAKPOINT = 768;

// True on tablet-sized (or wider) viewports — used to switch a couple of
// screens between a single-column phone layout and a split tablet layout.
export function useIsTablet() {
  const { width } = useWindowDimensions();
  return width >= TABLET_BREAKPOINT;
}
