# Fitness Tracker — Product Requirements Document (PRD)

## Context

Lifters who track their training seriously today mostly rely on unstructured tools — in this case, a Notes app, retyping the same tab of sets/reps/weight every session. That works, but it has no memory: no easy way to see what you lifted last time on a given exercise, no automatic detection of a new PR, no trend over weeks/months, and it gets more tedious as history accumulates.

This project is two things at once, and the design should serve both:
1. **A real product for other lifters** — general-public facing, not just a personal script. It needs real accounts, data ownership (editing, deletion), and onboarding that makes sense to a stranger, with privacy-aware social features planned for phase 2.
2. **A portfolio-quality technical build** — architecture, code quality, and polish matter as much as shipping features.

The immediate goal is a structured, low-friction workout logger that replaces the Notes-app workflow, gets the core data model and account lifecycle right (editable history, clean account deletion), and adds a social layer in phase 2 once that foundation is solid (positioned between Strong/Hevy's fast logging UX and Strava's more interactive, social feed experience).

## Goals & Success Metrics

- **Adoption**: people beyond the founder sign up and use it, and give feedback that shapes the roadmap.
- **Retention/habit**: users log workouts consistently (weekly logging frequency, week-4 return rate) — this is the core signal the app is actually better than the Notes-app workflow.
- **Progression value**: users can answer "am I getting stronger?" for any exercise without doing mental math — PRs and history should be visible with near-zero effort.
- **Technical quality**: clean, well-structured architecture suitable to showcase — sensible data model, sane auth/privacy boundaries, maintainable code.

Non-goal for success measurement: revenue. This is explicitly free with no monetization plan.

## Target Users

- **Primary**: everyday lifters (recreational to serious) who currently track workouts manually or with a generic notes tool and want structure without complexity.
- **Founder-as-user**: the app must genuinely replace the user's own current Notes-app habit — if it doesn't, it has failed regardless of external adoption.
- Not targeting (for now): professional coaches managing clients, endurance/cardio athletes (running/cycling), or nutrition-focused users.

## Positioning / Differentiators

- **Logging speed & simplicity** inspired by Strong/Hevy: minimal required fields (weight + reps), no forced structure.
- **Personal notes per exercise** (a Strong feature the user specifically likes): free-text comments attached to an exercise entry (e.g., "felt easy, bump next time" or cueing notes).
- **Strava-grade interactivity**: the UI should feel alive — not a plain CRUD form. Motion and feedback on PRs in v1; an engaging social feed once phase 2 adds followers.
- **Social layer that grows over time**: deliberately deferred to phase 2 (follow + feed + kudos) to keep v1 scope tight — but the data model shouldn't have to be reworked to add it later.

## Explicit Non-Goals (out of scope, for now)

- **Not a nutrition/calorie tracker.**
- **Not a wearable/heart-rate integration platform** (no Garmin/Whoop/Apple Watch sync).
- **Not an AI coaching or auto-program-generation tool.**
- **Not a paid coaching marketplace**, and **no monetization/billing** built into the architecture.

These are ruled out "for now" per the user — not permanently forbidden, but nothing in the v1 architecture should be built around enabling them.

## Feature Breakdown

### MVP (v1)

| Area | Feature |
|---|---|
| Accounts | Sign up / log in (email+password, Supabase Auth); basic profile (name, avatar, unit preference kg/lb) |
| Exercise library | Preloaded common exercises tagged by muscle group/category; users can add custom exercises |
| Workout logging | Start a session, add exercises, log sets with **weight + reps** (required); optional **set type tag** (warm-up / working, user-assigned, not forced); optional **RPE/RIR** field per set for users who want more detail; free-text **personal note per exercise** within a session |
| History | Chronological list of past workout sessions; detail view of any past session |
| Exercise progress | Per-exercise timeline showing every past performance (weight/reps over time) with a simple progress chart |
| PR tracking | Automatic detection of new personal records (max weight, max reps at a weight, best estimated 1RM, or session volume) per exercise; PR badge/celebration in the moment it's logged; PR history view |
| Routines/Programs | User-defined templates (e.g., "Push Day A") with a target exercise list; start a session from a routine and log against it; basic adherence view (did you do what the routine planned) |
| Bodyweight | Simple bodyweight log with timestamped entries and a trend chart |
| Data editing | Edit or delete any past set, exercise entry, or full session; edits/deletes recalculate PR status for the affected exercise so history stays accurate |
| Account management | Account deletion cascades to remove all owned data (sessions, sets, routines, bodyweight entries, custom exercises) — no orphaned records left behind |
| Platform | Mobile-responsive web app, installable as a PWA; works well as a phone-first experience for in-gym use |

### Phase 2 (near-term follow-up)

