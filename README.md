# Welicare

**Personalized activity tools for dementia care teams and family caregivers, backed by AI**

Welicare is an iPad-first app for people who provide activities for individuals with dementia, from recreational therapists to volunteers to family caregivers. Every resident has a "life story" profile (where they grew up, what they did for work, their favourite artists), and the app uses it to generate trivia questions, conversation starters, and other personalized activities that are tailored to them, and to build a library of music and videos that they will recognize. 

I built Welicare solo, while studying Computer Engineering at UBC. This README covers the main app functions and what is still in progress.

**Status:** Welicare is actively being built and is not on the App Store yet. The core loop (accounts, organizations, resident profiles, music and video) works end-to-end against a live backend. The AI features and music suggestions work but still need refining, and a handful of secondary screens are still placeholders.

## Screenshots
**Mode Selection Screen**
<img width="766" height="468" alt="mode-selection-screen" src="https://github.com/user-attachments/assets/8f415d81-019e-43f5-9174-93be77341d96" />

**Resident View**
<img width="769" height="472" alt="resident-view-1" src="https://github.com/user-attachments/assets/8eca04e8-0abb-4cb0-95a6-7aa1dc3b850d" />

**Music Player**
<img width="767" height="471" alt="music-player-1" src="https://github.com/user-attachments/assets/f2c34445-434c-4d74-b8c0-ab737d6e9749" />

## Why I built this

The inspiration for Welicare came from my own personal experiences working with mid-to-late-stage dementia patients. I have worked with this population for over four years, and have seen firsthand how limited resources and staffing can make it difficult to provide meaningful, individualized care. Generic programming like bingo and word games doesn't do much for a resident who spent 40 years working on a farm or who lights up at Patsy Cline. Often, the most meaningful details that would make a one-on-one session land live in a family member's head or a binder in a filing cabinet. 

Welicare takes this information and puts it somewhere it can actually be useful in the moment: on a shared iPad with the resident sitting right there. Caregiving is unique. In a world increasingly reliant on AI and automation, this job can't be handed off. We cannot take the humanity out of caregiving, but we can use tools like AI to make caregiving easier.

## Main Features

**Role Selection:** Users sign up as either an Administrator, Caregiver (Family or Organizational), Family Member, or Volunteer. After logging in, they are directed to a Mode Selection screen where they have access to different features based on this role. Every user has access to Resident Mode.

**Resident Mode:** This contains all of the patient-facing screens and is designed to be handed over. A "lock" function allows caregivers to require PIN access to leave the mode, meaning that a resident using the iPad on their own or with limited supervision can freely explore the activities but can't wander back into the resident list or staff screens. A guest mode is available for group activities or situations where an account hasn't been created yet.

**Resident Profiles:** A guided, optional questionnaire collects information about a resident's preferred name, hometown, career, family, hobbies, favourite music, etc. This questionnaire is designed to be completed with assistance from family members or the residents themselves, and the information is then used for the app's AI suggestions.

**Curated music and video:** Welicare comes with a starter set of 80+ pre-selected music videos. Staff and family caregivers can build a shared media library by searching YouTube and pasting links, tagging each entry with artist, genre, and date information. These entries can be further customized by picking which media any given resident has access to see. This way, residents can browse a filtered, pre-vetted media library and favourite tracks, instead of raw YouTube.

**Organizations:** Care facilities are stored under organizations with a short invite code. Residents belong to a facility, so any caregiver under a facility can find and manage profiles, with music libraries being scoped to facilities too. Family caregivers using Welicare at home have their own personal organizations automatically, and can later upgrade into real facilities or join existing ones without losing their information.

**Accessible Design:** The app interface was designed with older adults in mind. Atkinson Hyperlegible, created specifically for low-vision users, is used for body text and the app colour palette is designed to be high-contrast. Accessibility labels are also included on UI elements for VoiceOver and TalkBack compatibility. 

