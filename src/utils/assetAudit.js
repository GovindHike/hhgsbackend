import mongoose from "mongoose";
import { AssetAuditLog } from "../models/AssetAuditLog.js";
import { User } from "../models/User.js";

const TRACKED_FIELDS = [
  { field: "uniqueAssetId", label: "Asset ID" },
  { field: "name", label: "Asset Name" },
  { field: "description", label: "Description" },
  { field: "category", label: "Category" },
  { field: "subcategory", label: "Subcategory" },
  { field: "type", label: "Type" },
  { field: "serialNumber", label: "Serial Number" },
  { field: "purchaseDate", label: "Purchase Date", type: "date" },
  { field: "vendor", label: "Vendor" },
  { field: "invoiceNumber", label: "Invoice Number" },
  { field: "cost", label: "Cost", type: "number" },
  { field: "warrantyStartDate", label: "Warranty Start", type: "date" },
  { field: "warrantyExpiryDate", label: "Warranty Expiry", type: "date" },
  { field: "warrantyProvider", label: "Warranty Provider" },
  { field: "warrantyDetails", label: "Warranty Details" },
  { field: "location", label: "Location" },
  { field: "status", label: "Status" },
  { field: "assignedLabel", label: "Assigned To" },
  { field: "complaint", label: "Complaint" },
  { field: "complaintDate", label: "Complaint Date", type: "date" },
  { field: "recoverDate", label: "Recover Date", type: "date" },
  { field: "remarks", label: "Remarks" }
];

const formatValue = (value, type) => {
  if (value === null || value === undefined || value === "") return "";
  if (type === "date") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }
  if (type === "number") return String(Number(value) || 0);
  return String(value).trim();
};

/** Resolves the display label for an asset assignment (employee name, group name, or "Office Asset"). */
export const resolveAssignedLabel = async (assignedTo, assignedGroup) => {
  if (assignedTo) {
    const id = assignedTo?._id || assignedTo;
    if (mongoose.isValidObjectId(id)) {
      const user = await User.findById(id).select("name").lean();
      if (user?.name) return user.name;
    }
  }
  const group = String(assignedGroup || "").trim();
  return group || "Office Asset";
};

/** Flattens an asset (plus its resolved assignment label) into the shape the diff works on. */
export const buildAssetSnapshot = (asset, assignedLabel) => {
  const snapshot = {};
  for (const { field, type } of TRACKED_FIELDS) {
    snapshot[field] = field === "assignedLabel"
      ? formatValue(assignedLabel)
      : formatValue(asset?.[field], type);
  }
  return snapshot;
};

export const diffAssetSnapshots = (before, after) =>
  TRACKED_FIELDS.reduce((changes, { field, label }) => {
    const from = before?.[field] ?? "";
    const to = after?.[field] ?? "";
    if (from !== to) changes.push({ field, label, from, to });
    return changes;
  }, []);

/**
 * Writes an asset audit trail entry. Audit failures are swallowed so a logging
 * problem can never fail the asset operation that triggered it.
 */
export const recordAssetAudit = async ({ asset, action, user, summary = "", note = "", changes = [] }) => {
  try {
    await AssetAuditLog.create({
      asset: asset?._id || null,
      uniqueAssetId: asset?.uniqueAssetId || "",
      assetName: asset?.description || asset?.name || "",
      category: asset?.category || "",
      subcategory: asset?.subcategory || "",
      action,
      performedBy: user?._id || null,
      performedByName: user?.name || "",
      performedByRole: user?.role || "",
      summary,
      note: note || "",
      changes
    });
  } catch (error) {
    console.error("Failed to record asset audit entry", error);
  }
};
