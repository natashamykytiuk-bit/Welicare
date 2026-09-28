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
 * @property {boolean} [orgStepSkipped] Non-admins who skipped joining an org.
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
 * @property {string | null} [childrenDetails]
 * @property {boolean | null} [hasGrandchildren]
 * @property {string | null} [grandchildrenDetails]
 * @property {string | null} [importantPeople]
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
 * @property {string | null} [email]
 * @property {boolean} [isPersonal] true for a Family Caregiver's auto-created
 *   single-person org.
 * @property {string} createdBy Owner uid — the admin who can edit it.
 * @property {string} adminId Mirrors createdBy.
 * @property {{ canViewLifeStories?: boolean }} [volunteerPermissions]
 *   Organizational Settings → Manage Volunteer Permissions. Off by default.
 */

/**
 * Which set of suggestions the generateSuggestions Cloud Function writes.
 * @typedef {'activityIdeas' | 'conversationStarters' | 'musicMovieRecs'} SuggestionKind
 */

/**
 * Request body for the generateSuggestions Cloud Function.
 * @typedef {object} GenerateSuggestionsRequest
 * @property {SuggestionKind} kind
 * @property {LifeStory | null} lifeStory null → general, non-personal
 *   suggestions.
 */

/**
 * Response from the generateSuggestions Cloud Function.
 * @typedef {object} GenerateSuggestionsResponse
 * @property {string} text The model's suggestions as plain text.
 */

export {};
