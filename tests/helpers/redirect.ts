/** Shared mock for next/navigation's redirect(), used across every server
 * action test. Real Next.js has redirect() throw a special NEXT_REDIRECT
 * error caught by the framework; we mirror that by throwing a signal class
 * carrying the target URL, so tests can assert on it with captureRedirect(). */
export class RedirectSignal extends Error {
  constructor(public readonly url: string) {
    super(`REDIRECT:${url}`);
  }
}

export function redirectMock(url: string): never {
  throw new RedirectSignal(url);
}

/** Runs an action expected to redirect and returns the target URL. Throws if
 * the action returns normally instead of redirecting, or throws anything
 * other than the redirect signal. */
export async function captureRedirect(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof RedirectSignal) return error.url;
    throw error;
  }
  throw new Error("Expected the action to redirect, but it returned normally.");
}
