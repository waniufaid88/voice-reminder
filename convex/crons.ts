import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Periodic safety check to catch any reminders that became due
crons.interval(
  "check-due-reminders",
  { minutes: 1 },
  internal.notifications.checkDueReminders
);

export default crons;
