import { User } from "../models/User.js";
import { currentLeaveYearStart } from "./leaveResetJob.js";

/**
 * One-time migration: convert leaveBalance from a plain Number to { planned, sick }
 * and stamp leaveYearStart for users that don't have it yet.
 * Safe to run on every startup — only updates documents that still have the old format.
 */
export async function migrateLeaveBalance() {
  const expectedStart = currentLeaveYearStart();

  // Phase 1: convert legacy numeric leaveBalance
  const legacyResult = await User.updateMany(
    { leaveBalance: { $type: "number" } },
    [
      {
        $set: {
          leaveBalance: {
            planned: { $min: [{ $ifNull: ["$leaveBalance", 12] }, 12] },
            sick: 6
          },
          leaveYearStart: expectedStart
        }
      }
    ]
  );

  if (legacyResult.modifiedCount > 0) {
    console.log(`[migrate] Converted ${legacyResult.modifiedCount} user(s) to new leaveBalance format.`);
  }

  // Phase 2: stamp leaveYearStart for any users still missing it
  const stampResult = await User.updateMany(
    { leaveYearStart: null },
    { $set: { leaveYearStart: expectedStart } }
  );

  if (stampResult.modifiedCount > 0) {
    console.log(`[migrate] Stamped leaveYearStart for ${stampResult.modifiedCount} user(s).`);
  }
}
