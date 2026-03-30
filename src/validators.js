import Joi from "joi";
import { ASSET_STATUSES, LEAVE_STATUSES, ROLES, TASK_STATUSES } from "./utils/constants.js";

const emailRule = Joi.string().email({ tlds: { allow: false } });

export const authValidators = {
  login: Joi.object({
    email: emailRule.required(),
    password: Joi.string().required()
  }),
  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).required()
  }),
  resetPassword: Joi.object({
    email: emailRule.required()
  })
};

export const userValidators = {
  create: Joi.object({
    name: Joi.string().required(),
    email: emailRule.required(),
    role: Joi.string().valid(...Object.values(ROLES)).required(),
    employeeCode: Joi.string().allow("", null),
    team: Joi.string().allow(null, "")
  }),
  update: Joi.object({
    name: Joi.string(),
    email: emailRule,
    role: Joi.string().valid(...Object.values(ROLES)),
    employeeCode: Joi.string().allow("", null),
    team: Joi.string().allow(null, ""),
    isActive: Joi.boolean()
  }).min(1)
};

export const teamValidators = {
  create: Joi.object({
    name: Joi.string().required(),
    description: Joi.string().allow("", null),
    lead: Joi.string().allow("", null),
    members: Joi.array().items(Joi.string()).default([])
  }),
  update: Joi.object({
    name: Joi.string(),
    description: Joi.string().allow("", null),
    lead: Joi.string().allow("", null),
    members: Joi.array().items(Joi.string())
  }).min(1)
};

export const assetValidators = {
  create: Joi.object({
    name: Joi.string().allow("", null),
    type: Joi.string().allow("", null),
    category: Joi.string().allow("", null),
    description: Joi.string().allow("", null),
    uniqueAssetId: Joi.string().required(),
    complaints: Joi.array().items(
      Joi.object({
        details: Joi.string().required(),
        date: Joi.date().required(),
        receiptName: Joi.string().allow("", null),
        receiptData: Joi.string().allow("", null)
      })
    ),
    purchaseDate: Joi.date().allow(null),
    vendor: Joi.string().allow("", null),
    cost: Joi.number().precision(2).min(0).default(0),
    location: Joi.string().valid("Regional office", "new office").default("Regional office"),
    serialNumber: Joi.string().allow("", null),
    assignedTo: Joi.string().allow("", null),
    status: Joi.string().valid(...ASSET_STATUSES).default("Available"),
    complaint: Joi.string().allow("", null),
    complaintDate: Joi.date().allow(null),
    recoverDate: Joi.date().allow(null),
    remarks: Joi.string().allow("", null),
    note: Joi.string().allow("", null)
  }),
  update: Joi.object({
    name: Joi.string(),
    type: Joi.string(),
    category: Joi.string().allow("", null),
    description: Joi.string().allow("", null),
    uniqueAssetId: Joi.string(),
    complaints: Joi.array().items(
      Joi.object({
        details: Joi.string().required(),
        date: Joi.date().required(),
        receiptName: Joi.string().allow("", null),
        receiptData: Joi.string().allow("", null)
      })
    ),
    purchaseDate: Joi.date().allow(null),
    vendor: Joi.string().allow("", null),
    cost: Joi.number().precision(2).min(0),
    location: Joi.string().valid("Regional office", "new office"),
    serialNumber: Joi.string().allow("", null),
    assignedTo: Joi.string().allow("", null),
    status: Joi.string().valid(...ASSET_STATUSES),
    complaint: Joi.string().allow("", null),
    complaintDate: Joi.date().allow(null),
    recoverDate: Joi.date().allow(null),
    remarks: Joi.string().allow("", null),
    note: Joi.string().allow("", null)
  }).min(1),
  movement: Joi.object({
    action: Joi.string().valid("OUT", "IN").required(),
    date: Joi.date().required(),
    reason: Joi.string().required(),
    note: Joi.string().allow("", null)
  }),
  complaint: Joi.object({
    details: Joi.string().required(),
    date: Joi.date().required(),
    receiptName: Joi.string().allow("", null),
    receiptData: Joi.string().allow("", null)
  })
};

export const taskValidators = {
  create: Joi.object({
    title: Joi.string().required(),
    description: Joi.string().allow("", null),
    projectName: Joi.string().allow("", null),
    assignedTo: Joi.string().allow("", null),
    taskDate: Joi.date().required(),
    dueDate: Joi.date().allow(null),
    isDailyTask: Joi.boolean().default(false)
  }),
  updateStatus: Joi.object({
    status: Joi.string().valid(...TASK_STATUSES).required()
  }),
  command: Joi.object({
    message: Joi.string().trim().required()
  })
};

export const leaveValidators = {
  create: Joi.object({
    startDate: Joi.date().required(),
    endDate: Joi.date().min(Joi.ref("startDate")).required(),
    leaveType: Joi.string().valid("Full Day", "Half Day").required(),
    requestedType: Joi.string().valid("PLANNED", "SICK").required(),
    reason: Joi.string().required(),
    doctorProof: Joi.string().allow(null, ""),
    finalType: Joi.string().valid("PLANNED", "SICK").allow(null)
  }),
  decide: Joi.object({
    action: Joi.string().valid("approve", "approve_sick", "convert_planned", "reject").required(),
    finalType: Joi.string().valid("PLANNED", "SICK").allow(null)
  })
};