## How it's built
```
┌──────────────────────────────┐        ┌──────────────────────────────────┐
│  Expo / React Native app     │        │  Firebase project "welicare"      │
│  (iOS, Android, web)         │        │                                  │
│                              │  Auth  │  Firebase Auth                   │
│  React Navigation stack      │◄──────►│   email + password, verified     │
│  Role-aware routing          │        │                                  │
│  ResidentLockContext         │ Rules  │  Cloud Firestore (Montreal)      │
│  theme.js design tokens      │◄──────►│   users · usernames · residents  │
│                              │        │   organizations · musicLibrary   │
│  utils/aiSuggestions.js      │ onCall │                                  │
│  utils/youtube.js            │──────► │  Cloud Functions (Node.js)        │
│                              │        │   generateSuggestions → Claude   │
└──────────────────────────────┘        │   searchYouTube → YouTube Data   │
                                        │   secrets via Secret Manager     │
                                        └──────────────────────────────────┘

```

### Stack
 
| Layer | Choice | Reasoning |
|---|---|---|
| Client | React Native 0.81 · Expo SDK 54 · React 19 | iPad, Android, and web preview are all under one codebase. |
| Auth | Firebase Auth | Sign-up with an email + password with mandatory email verification. Sign-in can be done with a username or email. |
| Data | Cloud Firestore, `northamerica-northeast1` | Resident data is stored on Canadian servers in compliance with the Alberta Health Information Act. |
| Backend | Firebase Cloud Functions v2 (`onCall`) | API keys are stored server-side & functions refuse calls from people who are not signed in. |
| AI | Claude (`claude-sonnet-5`) via the Anthropic Messages API | Resident profiles are turned into prompts in the Cloud Function. |
| Media | YouTube Data API + `react-native-youtube-iframe` | Staff search YouTube through a Cloud Function, and resident video playback is fully contained within the app. |
| Fonts | Lora + Atkinson Hyperlegible | Fonts chosen specifically for visual accessibility. |

## Development

### Prerequisites

- **Node.js 22** (the Cloud Functions runtime is Node 22; the app works with 22+)
- **Expo** — no global install needed, everything runs through `npx expo`
- **Firebase CLI** — `npm install -g firebase-tools`, then `firebase login`
- **Google Cloud CLI (`gcloud`)** — for Cloud Run permissions after deploying functions, and `gcloud auth application-default login` for the admin scripts in `scripts/`
- **Java (JDK 11 or newer)** — required by the Firestore emulator. On Windows, install e.g. [Eclipse Temurin](https://adoptium.net/) and check with `java -version`.

### Local setup (Windows)

```bash
git clone https://github.com/natashamykytiuk-bit/Welicare.git
cd Welicare
npm install
cd functions && npm install && cd ..
```

Git Bash or PowerShell both work for the commands below.

### Running the app

```bash
npx expo start
```

Then press `w` for web, or scan the QR code with Expo Go. The app talks to the live `welicare` Firebase project.

### Checks

| Command | What it does |
|---|---|
| `npm run lint` | ESLint (Expo's rules + React hooks rules) |
| `npm run lint:fix` | Auto-fix what ESLint safely can |
| `npm run format` | Format everything with Prettier |
| `npm run typecheck` | JSDoc type checking (`tsc --noEmit`) on files marked `// @ts-check`; shared types live in `types/models.js` |
| `npm test` | Jest tests for the app (Firebase is mocked — see `tests/mocks/firebase.js`) |
| `npm run test:watch` | Jest in watch mode |
| `npm run test:rules` | Firestore security-rules tests against the local emulator |
| `npm run emulators` | Starts the Auth, Firestore and Functions emulators |

The emulator scripts always use the project ID `demo-welicare`. Firebase treats `demo-` projects as local-only, so the emulators can never read or write production data.

### Deploying

```bash
firebase deploy --only firestore:rules
firebase deploy --only functions
```

After a functions deploy, `firebase.json`'s `postdeploy` step runs `gcloud run services add-iam-policy-binding … --member=allUsers --role=roles/run.invoker` for each callable function, so the app is allowed to call it (each function still rejects callers who aren't signed in). If app features that use Cloud Functions stop working after a deploy, check that step ran, and add any new function to that list.

### Secrets

API keys for Anthropic and YouTube are stored in **Google Cloud Secret Manager** and read by the Cloud Functions at runtime (`defineSecret` in `functions/index.js`). They are never committed to the repo or shipped in the app. The Firebase web config in `firebaseConfig.js` is not a secret — it identifies the project, and access is controlled by Firebase Auth and `firestore.rules`.

## License

Copyright © 2026 Natasha Mykytiuk. All rights reserved. The code is public to view for portfolio purposes, but is not licensed for use, copying, or distribution — see [LICENSE](LICENSE).
