import mongoose from "mongoose";
import { StatusCodes } from "http-status-codes";
import { Asset } from "../models/Asset.js";
import { AssetAuditLog } from "../models/AssetAuditLog.js";
import { buildAssetNumber } from "../utils/asset.js";
import { AppError } from "../utils/AppError.js";
import { isAdminRole } from "../utils/constants.js";
import { buildPaginatedResponse, parsePagination } from "../utils/query.js";
import {
  buildAssetSnapshot,
  diffAssetSnapshots,
  recordAssetAudit,
  resolveAssignedLabel
} from "../utils/assetAudit.js";

const buildHistoryEntry = (assignedTo, assignedBy, note) => ({
  assignedTo: assignedTo || null,
  assignedBy,
  note: note || "",
  assignedAt: new Date()
});

const normalizeAssignedGroup = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.toLowerCase() === "admin department") return "Admin department";
  if (raw.toLowerCase() === "all employees") return "All Employees";
  if (raw.toLowerCase() === "hike team") return "Hike team";
  return "";
};

const isRepairStatus = (status) => String(status || "").trim().toLowerCase() === "repair";

const assertNonRepairAssetIdConflict = async ({ uniqueAssetId, status, excludeId = null }) => {
  const filter = { uniqueAssetId };
  if (excludeId && mongoose.isValidObjectId(excludeId)) {
    filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
  }

  const existing = await Asset.find(filter).select("status").lean();
  if (!existing.length) return;

  const hasNonRepairDuplicate = existing.some((entry) => !isRepairStatus(entry.status));
  if (!isRepairStatus(status) && hasNonRepairDuplicate) {
    throw new AppError(
      "Asset ID already exists for an active asset. Reuse is allowed only when the existing asset is in Repair status.",
      StatusCodes.BAD_REQUEST
    );
  }
};

export const createAsset = async (req, res) => {
  const uniqueAssetId = req.body.uniqueAssetId?.trim() || (await buildAssetNumber(Asset));
  const assignedTo = req.body.assignedTo || null;
  const assignedGroup = assignedTo ? "" : normalizeAssignedGroup(req.body.assignedGroup);
  const nextStatus = assignedTo ? "Assigned" : (req.body.status || "Available");
  await assertNonRepairAssetIdConflict({ uniqueAssetId, status: nextStatus });

  const initialComplaints = [];
  if (req.body.complaints?.length) {
    initialComplaints.push(...req.body.complaints);
  } else if (req.body.complaint && req.body.complaintDate) {
    initialComplaints.push({
      details: req.body.complaint,
      date: req.body.complaintDate,
      receiptName: req.body.complaintReceiptName || "",
      receiptData: req.body.complaintReceiptData || ""
    });
  }

  const asset = await Asset.create({
    name: req.body.name || req.body.description || uniqueAssetId,
    type: req.body.type || req.body.category || "General",
    category: req.body.category || req.body.type || "",
    subcategory: req.body.subcategory || "",
    description: req.body.description || "",
    uniqueAssetId,
    purchaseDate: req.body.purchaseDate || null,
    vendor: req.body.vendor || "",
    invoiceNumber: req.body.invoiceNumber || "",
    cost: Number(req.body.cost || 0),
    warrantyStartDate: req.body.warrantyStartDate || null,
    warrantyExpiryDate: req.body.warrantyExpiryDate || null,
    warrantyProvider: req.body.warrantyProvider || "",
    warrantyDetails: req.body.warrantyDetails || "",
    location: req.body.location || "Regional office",
    serialNumber: req.body.serialNumber || "",
    assignedTo,
    assignedGroup,
    status: nextStatus,
    complaint: req.body.complaint || "",
    complaintDate: req.body.complaintDate || null,
    recoverDate: req.body.recoverDate || null,
    complaints: initialComplaints,
    remarks: req.body.remarks || "",
    history: [buildHistoryEntry(assignedTo, req.user._id, req.body.note || "Asset created")]
  });

  const assignedLabel = await resolveAssignedLabel(asset.assignedTo, asset.assignedGroup);
  await recordAssetAudit({
    asset,
    action: "CREATE",
    user: req.user,
    summary: `Created asset ${asset.uniqueAssetId}`,
    note: req.body.note || "",
    changes: diffAssetSnapshots({}, buildAssetSnapshot(asset, assignedLabel))
  });

  res.status(StatusCodes.CREATED).json({ asset });
};

