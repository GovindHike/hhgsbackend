import mongoose from "mongoose";
import { ASSET_STATUSES } from "../utils/constants.js";

const assetHistorySchema = new mongoose.Schema(
  {
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    note: { type: String, trim: true },
    assignedAt: { type: Date, default: Date.now },
    unassignedAt: { type: Date, default: null }
  },
  { _id: false }
);

const assetMovementSchema = new mongoose.Schema(
  {
    action: { type: String, enum: ["OUT", "IN"], required: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: Date, required: true, index: true },
    reason: { type: String, required: true, trim: true },
    note: { type: String, trim: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const assetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true, index: true },
    description: { type: String, trim: true, default: "" },
    category: { type: String, trim: true, default: "" },
    uniqueAssetId: { type: String, required: true, unique: true, index: true },
    purchaseDate: { type: Date, default: null },
    vendor: { type: String, trim: true, default: "" },
    cost: { type: Number, default: 0 },
    location: { type: String, trim: true, enum: ["Regional office", "new office"], default: "Regional office" },
    serialNumber: { type: String, trim: true, default: "" },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    status: { type: String, enum: ASSET_STATUSES, default: "Available" },
    complaint: { type: String, trim: true, default: "" },
    complaintDate: { type: Date, default: null },
    recoverDate: { type: Date, default: null },
    complaints: [
      {
        details: { type: String, trim: true },
        date: { type: Date },
        receiptName: { type: String, trim: true, default: "" },
        receiptData: { type: String, default: "" }
      }
    ],
    remarks: { type: String, trim: true, default: "" },
    history: [assetHistorySchema],
    movements: [assetMovementSchema]
  },
  { timestamps: true }
);

export const Asset = mongoose.model("Asset", assetSchema);
