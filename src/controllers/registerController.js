import mongoose from "mongoose";
import { StatusCodes } from "http-status-codes";
import { Register } from "../models/Register.js";
import { RegisterEntry } from "../models/RegisterEntry.js";
import { AppError } from "../utils/AppError.js";
import { REGISTER_FIELD_TYPES } from "../utils/constants.js";
import { REGISTER_TEMPLATES, getRegisterTemplate } from "../utils/registerTemplates.js";

const TEXT_FIELD_TYPES = ["text", "textarea", "email", "phone", "select", "multiselect"];
const MAX_ENTRY_LIMIT = 500;

const slugify = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Turns a label into a camelCase key usable as a document path segment. */
const toFieldKey = (value) => {
  const words = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "";

  return words
    .map((word, index) => (index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join("");
};

const buildUniqueSlug = async (name, excludeId = null) => {
  const base = slugify(name) || "register";
  let candidate = base;
  let suffix = 2;

  // Slugs are unique per register; append a counter until a free one is found.
  while (true) {
    const filter = { slug: candidate };
    if (excludeId) filter._id = { $ne: excludeId };
    const existing = await Register.exists(filter);
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
};

/** Fills in keys, orders and defaults, and rejects duplicate or empty field definitions. */
const normalizeFields = (fields = []) => {
  const usedKeys = new Set();

  return fields.map((field, index) => {
    const label = String(field.label || "").trim();
    if (!label) {
      throw new AppError(`Field ${index + 1} needs a label`, StatusCodes.BAD_REQUEST);
    }

    const type = REGISTER_FIELD_TYPES.includes(field.type) ? field.type : "text";
    let key = String(field.key || "").trim() || toFieldKey(label) || `field${index + 1}`;

    if (usedKeys.has(key)) {
      let suffix = 2;
      while (usedKeys.has(`${key}${suffix}`)) suffix += 1;
      key = `${key}${suffix}`;
    }
    usedKeys.add(key);

    const options = ["select", "multiselect"].includes(type)
      ? [...new Set((field.options || []).map((option) => String(option).trim()).filter(Boolean))]
      : [];

    if (["select", "multiselect"].includes(type) && !options.length) {
      throw new AppError(`"${label}" is a choice field, so it needs at least one option`, StatusCodes.BAD_REQUEST);
    }

    return {
      key,
      label,
      type,
      required: Boolean(field.required),
      options,
      placeholder: String(field.placeholder || "").trim(),
      helpText: String(field.helpText || "").trim(),
      showInTable: field.showInTable === undefined ? true : Boolean(field.showInTable),
      order: index
    };
  });
};

const isBlank = (value) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && !value.trim()) ||
  (Array.isArray(value) && !value.length);

/** Casts an incoming raw value to the storage shape for its field type. */
const coerceFieldValue = (field, raw) => {
  if (isBlank(raw)) return field.type === "multiselect" ? [] : null;

  switch (field.type) {
    case "number":
    case "currency": {
      const numeric = Number(raw);
      if (Number.isNaN(numeric)) throw new AppError(`"${field.label}" must be a number`, StatusCodes.BAD_REQUEST);
      return numeric;
    }
    case "date": {
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) throw new AppError(`"${field.label}" must be a valid date`, StatusCodes.BAD_REQUEST);
      return date;
    }
    case "time": {
      const time = String(raw).trim();
      if (!/^\d{2}:\d{2}$/.test(time)) throw new AppError(`"${field.label}" must be a time in HH:mm format`, StatusCodes.BAD_REQUEST);
      return time;
    }
    case "boolean":
      return raw === true || raw === "true" || raw === 1 || raw === "1";
    case "select": {
      const value = String(raw).trim();
      if (field.options.length && !field.options.includes(value)) {
        throw new AppError(`"${value}" is not an allowed option for "${field.label}"`, StatusCodes.BAD_REQUEST);
      }
      return value;
    }
    case "multiselect": {
      const values = (Array.isArray(raw) ? raw : [raw]).map((item) => String(item).trim()).filter(Boolean);
      const invalid = field.options.length ? values.filter((value) => !field.options.includes(value)) : [];
      if (invalid.length) {
        throw new AppError(`"${invalid.join(", ")}" is not allowed for "${field.label}"`, StatusCodes.BAD_REQUEST);
      }
      return values;
    }
    case "employee": {
      const value = String(raw).trim();
      if (!mongoose.isValidObjectId(value)) throw new AppError(`"${field.label}" must be a valid employee`, StatusCodes.BAD_REQUEST);
      return new mongoose.Types.ObjectId(value);
    }
    default:
      return String(raw).trim();
  }
};

/**
 * Builds the stored `data` object for an entry. On update the previous data is merged in
 * so a partial payload only touches the keys it actually sends.
 */
const buildEntryData = (register, payload = {}, previousData = {}) => {
  const data = {};

  for (const field of register.fields) {
    const provided = Object.prototype.hasOwnProperty.call(payload, field.key);
    const raw = provided ? payload[field.key] : previousData[field.key];
    const value = provided ? coerceFieldValue(field, raw) : (raw ?? null);

    if (field.required && isBlank(value)) {
      throw new AppError(`"${field.label}" is required`, StatusCodes.BAD_REQUEST);
    }

    data[field.key] = value;
  }

  return data;
};

const findRegisterOr404 = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError("Register not found", StatusCodes.NOT_FOUND);
  const register = await Register.findById(id);
  if (!register) throw new AppError("Register not found", StatusCodes.NOT_FOUND);
  return register;
};

