import cron from "node-cron";
import dayjs from "dayjs";
import { User } from "../models/User.js";

/**
 * Returns the April 1 date that starts the current leave year.
 *
 * Leave year runs April 1 → March 31.
 *   - Jan–Mar 2026 → year started April 1, 2025
 *   - Apr–Dec 2026 → year started April 1, 2026
 */
export function currentLeaveYearStart() {
  const now = dayjs();
  // dayjs month() is 0-indexed: 3 = April
  const year = now.month() >= 3 ? now.year() : now.year() - 1;
  return dayjs(`${year}-04-01`).startOf("day").toDate();
}

export function leaveYearLabel(startDate) {
  const s = dayjs(startDate);
  return `${s.year()}–${String(s.year() + 1).slice(2)}`; // e.g. "2025–26"
}

/**
 * Reset leave balances for every user whose leaveYearStart is before the
 * expected year start (or has never been set).
 * Safe to call on startup — it is a no-op when already current.
 */
export async function resetLeaveBalances() {
  const expectedStart = currentLeaveYearStart();

  const result = await User.updateMany(
    {
      $or: [
        { leaveYearStart: { $lt: expectedStart } },
        { leaveYearStart: null }
      ]
    },
    {
      $set: {
        "leaveBalance.planned": 12,
        "leaveBalance.sick": 6,
        leaveYearStart: expectedStart
      }
    }
  );

  if (result.modifiedCount > 0) {
    console.log(
      `[leaveReset] Reset leave balances for ${result.modifiedCount} user(s) — FY ${leaveYearLabel(expectedStart)} (Apr ${dayjs(expectedStart).year()})`
    );
  }
}

/**
 * Cron: runs at 00:01 on April 1st every year.
 * Also triggered on startup via resetLeaveBalances() to handle missed resets.
 */
export function startLeaveResetJob() {
  // "1 minute past midnight on April 1st"
  cron.schedule("1 0 1 4 *", async () => {
    console.log("[leaveReset] Annual leave reset triggered by cron.");
    await resetLeaveBalances();
  });
}
