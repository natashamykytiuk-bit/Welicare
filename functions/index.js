const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const youtubeApiKey = defineSecret('YOUTUBE_API_KEY');

const KIND_PHRASES = {
  activityIdeas: 'activity ideas',
  conversationStarters: 'conversation starters',
  musicMovieRecs: 'music and movie recommendations',
};

// Readable label for each lifeStory field, in the order they should be
// presented to the model. Yes/No fields render their detail text (falling
// back to "Yes"/"No") since a bare boolean isn't useful to an LLM prompt.
const FIELD_LABELS = [
  ['preferredName', 'Preferred name'],
  ['age', 'Age'],
  ['grewUpIn', 'Grew up in'],
  ['otherPlacesLived', 'Other places lived'],
  ['relationshipStatus', 'Relationship status'],
  ['career', 'Career'],
  ['careerLove', 'Loved most about work'],
  ['importantPeople', 'Important people'],
  ['favouriteMusicians', 'Favourite musicians'],
  ['favouriteMovies', 'Favourite movies'],
  ['favouriteFoods', 'Favourite foods'],
  ['happiestMemory', 'Happiest memory'],
  ['specialPlace', 'Special place'],
];

function isEmpty(value) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function buildFactLines(lifeStory) {
  const lines = [];
  for (const [key, label] of FIELD_LABELS) {
    if (!isEmpty(lifeStory[key])) lines.push(`- ${label}: ${lifeStory[key]}`);
  }
  if (lifeStory.hasChildren) {
    lines.push(`- Children: ${lifeStory.childrenDetails || 'Yes'}`);
  }
  if (lifeStory.hasGrandchildren) {
    lines.push(`- Grandchildren: ${lifeStory.grandchildrenDetails || 'Yes'}`);
  }
  if (!isEmpty(lifeStory.hobbies)) {
    const detail = lifeStory.hobbies.includes('Other') && lifeStory.hobbiesOtherDetail
      ? [...lifeStory.hobbies.filter((h) => h !== 'Other'), lifeStory.hobbiesOtherDetail]
      : lifeStory.hobbies;
    lines.push(`- Hobbies: ${detail.join(', ')}`);
  }
  if (!isEmpty(lifeStory.creativeHobbies)) {
    const detail = lifeStory.creativeHobbies.includes('Other') && lifeStory.creativeHobbiesOtherDetail
      ? [...lifeStory.creativeHobbies.filter((h) => h !== 'Other'), lifeStory.creativeHobbiesOtherDetail]
      : lifeStory.creativeHobbies;
    lines.push(`- Creative hobbies: ${detail.join(', ')}`);
  }
  if (!isEmpty(lifeStory.musicGenres)) {
    const detail = lifeStory.musicGenres.includes('Other') && lifeStory.musicGenresOtherDetail
      ? [...lifeStory.musicGenres.filter((g) => g !== 'Other'), lifeStory.musicGenresOtherDetail]
      : lifeStory.musicGenres;
    lines.push(`- Favourite music: ${detail.join(', ')}`);
  }
  return lines;
}

function buildPrompt(kind, lifeStory) {
  const phrase = KIND_PHRASES[kind] ?? 'suggestions';
  const factLines = lifeStory ? buildFactLines(lifeStory) : [];

  if (factLines.length === 0) {
    return `Please generate warm, general ${phrase} suggestions appropriate for an elderly person in a care setting. No specific personal information is available for this person.`;
  }

  return [
    'Here is what we know about this person:',
    ...factLines,
    '',
    `Based on this, please generate ${phrase} that are specifically tailored to this person. If limited information is available, use what is provided and make warm, general suggestions appropriate for an elderly person in a care setting.`,
  ].join('\n');
}

// Redeployed to repair a missing public-invoker IAM binding on the
// underlying Cloud Run service, left over from a failed first deploy.
exports.generateSuggestions = onCall({ secrets: [anthropicApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const { kind, lifeStory } = request.data ?? {};
  if (!KIND_PHRASES[kind]) {
    throw new HttpsError('invalid-argument', 'kind must be one of activityIdeas, conversationStarters, musicMovieRecs.');
  }

  const prompt = buildPrompt(kind, lifeStory);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicApiKey.value(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new HttpsError('internal', `Anthropic API error: ${errorText}`);
  }

  const data = await response.json();
  const text = data.content?.map((block) => block.text).join('\n') ?? '';
  return { text };
});

// Server-side YouTube search so the API key never ships in the app — same
// reasoning as generateSuggestions and Anthropic. Shared by both Music and
// Movies & Videos; category picks the filtering behavior for each.
exports.searchYouTube = onCall({ secrets: [youtubeApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

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

  if (!response.ok) {
    const errorText = await response.text();
    throw new HttpsError('internal', `YouTube API error: ${errorText}`);
  }

  const data = await response.json();
  const results = (data.items ?? [])
    .filter((item) => item.id?.videoId)
    .slice(0, 10)
    .map((item) => ({
      videoId: item.id.videoId,
      title: item.snippet?.title ?? '',
      channelTitle: item.snippet?.channelTitle ?? '',
      thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? '',
    }));

  return { results };
});
