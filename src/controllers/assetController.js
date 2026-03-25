import { StatusCodes } from "http-status-codes";
import { Asset } from "../models/Asset.js";
import { buildAssetNumber } from "../utils/asset.js";
import { AppError } from "../utils/AppError.js";
import { buildPaginatedResponse, parsePagination } from "../utils/query.js";

const buildHistoryEntry = (assignedTo, assignedBy, note) => ({
  assignedTo: assignedTo || null,
  assignedBy,
  note: note || "",
  assignedAt: new Date()
});

export const createAsset = async (req, res) => {
  const uniqueAssetId = await buildAssetNumber(Asset);
  const assignedTo = req.body.assignedTo || null;
  const asset = await Asset.create({
    name: req.body.name,
    type: req.body.type,
    uniqueAssetId,
    assignedTo,
    status: assignedTo ? "Assigned" : req.body.status,
    history: [buildHistoryEntry(assignedTo, req.user._id, req.body.note || "Asset created")]
  });

  res.status(StatusCodes.CREATED).json({ asset });
};

export const getAssets = async (req, res) => {
  const filter = {};
  if (req.user.role !== "Admin") {
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
    name: req.body.name ?? asset.name,
    type: req.body.type ?? asset.type,
    assignedTo: req.body.assignedTo ?? asset.assignedTo,
    status: req.body.status ?? asset.status
  });

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

  if (req.user.role !== "Admin" && String(asset.assignedTo) !== String(req.user._id)) {
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

export const deleteAsset = async (req, res) => {
  const asset = await Asset.findById(req.params.id);
  if (!asset) {
    throw new AppError("Asset not found", StatusCodes.NOT_FOUND);
  }

  await asset.deleteOne();
  res.status(StatusCodes.OK).json({ message: "Asset deleted successfully" });
};
