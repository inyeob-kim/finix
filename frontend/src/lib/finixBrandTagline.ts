export const FINIX_TAGLINE_INTRO_SESSION_KEY = "finix.brand-tagline.intro";

export function clearFinixTaglineIntroSession(): void {
  try {
    sessionStorage.removeItem(FINIX_TAGLINE_INTRO_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function markFinixTaglineIntroPlayed(): void {
  try {
    sessionStorage.setItem(FINIX_TAGLINE_INTRO_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function hasFinixTaglineIntroPlayed(): boolean {
  try {
    return sessionStorage.getItem(FINIX_TAGLINE_INTRO_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}
