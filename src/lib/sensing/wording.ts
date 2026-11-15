/** The short findings the setup sequence shows for each signal. Pure. */
import { occasionLabel } from '../../../convex/lib/occasion';
import { timeOfDayFor } from '../../../convex/lib/scene';
import type { Occasion, Weather } from '../../../convex/lib/validators';
import { TUNING } from '../../../convex/tuning';

const WEATHER_WORD: Record<Weather, string> = {
  any: 'Hard to say',
  clear: 'Clear skies',
  cloudy: 'Overcast',
  fog: 'Fog',
  rain: 'Rain',
  snow: 'Snow',
  storm: 'A storm',
};

/** "Rain, 12°", "Clear skies". */
export function describeWeather(weather: Weather, temperatureC: number | null): string {
  const word = WEATHER_WORD[weather];
  return temperatureC === null ? word : `${word}, ${Math.round(temperatureC)}°`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Tuesday evening, 6:42pm" for a weekday index and a float hour. */
export function describeTime(day: number, localHour: number): string {
  const hour = ((localHour % 24) + 24) % 24;
  let h = Math.floor(hour);
  let m = Math.round((hour - h) * 60);
  if (m === 60) {
    m = 0;
    h = (h + 1) % 24;
  }
  const suffix = h >= 12 ? 'pm' : 'am';
  const clock = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}${suffix}`;
  return `${DAYS[((day % 7) + 7) % 7]} ${timeOfDayFor(hour)}, ${clock}`;
}

/** "Date in 40 min", "Workout underway", or the line for an empty calendar. */
export function describeOccasion(occasion: { id: Occasion; minutesUntil: number } | null): string {
  if (!occasion) return 'Nothing coming up';
  const minutes = Math.round(occasion.minutesUntil);
  const label = occasionLabel(occasion.id);
  return minutes <= 0 ? `${label} underway` : `${label} in ${minutes} min`;
}

/** "A steady walk, 104 steps/min", "Standing still". */
export function describePace(cadenceSpm: number): string {
  const spm = Math.round(cadenceSpm);
  const { paceMinSpm } = TUNING;
  if (spm < paceMinSpm.stroll) return 'Standing still';
  const kind =
    spm < paceMinSpm.walk
      ? 'A slow stroll'
      : spm < paceMinSpm.brisk
        ? 'A steady walk'
        : spm < paceMinSpm.run
          ? 'A brisk walk'
          : 'A run';
  return `${kind}, ${spm} steps/min`;
}
