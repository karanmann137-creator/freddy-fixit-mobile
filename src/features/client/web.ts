// Hand a step the app can't do yet to the website, in the in-app browser sheet.
// Same pattern Phase 3 uses for "Forgot password?" until W3 lands: an honest way
// forward, never a dead button. Each caller names the step that will replace it.
import * as WebBrowser from "expo-web-browser";
import { notify } from "@/kit";

export const WEB = "https://freddyfixit.ca";

/** Resolves when the browser sheet closes, so a caller can re-read what the website may have changed. */
export function openOnWeb(path: string): Promise<void> {
  return WebBrowser.openBrowserAsync(WEB + path)
    .then(() => undefined)
    .catch(() => notify("Couldn't open the website. Check your connection and try again.", "danger"));
}

/** The website's dashboard with this job's request selected (web reads ?job= and selects its request). */
export const webJobPath = (jobId: string) => "/client-dashboard?tab=requests&job=" + encodeURIComponent(jobId);
