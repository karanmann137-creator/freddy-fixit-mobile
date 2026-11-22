# Freddy Fix It: mobile app plan

Status: **plan only, no app code yet.** Written 2026-11-22 against web repo
`karanmann137-creator/freddy-fixit` at `153edd3`.

**Scope.** One Expo app (Expo Router + TypeScript) for **clients and contractors**,
with tabs chosen by role. Admin, blog, SEO/marketing, area/service landing pages and
legal pages stay on the web. The app links out to legal pages and blocks the admin role
with a dead-end screen that opens the web dashboard.

**The one principle.** The web repo's CLAUDE.md already says *"Keep business logic in RPCs
and edge functions, never in a page component, so an app can call the same backend."* The
app is a **second client of the same Supabase backend**. It adds no business rules of its
own. Any new rule goes into an RPC or edge function first, and then both clients call it.

---

## 0. Web-repo rules that carry over unchanged

These are hard rules from the web `CLAUDE.md`. They hold in the app because the app calls
the same backend. The mobile `CLAUDE.md` (written in build step 1.1) repeats them in short
form and points to the web doc for the reasons.

- **`readAuthUser()` is the only test for "signed in?"** It has three outcomes (`user`, `signedOut`, `unknown`). Never branch on `if (error)` or `if (!user)`.
- **Never run a Supabase query inside `onAuthStateChange`.** It deadlocks the auth lock. React to route or state changes instead.
- **Use `.maybeSingle()`, never `.single()`.** A failed read is not an empty result: show "couldn't load" with Retry, never a confident zero.
- **`supabase.functions.invoke` drops the response body.** Read the reason off `error.context.json()`. Never branch on the wording of an error when the job's own state can answer.
- **`setMyRole()` is the only client-side write to `role`.** `getMyProfile()` caches the in-flight promise and never caches absence. Call `clearMyProfile()` after any role write and on sign-out.
- **A dead end is a screen, not `return null`.** The native `DeadEnd` has the same contract as the web one: a way out is required.
- **"If a refresh fixes it, say so."** On native, "refresh" means pull-to-refresh or a Retry button. For a stale app version it means the update gate (§6.6).
- **One predicate, shared by every reader.** `photosMissing`, `canWithdraw`, `jobFullyFunded`, `chatReadOnly` and the rest are **imported, never re-written** (§2).
- **Money:** the app never computes a charge, a fee or a payout. It shows what `get_job_fee` and `jobFunding.ts` return. The client-side gates (contract signed, price change pending, address confirmed) mirror the web and start closed (`contractBlocked = true` until a positive `contract_signed`).
- **Uploads are compressed first, and every failure path returns the original file.** HEIC files can arrive with an empty `type`, so fall back to the extension. A cancelled picker returns nothing: `if (!asset) return`.
- **Consumer wording:** say "held securely", never "escrow". No PII in commits (the repo may become public, just like the web repo).
- **Product direction:** simple beats complete. Phone-first is now literal. Every screen is checked against "does this serve customers or contractors?"

**A new rule that exists only because there is now an app.** Once a build is in the
stores, users run **old JavaScript against the live backend** for weeks. So from the first
store release:
- an RPC may **gain** a parameter only **with a DEFAULT**. The web rule "DROP the old signature first" still applies, and the new signature must accept the old call.
- never rename or remove a column, RPC, RPC argument, edge-function body field or response field that a shipped app reads until `min_app_version` (§6.6) is past every build that reads it.
- add this line to the web `CLAUDE.md` in the same ship as the first store release. It replaces nothing because it is a new class of rule.

---

## 1. Folder structure

```
freddy-fixit-mobile/
├─ app/                          Expo Router. Route files stay THIN: params → feature screen.
│  ├─ _layout.tsx                Providers: fonts, theme, QueryBoundary, auth gate, push, link handler
│  ├─ index.tsx                  Redirect by readAuthUser() + getMyProfile().role
│  ├─ (auth)/                    welcome, sign-in, verify-code, choose-role, forgot-password,
│  │                             update-password, confirm (email deep link target)
│  ├─ (client)/                  bottom tabs: requests, messages, pros, account
│  ├─ (contractor)/              bottom tabs: jobs, available, messages, earnings, account
│  ├─ job/[id].tsx               Job detail. One route, role decides the panels.
│  ├─ request/new.tsx            New request (signed in) / signup funnel (signed out)
│  ├─ request/[id].tsx           Estimates + pick
│  ├─ chat/[jobId].tsx           JobChat
│  ├─ bid-chat/[requestId].tsx   BidChat (pre-pick)
│  ├─ pick/[token].tsx           Universal link from the "pick your pro" email
│  ├─ pro/[id].tsx               Public contractor profile
│  ├─ notifications.tsx          The bell list
│  ├─ return/payment.tsx         Stripe Checkout return (universal link)
│  ├─ return/connect.tsx         Stripe Connect onboarding return (universal link)
│  └─ +not-found.tsx             DeadEnd
├─ src/
│  ├─ lib/                       SYNCED web modules + native overrides with the same API (§2)
│  ├─ kit/                       Native component kit (§3). No business logic, same rule as web ui/
│  │  ├─ tokens.generated.ts     Generated from web main.tsx (§3.1). Never hand-edited
│  │  ├─ theme.tsx               ThemeProvider, useTokens(), rgba(), text scale
│  │  ├─ glyphs.generated.ts     Lucide path data synced from web Ic.tsx
│  │  └─ Button.tsx, Row.tsx, Pass.tsx, ...
│  ├─ features/
│  │  ├─ auth/  client/  contractor/  job/  chat/  payments/  push/  profile/
│  │  └─ (one folder per area; a screen file per tab, same rule as web pages/client|contractor)
│  └─ platform/                  The native seams: storage.ts, bus.ts, links.ts, browser.ts, upload.ts
├─ assets/fonts/                 Archivo, Bebas Neue, DM Sans (OFL; via @expo-google-fonts)
├─ scripts/
│  ├─ sync-shared.mjs            Pull pinned web files into src/lib + glyphs + tokens
│  └─ check-shared.mjs           Verify synced files match shared.lock.json byte-for-byte
├─ shared.lock.json              { webSha, files: { path: sha256 } }
├─ app.config.ts  eas.json  tsconfig.json  CLAUDE.md  PLAN.md
└─ .github/workflows/ci.yml      typecheck + lint + check-shared on push, and nightly-sync job (§2.4)
```

