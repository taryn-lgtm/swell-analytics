"use client";

import { useEffect, useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, type ThemeChoice } from "@/lib/theme";

/**
 * Light / system / dark (DESIGN_BRIEF F10). The dark tokens already existed
 * under [data-theme="dark"]; this only chooses which set <html> carries.
 *
 * The first paint is set by THEME_INIT_SCRIPT in the root layout, so this
 * component never decides the initial theme -- it reads the stored choice,
 * writes a new one, and follows the device while the choice is "system".
 *
 * Two renderings of one control. From 640px up: a three-segment switch, the
 * selected segment raised and outlined, so the state is not carried by fill
 * alone. Below 640px there is no room for three targets beside the nav, so a
 * single button shows the current choice and cycles to the next, and its
 * label says both.
 */

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
];

const CHANGE_EVENT = "themechoice";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readChoice(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function systemIsDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

function apply(choice: ThemeChoice) {
  const resolved = choice === "system" ? (systemIsDark() ? "dark" : "light") : choice;
  document.documentElement.dataset.theme = resolved;
}

function writeChoice(choice: ThemeChoice) {
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  apply(choice);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange); // another tab changed it
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export default function ThemeToggle() {
  // The server cannot know the stored choice; it renders "system" and the
  // client corrects it after hydration without a mismatch warning.
  const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as ThemeChoice);

  // While following the system, follow it live; a storage event from another
  // tab also needs applying here, since only the writing tab called apply().
  useEffect(() => {
    apply(choice);
    if (choice !== "system") return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(DARK_QUERY);
    } catch {
      return;
    }
    const onSystem = () => apply("system");
    mql.addEventListener("change", onSystem);
    return () => mql.removeEventListener("change", onSystem);
  }, [choice]);

  const index = CHOICES.findIndex((c) => c.value === choice);
  const next = CHOICES[(index + 1) % CHOICES.length];
  const current = CHOICES[index];

  return (
    <>
      <div role="radiogroup" aria-label="Colour theme" className="hidden border border-chrome-hairline sm:flex">
        {CHOICES.map((c) => {
          const on = c.value === choice;
          return (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${c.label} theme`}
              title={`${c.label} theme`}
              onClick={() => writeChoice(c.value)}
              className={`-m-px flex h-8 w-8 items-center justify-center border transition-colors ${
                on
                  ? "z-10 border-chrome-fg-muted bg-chrome-hairline text-chrome-fg"
                  : "border-transparent text-chrome-fg-muted hover:text-chrome-fg"
              }`}
            >
              <ThemeIcon choice={c.value} />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => writeChoice(next.value)}
        aria-label={`Theme: ${current.label}. Switch to ${next.label.toLowerCase()}`}
        title={`Theme: ${current.label}`}
        className="flex h-11 w-9 items-center justify-center text-chrome-fg-muted transition-colors hover:text-chrome-fg sm:hidden"
      >
        <ThemeIcon choice={choice} />
      </button>
    </>
  );
}

function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  const common = {
    viewBox: "0 0 16 16",
    width: 16,
    height: 16,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "square" as const,
    "aria-hidden": true,
  };
  if (choice === "light") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
      </svg>
    );
  }
  if (choice === "dark") {
    return (
      <svg {...common}>
        <path d="M13.5 9.6A5.75 5.75 0 0 1 6.4 2.5a5.75 5.75 0 1 0 7.1 7.1Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="1.75" y="2.75" width="12.5" height="8.5" />
      <path d="M5.5 14h5M8 11.25V14" />
    </svg>
  );
}
