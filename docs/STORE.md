# Store submission pack (PLAN step 7.3) - DRAFT

Status: **draft, written 2026-11-25 from the code at branch `wt/store`.** Nothing here has been
entered into App Store Connect or Play Console. Every answer below is what the **code does today**.
Where it will change (push in Phase 6, in-app account deletion in 4.18, PDFs, SMS), the row says so,
and **the form must be re-checked at that release**.

How to read this: "Collected" means the app sends it to our servers (Supabase) or to a service
provider. Where I could not prove something from the code, the text says **check**.
Nothing here is legal advice; the Privacy Policy is the source of truth and the store forms must agree
with it. Owner fills every `[OWNER: ...]` placeholder. I never invent logins, URLs or numbers.

---

## 0. What the app actually does with data (the facts the forms rest on)

| Fact | Source |
|---|---|
| Account data is held in our own Supabase backend (database, sign-in, photo storage). | `src/lib/supabase.ts` |
| Sign-in: email + password, Google, Sign in with Apple. Session stored encrypted on the phone. | PLAN 4.1, 4.3; `app.config.ts` |
| Photos come from the camera or photo library, are shrunk on the phone, uploaded, then checked by our `scan-image` function (which uses Anthropic, per Privacy Policy 6.2). | `src/platform/upload.ts`, `src/lib/imageSafety.ts` |
| Contractors upload licence/insurance/WCB/trade documents (photos only for now; PDFs not yet) and a profile photo. `review-contractor` reads them (Anthropic, advisory only). | `OnboardingScreen.tsx`; `review-contractor` call; PP 6.2 |
| **No location permission.** The app never reads GPS. The client types a postal code. | no `expo-location`; `LocationBlock` in `request/pieces.tsx` |
| **No analytics, no crash reporter, no advertising SDK.** `analytics.ts` is a no-op by owner decision. | `src/lib/analytics.ts`; PLAN §9 |
| **No push notifications yet** (Phase 6). No `expo-notifications` in `package.json`. | `package.json` |
| **No in-app payment UI yet.** Live jobs, payments, messages, estimates, recurring and account deletion currently **open the website** (in-app browser sheet). Payment will be Stripe Checkout in the system browser sheet; the app never sees card numbers. | PLAN §6.1; Progress table; `client/web.ts` |
| Fonts are bundled (`@expo-google-fonts/*`), so the app does not call Google Fonts over the network. | `package.json` |
| Camera and photo-library permission texts are set. No other permission strings. | `app.json` |
| The website pages opened in the in-app browser (Privacy Policy, User Agreement, account deletion, any handed-off job screen) are the web app and run its consent-gated analytics. That is the website's behaviour, covered by the web Privacy Policy, but a reviewer may notice. | `client/web.ts` |

---

## 1. Apple App Privacy ("nutrition label")

Apple asks, per data type: collected? linked to the user? used to track? and why.
**Tracking = No for everything**: no advertising SDK, no data broker, no cross-app/website linking, no ATT prompt
(Privacy Policy 6.3: no advertising partners). Answer "No, we do not use data to track you".

All rows below are **Linked to the user's identity: Yes** (everything hangs off the account), **Used to track: No**.
Purposes use Apple's wording: **AF** = App Functionality, **PZ** = Personalisation (not used), **AN** = Analytics (not used).