export const getRegisterTemplates = async (_req, res) => {
  res.status(StatusCodes.OK).json({ templates: REGISTER_TEMPLATES });
};

export const getRegisters = async (req, res) => {
  const filter = {};
  if (req.query.search) filter.name = { $regex: req.query.search, $options: "i" };
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive !== "false";

  const registers = await Register.find(filter)
    .populate("createdBy", "name email")
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();

  const counts = await RegisterEntry.aggregate([
    { $match: { register: { $in: registers.map((register) => register._id) } } },
    { $group: { _id: "$register", count: { $sum: 1 }, lastEntryAt: { $max: "$createdAt" } } }
  ]);

  const countByRegister = new Map(counts.map((row) => [String(row._id), row]));

  res.status(StatusCodes.OK).json({
    registers: registers.map((register) => ({
      ...register,
      entryCount: countByRegister.get(String(register._id))?.count || 0,
      lastEntryAt: countByRegister.get(String(register._id))?.lastEntryAt || null
    }))
  });
};

export const getRegister = async (req, res) => {
  const register = await findRegisterOr404(req.params.id);
  const entryCount = await RegisterEntry.countDocuments({ register: register._id });
  res.status(StatusCodes.OK).json({ register: { ...register.toObject(), entryCount } });
};

export const createRegister = async (req, res) => {
  const template = req.body.templateKey ? getRegisterTemplate(req.body.templateKey) : null;
  if (req.body.templateKey && !template) {
    throw new AppError("Unknown register template", StatusCodes.BAD_REQUEST);
  }

  const name = (req.body.name || template?.name || "").trim();
  if (!name) throw new AppError("Register name is required", StatusCodes.BAD_REQUEST);

  const duplicate = await Register.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).lean();
  if (duplicate) throw new AppError("A register with this name already exists", StatusCodes.BAD_REQUEST);

  const sourceFields = req.body.fields?.length ? req.body.fields : template?.fields || [];
  const lastRegister = await Register.findOne().sort({ sortOrder: -1 }).select("sortOrder").lean();

  const register = await Register.create({
    name,
    slug: await buildUniqueSlug(name),
    description: (req.body.description ?? template?.description ?? "").trim(),
    color: req.body.color || template?.color || "#2563eb",
    templateKey: template?.key || "",
    fields: normalizeFields(sourceFields),
    isActive: req.body.isActive === undefined ? true : Boolean(req.body.isActive),
    sortOrder: (lastRegister?.sortOrder ?? -1) + 1,
    createdBy: req.user._id,
    updatedBy: req.user._id
  });

  res.status(StatusCodes.CREATED).json({ register });
};

export const updateRegister = async (req, res) => {
  const register = await findRegisterOr404(req.params.id);

  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) throw new AppError("Register name is required", StatusCodes.BAD_REQUEST);

    if (name.toLowerCase() !== register.name.toLowerCase()) {
      const duplicate = await Register.findOne({
        _id: { $ne: register._id },
        name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
      }).lean();
      if (duplicate) throw new AppError("A register with this name already exists", StatusCodes.BAD_REQUEST);
      register.slug = await buildUniqueSlug(name, register._id);
    }

    register.name = name;
  }

  if (req.body.description !== undefined) register.description = String(req.body.description).trim();
  if (req.body.color !== undefined) register.color = req.body.color;
  if (req.body.isActive !== undefined) register.isActive = Boolean(req.body.isActive);
  if (req.body.sortOrder !== undefined) register.sortOrder = Number(req.body.sortOrder);
  if (req.body.fields !== undefined) register.fields = normalizeFields(req.body.fields);

  register.updatedBy = req.user._id;
  await register.save();

  res.status(StatusCodes.OK).json({ register });
};