Path alias `@/` → `src/`. This matches the web repo, so synced files import
`@/lib/supabase` unchanged. Expo's Metro resolves `tsconfig` `paths` natively, so no Babel
resolver is needed.

---

## 2. Sharing `src/lib` and `database.types.ts`

### 2.1 Mechanism: a pinned, vendored copy (not a submodule, not a package)

`npm run sync` (`scripts/sync-shared.mjs`) does three things:
1. Makes a sparse, shallow fetch of the web repo at a ref (default `main`), checking out only `src/lib/`, `src/components/Ic.tsx` and `src/main.tsx`.
2. Copies each file on the **SHARED list** into `src/lib/` and adds a first-line header: `// SYNCED from freddy-fixit@<sha>:src/lib/<file>. DO NOT EDIT HERE. Edit the web repo, then npm run sync.`
3. Writes `shared.lock.json` with the web SHA and a sha256 for each synced file. It also regenerates `kit/tokens.generated.ts` and `kit/glyphs.generated.ts` (§3.1).

`npm run check:shared` re-hashes the files and fails if any synced file was edited in this
repo. CI runs it, and so does `eas build` (via `prebuild` hook).

**Why this mechanism.** The owner is non-technical and works by pasting commands.
- A git submodule brings detached HEADs, a second `git pull`, and Metro trouble with paths outside the project root.
- A private npm package brings a publish step on every web change.
- A vendored copy is one command, and the lock file shows exactly which web commit the app was built against.

> **More efficient option to consider.** A monorepo, with the app in `apps/mobile` inside
> the web repo, makes sharing a plain import and removes the sync entirely. The costs: the
> web repo is **public** and its `ship.py`/`check_mounts.py`/`check_legal.py` gates and
> Vercel builds would need to learn to ignore `apps/mobile`. Start with the vendored copy,
> since it is reversible. Revisit once both codebases are stable.

### 2.2 What is shared, overridden or left out

Classified from a read of every file in web `src/lib/`. "Override" means a native file
with **the same exported names and types**, written in this repo and not on the SHARED
list.

| Class | Files | Notes |
|---|---|---|
| **Shared verbatim** | `database.types.ts`, `authRead`, `availability`, `calgaryAreas`, `chatParse`, `checklistTemplates`, `contractCopy`, `contractorGuide`, `dashSearch`, `dismissals`, `docPhotos`, `emailValidation`, `imageSafety`, `jobCode`, `jobFunding`, `jobQuestions`, `jobSplit`, `jobStage`, `jobText`, `mfa`, `myProfile`, `passwordStrength`, `platformRates`, `platformStatus`, `priceChange`, `recurrence`, `respTime`, `roleWrite`, `servicePricing`, `serviceTags`, `stripeRequirements`, `notificationRoutes` (only `noteTarget`/types are used, see below) | None of these touch `window`/`document`/storage at import time. `passwordStrength.checkPwned` already feature-tests `crypto.subtle`. Install `react-native-quick-crypto` or accept the documented skip. |
| **Shared after web prereq W2** | `chatUnread`, `bidThreads` | Today they call `window.addEventListener(CHAT_CHANGED_EVENT)`. React Native has no `window` events, so this would crash at runtime. W2 moves them onto `@/lib/bus`. |
| **Native override** | `supabase.ts` (§4.1), `bus.ts` (EventEmitter), `imageCompress.ts` (`expo-image-manipulator`, same `PROFILES` 1600/.82 · 640/.85 · 2400/.92, every failure returns the original), `theme.ts` (`Appearance` + AsyncStorage, same `TEXT_SCALES`/keys), `requestDraft.ts`, `referralCode.ts`, `terms.ts`, `reviewPrompt.ts`, `referralPrompt.ts`, `completionPrompt.ts` (AsyncStorage instead of localStorage, `bus` instead of `window` events), `analytics.ts` (no-op at first; `posthog-react-native` later if the owner asks) | Keep each override's exports identical so a synced file that imports it compiles. Typecheck proves it. |
| **Web only, not synced** | `seo.ts`, `printDoc.ts`, `blogDb.tsx` | No app surface. |

**Lint guard.** `no-restricted-imports` bans `readDashNavFromUrl` and
`clearDashNavFromUrl` from `@/lib/notificationRoutes`. They read `window.location`. The
app's equivalent is `platform/links.ts`.

### 2.3 Web-repo prerequisites (small, mechanical, one concern each)

These ship through the web repo's normal `ship.py` path **before** the app screens that
need them.

- **W1: extract the pure predicates into `src/lib/jobRules.ts`.** Six predicates the app needs live inside `.tsx` component and page files:
  - `photosMissing` (`components/JobPhotos.tsx`)
  - `addressMissing` (`components/ConfirmAddress.tsx`)
  - `canRemoveRequest` (`pages/client/shared.tsx`)
  - `canWithdraw` (`pages/ContractorDashboard.tsx:107`)
  - `autopayNote` (closure at `ClientDashboard.tsx:1644`)
  - the local `jobBalance` / `jobTotal` copy in `ClientDashboard.tsx:1500`, which shadows `lib/jobFunding`

  Move each body verbatim and re-export it from its old file, so every mount and `check_mounts.py` needle is unchanged. `autopayNote` returns JSX today: split it into a pure `autopayNoteText()` plus the existing JSX wrapper. **Moving code that reads money flags goes through `freddy-payment-change`: it touches no guard, and the predicates stay byte-identical.**
- **W2: `src/lib/bus.ts`.** `emit(name, detail)` / `on(name, fn) → off` over `window` CustomEvents. Re-point `chatUnread`, `bidThreads` and `completionPrompt` at it, keeping the event names. Web behaviour is identical, and the app overrides `bus.ts`.
- **W3: device-independent email links.** See §4.4. This is a new `/auth/confirm` route, plus `.well-known` files and Vercel headers.

