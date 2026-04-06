import mongoose from "mongoose";

const scheduleVariantSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    effectiveFrom: { type: String, default: null, trim: true },
    effectiveTo: { type: String, default: null, trim: true },
    isDefault: { type: Boolean, default: false }
  },
  { _id: false }
);

const shiftPolicySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    variants: { type: [scheduleVariantSchema], default: [] }
  },
  { _id: false }
);

const attendancePolicySchema = new mongoose.Schema(
  {
    dailyTargetHours: { type: Number, default: 9 },
    reminderDelayMinutes: { type: Number, default: 30 },
    autoCheckoutDelayMinutes: { type: Number, default: 120 },
    lunchIncludedInShift: { type: Boolean, default: true },
    autoDeductLunchMinutes: { type: Number, default: 0 },
    workWeekDays: { type: [Number], default: [1, 2, 3, 4, 5] },
    holidays: {
      type: [
        new mongoose.Schema(
          {
            date: { type: String, required: true, trim: true },
            label: { type: String, default: "", trim: true }
          },
          { _id: false }
        )
      ],
      default: []
    },
    shifts: {
      shift1: {
        type: shiftPolicySchema,
        default: {
          name: "Shift 1",
          startTime: "09:30",
          endTime: "19:30",
          variants: []
        }
      },
      shift2: {
        type: shiftPolicySchema,
        default: {
          name: "Shift 2",
          startTime: "13:00",
          endTime: "23:00",
          variants: [
            {
              label: "US Daylight Saving",
              startTime: "14:00",
              endTime: "00:00",
              effectiveFrom: null,
              effectiveTo: null,
              isDefault: false
            }
          ]
        }
      }
    }
  },
  { _id: false }
);

const settingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    primaryColor: {
      type: String,
      default: "#2563eb",
      trim: true
    },
    templates: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    attendancePolicy: {
      type: attendancePolicySchema,
      default: () => ({})
    }
  },
  {
    timestamps: true
  }
);

export const Setting = mongoose.model("Setting", settingSchema);