export const deleteRegister = async (req, res) => {
  const register = await findRegisterOr404(req.params.id);

  await RegisterEntry.deleteMany({ register: register._id });
  await register.deleteOne();

  res.status(StatusCodes.OK).json({ message: "Register and its entries deleted successfully" });
};

export const getRegisterEntries = async (req, res) => {
  const register = await findRegisterOr404(req.params.id);
  const filter = { register: register._id };

  if (req.query.search) {
    const regex = { $regex: String(req.query.search), $options: "i" };
    const searchable = register.fields.filter((field) => TEXT_FIELD_TYPES.includes(field.type));
    if (searchable.length) {
      filter.$or = searchable.map((field) => ({ [`data.${field.key}`]: regex }));
    }
  }

  // `f_<fieldKey>=value` filters an entry on an exact field value (comma separated for multiple).
  for (const [queryKey, queryValue] of Object.entries(req.query)) {
    if (!queryKey.startsWith("f_") || queryValue === undefined || queryValue === "") continue;
    const field = register.fields.find((item) => item.key === queryKey.slice(2));
    if (!field) continue;

    const values = String(queryValue).split(",").filter(Boolean);
    filter[`data.${field.key}`] = values.length > 1 ? { $in: values } : values[0];
  }

  const dateField = register.fields.find((field) => field.key === req.query.dateField && field.type === "date");
  if (dateField && (req.query.dateFrom || req.query.dateTo)) {
    const range = {};
    if (req.query.dateFrom) range.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) range.$lte = new Date(req.query.dateTo);
    filter[`data.${dateField.key}`] = range;
  }

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), MAX_ENTRY_LIMIT);
  const skip = (page - 1) * limit;

  const sortField = register.fields.find((field) => field.key === req.query.sortBy);
  const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
  const sort = sortField ? { [`data.${sortField.key}`]: sortOrder } : { createdAt: sortOrder };

  const [entries, total] = await Promise.all([
    RegisterEntry.find(filter)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    RegisterEntry.countDocuments(filter)
  ]);

  res.status(StatusCodes.OK).json({
    register,
    entries,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
  });
};

export const createRegisterEntry = async (req, res) => {
  const register = await findRegisterOr404(req.params.id);

  if (!register.fields.length) {
    throw new AppError("Set up the register fields before adding entries", StatusCodes.BAD_REQUEST);
  }

  const entry = await RegisterEntry.create({
    register: register._id,
    data: buildEntryData(register, req.body.data || {}),
    createdBy: req.user._id,
    updatedBy: req.user._id
  });

  await entry.populate("createdBy", "name email");
  res.status(StatusCodes.CREATED).json({ entry });
};

export const updateRegisterEntry = async (req, res) => {
  const register = await findRegisterOr404(req.params.id);

  if (!mongoose.isValidObjectId(req.params.entryId)) {
    throw new AppError("Entry not found", StatusCodes.NOT_FOUND);
  }

  const entry = await RegisterEntry.findOne({ _id: req.params.entryId, register: register._id });
  if (!entry) throw new AppError("Entry not found", StatusCodes.NOT_FOUND);

  entry.data = buildEntryData(register, req.body.data || {}, entry.data || {});
  entry.updatedBy = req.user._id;
  entry.markModified("data");
  await entry.save();

  await entry.populate("createdBy", "name email");
  await entry.populate("updatedBy", "name email");
  res.status(StatusCodes.OK).json({ entry });
};

export const deleteRegisterEntry = async (req, res) => {
  const register = await findRegisterOr404(req.params.id);

  if (!mongoose.isValidObjectId(req.params.entryId)) {
    throw new AppError("Entry not found", StatusCodes.NOT_FOUND);
  }

  const entry = await RegisterEntry.findOneAndDelete({ _id: req.params.entryId, register: register._id });
  if (!entry) throw new AppError("Entry not found", StatusCodes.NOT_FOUND);

  res.status(StatusCodes.OK).json({ message: "Entry deleted successfully" });
};
