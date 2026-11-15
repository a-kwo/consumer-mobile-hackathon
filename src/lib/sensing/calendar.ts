/**
 * Reads the device calendar for the next occasion. Event titles are classified
 * here, on the phone, and dropped: what leaves this file is an occasion id and
 * the event's start and end, nothing else.
 *
 * Facts this relies on, from the SDK 58 docs and the installed package source:
 * - `expo-calendar` has no web implementation and is not in Expo Go; its native
 *   module is looked up when the package is first imported, so it is imported
 *   lazily and a build without it reads as "unavailable".
 * - `requestCalendarPermissions()` shows the system prompt the first time and
 *   `getCalendarPermissions()` never does.
 * - `getCalendars(EntityTypes.EVENT)` needs calendar access only; without the
 *   entity type iOS also wants reminders access.
 * - `listEvents(calendars, start, end)` returns the events overlapping the
 *   range, recurring ones expanded, with `startDate` and `endDate` as ISO strings.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { type CalendarEvent, type OccasionEvent, occasionEventsFrom } from '../../../convex/lib/occasion';
import { TUNING } from '../../../convex/tuning';
import { CONFIG } from '../score/config';
import type { CalendarAccess } from '../score/types';

const MINUTE_MS = 60 * 1000;

async function loadModule(): Promise<typeof import('expo-calendar') | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await import('expo-calendar');
  } catch {
    return null;
  }
}

/** The calendar permission as it stands, asking the user first when `ask` is set. Never rejects. */
export async function calendarAccess(ask: boolean): Promise<CalendarAccess> {
  const Calendar = await loadModule();
  if (!Calendar) return 'unavailable';
  try {
    const response = ask
      ? await Calendar.requestCalendarPermissions()
      : await Calendar.getCalendarPermissions();
    if (response.granted) return 'granted';
    return response.status === 'denied' ? 'denied' : 'unknown';
  } catch {
    return 'unavailable';
  }
}

const toMs = (value: string | Date | null | undefined) => (value ? new Date(value).getTime() : NaN);

/**
 * The recognised events that are running at `nowMs` or start within the lead
 * window, as occasion ids and times. Rejects when the calendar cannot be read.
 */
export async function readOccasionEvents(nowMs: number): Promise<OccasionEvent[]> {
  const Calendar = await loadModule();
  if (!Calendar) return [];
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  if (calendars.length === 0) return [];
  const { leadMinutes, maxEventMinutes } = TUNING.occasion;
  const events = await Calendar.listEvents(
    calendars,
    new Date(nowMs - maxEventMinutes * MINUTE_MS),
    new Date(nowMs + leadMinutes * MINUTE_MS),
  );
  const read: CalendarEvent[] = [];
  for (const event of events) {
    if (event.status === Calendar.EventStatus.CANCELED) continue;
    read.push({
      title: typeof event.title === 'string' ? event.title : '',
      startMs: toMs(event.startDate),
      endMs: toMs(event.endDate),
      allDay: event.allDay === true,
    });
  }
  return occasionEventsFrom(read);
}

/** Whether the user turned calendar reading on. Never rejects. */
export async function loadCalendarEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CONFIG.sensing.calendarStorageKey)) === '1';
  } catch {
    return false;
  }
}

export async function storeCalendarEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) await AsyncStorage.setItem(CONFIG.sensing.calendarStorageKey, '1');
    else await AsyncStorage.removeItem(CONFIG.sensing.calendarStorageKey);
  } catch {
    // Kept in memory for this launch.
  }
}
