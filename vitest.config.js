import { defineConfig } from 'vitest/config';

// Floating .ics times and Sessionize's offset-less timestamps are read in the device's zone,
// so pin the zone the unit tests run in. Workers inherit this from the parent process.
process.env.TZ = 'UTC';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.js'],
  },
});
