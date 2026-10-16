/**
 * Theme choice, shared by the no-flash script in the root layout and by
 * ThemeToggle. Not a client module on purpose: the layout is a server
 * component and needs the script as a string, not as a client reference.
 *
 * "system" is the default and is never stored -- choosing it removes the key,
 * so a reader who never touches the toggle follows their device.
 */

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "theme";

/**
 * Runs in <head> before first paint. Resolves the stored choice (or the
 * system preference) to data-theme="light" | "dark" on <html>. Every storage
 * and media call is guarded: a blocked localStorage falls through to the
 * system preference, and a failure there leaves the light default.
 */
export const THEME_INIT_SCRIPT = `(function(){var t=null;try{t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})}catch(e){}if(t!=="light"&&t!=="dark"){try{t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){t="light"}}document.documentElement.dataset.theme=t})();`;
