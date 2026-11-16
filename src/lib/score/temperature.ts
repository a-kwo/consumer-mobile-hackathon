/**
 * Temperatures for display. The engine and the backend work in Celsius; this
 * only decides what the user reads.
 */
import { Platform } from 'react-native';

export type DisplayTemperature = { value: number; unit: 'F' | 'C' };

/** The device's locale tag, e.g. "en-US"; empty when the platform will not say. */
function deviceLocale(): string {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.language) {
      return navigator.language;
    }
    return Intl.DateTimeFormat().resolvedOptions().locale ?? '';
  } catch {
    return '';
  }
}

/** True when the locale's region is the United States ("en-US", "es_US", "en-Latn-US"). */
export function usesFahrenheit(locale: string): boolean {
  const parts = locale.split(/[-_]/);
  return parts.slice(1).some((part) => part.toUpperCase() === 'US');
}

/**
 * A Celsius temperature as the user expects to read it: whole degrees
 * Fahrenheit where the device's region is the United States, whole degrees
 * Celsius everywhere else. `locale` is for tests; it defaults to the device's.
 */
export function formatTemperature(celsius: number, locale: string = deviceLocale()): DisplayTemperature {
  if (usesFahrenheit(locale)) return { value: Math.round((celsius * 9) / 5 + 32), unit: 'F' };
  return { value: Math.round(celsius), unit: 'C' };
}
