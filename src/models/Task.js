import mongoose from "mongoose";
import { TASK_STATUSES } from "../utils/constants.js";

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    projectName: { type: String, trim: true, default: "General", index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: TASK_STATUSES, default: "Pending", index: true },
    taskDate: { type: Date, required: true, index: true, default: Date.now },
    dueDate: { type: Date, default: null, index: true },
    isDailyTask: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const Task = mongoose.model("Task", taskSchema);
