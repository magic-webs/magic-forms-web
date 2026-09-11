import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Drop expired sessions and webhook delivery logs older than two weeks.
crons.interval(
  "prune expired records",
  { hours: 6 },
  internal.cleanup.pruneExpired,
  {},
);

export default crons;
