import { StatusCodes } from "http-status-codes";
import { Asset } from "../models/Asset.js";
import { buildAssetNumber } from "../utils/asset.js";
import { AppError } from "../utils/AppError.js";
import { isAdminRole } from "../utils/constants.js";
import { buildPaginatedResponse, parsePagination } from "../utils/query.js";

const buildHistoryEntry = (assignedTo, assignedBy, note) => ({
  assignedTo: assignedTo || null,
  assignedBy,
  note: note || "",
  assignedAt: new Date()
});

export const createAsset = async (req, res) => {
  const uniqueAssetId = req.body.uniqueAssetId?.trim() || (await buildAssetNumber(Asset));
  const assignedTo = req.body.assignedTo || null;
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
    description: req.body.description || "",
    uniqueAssetId,
    purchaseDate: req.body.purchaseDate || null,
    vendor: req.body.vendor || "",
    cost: Number(req.body.cost || 0),
    location: req.body.location || "Regional office",
    serialNumber: req.body.serialNumber || "",
    assignedTo,
    status: assignedTo ? "Assigned" : req.body.status || "Available",
    complaint: req.body.complaint || "",
    complaintDate: req.body.complaintDate || null,
    recoverDate: req.body.recoverDate || null,
    complaints: initialComplaints,
    remarks: req.body.remarks || "",
    history: [buildHistoryEntry(assignedTo, req.user._id, req.body.note || "Asset created")]
  });

  res.status(StatusCodes.CREATED).json({ asset });
};

export const getAssets = async (req, res) => {
  const filter = {};
  if (!isAdminRole(req.user.role)) {
    filter.assignedTo = req.user._id;
  }
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: "i" } },
      { uniqueAssetId: { $regex: req.query.search, $options: "i" } }
    ];
  }

  const { page, limit, skip } = parsePagination(req.query);
  const [assets, total] = await Promise.all([
    Asset.find(filter)
      .populate("assignedTo", "name email employeeCode")
      .populate("history.assignedTo", "name email")
      .populate("history.assignedBy", "name email")
      .populate("movements.employee", "name email employeeCode")
      .populate("movements.recordedBy", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Asset.countDocuments(filter)
  ]);
  res.status(StatusCodes.OK).json({ assets, ...buildPaginatedResponse({ items: assets, total, page, limit }) });
};

export const updateAsset = async (req, res) => {
  const asset = await Asset.findById(req.params.id);
  if (!asset) {
    throw new AppError("Asset not found", StatusCodes.NOT_FOUND);
  }

  const previousAssignedTo = String(asset.assignedTo || "");
  const nextAssignedTo = String(req.body.assignedTo || "");

  Object.assign(asset, {
    name: req.body.name || req.body.description || asset.name,
    type: req.body.type || req.body.category || asset.type,
    category: req.body.category || req.body.type || asset.category,
    description: req.body.description ?? asset.description,
    uniqueAssetId: req.body.uniqueAssetId ?? asset.uniqueAssetId,
    purchaseDate: req.body.purchaseDate ?? asset.purchaseDate,
    vendor: req.body.vendor ?? asset.vendor,
    cost: req.body.cost !== undefined ? Number(req.body.cost) : asset.cost,
    location: req.body.location ?? asset.location,
    serialNumber: req.body.serialNumber ?? asset.serialNumber,
    assignedTo: req.body.assignedTo ?? asset.assignedTo,
    status: req.body.status ?? asset.status,
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

  if (previousAssignedTo !== nextAssignedTo || req.body.note) {
    const currentHistory = asset.history.at(-1);
    if (currentHistory && !currentHistory.unassignedAt && previousAssignedTo !== nextAssignedTo) {
      currentHistory.unassignedAt = new Date();
    }

    asset.history.push(buildHistoryEntry(req.body.assignedTo || null, req.user._id, req.body.note));
    asset.status = req.body.assignedTo ? "Assigned" : req.body.status || "Available";
  }

  await asset.save();
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

  res.status(StatusCodes.OK).json({ asset });
};

export const deleteAsset = async (req, res) => {
  const asset = await Asset.findById(req.params.id);
  if (!asset) {
    throw new AppError("Asset not found", StatusCodes.NOT_FOUND);
  }

  await asset.deleteOne();
  res.status(StatusCodes.OK).json({ message: "Asset deleted successfully" });
};
