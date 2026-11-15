import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();

// Each seeded friend gets at most one new play an hour, and plays older than
// three days are pruned. Does nothing while the song library is empty.
crons.hourly('grow seeded friends', { minuteUTC: 7 }, internal.seed.friends, {});

export default crons;
