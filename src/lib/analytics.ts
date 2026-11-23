// NATIVE OVERRIDE of web src/lib/analytics.ts: an intentional SUBSET (no synced file
// imports analytics). Consent, GA/PostHog ids and campaign capture arrive with
// PostHog in step 8.1. Owner decision 2026-11-22:
// no analytics in the app at launch. These are no-ops with the web's names, so
// feature code can call trackEvent() today and PostHog-with-consent can be
// dropped in later (PLAN.md step 8.1) without touching any caller.
export const analyticsEnabled = (): boolean => false;
export function initAnalytics(): void {}
export function trackPageView(_path: string): void {}
export function trackEvent(_name: string, _params: Record<string, unknown> = {}): void {}
