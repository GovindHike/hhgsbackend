import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek.js";

dayjs.extend(isoWeek);

export const DEFAULT_ATTENDANCE_POLICY = {
  dailyTargetHours: 9,
  reminderDelayMinutes: 30,
  autoCheckoutDelayMinutes: 120,
  lunchIncludedInShift: true,
  autoDeductLunchMinutes: 0,
  workWeekDays: [1, 2, 3, 4, 5],
  holidays: [],
  shifts: {
    shift1: {
      name: "Shift 1",
      startTime: "09:30",
      endTime: "19:30",
      variants: []
    },
    shift2: {
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
};

const normalizeVariants = (variants = []) =>
  variants.map((variant) => ({
    label: variant.label,
    startTime: variant.startTime,
    endTime: variant.endTime,
    effectiveFrom: variant.effectiveFrom || null,
    effectiveTo: variant.effectiveTo || null,
    isDefault: Boolean(variant.isDefault)
  }));

export const normalizeAttendancePolicy = (policy = {}) => ({
  dailyTargetHours: Number(policy.dailyTargetHours ?? DEFAULT_ATTENDANCE_POLICY.dailyTargetHours),
  reminderDelayMinutes: Number(policy.reminderDelayMinutes ?? DEFAULT_ATTENDANCE_POLICY.reminderDelayMinutes),
  autoCheckoutDelayMinutes: Number(policy.autoCheckoutDelayMinutes ?? DEFAULT_ATTENDANCE_POLICY.autoCheckoutDelayMinutes),
  lunchIncludedInShift: Boolean(policy.lunchIncludedInShift ?? DEFAULT_ATTENDANCE_POLICY.lunchIncludedInShift),
  autoDeductLunchMinutes: Number(policy.autoDeductLunchMinutes ?? DEFAULT_ATTENDANCE_POLICY.autoDeductLunchMinutes),
  workWeekDays: Array.isArray(policy.workWeekDays) && policy.workWeekDays.length ? policy.workWeekDays : DEFAULT_ATTENDANCE_POLICY.workWeekDays,
  holidays: Array.isArray(policy.holidays)
    ? policy.holidays.map((holiday) => ({
        date: holiday?.date || "",
        label: holiday?.label || ""
      }))
    : DEFAULT_ATTENDANCE_POLICY.holidays,
  shifts: {
    shift1: {
      ...DEFAULT_ATTENDANCE_POLICY.shifts.shift1,
      ...(policy.shifts?.shift1 || {}),
      variants: normalizeVariants(policy.shifts?.shift1?.variants || DEFAULT_ATTENDANCE_POLICY.shifts.shift1.variants)
    },
    shift2: {
      ...DEFAULT_ATTENDANCE_POLICY.shifts.shift2,
      ...(policy.shifts?.shift2 || {}),
      variants: normalizeVariants(policy.shifts?.shift2?.variants || DEFAULT_ATTENDANCE_POLICY.shifts.shift2.variants)
    }
  }
});

const getShiftPolicyKey = (shift = "Shift 1") => (shift === "Shift 2" ? "shift2" : "shift1");

const isVariantEffectiveForDate = (variant, dateKey) => {
  if (!variant) return false;
  const startsOkay = !variant.effectiveFrom || dateKey >= variant.effectiveFrom;
  const endsOkay = !variant.effectiveTo || dateKey <= variant.effectiveTo;
  return startsOkay && endsOkay;
};

export const resolveShiftSnapshot = ({ shift = "Shift 1", dateKey, policy = DEFAULT_ATTENDANCE_POLICY } = {}) => {
  const normalizedPolicy = normalizeAttendancePolicy(policy);
  const shiftPolicy = normalizedPolicy.shifts[getShiftPolicyKey(shift)] || normalizedPolicy.shifts.shift1;
  const effectiveVariant = (shiftPolicy.variants || []).find((variant) => isVariantEffectiveForDate(variant, dateKey)) ||
    (shiftPolicy.variants || []).find((variant) => variant.isDefault);

  return {
    shift,
    scheduleLabel: effectiveVariant?.label || shiftPolicy.name,
    startTime: effectiveVariant?.startTime || shiftPolicy.startTime,
    endTime: effectiveVariant?.endTime || shiftPolicy.endTime,
    expectedHours: normalizedPolicy.dailyTargetHours,
    reminderDelayMinutes: normalizedPolicy.reminderDelayMinutes,
    autoCheckoutDelayMinutes: normalizedPolicy.autoCheckoutDelayMinutes,
    lunchIncludedInShift: normalizedPolicy.lunchIncludedInShift,
    autoDeductLunchMinutes: normalizedPolicy.autoDeductLunchMinutes
  };
};

export const getShiftWindow = (dateKey, shiftSnapshot) => {
  const shiftStart = dayjs(`${dateKey} ${shiftSnapshot.startTime}:00`);
  let shiftEnd = dayjs(`${dateKey} ${shiftSnapshot.endTime}:00`);
  if (!shiftEnd.isAfter(shiftStart)) {
    shiftEnd = shiftEnd.add(1, "day");
  }

  return {
    shiftStart,
    shiftEnd,
    reminderAt: shiftEnd.add(shiftSnapshot.reminderDelayMinutes || 0, "minute"),
    autoCheckoutAt: shiftEnd.add(shiftSnapshot.autoCheckoutDelayMinutes || 0, "minute")
  };
};

export const computeAttendanceSummary = (sessions = [], shiftSnapshot = null) => {
  let totalMilliseconds = 0;
  let totalLunchMinutes = 0;
  let totalPermissionMinutes = 0;
  let missedCheckoutCount = 0;

  sessions.forEach((session) => {
    if (session.checkIn && session.checkOut) {
      let sessionMs = new Date(session.checkOut) - new Date(session.checkIn);
      const lunchMs = (session.lunchMinutes || 0) * 60 * 1000;
      const permissionsMs = (session.permissionMinutes || 0) * 60 * 1000;
      totalLunchMinutes += session.lunchMinutes || 0;
      totalPermissionMinutes += session.permissionMinutes || 0;
      sessionMs = Math.max(0, sessionMs - lunchMs - permissionsMs);
      totalMilliseconds += sessionMs;
    }

    if (session.autoCheckoutApplied) {
      missedCheckoutCount += 1;
    }
  });

  const policyLunchMinutes = shiftSnapshot?.autoDeductLunchMinutes || 0;
  if (policyLunchMinutes > 0) {
    totalMilliseconds = Math.max(0, totalMilliseconds - policyLunchMinutes * 60 * 1000);
    totalLunchMinutes += policyLunchMinutes;
  }

  const totalHours = Number((totalMilliseconds / (1000 * 60 * 60)).toFixed(2));
  const expectedHours = Number(shiftSnapshot?.expectedHours || 0);

  return {
    totalMilliseconds,
    totalHours,
    totalLunchMinutes,
    totalPermissionMinutes,
    expectedHours,
    varianceHours: Number((totalHours - expectedHours).toFixed(2)),
    missedCheckoutCount
  };
};

export const getSummaryRange = ({ period = "week", referenceDate } = {}) => {
  const baseDate = referenceDate ? dayjs(referenceDate) : dayjs();
  if (period === "month") {
    return {
      start: baseDate.startOf("month"),
      end: baseDate.endOf("month"),
      label: baseDate.format("MMMM YYYY")
    };
  }

  return {
    start: baseDate.startOf("isoWeek"),
    end: baseDate.endOf("isoWeek"),
    label: `${baseDate.startOf("isoWeek").format("DD MMM YYYY")} - ${baseDate.endOf("isoWeek").format("DD MMM YYYY")}`
  };
};

export const buildAttendanceSummary = (records = [], { period = "week", referenceDate } = {}) => {
  const range = getSummaryRange({ period, referenceDate });
  const totals = records.reduce(
    (accumulator, record) => {
      accumulator.totalHours += Number(record.totalHours || 0);
      accumulator.expectedHours += Number(record.expectedHours || record.shiftSnapshot?.expectedHours || 0);
      accumulator.missedCheckoutCount += Number(record.missedCheckoutCount || 0);
      accumulator.totalDays += 1;
      return accumulator;
    },
    { totalHours: 0, expectedHours: 0, missedCheckoutCount: 0, totalDays: 0 }
  );

  totals.totalHours = Number(totals.totalHours.toFixed(2));
  totals.expectedHours = Number(totals.expectedHours.toFixed(2));
  totals.varianceHours = Number((totals.totalHours - totals.expectedHours).toFixed(2));

  return {
    period,
    label: range.label,
    startDate: range.start.format("YYYY-MM-DD"),
    endDate: range.end.format("YYYY-MM-DD"),
    totalHours: totals.totalHours,
    expectedHours: totals.expectedHours,
    varianceHours: totals.varianceHours,
    missedCheckoutCount: totals.missedCheckoutCount,
    totalDays: totals.totalDays
  };
};
