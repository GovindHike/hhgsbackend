/**
 * Migration: Fix attendance records saved while the server ran in UTC
 * instead of Asia/Kolkata (IST = UTC+5:30).
 *
 * Affected records have:
 *  - Auto-checkout sessions where checkOut = shift endTime treated as UTC
 *    (e.g. "19:30 UTC" instead of "19:30 IST = 14:00 UTC") — 5h30m too late.
 *  - Auto-created system lunch-break sessions at wrong IST times
 *    (e.g. 13:30 UTC = 19:00 IST instead of 08:00 UTC = 13:30 IST).
 *
 * What this script does per affected record:
 *  1. Shifts auto-checkout session.checkOut back by 5h30m (UTC→IST correction).
 *  2. Removes all isSystemLunchBreak sessions (they were placed at wrong times).
 *  3. Re-applies applyLunchBreakPolicy so correct lunch gap is detected.
 *  4. Recomputes totalHours / varianceHours / totalLunchMinutes.
 *
 * Run once:
 *   node src/jobs/migrateTimezone.js
 */

import dayjs from "dayjs";
import { connectDatabase } from "../config/database.js";
import { Attendance } from "../models/Attendance.js";
import {
  applyLunchBreakPolicy,
  computeAttendanceSummary,
} from "../utils/attendance.js";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5h30m in milliseconds

/**
 * Returns true when a Date looks like a raw shift-time string treated as UTC:
 * seconds and milliseconds are both zero, and the HH:mm of the UTC timestamp
 * matches the shiftSnapshot endTime exactly.
 */
const looksLikeBrokenAutoCheckout = (checkOutDate, endTime) => {
  if (!checkOutDate || !endTime) return false;
  const d = new Date(checkOutDate);
  if (d.getUTCSeconds() !== 0 || d.getUTCMilliseconds() !== 0) return false;
  const utcHHMM = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return utcHHMM === endTime;
};

const run = async () => {
  await connectDatabase();
  console.log("Connected to database.");

  // Find all records that have at least one auto-checkout session
  const records = await Attendance.find({ "sessions.autoCheckoutApplied": true });
  console.log(`Found ${records.length} attendance record(s) with auto-checkout sessions.`);

  let fixedCount = 0;

  for (const record of records) {
    let modified = false;

    // ── Step 1: Correct auto-checkout session.checkOut times ─────────────────
    for (const session of record.sessions) {
      if (!session.autoCheckoutApplied) continue;

      const endTime = session.shiftSnapshot?.endTime || record.shiftSnapshot?.endTime;
      if (!looksLikeBrokenAutoCheckout(session.checkOut, endTime)) continue;

      const oldCheckOut = new Date(session.checkOut);
      const corrected = new Date(oldCheckOut.getTime() - IST_OFFSET_MS);

      console.log(
        `  [${record._id}] date=${record.date}  checkOut ${oldCheckOut.toISOString()} → ${corrected.toISOString()}`
      );

      session.checkOut = corrected;
      modified = true;
    }

    if (!modified) continue; // nothing broken in this record

    // ── Step 2: Remove phantom system lunch-break sessions ───────────────────
    const before = record.sessions.length;
    record.sessions = record.sessions.filter((s) => !s.isSystemLunchBreak);
    const removed = before - record.sessions.length;
    if (removed > 0) {
      console.log(`  [${record._id}] Removed ${removed} phantom system lunch session(s).`);
    }

    // ── Step 3: Re-apply lunch-break policy with corrected times ─────────────
    // Use the last checkout moment as reference so the policy considers the
    // session fully closed.
    const latestCheckout = record.sessions
      .map((s) => (s.checkOut ? new Date(s.checkOut) : null))
      .filter(Boolean)
      .reduce((max, d) => (d > max ? d : max), new Date(0));

    applyLunchBreakPolicy(record, dayjs(latestCheckout));

    // ── Step 4: Recompute summary fields ─────────────────────────────────────
    const shiftSnap = record.shiftSnapshot || record.sessions?.[0]?.shiftSnapshot || null;
    const summary = computeAttendanceSummary(record.sessions, shiftSnap);

    record.totalHours = summary.totalHours;
    record.totalLunchMinutes = summary.totalLunchMinutes;
    record.totalPermissionMinutes = summary.totalPermissionMinutes;
    record.expectedHours = summary.expectedHours;
    record.varianceHours = summary.varianceHours;
    record.missedCheckoutCount = summary.missedCheckoutCount;

    await record.save();
    fixedCount++;
    console.log(
      `  [${record._id}] Saved — totalHours: ${summary.totalHours}h, variance: ${summary.varianceHours}h`
    );
  }

  console.log(`\nDone. Fixed ${fixedCount} record(s).`);
  process.exit(0);
};

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
