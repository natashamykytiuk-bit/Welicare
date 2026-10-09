// Good/bad ratings on AI suggestions: the document utils/suggestionFeedback.js
// builds, and that saving refuses anything the rules would refuse anyway.
// The suggestion text is fictional — never real resident data in tests.
import { buildFeedbackDoc, saveSuggestionFeedback } from '../utils/suggestionFeedback';
import { auth, firestore } from './mocks/firebase';

const PROFILE = { orgId: 'orgA', role: 'Caregiver' };
const base = {
  kind: 'conversation',
  promptVersion: 'v2',
  itemText: 'Big band music — try "That\'s a lovely tune, isn\'t it?"',
  rating: 'good',
  userId: 'u1',
  profile: PROFILE,
};

describe('buildFeedbackDoc', () => {
  it('builds exactly the fields firestore.rules allows', () => {
    const data = buildFeedbackDoc(base);
    expect(Object.keys(data).sort()).toEqual(
      [
        'createdAt',
        'facilityId',
        'itemText',
        'kind',
        'promptVersion',
        'rating',
        'userId',
        'userRole',
      ].sort()
    );
    expect(data.facilityId).toBe('orgA');
    expect(data.userRole).toBe('Caregiver');
    expect(data.createdAt).toEqual({ serverTimestamp: true });
  });

  it('trims and caps the suggestion text', () => {
    expect(buildFeedbackDoc({ ...base, itemText: '  hi  ' }).itemText).toBe('hi');
    expect(buildFeedbackDoc({ ...base, itemText: 'x'.repeat(900) }).itemText).toHaveLength(500);
  });

  it('returns null for an unknown rating, empty text, or no facility/role', () => {
    expect(buildFeedbackDoc({ ...base, rating: 'meh' })).toBeNull();
    expect(buildFeedbackDoc({ ...base, itemText: '   ' })).toBeNull();
    expect(buildFeedbackDoc({ ...base, profile: null })).toBeNull();
    expect(buildFeedbackDoc({ ...base, profile: { orgId: 'orgA' } })).toBeNull();
  });
});

describe('saveSuggestionFeedback', () => {
  const { userId: _userId, ...input } = base;

  it('writes the rating to suggestionFeedback as the signed-in user', async () => {
    await saveSuggestionFeedback(input);
    expect(firestore.addDoc).toHaveBeenCalledTimes(1);
    const [, data] = firestore.addDoc.mock.calls[0];
    expect(data.userId).toBe('test-uid');
    expect(data.rating).toBe('good');
  });

  it('throws without writing when signed out or the rating is invalid', async () => {
    await expect(saveSuggestionFeedback({ ...input, rating: 'meh' })).rejects.toThrow();
    auth.currentUser = null;
    await expect(saveSuggestionFeedback(input)).rejects.toThrow();
    expect(firestore.addDoc).not.toHaveBeenCalled();
  });
});
