import mongoose from "mongoose";

const attendanceSessionSchema = new mongoose.Schema(
  {
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, default: null },
    reason: { type: String, enum: ["Lunch", "Permission", "Regular", "Other"], default: "Regular" },
    lunchMinutes: { type: Number, default: 0 },
    permissionMinutes: { type: Number, default: 0 }
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true, index: true },
    sessions: [attendanceSessionSchema],
    totalHours: { type: Number, default: 0 }
  },
  { timestamps: true }
);

attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

export const Attendance = mongoose.model("Attendance", attendanceSchema);
