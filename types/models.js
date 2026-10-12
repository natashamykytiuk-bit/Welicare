// @ts-check
// Shared JSDoc type definitions for Welicare's core data shapes. No runtime
// code — this file only exists so other files can write e.g.
//   /** @param {import('../types/models').Resident} resident */
// and have `npm run typecheck` (tsc over jsconfig.json) check them.
//
// These describe what's stored in Firestore. Fields marked optional (`?`)
// are missing on older docs or only set in some flows, so code reading
// them should handle `undefined`.

/**
 * One of the four roles picked at sign-up. firestore.rules only accept these
 * values and lock `role` after sign-up.
 * @typedef {'Family Caregiver' | 'Caregiver' | 'Volunteer' | 'Administrator'} Role
 */

/**
 * users/{uid} — one per account.
 * @typedef {object} User
 * @property {string} uid
 * @property {string} email
 * @property {string} fullName
 * @property {string} username
 * @property {string} [country]
 * @property {Role} role
 * @property {string} [orgId] The organization (facility) this user belongs
 *   to. Only settable to an org they created, or via the joinOrganization
 *   Cloud Function.
 * @property {string} [pinHash] Hashed 4-digit PIN; missing until PINSetup.
 * @property {boolean} [orgStepSkipped] Family Caregivers who skipped joining an org.
 * @property {string} [pendingOrgId] An organization this user asked to join
 *   with its invite code and is waiting for its administrator to approve.
 *   Set only by the joinOrganization Cloud Function; approval moves it to
 *   orgId. The app may only clear it (to cancel the request).
 * @property {import('firebase/firestore').Timestamp} [pendingSince] When
 *   that request was made.
 */

/**
 * One person in a life story's people lists (utils/lifeStoryPeople.js).
 * @typedef {object} LifeStoryPerson
 * @property {string} name
 * @property {string} notes Details about them; may be ''.
 * @property {boolean} okToTalkAbout False for someone who shouldn't be
 *   brought up with the resident — AI suggestions are told to leave them out.
 */

/**
 * The questionnaire answers collected by BuildProfileScreen. Every field is
 * optional in practice; empty answers are saved as null (or [] for lists).
 * @typedef {object} LifeStory
 * @property {string | null} [preferredName]
 * @property {string | null} [age] An age range such as '80-90'.
 * @property {string | null} [grewUpIn]
 * @property {string | null} [otherPlacesLived]
 * @property {string | null} [relationshipStatus]
 * @property {boolean | null} [hasChildren]
 * @property {LifeStoryPerson[]} [childrenList]
 * @property {string | null} [childrenDetails] Older free-text answer,
 *   replaced by childrenList (BuildProfileScreen converts it on next save).
 * @property {boolean | null} [hasGrandchildren]
 * @property {LifeStoryPerson[]} [grandchildrenList]
 * @property {string | null} [grandchildrenDetails] Older free-text answer,
 *   replaced by grandchildrenList.
 * @property {LifeStoryPerson[]} [importantPeopleList]
 * @property {string | null} [importantPeople] Older free-text answer,
 *   replaced by importantPeopleList.
 * @property {string | null} [career]
 * @property {string | null} [careerLove]
 * @property {string[]} [hobbies]
 * @property {string | null} [hobbiesOtherDetail]
 * @property {string[]} [creativeHobbies]
 * @property {string | null} [creativeHobbiesOtherDetail]
 * @property {string[]} [musicGenres]
 * @property {string | null} [musicGenresOtherDetail]
 * @property {string | null} [favouriteMusicians]
 * @property {string | null} [favouriteMovies]
 * @property {string | null} [favouriteFoods]
 * @property {string | null} [happiestMemory]
 * @property {string | null} [specialPlace]
 */

/**
 * residents/{residentId}.
 * @typedef {object} Resident
 * @property {string} name
 * @property {string} caregiverId Creator's uid (checked by rules on create).
 * @property {string} createdBy Same as caregiverId; kept for older docs.
 * @property {string | null} facilityId The organization this resident belongs
 *   to (an organizations/{orgId} id), or null if created outside one.
 * @property {string[]} assignedCaregivers uids who have this resident on
 *   their own list.
 * @property {string[]} [familyMembers] Family Caregivers linked by a family
 *   code (redeemFamilyCode) — view-only access plus photo uploads. Written
 *   only by Cloud Functions.
 * @property {string | null} [preferredName] Copied from the life story on
 *   save, so everyone who runs sessions (incl. volunteers) can use it.
 * @property {boolean} [hasLifeStory] Whether a life story has been filled
 *   in — the life story itself is in residents/{id}/private/lifeStory
 *   (see utils/residentLifeStory.js).
 * @property {LifeStory | null} [lifeStory] Old location, only on residents
 *   not yet migrated by scripts/migrateLifeStories.js.
 * @property {string[]} [selectedMusicVideoIds] Curated music, if any.
 * @property {string[]} [favouriteMusicVideoIds] Songs hearted in the player.
 * @property {'youtube'} [musicProvider]
 */

/**
 * organizations/{orgId}. Invite codes are deliberately NOT on this doc —
 * see organizations/{orgId}/private/invite and the inviteCodes collection.
 * @typedef {object} Organization
 * @property {string | null} name null for an un-upgraded personal org.
 * @property {string | null} [type]
 * @property {string | null} [province]
 * @property {string | null} [city]
 * @property {boolean} [isPersonal] true for a Family Caregiver's auto-created
 *   single-person org.
 * @property {string} createdBy Owner uid — the admin who can edit it.
 * @property {string} adminId Mirrors createdBy.
 * @property {{ canViewLifeStories?: boolean }} [volunteerPermissions]
 *   Organizational Settings → Manage Volunteer Permissions. Off by default.
 */

/**
 * Which brief the generateSuggestions Cloud Function writes for staff.
 * (The function also still accepts the pre-v2 kinds activityIdeas,
 * conversationStarters and musicMovieRecs from older app builds.)
 * @typedef {'conversation' | 'activities'} SuggestionKind
 */

/**
 * One idea in a suggestions brief (functions/suggestionPrompt.js parseBrief).
 * @typedef {object} BriefIdea
 * @property {string} title A few words naming the theme or activity.
 * @property {string} why Why it may suit this resident; may be ''.
 * @property {string[]} try Things staff could say, or simple steps — each
 *   rated (and later scored by the classifier) on its own.
 */

/**
 * A suggestions brief for staff.
 * @typedef {object} SuggestionBrief
 * @property {BriefIdea[]} ideas
 * @property {string[]} tips Short tips on approaching these with the resident.
 */

/**
 * Request body for the generateSuggestions Cloud Function.
 * @typedef {object} GenerateSuggestionsRequest
 * @property {SuggestionKind} kind
 * @property {LifeStory | null} lifeStory null → general, non-personal
 *   suggestions.
 * @property {string | null} [topicsToAvoid] Caregiver safety notes
 *   (residents/{id}/private/safety); never suggested.
 */

/**
 * Response from the generateSuggestions Cloud Function.
 * @typedef {object} GenerateSuggestionsResponse
 * @property {SuggestionBrief} brief The parsed brief.
 * @property {string} text The same brief as plain text (for pre-v2 builds).
 * @property {string} promptVersion Which prompt produced it; stored with
 *   good/bad ratings (utils/suggestionFeedback.js).
 * @property {SuggestionKind} kind The kind actually used.
 */

export {};
