import YoutubePlayer from 'react-native-youtube-iframe';

// Native (iOS/Android) YouTube player: a thin wrapper around
// react-native-youtube-iframe that (optionally) autoplays and reports when
// the video finishes. rel: false keeps YouTube's end-of-video suggestions
// to the same channel, so a resident isn't led off to unvetted content.
// There's a separate YouTubeEmbed.web.js because on web that library can't report player events back (see the comment there), so
// screens import this component and Metro picks the right file per platform.
//
// Optional `playing` makes play/pause controllable from the screen (an
// app-owned Play/Pause button is bigger and better labelled for VoiceOver
// than YouTube's own). `onPlayingChange` reports the real state back, so the
// button stays right when someone uses YouTube's controls instead.
export default function YouTubeEmbed({
  videoId,
  width,
  height,
  onEnded,
  autoplay = true,
  playing,
  onPlayingChange,
}) {
  return (
    <YoutubePlayer
      width={width}
      height={height}
      videoId={videoId}
      play={playing ?? autoplay}
      initialPlayerParams={{ rel: false }}
      onChangeState={(state) => {
        if (state === 'playing') onPlayingChange?.(true);
        if (state === 'paused' || state === 'ended') onPlayingChange?.(false);
        if (state === 'ended') onEnded?.();
      }}
    />
  );
}
