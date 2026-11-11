// Minimales Übersetzungssystem.
// Neue Sprache hinzufügen:
//   1. src/lib/i18n/de.ts nach z. B. en.ts kopieren und die Texte übersetzen
//   2. unten in `dictionaries` und `LOCALES` eintragen
import { derived, writable } from 'svelte/store';
import de from './de';

export type MessageKey = keyof typeof de;
type Dictionary = Partial<Record<MessageKey, string>>;

const dictionaries: Record<string, Dictionary> = {
  de,
};

export const LOCALES: { code: string; label: string }[] = [{ code: 'de', label: 'Deutsch' }];

const STORAGE_KEY = 'gewoelbentisch.locale';

function initialLocale(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && dictionaries[saved]) return saved;
  } catch {
    /* kein Speicher verfügbar */
  }
  const browser = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'de';
  return dictionaries[browser] ? browser : 'de';
}

export const locale = writable(initialLocale());

locale.subscribe((l) => {
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* ignorieren */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
});

/** Verwendung in Komponenten: {$t('action.save')} */
export const t = derived(locale, (l) => (key: MessageKey, vars?: Record<string, string | number>): string => {
  let text: string = dictionaries[l]?.[key] ?? de[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
});