| Apple data type | Collected? | Purpose | What it is in this app / note |
|---|---|---|---|
| **Contact Info: Name** | Yes | AF | Account name; shown to the matched pro/client (PP 6.1). |
| **Contact Info: Email address** | Yes | AF | Sign-in, confirmations, job emails. Apple sign-in may supply a private-relay address. |
| **Contact Info: Phone number** | Yes | AF | Profile phone; shared with the matched party. Stays AF even once SMS exists (PLAN 5a: still job messages only). |
| **Contact Info: Physical address** | Yes | AF | Postal code + area on a request; full service address once a pro is chosen (PP 3.2). **Check** whether the full address is entered in-app or on the web at launch. |
| **Contact Info: Other user contact info** | No | | |
| **Health & Fitness** | No | | |
| **Financial Info: Payment info** | **No (check)** | | Card details are entered on Stripe's hosted Checkout page, not in the app, and we never receive them (PP section 4). Apple's wording says "collected" includes data a third-party partner collects **if you use it for your own purposes**: we do not. **Check** this reading in App Store Connect help before submitting; if in doubt, the conservative answer is Yes, AF. |
| **Financial Info: Other financial info** | **Yes** | AF | Contractor earnings/payout amounts and a job's funded/paid state are shown in the app (server values). No bank numbers: Stripe Connect holds those. |
| **Location: Precise / Coarse** | **No** | | App has no location permission. Postal code is typed and is declared as Physical address above. |
| **Sensitive Info** | No | | Apple's category means race, religion, health etc. Government photo ID is declared under Photos and Other User Content, because Apple has no ID-document type (see note below). |
| **Contacts** | No | | |
| **User Content: Photos or Videos** | Yes | AF | Job photos, completion photos, profile/portfolio photos, and contractor verification documents (licence, insurance, WCB, trade cert, and government photo ID per PP 6.2 Anthropic row). Videos: **check**, not seen in the app code. |
| **User Content: Audio** | No | | |
| **User Content: Gameplay** | No | | |
| **User Content: Customer support** | Yes | AF | Job descriptions, bids, reviews, claim text. In-app support chat is on the web for now; emails to hello@freddyfixit.ca. |
| **User Content: Other user content** | Yes | AF | Job text, bids, reviews, contractor business details and licence numbers, uploaded documents. |
| **Browsing History / Search History** | No | | |
| **Identifiers: User ID** | Yes | AF | Supabase account id. |
| **Identifiers: Device ID** | **No today. Yes after Phase 6** | AF | The push token (Expo/Apple/Google) counts. **Update the label in the same release as push (6.3).** `expo-device` is installed but unused. |
| **Purchases: Purchase history** | Yes | AF | The account's own job payments, deposits and receipts, as shown from the server. Not an In-App Purchase. |
| **Usage Data** (product interaction, advertising data, other) | **No** | | No analytics. If step 8.1 (PostHog) is built: change to Yes, Analytics, and add the consent prompt. |
| **Diagnostics** (crash, performance, other) | **No** | | No crash/performance SDK. **Check** that the Expo/EAS build adds none (Apple/Google collect their own crash data under their own terms, which you do not declare). |
| **Other Data** | No | | |

Notes for the owner:
- "Linked to identity" is Yes because every row is stored against the signed-in account.
- Privacy Policy URL goes in App Store Connect (section 4 below). Apple also wants a **User Privacy Choices URL** (optional): leave blank unless a page exists.
- **After any of these ship, redo the label:** push (Device ID), PostHog (Usage Data), SMS (no change), PDF documents (no change).

---

## 2. Google Play Data safety form

Play asks: does the app collect/share data, per category, and whether it is optional, processed ephemerally,
and why. **Sharing** in Play excludes passing data to a service provider that processes it for you
(Supabase, Stripe, Anthropic, Resend, etc. in PP 6.2), and excludes legal disclosure. So **sharing = No** for
every row *except what is shown to the other party in a job (name/phone)*: Play treats that as sharing with
another user, not a third party, but **check** how Play Console words that on the day.

Top-level answers:
- Does the app collect or share user data? **Yes (collects).**
- **Is all of the data encrypted in transit? Yes.** The app talks to Supabase and the website over HTTPS only (every URL in `src/` is `https`). **Check** `eas.json`/env: the Supabase URL must be `https://`.
- **Do you provide a way for users to request data deletion? Yes.**
- Data collected is **required** (cannot use the app without it) unless marked optional.
- Independent security review: **No** (do not claim one).

