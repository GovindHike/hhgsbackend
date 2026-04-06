import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { ROLES, SHIFT_TYPES } from "../utils/constants.js";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: Object.values(ROLES), required: true, index: true },
    employeeCode: { type: String, unique: true, sparse: true },
    dateOfBirth: { type: Date, default: null },
    joiningDate: { type: Date, default: null },
    profilePhotoUrl: { type: String, trim: true, default: "" },
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", default: null, index: true },
    shift: { type: String, enum: SHIFT_TYPES, default: "Shift 1" },
    leaveBalance: {
      planned: { type: Number, default: 12, min: 0 },
      sick: { type: Number, default: 6, min: 0 }
    },
    leaveYearStart: { type: Date, default: null },
    isFirstLogin: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) {
    return next();
  }

  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.password);
};

export const User = mongoose.model("User", userSchema);