### 2.4 Keeping `database.types.ts` honest

- **The web repo stays the only generator.** Its rule is "regenerate `database.types.ts` in the same ship as any DB change". The app **never** runs `generate_typescript_types` itself, because two generators would be two truths.
- After every web DB ship, run `npm run sync && npm run typecheck` here. A renamed column or RPC argument then fails **this** repo's typecheck before it reaches a phone.
- **Nightly CI job `nightly-sync`:** sync from web `main` into a scratch checkout and typecheck. It goes red when a web change has broken the app, even if nobody ran sync. Like the web checks, it is self-clearing, and it never commits.
- The Supabase client is typed (`createClient<Database>`). The web rule "no `as any` to get past it" applies here too.

---

## 3. Native component kit (port of `src/components/ui/`)

### 3.1 Tokens: generated, never copied by hand

`sync-shared.mjs` parses the `--ff-*` custom properties from web `src/main.tsx`: the dark
`:root` block, the light block (~line 298), and the `.ff-on-dark` block (~line 392). It
emits:

```ts
export const tokens = { dark: {...}, light: {...}, onDark: {...} } as const;
// e.g. s1..s8 = 4,8,12,16,20,24,32 · r1..r4 = 10,14,18,26 · hCtl = 44 · gut = 40
// accent500 '#ea6b14' (light '#d65f10') · surface2 '#111827' (light '#dbe2f2')
// "r,g,b" triplets (fg, muted, accent-rgb, bg-rgb, danger-rgb) kept as triplets
```

`kit/theme.tsx` provides:
- `useTokens()`, which follows `Appearance` unless the user picked a theme.
- `rgba(triplet, a)`, the native form of the web's `rgba(var(--ff-fg), .07)`.
- `ease.spring = [0.34, 1.56, 0.64, 1]` for Reanimated, plus the rest of the easing scale.
- `fontScale` from `theme.ts` (default 1.1, never lowered), multiplied by the OS Dynamic Type. Text keeps `allowFontScaling`.

Brand constants from `docs/brand-and-motion.md`:
- Colours: navy `#1a2236`, section navy `#151d2e`, footer `#111827`, orange `#ea6b14`, text `#f0f4ff`.
- Fonts: **Bebas Neue** for dashboard headings, labels, chips, numerals, buttons and the logo (the app is all "dashboard/onboarding/auth/forms"). **DM Sans** for body. **Archivo** only on read-style screens (pro profile, guide).

**Glyphs.** Web `Ic.tsx` holds hand-copied Lucide paths, by rule not the package. The sync
extracts the path table into `glyphs.generated.ts`, and `kit/Ic.tsx` renders it with
`react-native-svg`. The web gotcha carries over: a missing glyph renders blank, so `Ic`
logs in dev when a name is unknown.

### 3.2 Translation rules (CSS → React Native)

| Web | Native |
|---|---|
| `:hover` | Doesn't exist. Nothing may depend on it (already a web rule). |
| `:active` press + `--ff-ease-spring` | `Pressable` + Reanimated scale 0.97 with the spring curve, plus light haptics on primary buttons only |
| `::before` hairline separators | A real 1px `View`, inset by `s4 + gut` exactly as `.ffu-row::before` |
| `:focus-visible` ring (the "most load-bearing rule") | `accessibilityRole`/`accessibilityLabel` on every interactive element. External keyboards get the platform focus ring. |
| `@keyframes ffu-pls` (state-dot pulse) | Reanimated loop |
| global reduced-motion flatten | `AccessibilityInfo.isReduceMotionEnabled()` → durations 0, read once in `ThemeProvider` |
| `(pointer: coarse)` 44px floor + 16px font floor | **48dp min touch target** (meets Android's 48dp guideline, above iOS's 44pt), via `hitSlop` where the visual is smaller. iOS input zoom doesn't exist natively, but inputs keep ≥16pt for legibility. |
| `env(safe-area-inset-*)` | `react-native-safe-area-context` |
| `position: fixed` banner (`uiStyles` ~704) | Absolutely positioned in the root layout under the header, inside the safe area |
| `.ffu-modal` scrim + card | `kit/Sheet` bottom sheet (`@gorhom/bottom-sheet`). The centred dialog is kept only for `ConfirmDialog`. |
| `backdrop-filter` glass (`--ff-glass`) | `expo-blur` `BlurView` on iOS; solid `surface2` at 0.96 on Android |
| `minmax(0,1fr)` + ellipsis | `flex:1, minWidth:0` + `numberOfLines={1}` |

### 3.3 Component list (all exported from `@/kit`, same names as web where possible)

| Web primitive | Native component | Notes |
|---|---|---|
| `Button`, `ButtonRow`, `Stack` | same | variants primary / secondary / quiet / danger; busy spinner; disabled. **Orange primary appears at most once per screen.** |
| `Pill` (`PillTone`) | same | 24px high, tones from `.ffu-pill-*` |
| `Mark` | same | logo mark (SVG) |
| `StateLine` (`State`) | same | **The palette gate:** orange only when the answer is "you". This is the same rule as web, so port the docblock. |
| `Pass`, `PassTop`, `IconButton` | same | `forceNavy` default true → wraps children in the `onDark` token set. `IconButton` badge is 44→48dp. |
| `Hero`, `HeroSub`, `PassMeta`, `PassMetaItem` | same | radial accent glow → `react-native-svg` RadialGradient |
| `JobSwitcher` (`SwitcherJob`) | same | horizontal `ScrollView` chips (`.ffd-tab` look); a filter, not a tablist |
| `Group`, `Sheet`, `Row` (`RowTone`) | `Group`, `Card`, `Row` | **Renamed `Sheet` → `Card`** because "sheet" means bottom sheet on mobile. `Row` is pressable only when given `onPress`. One `gut` is shared by the icon column and the separator. The icon wrapper renders even with no icon. |
| `Stepper` (`Step`, `StepState`) | same | vertical timeline, 18px node, 1.5px rail |
| `AttentionCard`, `TrustLine` | same | `max` prop: **3 client / 4 contractor**. Returns null when empty. Money-gating rows first. |
| `DashShell`, `DashContent`, `DashCard` | `Screen`, `ScreenContent`, `DashCard` | `Screen` owns safe area, pull-to-refresh and the keyboard-avoiding view |
| `DeadEnd` | same | `retry` default true. `retry={false}` requires `alt`. **No way to render it with neither.** The type enforces this, as on web. |
| `PageTitle` | `ScreenHeader` | Expo Router `Stack` header styled with tokens |
| (web `ConfirmDialog` + `askConfirm`) | `ConfirmDialog` + `askConfirm` | **Mounted once in the root layout,** so the web failure "forgot to mount → button hangs forever" cannot happen |
| (web `Skeleton`) | `Skeleton` | |
| (web `notify()` toasts) | `Toast` | `burnt` (native toasts) or a small kit component |
| (new) | `KitLab` screen | Dev-build-only twin of `/ui-lab`. Every primitive against real tokens, with a dark/light flip. Excluded from production via `__DEV__`. |

