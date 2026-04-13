import mongoose from "mongoose";
import { LEAVE_STATUSES } from "../utils/constants.js";

const leaveSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", default: null, index: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    leaveType: { type: String, enum: ["Full Day", "Half Day"], required: true, default: "Full Day" },
    requestedType: { type: String, enum: ["PLANNED", "SICK"], required: true },
    finalType: { type: String, enum: ["PLANNED", "SICK", null], default: null },
    validationStatus: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"], default: "PENDING", index: true },
    doctorProof: { type: String, default: null },
    adminOverride: { type: Boolean, default: false },
    reason: { type: String, required: true, trim: true },
    decisionReason: { type: String, default: null, trim: true },
    status: { type: String, enum: LEAVE_STATUSES, default: "Pending", index: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    decisionAt: { type: Date, default: null },
    isDeducted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const Leave = mongoose.model("Leave", leaveSchema);
