/**
 * Formularvalidierung ohne Bibliothek (Konzept 3.1). Verständliche Meldungen im Muster
 * „Was ist passiert → Was jetzt tun“. Rückgabe: Feldname → Meldung, leer = gültig.
 */

export const PASSWORD_MIN_LENGTH = 8;

// Bewusst einfache Prüfung: etwas@etwas.tld — kein RFC-Anspruch, keine Zustellprüfung.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type LoginFields = "email" | "password";
export type RegisterFields = "displayName" | "email" | "password" | "passwordConfirm" | "acceptTerms";

export function validateEmail(email: string): string | undefined {
  const value = email.trim();
  if (!value) return "Bitte gib eine E-Mail-Adresse ein.";
  if (!EMAIL_RE.test(value)) return "Das sieht nicht wie eine E-Mail-Adresse aus. Bitte prüfe das Format, zum Beispiel name@beispiel.de.";
  return undefined;
}

export function validatePassword(password: string): string | undefined {
  if (!password) return "Bitte gib ein Passwort ein.";
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Das Passwort ist zu kurz. Bitte verwende mindestens ${PASSWORD_MIN_LENGTH} Zeichen.`;
  return undefined;
}

export function validateDisplayName(name: string): string | undefined {
  const value = name.trim();
  if (!value) return "Bitte gib einen Anzeigenamen ein.";
  if (value.length < 2) return "Der Anzeigename ist zu kurz. Bitte verwende mindestens 2 Zeichen.";
  if (value.length > 32) return "Der Anzeigename ist zu lang. Bitte verwende höchstens 32 Zeichen.";
  return undefined;
}

export function validateLogin(input: { email: string; password: string }): FieldErrors<LoginFields> {
  const errors: FieldErrors<LoginFields> = {};
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  const password = validatePassword(input.password);
  if (password) errors.password = password;
  return errors;
}

export function validateRegister(input: {
  displayName: string;
  email: string;
  password: string;
  passwordConfirm: string;
  acceptTerms: boolean;
}): FieldErrors<RegisterFields> {
  const errors: FieldErrors<RegisterFields> = {};
  const name = validateDisplayName(input.displayName);
  if (name) errors.displayName = name;
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  const password = validatePassword(input.password);
  if (password) errors.password = password;
  if (!input.passwordConfirm) errors.passwordConfirm = "Bitte wiederhole das Passwort.";
  else if (input.password !== input.passwordConfirm)
    errors.passwordConfirm = "Die Passwörter stimmen nicht überein. Bitte gib beide identisch ein.";
  if (!input.acceptTerms) errors.acceptTerms = "Bitte stimme den Nutzungsbedingungen zu, um fortzufahren.";
  return errors;
}

/** Erstes fehlerhaftes Feld in Formularreihenfolge — dorthin wandert der Fokus. */
export function firstErrorField<K extends string>(order: readonly K[], errors: FieldErrors<K>): K | undefined {
  return order.find((k) => Boolean(errors[k]));
}
