import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// True while the device's Reduce Motion setting is on (iOS Settings >
// Accessibility > Motion; Android "Remove animations"). Games use it to skip
// scale/slide movement and jump straight to the end state, while keeping
// gentle opacity fades, which Apple's guidance treats as motion-safe.
// Starts false and updates once the async check resolves, so the first
// frame may animate; listening for changes covers the setting being
// toggled mid-game.
export default function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => mounted && setReduceMotion(on))
      // Unsupported platform (e.g. older web): just keep animations on.
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduceMotion;
}