Feature components that are **not** primitives (they know about jobs or money) live in
`src/features/*`. Examples: `ContractPanel`, `MilestonePanel`, `JobPhotos`, `JobTimer`,
`JobChecklist`, `JobExpenses`, `PhotoPicker`, `AddressAutocomplete` (Photon/komoot, a host
that is already declared), `BudgetPicker`, `ServicePicker`, `ScheduleField`.

**Dropped on mobile, as a simplification:** `VoiceDictate` (the OS keyboard already
dictates), `CookieConsent` (no web cookies; PostHog consent is handled at
`analytics.ts` override time if ever enabled), `FreddyRewind`, `OverhaulNotice` and
`OnboardingVideo` (add back only if the owner asks).

---

## 4. Auth design

### 4.1 Native Supabase client (`src/lib/supabase.ts` override)

```ts
createClient<Database>(EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { storage: LargeSecureStore, autoRefreshToken: true, persistSession: true,
          detectSessionInUrl: false, flowType: "pkce" },
});
export type UserRole = "client" | "contractor" | "admin";   // same export as web
```
- `LargeSecureStore` is the Supabase-documented pattern: an AES key in `expo-secure-store` and the encrypted session in AsyncStorage. SecureStore alone caps values near 2KB, and sessions exceed that.
- An `AppState` listener calls `startAutoRefresh()` / `stopAutoRefresh()`.
- `onAuthStateChange` does **synchronous work only**: it sets a flag and calls `clearMyProfile()`. The root layout reacts to the flag.

### 4.2 Root gate (`app/index.tsx` + `_layout.tsx`)

1. Show the splash until fonts and `readAuthUser()` settle. Then:
   - `unknown` → `DeadEnd` (Retry). **Never redirect on unknown.**
   - `signedOut` → `(auth)/welcome`.
   - `user` → go to step 2.
2. Check `mfaOwed()` (shared `mfa.ts`). If true → `(auth)/verify-code` (`mfa_request_code({p_purpose:'login'})` + verify). It fails open on a read error, the same as the web.
3. Read the role with `getMyProfile(user.id)`:
   - `ok:false` → `DeadEnd` Retry.
   - `client` → `(client)`.
   - `contractor` → `(contractor)`.
   - `admin` → `DeadEnd retry={false} alt="Open admin on the web"` (opens `https://freddyfixit.ca/admin-dashboard`).
   - A brand-new OAuth account (§4.3) → `(auth)/choose-role`.

### 4.3 Sign-in methods

**Email + password.**
- Sign-in uses `signInWithPassword`, then runs the gate from step 2.
- Sign-up keeps the web's two funnels: client signup lives inside the New Request flow, as `ClientOnboarding` does today, and contractor signup is its own flow. Both call `signUp({ options: { data: metadata, emailRedirectTo: "https://freddyfixit.ca/auth/confirm?role=client|contractor" } })`.
- `PasswordField` is ported with the strength meter and HIBP check (shared `passwordStrength.ts`). "Resend confirmation" uses `auth.resend`.

**Native Google** (`@react-native-google-signin/google-signin`; needs a dev build, not Expo Go).
- `GoogleSignin.configure({ webClientId, iosClientId })`, then `signIn()` and then `supabase.auth.signInWithIdToken({ provider: "google", token: idToken })`.
- Supabase dashboard: add the iOS and Android OAuth client IDs to the Google provider's *Authorized Client IDs*. Enable "skip nonce check", which the iOS Google SDK requires.
- **Port the `prompt=select_account` rule** (web 2026-11-09: the owner was silently signed into his client account). On the **sign-in** surface, call `GoogleSignin.signOut()` before `signIn()` so the account chooser always shows. On the two signup funnels, leave it alone, as the web does. Same asymmetry, same reason.

**Sign in with Apple** (`expo-apple-authentication`, iOS). **This is mandatory:** App Store guideline 4.8 requires it once Google sign-in is offered.
- Generate a raw nonce with `expo-crypto`, pass its SHA-256 to Apple, then call `signInWithIdToken({ provider: "apple", token: identityToken, nonce: raw })`.
- Supabase: enable the Apple provider with the bundle ID `ca.freddyfixit.app` as a client ID.
- Apple returns the user's name **only on the first sign-in**. Write `first_name`/`last_name` through the existing profile-update path immediately.
- On Android, hide the Apple button. Apple's guideline applies to the iOS app only.
- **Private-relay emails (`@privaterelay.appleid.com`).** Mail from `noreply@freddyfixit.ca` to those addresses is dropped unless the domain is registered in Apple Developer → *Sign in with Apple for Email Communication* and passes SPF/DKIM. **This is an owner action before launch.** Auth mail and transactional mail share one Resend domain and quota (web rule), so bounces here hurt signup for everyone.

