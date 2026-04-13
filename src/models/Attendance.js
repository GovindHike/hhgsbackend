import mongoose from "mongoose";
import { SHIFT_TYPES } from "../utils/constants.js";

const shiftSnapshotSchema = new mongoose.Schema(
  {
    shift: { type: String, enum: SHIFT_TYPES, required: true },
    scheduleLabel: { type: String, default: "Default" },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    lunchBreakStart: { type: String, default: null },
    lunchBreakEnd: { type: String, default: null },
    expectedHours: { type: Number, default: 8 },
    reminderDelayMinutes: { type: Number, default: 30 },
    autoCheckoutDelayMinutes: { type: Number, default: 120 },
    lunchIncludedInShift: { type: Boolean, default: true },
    autoDeductLunchMinutes: { type: Number, default: 0 }
  },
  { _id: false }
);

const attendanceSessionSchema = new mongoose.Schema(
  {
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, default: null },
    reason: { type: String, enum: ["Lunch", "Permission", "Regular", "Other"], default: "Regular" },
    reasonNote: { type: String, default: "", trim: true },
    lunchMinutes: { type: Number, default: 0 },
    permissionMinutes: { type: Number, default: 0 },
    lunchReminderSentAt: { type: Date, default: null },
    isSystemLunchBreak: { type: Boolean, default: false },
    reminderSentAt: { type: Date, default: null },
    autoCheckedOutAt: { type: Date, default: null },
    autoCheckoutApplied: { type: Boolean, default: false },
    shiftSnapshot: { type: shiftSnapshotSchema, default: null }
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true, index: true },
    sessions: [attendanceSessionSchema],
    shiftSnapshot: { type: shiftSnapshotSchema, default: null },
    totalHours: { type: Number, default: 0 },
    totalLunchMinutes: { type: Number, default: 0 },
    totalPermissionMinutes: { type: Number, default: 0 },
    expectedHours: { type: Number, default: 0 },
    varianceHours: { type: Number, default: 0 },
    missedCheckoutCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

export const Attendance = mongoose.model("Attendance", attendanceSchema);
