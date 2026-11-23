# Freddy Fix It: mobile app (Expo + Expo Router + TypeScript)

One app for **clients and contractors**. Admin, blog and marketing stay on the web.
**PLAN.md is the plan of record**: architecture, build order, and which steps
are Opus (complex) or Sonnet (follows a pattern). Read §0 before writing code.
`AGENTS.md` has the Expo/SDK rules (Expo changes every SDK: check the versioned docs).

## The one principle
The app is a **second client of the same Supabase backend** as the web app
(`karanmann137-creator/freddy-fixit`). It adds no business rules. A new rule
goes into an RPC or edge function first, then both clients call it.

## Hard rules (short form; the reasons live in the web repo's CLAUDE.md)
- **`readAuthUser()` is the only "signed in?" test.** Three outcomes. `unknown` renders `DeadEnd`, never a redirect.
- **No Supabase call or `await` inside `onAuthStateChange`.** It deadlocks the auth lock.
- **`.maybeSingle()`, never `.single()`.** A failed read is "couldn't load" + retry, never a confident zero.
- **`functions.invoke` drops the body**: read the reason from `error.context.json()`.
- **`setMyRole()` is the only role write.** `clearMyProfile()` after it and on sign-out.
- **A dead end is `<DeadEnd>`**, with a retry or (for a refusal) an `alt`. The type enforces it.
- **Money:** the app never computes a charge, fee or payout. Pay gates mirror web (PLAN §6.3). "Held securely", never "escrow".
- **Uploads:** `compressImage()` first; every failure path returns the original.
- **Kit:** every colour/size from `useTheme().t`, or `ui` in `kit/theme.tsx` for fixed component shapes copied from web CSS. Orange means "it's on you"; at most one orange call to action (`primary` Button) per screen. 48dp touch targets.
- **Backward compatibility (new, app-only):** shipped apps run old JavaScript for weeks. An RPC may gain a parameter only with a DEFAULT. Never rename or remove a column, argument or field a shipped build reads until `min_app_version` passes it (PLAN §0).

## Shared code: `src/lib` and `database.types.ts`
- Files whose first line is `// SYNCED from freddy-fixit@…` are **copies of the web repo. Never edit them here.** Change the web repo, then `npm run sync`. `npm run check:shared` fails CI on an edit.
- `*.generated.ts` (tokens, glyphs, image profiles) are parsed from web files by the same sync.
- Everything else in `src/lib` is a **native override** with the web module's exports (`supabase`, `bus`, `theme`, `imageCompress`, `analytics`).
- After any web DB change: `npm run sync && npm run check`. The web repo is the only generator of `database.types.ts`.

## Commands
```bash
cp .env.example .env          # once: fill in the PUBLIC Supabase URL + anon key
npm run sync                  # pull shared web files (fetches web main)
npm run sync -- --locked      # prove synced files reproduce from the locked web commit (CI runs this)
npm run check                 # check:shared + check:rules + typecheck + lint (what CI runs)
npx expo start                # dev server (needs a development build: native modules)
npx eas-cli@latest build --profile development   # a dev build for a phone
```

## Review gates (PLAN §8a)
1. `npm run check` on every push (CI). `scripts/check-rules.mjs` holds the mechanical rules and the
   silent-failure **mounts**. Add a mount when you build something whose absence would error nowhere.
2. CodeRabbit: comment `@coderabbitai review` on a phase PR (free, public repo, manual).
3. Sonnet review agent: before opening a gate PR, the build session runs a FRESH Sonnet agent (no build
   context) with the fixed brief in PLAN §8a. Fix every FAIL, re-run until VERDICT: MERGE, and paste the
   final review into the PR description. (The paid GitHub Action was removed: it needs API credits.)

## Layout
```
src/app/        Expo Router routes: thin, params → a screen from src/features
src/features/   one folder per area (auth, client, contractor, job, chat, payments, push, dev)
src/kit/        native component kit (port of web src/components/ui): no business logic
src/lib/        synced web modules + native overrides
src/platform/   native seams: storage, secureSession, upload (links.ts arrives in Phase 3)
scripts/        sync-shared, check-shared, check-rules
```