**Role on an OAuth account.** `handle_new_user()` has no role to read from an OAuth
identity, so a new Google or Apple account already holds `client`. Port `AuthCallback`'s
logic into `(auth)/choose-role`:
- The `?role=` intent of the funnel the user started from is **intent, never identity**.
- An established role wins on **every** branch: admin and contractor are never demoted. This was the web's asymmetric-branch bug.
- The write goes through `setMyRole()`, which asks `role_change_block` first and shows `{reason, permanent}`.

### 4.4 Email deep links (confirm signup, magic/recovery)

**Problem.** Today's links land on `…/auth/callback` (signup confirmation) and
`…/update-password` (password recovery), with tokens in the URL that the browser session
consumes. A PKCE link only works on the device that started the flow, and people open
email on a laptop.

**Design: `token_hash` links plus universal links. These work on any device.**
1. **W3a (web).** Add the route `/auth/confirm`. It reads `token_hash`, `type` and `next`/`role`, calls `supabase.auth.verifyOtp({ token_hash, type })`, then continues exactly as `AuthCallback` does today. `type=recovery` lands on `/update-password`. The existing `/auth/callback` stays for web OAuth.
2. **W3b (owner, Supabase dashboard).** Change the *Confirm signup*, *Reset password* and *Magic link* templates to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup` (or `recovery`, `magiclink`). Add `https://freddyfixit.ca/auth/confirm` to the redirect allowlist. **Auth mail is the most dangerous surface on the platform (Aug 2026 lockout).** Do this only after W3a is live and proven on the web with a real inbox. Watch health check 7 (`no_stuck_signups`) for 48h.
3. **W3c (web).** Publish `public/.well-known/apple-app-site-association` (paths `/auth/confirm*`, `/update-password*`, `/pick/*`, `/app/return/*`, `/contractors/*`) and `assetlinks.json` (Android App Links, with the SHA-256 of the EAS and Play signing keys). In `vercel.json`, serve the AASA as `application/json` with no redirect.
4. **App.** `platform/links.ts` maps incoming URLs to routes:
   - `/auth/confirm` → `(auth)/confirm`, which runs the same `verifyOtp` and then the §4.2 gate.
   - `/update-password` → `(auth)/update-password`.
   - `/pick/:token` → `pick/[token]`. Port the web rule: **compare the id; an RLS-visible row is not proof of ownership.**
   - `/contractors/:id` → `pro/[id]`.
   - Anything unknown → open in the browser.

   If the app isn't installed, the same URL works on the web. That's the point.
5. A custom scheme `freddyfixit://` exists only for dev builds and the Expo dev client. It never appears in an email.

### 4.5 Account deletion (store requirement)

Settings → Delete account → `delete-account` edge function, which already exists and
already blocks deletion during an active job. Show the function's JSON `error` body as the
web does. This is required by App Store 5.1.1(v) and Google Play.

**Apple adds a rule:** an app with Sign in with Apple must **revoke the Apple token** on
deletion. The design stores no Apple tokens:
- On delete, an account with an Apple identity re-prompts Sign in with Apple to get a fresh `authorizationCode`.
- `delete-account` exchanges it at `appleid.apple.com/auth/token` and calls `/auth/revoke`.
- This needs a new edge secret (Apple key ID, team ID, `.p8`).

**This is a new outbound host:** it needs a `check_legal.py` `DECLARED` entry and a Privacy
Policy §6.2 row in the same ship.

### 4.6 Sign-out

Call `unregister_push_token(token)` (§5) **before** `signOut()`, while the session is still
valid. Then call `clearMyProfile()` and go to `(auth)/welcome`.

---

## 5. Push notifications

**Transport.** Expo Push Service (`expo-notifications` + `exp.host/--/api/v2/push/send`).
That gives one API for APNs and FCM and no certificates to manage by hand, because EAS
manages the credentials.

**Registration (app).**
1. Don't ask for permission at launch. Ask at the first moment it clearly helps the user:
   - a client right after posting a request ("Get told when estimates arrive")
   - a contractor right after their profile is approved ("Get new jobs in your area")
2. Get the token with `getExpoPushTokenAsync({ projectId })`, then call `register_push_token(p_token, p_platform, p_app_version)`.
3. Re-register on every launch while signed in. That refreshes `last_seen_at` and handles token rotation.
4. Android: create channels `jobs`, `messages` and `money` so users can mute them separately in OS settings. This is the only "notification preferences" UI. Simple beats complete.

**Delivery (backend).** This adds no new emitter, because both existing fan-outs gain a
push leg:
- `supabase/functions/_shared/push.ts`: `sendPush(userIds, { title, body, data:{type, job_id}, channelId, threadId })`. It reads enabled `push_tokens` and posts in batches of 100. A ticket error of `DeviceNotRegistered` disables that token immediately.
- **`send-notification`** (fired by the DB webhook on every `public.notifications` INSERT) calls `sendPush` for **every** type, including the ones in `EMAIL_HANDLED_ELSEWHERE`. That set suppresses the *generic email*, not the bell, and push is the phone's bell. This keeps "one notification row → one push", with no second emitter to hunt for.
- **`notify-message`** (chat) calls `sendPush` for the recipient. It does this **before** and independent of the 15-minute `message_email_log` email throttle. Collapse per thread with `threadId`/`tag`, so a burst replaces one banner instead of stacking ten. It returns early on `NEW.blocked`, as now, so a blocked message can't push either.
- **Pause switch.** Push follows the **bell**, so it survives `outbound_paused()`. It goes only to signed-in users who opted in, and costs nothing, so it is not bulk email. **This is an owner decision; flag it before building.** If he wants push silenced in `paused`/`waitlist` mode, `sendPush` checks `outbound_paused()` itself (the web rule: the gate lives inside the emitter). Transactional types (payment receipts, auth) are exempt either way.

**Privacy on the lock screen.**
- Push bodies never carry message text, addresses, phone numbers or amounts. Chat pushes read "Mike sent you a message". Job pushes reuse the notification `title` only, plus "Open to see details".
- `data` carries `{type, job_id}` only.

