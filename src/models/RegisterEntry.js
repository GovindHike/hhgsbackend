import mongoose from "mongoose";

/**
 * A single row of a register. `data` is keyed by the parent register's field keys,
 * so the shape is decided by the register definition rather than by this schema.
 */
const registerEntrySchema = new mongoose.Schema(
  {
    register: { type: mongoose.Schema.Types.ObjectId, ref: "Register", required: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true, minimize: false }
);

registerEntrySchema.index({ register: 1, createdAt: -1 });

export const RegisterEntry = mongoose.model("RegisterEntry", registerEntrySchema);
