import mongoose from "mongoose";
import { REGISTER_FIELD_TYPES } from "../utils/constants.js";

/** One configurable column of a register. `key` is stable once created so entry data survives renames. */
const registerFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: { type: String, enum: REGISTER_FIELD_TYPES, default: "text" },
    required: { type: Boolean, default: false },
    options: { type: [String], default: [] },
    placeholder: { type: String, trim: true, default: "" },
    helpText: { type: String, trim: true, default: "" },
    showInTable: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
  },
  { _id: false }
);

const registerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, trim: true, default: "" },
    color: { type: String, trim: true, default: "#2563eb" },
    templateKey: { type: String, trim: true, default: "" },
    fields: { type: [registerFieldSchema], default: [] },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

export const Register = mongoose.model("Register", registerSchema);