**Routing a tap.** `data.type` + `data.job_id` → shared `noteTarget(type, jobId, role)` →
`{path, tab, jobId}` → `platform/links.ts` maps that to an Expo Router route (for example
contractor `available` tab, or `job/[id]` with a scroll anchor). One mapping table serves
the bell list, push taps and universal links. Unknown types fall back to the role's home
tab, as on the web.

**Legal.** `exp.host` is a new outbound host. It needs a `check_legal.py` `DECLARED` entry
and a Privacy Policy §6.2 row (Expo as processor; Apple and Google as push transit) in the
same ship as `_shared/push.ts`. UA §12 notice timing applies, and the weekly legal pass
covers it.

**Receipts sweep:** deferred. A cron that checks Expo receipts is "infrastructure ahead of
use". Add it only once push volume is non-zero and tickets show failures.

---

## 6. Payments design

### 6.1 Decision: keep Stripe Checkout, opened in the system browser sheet

All four charge edge functions (`create-payment-intent`, `create-balance-payment`,
`create-milestone-payment`, `create-recurring-prepayment`) already create **Checkout
Sessions** and return `url`. `stripe-webhook` increments `funded_amount` from those
sessions.

The app reuses this path unchanged:
1. Call `invoke(fn, { body: { job_id, return: "app" } })`.
2. Open the returned `url` with `WebBrowser.openAuthSessionAsync(url, "https://freddyfixit.ca/app/return/payment")`.
3. On return, poll the job at 2.5s, 4s and 7s, the same backoff as the web's `?payment=success` handler. **Never treat the return URL as proof of payment.** Only the job row's `funded_amount`/`payment_status` (set by the webhook) is proof.

**Why not Stripe PaymentSheet** (`@stripe/stripe-react-native`)? It needs PaymentIntents
instead of Checkout Sessions, which means a new webhook branch that must increment
`funded_amount`. That is new code in **guard territory** on the platform's
highest-risk surface, where card-on-file has never charged a real card and the dispute
branch is untested. The browser sheet gets the same result (Apple Pay and Google Pay
included, because Checkout offers them) with **zero money-path changes**. Revisit
PaymentSheet only if the owner sees checkout drop-off in data.

**App Store / Play.** Home repair is a physical service consumed outside the app. That
falls under App Store 3.1.3(e) and the Play equivalent, so in-app purchase is not
required and Stripe is allowed. **Write this in the review notes** (§8, step 7.3).

### 6.2 Backend change (the only one in the money path)

The charge functions hard-code `success_url`/`cancel_url` to `https://freddyfixit.ca/client-dashboard?...`.

**Change:** accept an optional `return` field in the request body, as the **enum
`"web" | "app"`** (default `"web"`).
- With `"app"`, set `success_url = https://freddyfixit.ca/app/return/payment?status=success&job=<id>` (and `cancel` to match).
- **Never accept a URL from the body.** That would be an open redirect off our Stripe account.
- `create-recurring-prepayment` uses `&tab=recurring` instead of `job`.
- `create-connect-account` gets the same enum for its `refresh_url`/`return_url`, pointing them at `/app/return/connect`.

**Process for this change (web rules).**
- Read the **deployed** source with `get_edge_function` first. The repo copy of `create-payment-intent` is known stale.
- Run the `freddy-payment-change` gate, and state: **"touches none of the four payout guards; changes only redirect URLs; no change to amounts, `funded_amount`, `fully_funded` or the 428 contract gate."**
- Run `freddy-money-test` after.
- Commit the source in the same ship.
- Web fallback: `/app/return/*` on the web (no app installed, or the link opened on desktop) renders a short "Payment received, open the app or continue on the web" page linking to `/client-dashboard`. This is one tiny web route in W3c.

### 6.3 Client-side gates (mirrored, never invented)

The pay button follows the same sequence as `ClientDashboard`:
1. `contractBlocked` starts true and clears only on a positive `contract_signed`. A check error shows "refresh".
2. Price change pending → "approve or decline first".
3. Address confirmed (frontend-only gate, kept frontend-only).
4. `askConfirm` with the server-derived amount.
5. Invoke.

An HTTP **428** from the function shows the reason from `error.context`. **`ContractPanel`
is the first screen ported in the job feature,** and every one of its render branches
(including loading) carries the contract anchor. A dropped contract panel makes every job
unpayable with no error, on mobile as on the web.

### 6.4 Contractor payouts (Stripe Connect onboarding)

`create-connect-account` → AccountLink `url` → `openAuthSessionAsync` → returns to
`/app/return/connect` → `refresh-connect-status` → re-read `contractors.stripe_payouts_enabled`.
`stripeRequirements.ts` (shared) renders what Stripe still needs. Payout history is read
from the same columns and RPCs the Earnings tab uses. The commission comes from
`platformRates.ts`, never a literal `0.93`.

### 6.5 Milestones, deposits, prepay pools

These are UI ports of `MilestonePanel` / the recurring tab over the same functions. The
only change is `return: "app"`. **No money logic moves to the client.**

### 6.6 App version gate

Add a `platform_settings` key `min_app_version`. It's a data row, not a schema change, if
`platform_settings` is key/value; otherwise it's one column. Read it at launch through an
anon-readable RPC `app_config()` that returns `{min_app_version, platform_mode}`.
- Below the minimum → `DeadEnd retry={false}` with "Update Freddy Fix It" linking to the store.
- **EAS Update (OTA)** ships JavaScript-only fixes without store review, so a channel per store build pins compatible JavaScript. `min_app_version` is the escape hatch for native or breaking backend changes.

---

## 7. Database / edge changes needed

All of these go through `freddy-db-change`: write the migration file first, apply that
exact file through Supabase MCP, prove with a rolled-back probe, regenerate the
`supabase/schema/` snapshot **and** `database.types.ts`, and commit in the same web ship.
Then run `npm run sync` here.

