// True if a resident's lifeStory object has at least one answered field.
// Used to decide whether to show the "personalize" banner / "Save Changes"
// vs "Save Profile" / whether to send a personalized vs generic AI prompt.
export function hasAnyLifeStoryData(lifeStory) {
  if (!lifeStory) return false;
  return Object.values(lifeStory).some((v) =>
    Array.isArray(v) ? v.length > 0 : v !== null && v !== ''
  );
}
