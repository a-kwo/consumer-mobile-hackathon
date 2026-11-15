import { useMutation } from 'convex/react';
import { useState } from 'react';

import { haptics, type NoticeTone } from '@/components/ui';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { Visibility } from '../../../convex/lib/validators';
import { TUNING } from '../../../convex/tuning';
import { addDays, dayKey } from './format';
import { pickPhoto } from './pick-photo';
import { uploadJpeg } from './upload';

export type EditNotice = { tone: NoticeTone; title: string; message: string };

export type OstEditing = {
  /** What is in flight, so its control can show it. */
  busy: 'photo' | 'details' | null;
  /** The last thing that went wrong, as a sentence for the user. */
  notice: EditNotice | null;
  dismissNotice(): void;
  /** Opens the photo picker, uploads the choice and adds it to the day. `photoCount` is how many it has now. */
  addPhoto(photoCount: number): Promise<void>;
  removePhoto(photoId: Id<'photos'>): Promise<void>;
  /** An empty title goes back to the date. Resolves true when it was saved. */
  rename(title: string): Promise<boolean>;
  setVisibility(visibility: Visibility): Promise<void>;
  setHideLocations(hideLocations: boolean): Promise<void>;
};

const REFUSED: Record<'not_image' | 'too_large' | 'too_many', string> = {
  not_image: 'That file is not a picture.',
  too_large: 'That picture is too large, even after resizing.',
  too_many: `A soundtrack holds ${TUNING.share.maxPhotosPerOst} photos. Remove one to add another.`,
};

/**
 * The edits a person can make to one of their own days: photos, the title,
 * who sees it. Every call here starts from a tap and never throws; a failure
 * (no connection, or a backend that does not have these functions yet)
 * becomes `notice` and leaves the screen as it was.
 */
export function useOstEditing(deviceId: string | null, dayStart: number): OstEditing {
  const update = useMutation(api.ost.update);
  const uploadUrl = useMutation(api.photos.uploadUrl);
  const attach = useMutation(api.photos.attach);
  const remove = useMutation(api.photos.remove);
  const [busy, setBusy] = useState<OstEditing['busy']>(null);
  const [notice, setNotice] = useState<EditNotice | null>(null);

  const dayEnd = addDays(dayStart, 1);
  const day = { date: dayKey(dayStart), dayStart, dayEnd };

  const fail = (title: string, message: string) => {
    haptics.error();
    setNotice({ tone: 'error', title, message });
  };

  const saveDetails = async (patch: { title?: string; visibility?: Visibility; hideLocations?: boolean }) => {
    if (!deviceId || busy) return false;
    setNotice(null);
    setBusy('details');
    try {
      await update({ deviceId, ...day, ...patch });
      return true;
    } catch {
      fail('Not saved', 'The soundtrack could not be updated. Try again in a moment.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  return {
    busy,
    notice,
    dismissNotice: () => setNotice(null),

    addPhoto: async (photoCount) => {
      if (!deviceId || busy) return;
      if (photoCount >= TUNING.share.maxPhotosPerOst) {
        haptics.warning();
        setNotice({ tone: 'warning', title: 'The reel is full', message: REFUSED.too_many });
        return;
      }
      setNotice(null);
      setBusy('photo');
      try {
        const picked = await pickPhoto();
        if (!picked) return;
        const storageId = await uploadJpeg(await uploadUrl({ deviceId }), picked.uri);
        // A photo from this day lands on the cue it was taken during; anything
        // else (an older picture, or no camera time at all) counts as taken now.
        const now = Date.now();
        const takenAt =
          picked.takenAt !== null && picked.takenAt >= dayStart && picked.takenAt < dayEnd && picked.takenAt <= now
            ? picked.takenAt
            : now;
        const result = await attach({ deviceId, ...day, storageId: storageId as Id<'_storage'>, takenAt });
        if (result.ok) haptics.success();
        else fail('Photo not added', REFUSED[result.reason]);
      } catch {
        fail('Photo not added', 'The photo could not be added to this soundtrack. Try again in a moment.');
      } finally {
        setBusy(null);
      }
    },

    removePhoto: async (photoId) => {
      if (!deviceId || busy) return;
      setNotice(null);
      setBusy('photo');
      try {
        await remove({ deviceId, photoId });
      } catch {
        fail('Photo not removed', 'The photo is still on this soundtrack. Try again in a moment.');
      } finally {
        setBusy(null);
      }
    },

    rename: (title) => saveDetails({ title }),
    setVisibility: async (visibility) => {
      await saveDetails({ visibility });
    },
    setHideLocations: async (hideLocations) => {
      await saveDetails({ hideLocations });
    },
  };
}
