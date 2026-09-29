import { useEffect, useRef } from 'react';

// Web YouTube player, built directly on YouTube's IFrame Player API.
// react-native-youtube-iframe doesn't work properly on web: it loads a
// hosted page that sends player events through window.ReactNativeWebView,
// which only exists inside a native WebView. So in a browser the app never
// heard "ended" (no autoplay of the next song) and couldn't swap videos.
// Same props as the native YouTubeEmbed.js.

// Loads the IFrame API script once and shares the promise, so several
// players (or remounts) don't add the script more than once.
let apiPromise = null;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      // The API calls this global when it's ready; keep any existing
      // handler working in case something else on the page set one.
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve(window.YT);
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

// autoplay (default true) only affects the first video; a later videoId
// change is always a deliberate switch, so it starts playing.
export default function YouTubeEmbed({ videoId, width, height, onEnded, autoplay = true }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  // Held in a ref so the player's event handler always calls the latest
  // onEnded without the player being rebuilt when the callback changes.
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  // Creates the player once. The API replaces the element it's given with
  // its iframe, so it gets an inner div rather than the React-owned one.
  useEffect(() => {
    let cancelled = false;
    const mount = document.createElement('div');
    containerRef.current?.appendChild(mount);
    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      playerRef.current = new YT.Player(mount, {
        width,
        height,
        videoId,
        // rel: 0 keeps end-of-video suggestions to the same channel.
        playerVars: { autoplay: autoplay ? 1 : 0, playsinline: 1, rel: 0 },
        events: {
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.ENDED) onEndedRef.current?.();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
    // Only on mount — video and size changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch songs in the same player (loadVideoById also starts playback).
  // Once a user has interacted, the browser allows this to autoplay.
  useEffect(() => {
    const player = playerRef.current;
    if (player?.loadVideoById && player.getVideoData?.().video_id !== videoId) {
      player.loadVideoById(videoId);
    }
  }, [videoId]);

  useEffect(() => {
    playerRef.current?.setSize?.(width, height);
  }, [width, height]);

  return <div ref={containerRef} style={{ width, height }} />;
}
