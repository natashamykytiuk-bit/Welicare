// YouTube search for the staff library screens (Music Library, Movie
// Library), server-side so the API key never ships in the app.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { requireVerified } = require('./authChecks');

const youtubeApiKey = defineSecret('YOUTUBE_API_KEY');

// Server-side YouTube search so the API key never ships in the app — same
// reasoning as generateSuggestions and Anthropic. Shared by both Music and
// Movies & Videos; category picks the filtering behavior for each.
exports.searchYouTube = onCall({ secrets: [youtubeApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);

  const query = typeof request.data?.query === 'string' ? request.data.query.trim() : '';
  if (!query) {
    throw new HttpsError('invalid-argument', 'query must be a non-empty string.');
  }

  const category = request.data?.category === 'video' ? 'video' : 'music';

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: '10',
    q: query,
    key: youtubeApiKey.value(),
  });
  // videoCategoryId=10 scopes Music results so an artist's name doesn't
  // surface interviews, news clips, etc. There's no equivalently reliable
  // category for older films/TV clips — videoCategoryId=1 (Film &
  // Animation) is inconsistently tagged and would exclude a lot of
  // legitimate results — so 'video' search omits the category filter
  // entirely for better coverage.
  if (category === 'music') {
    params.set('videoCategoryId', '10');
  }

  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);

  // Same as generateSuggestions: details to the server log, a stable
  // reason code to the app.
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[searchYouTube] YouTube error', response.status, errorText.slice(0, 500));
    throw new HttpsError('unavailable', 'Search is unavailable right now. Please try again.', {
      reason: 'search-provider-error',
    });
  }

  const data = await response.json();
  const results = (data.items ?? [])
    .filter((item) => item.id?.videoId)
    .slice(0, 10)
    .map((item) => ({
      videoId: item.id.videoId,
      title: item.snippet?.title ?? '',
      channelTitle: item.snippet?.channelTitle ?? '',
      thumbnailUrl:
        item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? '',
    }));

  return { results };
});
