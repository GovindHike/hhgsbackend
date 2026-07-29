import mongoose from "mongoose";
import { ASSET_AUDIT_ACTIONS } from "../utils/constants.js";

const auditChangeSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    label: { type: String, trim: true, default: "" },
    from: { type: String, default: "" },
    to: { type: String, default: "" }
  },
  { _id: false }
);

const assetAuditLogSchema = new mongoose.Schema(
  {
    asset: { type: mongoose.Schema.Types.ObjectId, ref: "Asset", default: null, index: true },
    // Snapshotted so the trail survives asset deletion.
    uniqueAssetId: { type: String, trim: true, default: "", index: true },
    assetName: { type: String, trim: true, default: "" },
    category: { type: String, trim: true, default: "" },
    subcategory: { type: String, trim: true, default: "" },
    action: { type: String, enum: ASSET_AUDIT_ACTIONS, required: true, index: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    performedByName: { type: String, trim: true, default: "" },
    performedByRole: { type: String, trim: true, default: "" },
    summary: { type: String, trim: true, default: "" },
    note: { type: String, trim: true, default: "" },
    changes: [auditChangeSchema]
  },
  { timestamps: true }
);

assetAuditLogSchema.index({ createdAt: -1 });

export const AssetAuditLog = mongoose.model("AssetAuditLog", assetAuditLogSchema);
