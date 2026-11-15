/**
 * Identity: the device id and the profile that belongs to it.
 *
 * On launch the id is loaded (or created), `profiles.ensure` makes sure a
 * profile exists, and a subscription to `profiles.get` keeps it fresh.
 */
import type { Profile } from '../../../convex/lib/validators';
import { TimerBag } from '../score/async';
import { CONFIG, MESSAGES } from '../score/config';
import { Store } from '../score/store';
import type { Backend, IdentitySnapshot, ProfilePatch } from '../score/types';

export type IdentityDeps = {
  loadDeviceId: () => Promise<string>;
};

function sameProfile(a: Profile | null, b: Profile): boolean {
  return (
    a !== null &&
    a.deviceId === b.deviceId &&
    a.displayName === b.displayName &&
    a.avatarEmoji === b.avatarEmoji
  );
}

export class IdentityController {
  readonly store = new Store<IdentitySnapshot>({ deviceId: null, profile: null });

  private backend: Backend | null = null;
  private mounted = false;
  private ready: Promise<string> | null = null;
  private unwatch: (() => void) | null = null;
  private syncEpoch = 0;
  private readonly timers = new TimerBag();

  constructor(private readonly deps: IdentityDeps) {}

  readonly getDeviceId = (): string | null => this.store.get().deviceId;

  /** Resolves with the device id once it has been loaded or created. Never rejects. */
  readonly whenReady = (): Promise<string> => {
    if (!this.ready) {
      this.ready = this.deps.loadDeviceId().then((deviceId) => {
        this.store.patch({ deviceId });
        return deviceId;
      });
    }
    return this.ready;
  };

  /**
   * Changes the display name or the avatar. Rejects with a readable message
   * when the change could not be saved.
   */
  readonly update = async (patch: ProfilePatch): Promise<void> => {
    const deviceId = await this.whenReady();
    const backend = this.backend;
    if (!backend) throw new Error(MESSAGES.profileUnavailable);
    const args: { deviceId: string } & ProfilePatch = { deviceId };
    if (patch.displayName !== undefined) args.displayName = patch.displayName;
    if (patch.avatarEmoji !== undefined) args.avatarEmoji = patch.avatarEmoji;
    let profile: Profile;
    try {
      profile = await backend.updateProfile(args);
    } catch {
      throw new Error(MESSAGES.profileUnavailable);
    }
    this.setProfile(profile);
  };

  setBackend(backend: Backend | null): void {
    if (backend === this.backend) return;
    this.backend = backend;
    this.sync();
  }

  mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    void this.whenReady().then(() => this.sync());
  }

  unmount(): void {
    this.mounted = false;
    this.stopSync();
  }

  // ---------------------------------------------------------------- internals

  private setProfile(profile: Profile): void {
    if (!sameProfile(this.store.get().profile, profile)) this.store.patch({ profile });
  }

  private stopSync(): void {
    this.syncEpoch += 1;
    this.timers.clear();
    this.unwatch?.();
    this.unwatch = null;
  }

  /** (Re)starts the profile subscription and makes sure the profile exists. */
  private sync(): void {
    this.stopSync();
    const backend = this.backend;
    const deviceId = this.getDeviceId();
    if (!this.mounted || !backend || !deviceId) return;
    const epoch = this.syncEpoch;

    try {
      this.unwatch = backend.watchProfile(deviceId, (profile) => {
        if (epoch === this.syncEpoch && profile) this.setProfile(profile);
      });
    } catch {
      this.unwatch = null;
    }
    void this.ensure(backend, deviceId, epoch);
  }

  private async ensure(backend: Backend, deviceId: string, epoch: number): Promise<void> {
    const delays = CONFIG.identity.ensureRetryMs;
    for (let attempt = 0; ; attempt++) {
      try {
        const profile = await backend.ensureProfile({ deviceId });
        // The subscription is the source of truth; this only fills the gap before it reports.
        if (epoch === this.syncEpoch && this.store.get().profile === null) this.setProfile(profile);
        return;
      } catch {
        if (epoch !== this.syncEpoch || attempt >= delays.length) return;
      }
      await this.timers.sleep(delays[attempt]);
      if (epoch !== this.syncEpoch) return;
    }
  }
}