| Play category / type | Collected | Shared | Optional? | Purpose |
|---|---|---|---|---|
| Personal info: Name | Yes | No | Required | App functionality, Account management |
| Personal info: Email address | Yes | No | Required | App functionality, Account management, Communications |
| Personal info: User IDs | Yes | No | Required | App functionality, Account management |
| Personal info: Address (postal code, service address) | Yes | No | Required for a request | App functionality |
| Personal info: Phone number | Yes | No | **Check**: profile phone may be optional for clients | App functionality, Communications |
| Personal info: Race, religion, sexual orientation, political/religious beliefs, other | No | | | |
| Financial info: User payment info | **No (check)** | | | Entered on Stripe's page, never received by us. Same caution as Apple row. |
| Financial info: Purchase history | Yes | No | Required | App functionality (a user's own job payments) |
| Financial info: Other financial info | Yes | No | Required for contractors | App functionality (earnings shown) |
| Health and fitness | No | | | |
| Messages: Emails / SMS / Other in-app messages | **Check** | | | Chat is on the web in this build. Declare "Other in-app messages: Yes, App functionality" once the chat tab is native (4.9+). |
| Photos and videos: Photos | Yes | No | Photos are optional for requests, required for contractor documents | App functionality |
| Photos and videos: Videos | **Check** | | | Not seen in the app. |
| Audio files | No | | | |
| Files and docs | **Not yet** | | | Becomes **Yes** when PDF documents ship (`expo-document-picker`). |
| Calendar / Contacts | No | | | |
| App activity (page views, interactions, search history, installed apps) | **No** | | | No analytics. |
| App activity: Other user-generated content | **Yes** | No | Required for requests and reviews | App functionality: job descriptions, request answers, review comments and ratings. |
| Web browsing | No | | | |
| App info and performance (crash logs, diagnostics) | **No** | | | None collected by us. |
| Device or other IDs | **No today, Yes after Phase 6** | No | | Push token. Update with 6.3. |
| Location (approximate / precise) | **No** | | | No location permission. |

**Account-deletion URL and in-app path (Play requires both for apps that create accounts):**
- Play Console asks for a **web URL** where a user can request deletion, even for people who have uninstalled. `[OWNER: the exact freddyfixit.ca page. The web account settings deletion lives behind sign-in, which may not satisfy Play's "outside the app" rule; check Play's current Account deletion wording. If no public page exists, one is needed (a short page saying how to delete, plus hello@freddyfixit.ca) before submission.]`
- In-app path today: Account tab, "Delete account on the website", which opens the website (both roles). **Not in-app. See launch blocker B1.**
- What deletion does and does not remove must say the same as Privacy Policy section 8: access removed now, account data kept up to 3 years, job records up to 7 years, profile media best-effort within 90 days. Play's form asks which data is deleted and which is kept and why; copy those periods from PP section 8, do not paraphrase.

---

## 3. App Review notes (Apple "App Review Information" box)

Paste and fill:

> **Freddy Fix It is a marketplace for real-world home and vehicle services in Calgary, Alberta.** Clients post a job, local contractors bid, the client picks one, and the work is done in person at the client's home or business.
>
> **Payments (Guideline 3.1.3(e), goods and services consumed outside the app).** Payments are for physical services performed in the real world by independent contractors, never for digital content or app features, so In-App Purchase does not apply. Payment is by Stripe Checkout (cards, Apple Pay, Google Pay) in a browser sheet. The app does not display or collect card numbers. Funds are held securely until the client confirms the work. The app never unlocks anything because of a payment.
>
> **Sign in with Apple (Guideline 4.8).** The app offers Google sign-in, and also offers **Sign in with Apple** on the same screens: the welcome (sign-in) screen and the contractor sign-up (the client sign-up form uses email and password only). Email + password is also available.
>
> **Account deletion (Guideline 5.1.1(v)).** `[SEE LAUNCH BLOCKER B1. Fill ONE of the two paragraphs below, the one that is true at submission.]`
> - *If 4.18/E3 has shipped:* Account tab, Delete account. It confirms, deletes the account, and revokes the Sign in with Apple token. Deletion is blocked while a job is active; the app says why.
> - *If not (this build today):* **Do not submit like this.** In this build Delete account opens freddyfixit.ca in a browser sheet. Apple expects deletion to be started inside the app.
>
> **Admin.** Admin tools are on the website only. An admin account signing in to the app sees a screen that points to the website.
>
> **Two-step code.** Some accounts have a two-step email code on sign-in. The demo accounts below have it off.
>
> **Contact:** `[OWNER: name, phone, email: hello@freddyfixit.ca]`

**Demo accounts (Apple requires working logins for both roles, and a way past any sign-up wall):**

| Role | Email | Password | Notes |
|---|---|---|---|
| Client | `[OWNER: create in Supabase/web, e.g. a reviewer address on freddyfixit.ca]` | `[OWNER]` | Should already have at least one request and one matched contractor so the reviewer sees real screens. |
| Contractor | `[OWNER]` | `[OWNER]` | **Already approved/vetted**, with an open job to bid on in Available. Otherwise the reviewer sees only the "waiting for approval" state. |

Rules for the owner: use real, working accounts; keep two-step off; **do not put real customers' data in them**; keep the
platform out of waitlist/paused mode on review day (PLAN 5: waitlist hides job offers); check that neither account
is flagged by the abuse/role-change rules. Test both logins on a clean phone the day before submitting.
Google Play also asks for login instructions for restricted areas ("App access"): reuse the same two accounts.

---

## 4. Store listing draft

Claims policy: only what the website says today (Home page, Freddy Verified, Protection Promise). No numbers of
users, jobs or reviews; no "guaranteed"; no "insured/insurance" about our own cover (the Promise is "not insurance");
"verified" is only ever "our review process was completed" (legal.md). No "escrow": say "held securely".
I found no literal "WHAT WE CAN CLAIM" block in the web repo; the sources below are Home.tsx copy,
the Freddy Verified checklist, ProtectionPromise.tsx and docs/legal.md.

| Field | Draft | Limit / note |
|---|---|---|
| **App name** | Freddy Fix It | Apple 30 chars. Fine. |
| **Subtitle (Apple)** | Compare local pro estimates | 27 chars (limit 30). |
| **Short description (Play, 80 max)** | Describe the job. Compare estimates from Calgary pros. Book it. | 63 chars. |
| **Promotional text (Apple, 170 max)** | Pros come to you. You pick the price. Post a job in minutes, compare estimates from local Calgary pros, and pay securely. Your payment is held until you approve. | ~160 chars: **recount in App Store Connect**. |
| **Category** | Primary: Lifestyle. Secondary: Business (pros). | **Check** Apple's current list; Play: House & Home. |
| **Keywords (Apple, 100 max)** | `handyman,plumber,electrician,Calgary,home repair,contractor,estimates,quotes,painter,renovation` | 95 chars. Do not repeat the app name. Do not use competitor names. |
| **Support URL** | `[OWNER: freddyfixit.ca page with a contact route, e.g. the site contact/help page; mailto: alone is not accepted by Apple]` | The site has no confirmed support page route in what I read: **check**. Support email: hello@freddyfixit.ca |
| **Privacy Policy URL** | https://freddyfixit.ca/privacy-policy | Same URL the app links to. |
| **Marketing URL (optional)** | https://freddyfixit.ca | |
| **Copyright** | `[OWNER: year] Freddy FixIt Contractors Inc.` | Entity name from legal.md. |

**Full description (draft; Apple 4000 / Play 4000 max):**

> Pros come to you. You pick the price.
>
> Freddy Fix It connects busy Calgarians with local tradespeople for home repairs, business needs and vehicle maintenance. Describe it. Compare it. Book it.
>
> FOR CLIENTS
> - Tell us what you need, add a photo and a few details.
> - Get estimates from local pros and compare them without making calls.
> - You approve the price and the timing.
> - Your payment is held securely until you confirm the work is done.
> - Rate your pro when you are happy.
>
> FOR CONTRACTORS
> - Sign up, upload your licence, insurance and WCB documents, and get reviewed by a real person on our team.
> - Browse open jobs in your area and send your estimate.
> - See your earnings and reviews in one place.
>
> FREDDY VERIFIED
> Before a pro can take a job, they go through our verification checklist: licence and trade certification, liability insurance, WCB coverage, references and work history, and a review by our team. A verified badge means our review process was completed. It is not a guarantee of outcome, and you always pick your own pro.
>
> HOMEOWNER PROTECTION PROMISE
> If something is not right, you can submit a claim. It is a goodwill, claims-based program offered at our discretion. It is not insurance or a warranty.
>
> Calgary and nearby towns. Canadian and family-owned.
> Questions? hello@freddyfixit.ca

Do **not** add: "5-star", "thousands of", "licensed and insured pros" (we confirm documents; we do not guarantee
cover), "guaranteed", "escrow", "instant", "24/7" (no source). Anything about push alerts, in-app chat or in-app
payment only once those are native and tested.

**Age rating (Apple questionnaire / Play IARC): suggested answers, check each against the live questionnaire**
- Intended audience: **adults, 18+** (Privacy Policy section on minors: 18+ only). Play target age: **18+**, not "children".
- Violence, sexual content, nudity, profanity, horror, gambling, alcohol/tobacco/drugs, medical info: **None**.
- User-generated content / unrestricted web access: **Yes, user-to-user content (job text, photos, reviews, chat)**, moderated by an image safety scan (`scan-image`). **Apple 1.2 expects**: a way to report content, a way to block abusive users, filtering, and published contact info. **Check** that the app and web provide report/block; **missing on web and app** (see blocker B6).
- In-app purchases: **None** (payments are for services outside the app).
- Expected Apple result: likely 4+ to 12+ depending on the UGC answer; do not pre-judge, take what the form returns. Apple may also ask about "Made for Kids": **No**.
- Play: declares **Ads: No**, **Government app: No**, **Financial features**: **check** (the app facilitates payments to contractors; Play's financial-features declaration may apply).

---

## 5. Pre-submission checklist: launch blockers and open items

**B = blocks submission or will get the app rejected. O = owner action. R = risk, decide.**

| # | Item | Why | Fixed by |
|---|---|---|---|
| **B1** | **Account deletion is not in-app.** Both roles' Account tabs open the website. Apple 5.1.1(v) expects deletion to be **initiated in the app**; a link out is a common rejection. Play also wants an account-deletion web URL. | `ClientAccountScreen` / `contractor AccountScreen` rows "Delete account on the website" | **4.18** (client + contractor in-app delete, calls the existing `delete-account` function) **after 7.4/E3** (Apple token revoke in `delete-account`; needs a new Apple key edge secret, a `check_legal.py` DECLARED entry and a PP 6.2 row for `appleid.apple.com` in the same ship) |
| **B2** | **Contractor documents are photos only; PDFs cannot be uploaded.** Insurance certificates and licences often arrive as PDFs. | Progress table, Phase 5 "Open (b)". Needs `expo-document-picker`, a native dependency, so a **new dev/store build**, and the Data safety "Files and docs" row flips to Yes. | Add `expo-document-picker` + PDF branch in `OnboardingScreen`/contractor Account (a Phase 5 follow-up step; not yet numbered in PLAN: add one) |
| **B3** | **Most of the job lifecycle still opens the website**: live jobs, payment, messages, estimates, recurring. Apple 4.2 (minimum functionality) can reject an app that mostly wraps the website, and the review notes' Stripe story is only true when payment actually works. | Progress table "Phase 4, rest" | Phase 0 **W1/W2**, then **4.5-4.12**, **E2/7.1** (`return` enum) before 4.7/4.8 payments |
| **B4** | **Owner dashboard step A1 (Supabase):** Google provider Authorized Client IDs + Skip nonce check; Apple provider enabled with client id `ca.freddyfixit.app`. Without it, **Sign in with Apple does not work for the reviewer** and the Apple 4.8 claim in section 3 is untrue. | Progress table "(waiting)" | Owner (O1) |
| **B5** | **Demo accounts for both roles** (section 3), with the contractor already approved. | Apple 2.1 | Owner (O2) |
| **B6** | **UGC safeguards (Apple 1.2):** report content, block users, contact info. **Checked 2026-11-27: MISSING on both clients.** Web has no report or block on any chat surface (JobChat, BidChat, MessagesInbox, ChatWidget) and no table or RPC for it; the only moderation is the server chat guard plus the admin's Flagged chat tab. | Section 4 age rating | **Build:** backend first (a `reports`/`blocks` table + RPCs, admin review), then web, then app (report on a message/photo, block on a thread) |
| **B7** | **Privacy Policy gaps** (see section 6): add rows before the app ships so the store forms and policy agree. Policy changes need the **UA 14-day notice (section 12)** before taking effect. | PP 6.2 | Web repo: PP edit + `check_legal.py`; owner sends notice |
| **B8** | **Tested end to end:** both roles on one real job, plus `freddy-money-test` against a real Checkout started from the app. | PLAN 7.5 | **7.5** (needs the store developer accounts) |
| **B9** | **`min_app_version` / `app_config()` update gate** so old builds can be forced to update after a breaking backend change. | PLAN 6.6, D3 | **7.2** |
| O1 | Supabase A1 (above). | | Owner |
| O2 | Create + test the two demo accounts. | | Owner |
| O3 | **D-U-N-S number**, then Apple Organization and Play organization accounts under the legal entity, with a role inbox (hello@freddyfixit.ca). Longest lead time. | PLAN Phase 7 owner row | Owner, start now |
| O4 | Register the `freddyfixit.ca` mail domain for **Apple "Sign in with Apple for Email Communication"** and check SPF/DKIM, or mail to private-relay addresses is dropped. | PLAN 4.3 | Owner |
| O5 | **Web: `apple-app-site-association` and `assetlinks.json`** (W3c) and the `/auth/confirm` route (W3a), then the email templates (W3b). `app.config.ts` already claims `applinks:freddyfixit.ca` and `/auth/confirm`; the files must exist on the site and match the signing keys. Until then, emailed links open the website. | PLAN 4.4 | **W3a/b/c** |
| O6 | App icon / splash: the icon PR (#3) was "waiting for the owner to merge" per the Progress table. **Check** it merged; confirm the store icon is 1024x1024, no transparency (Apple). | PLAN Progress | Owner |
| O7 | Support URL page and a **public account-deletion page** (section 2). | | Owner / web |
| O8 | EAS submit credentials, bundle id `ca.freddyfixit.app` / package `ca.freddyfixit.app` already set. **Export compliance:** `ITSAppUsesNonExemptEncryption` is not set in `app.json`/`app.config.ts`; the app uses only standard HTTPS plus AES for its session store: **check** the current Apple export-compliance answer and set the key to avoid the prompt on every build. | `app.json` | Owner / build |
| R1 | **Contractor "onboarded" test is client-side**: `ensure_profile(contractor)` creates a bare row, so a half-finished onboarding is treated as done. Could let a reviewer or user land in a half-built state. | Progress table "Open (a)" | Needs a server-side onboarded predicate (web) |
| R2 | **Alberta prepaid-contracting licensing is open** (not resolvable by wording): contractors, and possibly the platform, may need Service Alberta licences. This is a business risk to settle before publicity, not a store requirement. | legal.md "STILL OPEN" | Lawyer + Service Alberta |
| R3 | **Phase 6 push** changes the forms (Device ID), the Privacy Policy (an Expo row, with Apple and Google as push transit; PLAN section 5 "Legal") and needs the permission-timing UX. If push ships in the first release, redo sections 1 and 2 first. | PLAN 5 | **6.1-6.4** |
| R4 | SMS: the Privacy Policy already names Twilio (effective 2026-12-03); the app has no SMS UI. Nothing to declare for the app until the opt-in toggle (4.17b). | PLAN 5a | n/a |
| R5 | Reviewer day: confirm platform is **not** in waitlist/paused mode, or the reviewer sees an empty marketplace (waitlist screen exists in `request/Waitlist.tsx`). | PLAN 5 | Owner |

---

## 6. Privacy Policy section 6.2 vs. what the app does

The store forms must match PP 6.2. Current 6.2 providers: Supabase, Vercel, Resend, Stripe, Google (analytics, "Sign in with Google", fonts), PostHog, Anthropic, Cloudflare, Komoot (Photon), Have I Been Pwned, Unsplash, Twilio.

| Topic | Policy says | App does | Action |
|---|---|---|---|
| **Sign in with Apple** | No row for Apple. Google's row covers "Sign in with Google" only. | App offers Sign in with Apple (`expo-apple-authentication`); Apple receives the sign-in and returns name/email, and (after 4.5/E3) `appleid.apple.com` token exchange/revoke. | **Add an Apple Inc. row** (authentication; account deletion revoke) in the web PP and `check_legal.py` before submission |
| **Google row says "optional Sign in with Google"** | Web wording | App uses the native Google SDK; same provider, purpose holds. | None, but the row could say "web and mobile app" |
| **Expo / push** | No Expo, Apple push or Google FCM row. | Not yet: no push code. Planned (Phase 6). | Add rows **in the same ship as 6.2**, as PLAN section 5 says |
| **Google Fonts, Google Analytics, PostHog, Unsplash, Komoot Photon, Cloudflare** | Listed. | The **app** uses none of these natively (bundled fonts, no analytics, no address lookup, no stock photos, no location). Only the website pages shown in the in-app browser do. | None. The forms say No analytics for the app; consistent with PLAN section 9. If 8.1 is built, update both. |
| **Anthropic** | Photo scanning, contractor documents incl. **government photo ID** | App triggers both (`scan-image` after each upload; `review-contractor` after contractor signup). Because of the ID mention, the label's Photos / Other User Content rows include documents. | Matches. Keep "advisory only" true. |
| **"Use my current location" (PP 3.2)** | Describes device location on the web | **App has no location feature.** | Not a mismatch (the policy covers the web), but the store forms correctly say Location: No. If a location feature is added to the app, the forms change. |
| **Right to delete "through your account settings" (PP section on rights)** | Implies self-service deletion | In the app today it opens the website (B1). | Resolved when 4.18 ships. |
| **Retention** | Account/profile up to 3 years after deletion; job media with transaction records up to 7 years; profile media best-effort 90 days | Server behaviour; app adds nothing | Copy these periods into the Play deletion answers (section 2) |
| **Mobile app mention** | I did not find the policy naming the mobile app or app-specific data (push token, device) | | **Check** with the owner/lawyer; add a sentence when the app launches |
| **Data location** | United States for Supabase etc. (PP section 7 lists countries) | Same backend | Matches |
| **Two entity names flagged unverified in legal.md** (Pwned Passwords operator, Unsplash corporate name) | | Not used by the app | Not store-relevant |

---

## 7. Screenshots

Sizes change often. For both stores: **check the current requirement in App Store Connect / Play Console** (the
required device classes, pixel sizes, count, and whether one size can scale to others), and the Play feature graphic
and app icon requirements. The app is **portrait, iPhone only** (`supportsTablet: false`), so iPad screenshots should
not be needed: **check**. Take screenshots from a real build or simulator at the size the console asks for, with the
demo accounts, using no real customer data, with no test banners or dev menus visible.

Capture (show the real app, light or dark but be consistent; follow the claims policy above):

**Client**
1. Welcome / sign-in (shows Google + Apple + email).
2. New request: describe the job + photo.
3. Requests tab with an open request and estimates waiting.
4. My Pros.
5. Account (profile, two-step, appearance).
6. (After 4.7/4.8) a job with payment held securely. **Do not capture screens that are website handoffs.**

**Contractor**
1. Contractor sign-up / onboarding steps and the documents step.
2. Available jobs and a bid.
3. Jobs tab.
4. Earnings (only if it shows demo data, never real payouts).
5. Public pro profile (`/pro/[id]`).
6. Account: profile/portfolio/availability.

Per-store extras: Apple optional app preview video; Play needs a feature graphic and (check) phone screenshots, and
possibly tablet shots if the console asks. Do not use a screenshot showing a placeholder role home
(`PlaceholderHome`) or a "coming soon" handoff.

---

## 8. Judgement calls made in this draft

- Payment info answered **No** with a "check" flag, because Stripe's hosted page, not the app, takes the card.
- Government photo ID has no Apple type, so it sits under Photos and Other User Content.
- Device ID and Usage Data are **No today** and flagged to flip with push (6) and PostHog (8.1).
- Categories, age-rating answers and keywords are suggestions: the consoles' current forms win.
- "WHAT WE CAN CLAIM" was not found as a literal heading; claims come from the site copy listed in section 4.