- **Social layer**: follow other users; activity feed of followed users' completed workouts (exercise summary, not full detail by default); kudos-style reaction on a feed post; basic privacy model (followers-only visibility by default, option to go public). Deferred from v1 specifically to reduce initial complexity — the data model below is designed so this can be added without reworking core tables.
- Comments on feed posts (beyond kudos-only reactions)
- Body measurements (waist, chest, arms, etc.) and progress photos
- Deeper analytics: volume trends, estimated 1RM curves over time, per-muscle-group breakdowns
- Data export (CSV)
- Friendly leaderboards among followed users (opt-in)
- Improved notifications (someone followed you, kudos received, etc.)

### Backlog / Later (not committed, explicitly deferred)

- Native mobile app (once the PWA validates the core product)
- Offline-first logging with background sync (not critical for v1 — "nice to have")
- Wearable integrations, AI coaching/program generation, paid coaching marketplace — explicitly ruled out for now; revisit only if there's clear demand

## User Stories

**Logging**
- As a lifter, I want to quickly log weight and reps for each set with minimal taps, so logging doesn't interrupt my workout.
- As a lifter, I want to optionally mark a set as a warm-up, so my working-set history/analytics aren't skewed.
- As a lifter, I want to leave a note on an exercise (e.g., "felt heavy today"), so I have context next time I do it.

**History & Progress**
- As a lifter, I want to see every past time I did "Bench Press," so I know what weight/reps to aim to beat.
- As a lifter, I want to be told when I just hit a new PR, so I feel motivated and can track my progress over time.

**Routines**
- As a lifter, I want to save a routine (e.g., "Push Day A"), so I don't have to remember or retype my plan every session.
- As a lifter, I want to start a session from a saved routine, so logging is faster and consistent week to week.

**Body tracking**
- As a lifter, I want to log my bodyweight over time, so I can see it alongside my strength progress.

**Data editing**
- As a lifter, I want to fix a typo in a logged set (wrong weight/reps), so my history stays accurate.
- As a lifter, I want to delete a set, exercise, or entire session I logged by mistake, so my history and PRs aren't corrupted by bad data.

**Account management**
- As a user, I want to permanently delete my account and all associated data, so I'm in full control of my data and can trust the app with it.

**Social (phase 2)**
- As a lifter, I want to follow training partners, so I can see their workouts in a feed.
- As a lifter, I want to give kudos on a friend's workout, so I can encourage them with minimal effort.
- As a lifter, I want control over who can see my workouts, so I'm not exposing my training data to strangers by default.

## Key User Workflows

1. **Onboarding**: Sign up → set unit preference (kg/lb) → optionally create first routine or skip → land on an empty history/dashboard with a clear "Start Workout" CTA.
2. **Logging a workout**: Start Workout → (optionally pick a routine to pre-fill exercises) → add exercise from library or custom → log sets (weight, reps, optional RPE/set-type) → optional note → finish session → see any PRs hit, session saved to history.
3. **Reviewing progress**: Open an exercise from history or library → see full timeline of past performances + chart → see PR markers.
4. **Building a routine**: Create Routine → name it → add exercises (and optionally target sets/reps) → save → available as a starting point for future sessions.
5. **Editing/correcting history**: Open a past session → edit or delete a set/exercise/whole session → affected PRs recalculate automatically → history stays trustworthy.
6. **Bodyweight check-in**: Log bodyweight → see trend chart alongside training history.
7. **Account deletion**: Account settings → request deletion → confirm (irreversible warning) → all owned records cascade-deleted → user logged out.
8. **Social loop (phase 2)**: Search/find a user → follow → see their completed workouts in feed → give kudos.

## Data Model (high-level)