export const getAssets = async (req, res) => {
  const filter = {};
  if (!isAdminRole(req.user.role)) {
    filter.assignedTo = req.user._id;
  } else if (req.query.assignedTo === "__UNASSIGNED__") {
    filter.assignedTo = null;
    filter.assignedGroup = "";
  } else if (req.query.assignedTo === "__ADMIN_DEPARTMENT__") {
    filter.assignedTo = null;
    filter.assignedGroup = "Admin department";
  } else if (req.query.assignedTo === "__ALL_EMPLOYEES__") {
    filter.assignedTo = null;
    filter.assignedGroup = "All Employees";
  } else if (req.query.assignedTo === "__HIKE_TEAM__") {
    filter.assignedTo = null;
    filter.assignedGroup = "Hike team";
  } else if (req.query.assignedTo) {
    if (!mongoose.isValidObjectId(req.query.assignedTo)) {
      throw new AppError("Invalid assigned user filter", StatusCodes.BAD_REQUEST);
    }

    filter.assignedTo = new mongoose.Types.ObjectId(req.query.assignedTo);
  }
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.subcategory) filter.subcategory = req.query.subcategory;
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: "i" } },
      { uniqueAssetId: { $regex: req.query.search, $options: "i" } },
      { invoiceNumber: { $regex: req.query.search, $options: "i" } },
      { serialNumber: { $regex: req.query.search, $options: "i" } }
    ];
  }

  const sortBy = req.query.sortBy === "uniqueAssetId" ? "uniqueAssetId" : "createdAt";
  const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
  let assets;
  const total = await Asset.countDocuments(filter);

  const fetchAll = isAdminRole(req.user.role) && Number(req.query.limit) > 100;
  const { page, limit, skip } = fetchAll
    ? { page: 1, limit: total || 1, skip: 0 }
    : parsePagination(req.query);

  if (sortBy === "uniqueAssetId") {
    const aggregatePipeline = [
      { $match: filter },
      {
        $addFields: {
          uniqueAssetIdLength: { $strLenCP: { $ifNull: ["$uniqueAssetId", ""] } },
          uniqueAssetIdSortValue: { $toUpper: { $ifNull: ["$uniqueAssetId", ""] } }
        }
      },
      { $sort: { uniqueAssetIdLength: sortOrder, uniqueAssetIdSortValue: sortOrder, _id: 1 } },
      { $skip: skip },
      { $project: { uniqueAssetIdLength: 0, uniqueAssetIdSortValue: 0 } }
    ];
    if (!fetchAll) aggregatePipeline.splice(4, 0, { $limit: limit });

    assets = await Asset.aggregate(aggregatePipeline);
    assets = await Asset.populate(assets, [
      { path: "assignedTo", select: "name email employeeCode" },
      { path: "history.assignedTo", select: "name email" },
      { path: "history.assignedBy", select: "name email" },
      { path: "movements.employee", select: "name email employeeCode" },
      { path: "movements.recordedBy", select: "name email role" }
    ]);
  } else {
    const query = Asset.find(filter)
      .populate("assignedTo", "name email employeeCode")
      .populate("history.assignedTo", "name email")
      .populate("history.assignedBy", "name email")
      .populate("movements.employee", "name email employeeCode")
      .populate("movements.recordedBy", "name email role")
      .sort({ createdAt: sortOrder })
      .skip(skip);
    if (!fetchAll) query.limit(limit);
    assets = await query.lean();
  }

  res.status(StatusCodes.OK).json({ assets, ...buildPaginatedResponse({ items: assets, total, page, limit }) });
};

