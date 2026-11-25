// Hand a step the app can't do yet to the website, in the in-app browser sheet.
// Same pattern Phase 3 uses for "Forgot password?" until W3 lands: an honest way
// forward, never a dead button. Each caller names the step that will replace it.
import * as WebBrowser from "expo-web-browser";
import { notify } from "@/kit";

export const WEB = "https://freddyfixit.ca";

export function openOnWeb(path: string) {
  WebBrowser.openBrowserAsync(WEB + path).catch(() => notify("Couldn't open the website. Check your connection and try again.", "danger"));
}
