import YoutubePlayer from 'react-native-youtube-iframe';

// Native (iOS/Android) YouTube player: a thin wrapper around
// react-native-youtube-iframe that (optionally) autoplays and reports when
// the video finishes. rel: false keeps YouTube's end-of-video suggestions
// to the same channel, so a resident isn't led off to unvetted content.
// There's a separate YouTubeEmbed.web.js because on web that library can't report player events back (see the comment there), so
// screens import this component and Metro picks the right file per platform.
export default function YouTubeEmbed({ videoId, width, height, onEnded, autoplay = true }) {
  return (
    <YoutubePlayer
      width={width}
      height={height}
      videoId={videoId}
      play={autoplay}
      initialPlayerParams={{ rel: false }}
      onChangeState={(state) => {
        if (state === 'ended') onEnded?.();
      }}
    />
  );
}