| # | Change | Kind | Notes / web rules that apply |
|---|---|---|---|
| D1 | `push_tokens` table: `id uuid pk`, `user_id uuid → auth.users on delete cascade`, `token text unique not null`, `platform text check in ('ios','android')`, `app_version text`, `created_at`, `last_seen_at`, `disabled_at` | migration | RLS on. Own-row `select`/`delete` only, no insert/update policy. Writes go through D2. Revoke `TRUNCATE` from anon/authenticated (web convention). |
| D2 | `register_push_token(p_token, p_platform, p_app_version)` and `unregister_push_token(p_token)` | RPC, `SECURITY DEFINER` | **Test `auth.uid() is null` first.** Upsert on `token`, **reassigning** it to the caller (one phone, two accounts → the token follows whoever is signed in). `set search_path = public, extensions, pg_temp`. `revoke … from public, anon`; grant `authenticated`. **Verify via `pg_proc.proacl`, not the migration.** Rate-limit like other user writes. |
| D3 | `app_config()` + `min_app_version` setting | RPC (anon-readable) + data | Read-only; no PII. |
| E1 | `_shared/push.ts`; push leg in `send-notification` and `notify-message` | edge | Read the deployed source first. A new host `exp.host` → `check_legal.py` + Privacy §6.2 in the same ship. Owner decision on the pause (§5). |
| E2 | `return: "web" \| "app"` enum on the 4 charge functions + `create-connect-account` | edge, **money** | §6.2. `freddy-payment-change` gate; no guard touched. Deployed source first. |
| E3 | Apple token revoke in `delete-account` | edge | §4.5. A new host `appleid.apple.com` → legal entries. New secrets. |
| A1 | Supabase Auth: enable Apple; add Google iOS/Android client IDs; skip-nonce for iOS Google; redirect allowlist `https://freddyfixit.ca/auth/confirm` (+ `freddyfixit://` for dev only) | dashboard (owner) | |
| A2 | Email templates → `token_hash` links | dashboard (owner) | **Only after W3a is proven.** Watch health check 7. §4.4 |
| — | **Not needed:** notification preferences table (Android channels + OS settings cover it), push receipts cron (deferred), device table beyond `push_tokens`, any change to bids/jobs/money tables | | Product direction: fewer tables, fewer rules. |

---

## 8. Build order

**Opus** = complex: new pattern, money, auth, realtime, or a ported page over ~800 web
lines with load-bearing rules. **Sonnet** = follows an existing pattern set earlier in this
list. Each step is a separate PR with **one concern** (the web rule). Each Opus step
leaves behind the pattern its Sonnet siblings copy.

### Phase 0: web-repo prerequisites (ship in the web repo)
| Step | Work | Model |
|---|---|---|
| 0.1 | W1: extract pure predicates to `src/lib/jobRules.ts` (re-export; `freddy-payment-change` note) | Sonnet |
| 0.2 | W2: `src/lib/bus.ts`; re-point `chatUnread` / `bidThreads` / `completionPrompt` | Sonnet |
| 0.3 | W3a: `/auth/confirm` route with `verifyOtp(token_hash)` | Opus |
| 0.4 | W3c: AASA + `assetlinks.json` + `vercel.json` headers + `/app/return/*` web fallback page | Sonnet |

### Phase 1: foundation
| Step | Work | Model |
|---|---|---|
| 1.1 | Expo scaffold (current stable SDK, TS strict, Expo Router), `app.config.ts`, `eas.json` (development / preview / production), bundle IDs `ca.freddyfixit.app`; **mobile `CLAUDE.md`** with §0 rules | Opus |
| 1.2 | `scripts/sync-shared.mjs` + `check-shared.mjs` + `shared.lock.json` + CI (typecheck, lint, check-shared, nightly-sync) | Opus |
| 1.3 | Native overrides: `supabase.ts` (LargeSecureStore, PKCE, AppState refresh), `bus.ts`, `platform/storage.ts` | Opus |
| 1.4 | Remaining overrides: `theme`, `requestDraft`, `referralCode`, `terms`, `reviewPrompt`, `referralPrompt`, `completionPrompt`, `analytics` no-op | Sonnet |
| 1.5 | `imageCompress` override + `platform/upload.ts` (picker → compress → `storage.upload` ArrayBuffer → `scan-image`; HEIC fallback; original-on-failure) | Opus |

### Phase 2: native kit
| Step | Work | Model |
|---|---|---|
| 2.1 | Token generator in sync + `ThemeProvider`/`useTokens`/`rgba`/fonts/reduced-motion | Opus |
| 2.2 | `Button`/`ButtonRow`/`Stack` (sets the press-spring, haptics, 48dp and a11y pattern) | Opus |
| 2.3 | `Ic` + glyph generator | Sonnet |
| 2.4 | `Pill`, `Mark`, `StateLine` | Sonnet |
| 2.5 | `Group`/`Card`/`Row` (gut + hairline geometry) | Opus |
| 2.6 | `Pass`/`PassTop`/`IconButton`, `Hero`/`HeroSub`/`PassMeta` | Sonnet |
| 2.7 | `Stepper`, `AttentionCard`/`TrustLine`, `JobSwitcher` | Sonnet |
| 2.8 | `Screen`/`ScreenContent`/`DashCard`/`ScreenHeader`, `Skeleton`, `Toast` | Sonnet |
| 2.9 | `DeadEnd` (type-enforced way out) | Sonnet |
| 2.10 | Bottom `Sheet` + `ConfirmDialog`/`askConfirm` mounted once in the root | Opus |
| 2.11 | `KitLab` dev screen | Sonnet |

### Phase 3: auth
| Step | Work | Model |
|---|---|---|
| 3.1 | Root gate (`readAuthUser` three outcomes, `mfaOwed`, role routing, admin dead end) | Opus |
| 3.2 | Welcome + email sign-in + `PasswordField` + resend confirmation | Opus |
| 3.3 | Verify-code screen (two-step) | Sonnet |
| 3.4 | Native Google (select-account asymmetry) | Opus |
| 3.5 | Sign in with Apple (nonce, first-sign-in name) | Opus |
| 3.6 | Choose-role (`setMyRole`, established role wins on every branch) | Opus |
| 3.7 | `platform/links.ts` + `(auth)/confirm` (`verifyOtp`) + universal-link wiring | Opus |
| 3.8 | Forgot password + update password | Sonnet |
| 3.9 | Sign-out (unregister push first) | Sonnet |
| — | **Owner:** A1 dashboard settings; Apple private-relay email registration | — |