export const updateAsset = async (req, res) => {
  const asset = await Asset.findById(req.params.id);
  if (!asset) {
    throw new AppError("Asset not found", StatusCodes.NOT_FOUND);
  }

  const beforeSnapshot = buildAssetSnapshot(
    asset,
    await resolveAssignedLabel(asset.assignedTo, asset.assignedGroup)
  );

  const previousAssignedTo = String(asset.assignedTo || "");
  const assignedGroupPayloadProvided = Object.prototype.hasOwnProperty.call(req.body, "assignedGroup");
  const assignedToPayloadProvided = Object.prototype.hasOwnProperty.call(req.body, "assignedTo");
  const nextAssignedToRaw = assignedToPayloadProvided ? (req.body.assignedTo || null) : asset.assignedTo;
  const nextAssignedGroup = nextAssignedToRaw
    ? ""
    : (assignedGroupPayloadProvided ? normalizeAssignedGroup(req.body.assignedGroup) : asset.assignedGroup || "");
  const nextAssignedTo = String(nextAssignedToRaw || "");
  const nextUniqueAssetId = (req.body.uniqueAssetId ?? asset.uniqueAssetId)?.trim?.() || asset.uniqueAssetId;
  const assignmentChanged = previousAssignedTo !== nextAssignedTo;
  const nextStatus = assignmentChanged
    ? (nextAssignedToRaw ? "Assigned" : (req.body.status || "Available"))
    : (req.body.status ?? asset.status);

  await assertNonRepairAssetIdConflict({
    uniqueAssetId: nextUniqueAssetId,
    status: nextStatus,
    excludeId: asset._id
  });

  Object.assign(asset, {
    name: req.body.name || req.body.description || asset.name,
    type: req.body.type || req.body.category || asset.type,
    category: req.body.category || req.body.type || asset.category,
    subcategory: req.body.subcategory ?? asset.subcategory,
    description: req.body.description ?? asset.description,
    uniqueAssetId: nextUniqueAssetId,
    purchaseDate: req.body.purchaseDate ?? asset.purchaseDate,
    vendor: req.body.vendor ?? asset.vendor,
    invoiceNumber: req.body.invoiceNumber ?? asset.invoiceNumber,
    cost: req.body.cost !== undefined ? Number(req.body.cost) : asset.cost,
    warrantyStartDate: req.body.warrantyStartDate ?? asset.warrantyStartDate,
    warrantyExpiryDate: req.body.warrantyExpiryDate ?? asset.warrantyExpiryDate,
    warrantyProvider: req.body.warrantyProvider ?? asset.warrantyProvider,
    warrantyDetails: req.body.warrantyDetails ?? asset.warrantyDetails,
    location: req.body.location ?? asset.location,
    serialNumber: req.body.serialNumber ?? asset.serialNumber,
    assignedTo: nextAssignedToRaw,
    assignedGroup: nextAssignedGroup,
    status: nextStatus,
    complaint: req.body.complaint ?? asset.complaint,
    complaintDate: req.body.complaintDate ?? asset.complaintDate,
    recoverDate: req.body.recoverDate ?? asset.recoverDate,
    remarks: req.body.remarks ?? asset.remarks,
    complaints: Array.isArray(req.body.complaints) ? req.body.complaints : asset.complaints
  });

  if (req.body.complaint && req.body.complaintDate) {
    asset.complaints.push({
      details: req.body.complaint,
      date: req.body.complaintDate,
      receiptName: req.body.complaintReceiptName || "",
      receiptData: req.body.complaintReceiptData || ""
    });
  }

  if (assignmentChanged || req.body.note) {
    const currentHistory = asset.history.at(-1);
    if (currentHistory && !currentHistory.unassignedAt && assignmentChanged) {
      currentHistory.unassignedAt = new Date();
    }

    asset.history.push(buildHistoryEntry(nextAssignedToRaw || null, req.user._id, req.body.note));
  }

  await asset.save();

  const afterSnapshot = buildAssetSnapshot(
    asset,
    await resolveAssignedLabel(asset.assignedTo, asset.assignedGroup)
  );
  const changes = diffAssetSnapshots(beforeSnapshot, afterSnapshot);

  if (changes.length || req.body.note) {
    const auditAction = assignmentChanged ? (nextAssignedToRaw ? "ASSIGN" : "UNASSIGN") : "UPDATE";
    const summaryByAction = {
      ASSIGN: `Assigned ${asset.uniqueAssetId} to ${afterSnapshot.assignedLabel}`,
      UNASSIGN: `Unassigned ${asset.uniqueAssetId} from ${beforeSnapshot.assignedLabel}`,
      UPDATE: `Updated ${changes.length} field${changes.length === 1 ? "" : "s"} on ${asset.uniqueAssetId}`
    };

    await recordAssetAudit({
      asset,
      action: auditAction,
      user: req.user,
      summary: summaryByAction[auditAction],
      note: req.body.note || "",
      changes
    });
  }

  res.status(StatusCodes.OK).json({ asset });
};

