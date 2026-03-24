import mongoose from "mongoose";
import { LEAVE_STATUSES } from "../utils/constants.js";

const leaveSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", default: null, index: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    leaveType: { type: String, enum: ["Full Day", "Half Day"], required: true, default: "Full Day" },
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: LEAVE_STATUSES, default: "Pending", index: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    decisionAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const Leave = mongoose.model("Leave", leaveSchema);