### Phase 4: client app
| Step | Work | Model |
|---|---|---|
| 4.1 | `(client)` tab shell (Requests / Messages / Pros / Account; Pros hidden when 0, mirroring `visibleNav`) | Opus |
| 4.2 | Requests tab: request + job cards, `AttentionCard` (3 rows, money-gating first), pull-to-refresh, failed-read states | Opus |
| 4.3 | New request flow (port `NewRequest`: `ServicePicker`, `BudgetPicker`, `ScheduleField`, `AddressAutocomplete`, photos, `requestDraft`, `tidyDescription` normalise-never-rewrite) | Opus |
| 4.4 | Client signup funnel wrapped around 4.3 (port of `ClientOnboarding`'s signed-out branch, referral at signup, terms acceptance) | Opus |
| 4.5 | Request detail: estimates list, quote breakdown, pick (`accept_bid`), remove request (`canRemoveRequest`) | Opus |
| 4.6 | `pick/[token]` universal-link screen (id comparison, not RLS) | Sonnet |
| 4.7 | **Job detail (client):** `ContractPanel` first, then pay deposit/balance (§6), price change approve/decline, address confirm, photos, timeline, completion confirm, dispute/claim | Opus |
| 4.8 | Payment return handler (`return/payment`, poll job, never trust the URL) | Opus |
| 4.9 | `MilestonePanel` (milestone payments) | Opus |
| 4.10 | `JobChat` (realtime channel, media, chat guard / blocked messages, schedule-from-chat, `chatReadOnly`) | Opus |
| 4.11 | `BidChat` (pre-pick) | Sonnet |
| 4.12 | Messages inbox (`useChatUnread` + `useBidThreads`, badges) | Sonnet |
| 4.13 | Review prompt + completion thanks + referral share (native share sheet) | Sonnet |
| 4.14 | Pros tab (`list_my_pros`, rehire) | Sonnet |
| 4.15 | Recurring plans + prepay pool (`create-recurring-prepayment`, `return:"app"`) | Opus |
| 4.16 | History | Sonnet |
| 4.17 | Account: profile, settings (theme, text size), two-step panel, legal links, help/report a problem | Sonnet |
| 4.18 | Delete account (incl. Apple revoke re-prompt) | Opus |
| 4.19 | Notifications list (bell) + `noteTarget` routing | Sonnet |

### Phase 5: contractor app
| Step | Work | Model |
|---|---|---|
| 5.1 | `(contractor)` tab shell (Jobs / Available / Messages / Earnings / Account) | Sonnet |
| 5.2 | Contractor signup + onboarding (port `ContractorOnboarding`: specialties from the canonical `SPECIALTIES`, area, vetting answers, docs upload to `contractor-docs` with the `document` profile, `review-contractor`) | Opus |
| 5.3 | Stripe Connect onboarding + `return/connect` + `stripeRequirements` | Opus |
| 5.4 | Profile completion (`contractorGaps`, `GAP_ANCHORS`) + profile tab + portfolio photos | Sonnet |
| 5.5 | Available tab (`list_open_jobs`, zone ranking never a filter, hide job) + **submit bid** | Opus |
| 5.6 | Jobs tab: attention `else if` chain (4 rows; a new predicate goes **before** the one it overlaps), job cards, `JobSwitcher` | Opus |
| 5.7 | **Job detail (contractor):** mandatory photos (`photosMissing`, `photo_rules_start`), `JobTimer`, `JobChecklist`, `JobExpenses`, propose price change, split job, mark complete, withdraw (`canWithdraw`), sign contract | Opus |
| 5.8 | Calendar view (toggle inside Jobs) | Sonnet |
| 5.9 | Earnings (`total_earned`, payouts, `platformRates`) | Sonnet |
| 5.10 | Reviews | Sonnet |
| 5.11 | Contractor guide (Archivo read screen from `contractorGuide.ts`) + public `pro/[id]` | Sonnet |
| — | Messages / BidChat / JobChat / notifications / account reuse Phase 4 screens with role panels | Sonnet |

### Phase 6: push
| Step | Work | Model |
|---|---|---|
| 6.1 | D1 + D2 migration, probes, types regen, sync | Opus |
| 6.2 | E1 `_shared/push.ts` + `send-notification` + `notify-message` legs + legal entries (**after the owner's pause decision**) | Opus |
| 6.3 | App: permission timing, token register on launch, Android channels | Opus |
| 6.4 | Tap routing through `noteTarget` → `links.ts`; foreground banner behaviour | Sonnet |

### Phase 7: money redirect + release
| Step | Work | Model |
|---|---|---|
| 7.1 | E2 `return` enum on charge + connect functions (lands **before** 4.7 in practice; listed here because it's a web ship) | Opus |
| 7.2 | D3 `app_config()` + update gate + EAS Update channels | Sonnet |
| 7.3 | Store prep: icons/splash, privacy nutrition labels / Data safety form (matching Privacy Policy §6.2), review notes (3.1.3(e) physical services, demo accounts for both roles, Sign in with Apple present, account deletion location) | Sonnet |
| 7.4 | E3 Apple revoke in `delete-account` (lands before 4.18) | Opus |
| 7.5 | TestFlight / Play internal test: the owner runs both roles end to end on one real job; `freddy-money-test` against a real Checkout from the app | Opus |

**Critical path:** 0.1–0.2 → 1.1–1.3 → 2.1–2.2 → 3.1 → 7.1 → 4.7. The client job-detail
screen with payment is where the app either works or doesn't, so get to it early and
leave the polish tabs for later.

---

## 9. Open decisions for the owner

1. **Push during `paused`/`waitlist` mode:** keep it like the bell (default in this plan), or silence it like email?
2. **Monorepo later?** The vendored sync is the start (§2.1).
3. **Analytics in the app:** none at launch (default), or PostHog with a consent prompt.
4. **Apple developer account + Google Play console** are owned by the business, not a personal account. Store accounts are hard to transfer later.