export const recordAssetMovement = async (req, res) => {
  const asset = await Asset.findById(req.params.id);
  if (!asset) {
    throw new AppError("Asset not found", StatusCodes.NOT_FOUND);
  }

  if (!asset.assignedTo) {
    throw new AppError("Only assigned assets can have in/out entries", StatusCodes.BAD_REQUEST);
  }

  if (!isAdminRole(req.user.role) && String(asset.assignedTo) !== String(req.user._id)) {
    throw new AppError("You can only record movement for your assigned assets", StatusCodes.FORBIDDEN);
  }

  const lastMovement = asset.movements.at(-1);
  if (lastMovement?.action === req.body.action) {
    throw new AppError(
      req.body.action === "OUT" ? "Asset is already marked out" : "Asset is already marked in",
      StatusCodes.BAD_REQUEST
    );
  }

  asset.movements.push({
    action: req.body.action,
    employee: asset.assignedTo,
    date: req.body.date,
    reason: req.body.reason,
    note: req.body.note || "",
    recordedBy: req.user._id
  });

  await asset.save();
  await asset.populate("movements.employee", "name email employeeCode");
  await asset.populate("movements.recordedBy", "name email role");

  const movedBy = await resolveAssignedLabel(asset.assignedTo, asset.assignedGroup);
  await recordAssetAudit({
    asset,
    action: "MOVEMENT",
    user: req.user,
    summary: `Marked ${asset.uniqueAssetId} ${req.body.action === "OUT" ? "out" : "in"} for ${movedBy}`,
    note: req.body.note || "",
    changes: [
      { field: "movement", label: "Action", from: "", to: req.body.action },
      { field: "movementReason", label: "Reason", from: "", to: req.body.reason || "" },
      { field: "movementDate", label: "Date", from: "", to: new Date(req.body.date).toISOString() }
    ]
  });

  res.status(StatusCodes.OK).json({ asset });
};

export const recordAssetComplaint = async (req, res) => {
  const asset = await Asset.findById(req.params.id);
  if (!asset) {
    throw new AppError("Asset not found", StatusCodes.NOT_FOUND);
  }

  asset.complaints = asset.complaints || [];
  asset.complaints.push({
    details: req.body.details,
    date: req.body.date,
    receiptName: req.body.receiptName || "",
    receiptData: req.body.receiptData || ""
  });

  await asset.save();

  await recordAssetAudit({
    asset,
    action: "COMPLAINT",
    user: req.user,
    summary: `Logged a complaint on ${asset.uniqueAssetId}`,
    note: req.body.details || "",
    changes: [
      { field: "complaint", label: "Complaint", from: "", to: req.body.details || "" },
      { field: "complaintDate", label: "Complaint Date", from: "", to: new Date(req.body.date).toISOString() }
    ]
  });

  res.status(StatusCodes.OK).json({ asset });
};

export const deleteAsset = async (req, res) => {
  const asset = await Asset.findById(req.params.id);
  if (!asset) {
    throw new AppError("Asset not found", StatusCodes.NOT_FOUND);
  }

  const snapshot = buildAssetSnapshot(
    asset,
    await resolveAssignedLabel(asset.assignedTo, asset.assignedGroup)
  );

  await asset.deleteOne();

  await recordAssetAudit({
    asset,
    action: "DELETE",
    user: req.user,
    summary: `Deleted asset ${asset.uniqueAssetId}`,
    // Record the final state as from → (removed) so the trail keeps what was lost.
    changes: diffAssetSnapshots(snapshot, {})
  });

  res.status(StatusCodes.OK).json({ message: "Asset deleted successfully" });
};

export const getAssetAuditLogs = async (req, res) => {
  const filter = {};
  if (req.query.action) filter.action = req.query.action;
  if (req.query.assetId && mongoose.isValidObjectId(req.query.assetId)) {
    filter.asset = new mongoose.Types.ObjectId(req.query.assetId);
  }
  if (req.query.performedBy && mongoose.isValidObjectId(req.query.performedBy)) {
    filter.performedBy = new mongoose.Types.ObjectId(req.query.performedBy);
  }
  if (req.query.dateFrom || req.query.dateTo) {
    filter.createdAt = {};
    if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) filter.createdAt.$lte = new Date(req.query.dateTo);
  }
  if (req.query.search) {
    const regex = { $regex: req.query.search, $options: "i" };
    filter.$or = [
      { uniqueAssetId: regex },
      { assetName: regex },
      { performedByName: regex },
      { summary: regex }
    ];
  }

  const { page, limit, skip } = parsePagination(req.query);
  const [logs, total] = await Promise.all([
    AssetAuditLog.find(filter)
      .populate("performedBy", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AssetAuditLog.countDocuments(filter)
  ]);

  res.status(StatusCodes.OK).json({ logs, ...buildPaginatedResponse({ items: logs, total, page, limit }) });
};