- `User` (profile, unit preference, privacy setting; `deleted_at`/cascade handled via FK `ON DELETE CASCADE` from every owned table)
- `Exercise` (name, muscle group/category, `is_custom`, owner if custom)
- `Routine` → `RoutineExercise` (planned exercises per routine)
- `WorkoutSession` (user, date, optional routine reference)
- `WorkoutExercise` (session ↔ exercise join; holds the per-exercise note)
- `SetEntry` (belongs to WorkoutExercise; weight stored canonically in kg — see **Units & Data Integrity** below; reps, set_type, optional RPE, `is_pr` flag, `updated_at` for edit tracking)
- `PersonalRecord` (denormalized per user+exercise, for fast "is this a new PR" checks and PR history display; recomputed on any edit/delete that touches the exercise's set history)
- `BodyweightEntry` (user, date, weight — also stored canonically in kg)
- `Follow` (follower_id, followee_id, status if approval-based) — *phase 2*
- `KudosReaction` (workout_session_id, user_id) — *phase 2*

All tables owned by a user carry a foreign key to `User` with `ON DELETE CASCADE`, so account deletion is a single `DELETE FROM users WHERE id = ...` and the database guarantees no orphaned rows — no manual cleanup scripts needed.

## Units & Data Integrity

**Problem**: if a user logs in lb, then later switches their preference to kg, what happens to their existing history?

**Decision**: store every weight value **canonically in one unit (kg) in the database**, independent of the user's display preference. The unit preference (`kg`/`lb`) is purely a **display/input formatting setting** — it controls what unit the input field shows and how numbers are rendered, and converts on the way in and out.

This means:
- Changing your unit preference **never mutates historical data** and requires no migration or "convert my history?" prompt — every entry was always stored the same way internally.
- No ambiguity about "which unit was this originally logged in" — there's a single source of truth.
- Display conversion (kg↔lb) happens at render time using a standard, well-tested constant — trivial and lossless enough for display purposes (rounding only affects what's shown, not what's stored).
- The only edge case to handle deliberately: rounding on input (e.g., a user types "225 lb" — store the precise kg-converted value, not a rounded one, so repeated unit-switching doesn't drift).

## Technical Architecture (recommended)

- **Frontend**: Next.js (App Router) + React + TypeScript + Tailwind CSS
- **Backend**: Next.js server actions/API routes — no separate backend service needed at this scale
- **Database & Auth**: Supabase (Postgres + built-in Auth + Row Level Security) — RLS enforces own-data-only reads/writes in v1, and is the same mechanism that will enforce followers-only visibility once phase 2's social layer is added
- **ORM**: Prisma (typed schema/migrations; broadly recognizable for a portfolio)
- **Hosting**: Vercel (frontend/API) + Supabase (DB/Auth, and Storage later for photos)
- **Charts**: a lightweight React charting library (e.g., Recharts) for progress/bodyweight trend views
- **PWA**: manifest + service worker for installability; offline support deferred, not built into the initial architecture
- **Database seeding**: a seed script (run via Prisma's seed hook or a standalone Node script) to populate the curated exercise library (name + muscle group) on setup — required before the app is usable, not optional tooling. A second, separate seed script for synthetic demo/sample workout data (fake sessions, sets, history) is worth building too, for local development and for demoing the app without manually logging weeks of fake workouts by hand.

## Phase 2: Privacy & Social Visibility Model (default, revisit when social is built)

- Default: a user's workouts are visible to their approved followers only.
- Users can opt into a public profile if they want wider visibility.
- Following either requires approval (private-by-default) or is open — this needs a final call before building the social schema, flagged below. Not needed for MVP since social is deferred.

## Risks & Open Questions

- **Follow model** (phase 2): should following require approval (like a private Instagram) or be open (like Strava)? Affects schema and UX — decide when social work actually starts, not now.
- **Exercise library seeding**: needs an initial curated list (name + muscle group) — a one-time content task, not a technical risk, but needs to happen before logging is usable. Addressed via the seed script above.
- **PR recalculation on edit/delete**: editing or deleting a set that was (or affects) a PR must correctly recompute the `PersonalRecord` for that user+exercise — this is a real edge case (e.g., deleting the all-time-best set should demote the record to the next-best historical set, not just clear it). Needs explicit handling in the implementation plan, not an afterthought.
- **Cascading delete verification**: account deletion must be tested to confirm every owned table actually cascades (sessions, sets, routines, bodyweight entries, custom exercises) — a missed FK constraint would leave orphaned data despite the intent.
- **Prisma vs Drizzle**: Prisma recommended for familiarity/portfolio recognizability; Drizzle is a lighter-weight alternative worth a second look if migration ergonomics with Supabase matter more.

## Next Steps

This PRD defines *what* to build and why. Proposed sequence from here:

1. **Sign off on this PRD** — confirm scope (MVP vs phase 2 vs backlog) is right before any technical design work is spent on it.
2. **Technical implementation plan** (separate follow-up plan, still no code): exact Postgres schema (tables/columns/types/indexes), Prisma schema file layout, RLS policies, Next.js route/folder structure, the PR-recalculation algorithm, and the exercise-library seed data source. This is where the "how" gets nailed down before build order starts.
3. **Project scaffolding**: git init, Next.js + TypeScript + Tailwind scaffold, Supabase project creation, Prisma wired to it, Vercel deployment connected early so every later increment is deployable/demoable immediately, not just at the end.
4. **Incremental build order** (each step should be usable/testable on its own):
   1. Auth + profile + unit preference
   2. Exercise library schema + seed script + custom exercise creation
   3. Core workout logging (sessions → exercises → sets) + history view
   4. PR detection + PR history view
   5. Data editing/deletion for sets, exercises, and sessions, with PR recalculation
   6. Routines/templates + adherence view
   7. Bodyweight tracking
   8. Account deletion (cascade) + explicit verification that no orphaned rows remain
   9. PWA polish (manifest, installability, mobile UX pass)
   10. *(phase 2, separate effort)* social layer — follow, feed, kudos, visibility rules
5. **Verification approach per step**: unit tests for the PR-detection and kg/lb conversion logic (these are the two places subtle bugs would silently corrupt data), an RLS policy test pass (confirm users truly can't read/write each other's data), and a manual QA pass on the actual deployed app after each build-order step rather than only at the end.

Per the user's instruction, no code gets written until this PRD (and then the technical implementation plan) is explicitly approved to proceed.
