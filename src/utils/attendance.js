import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek.js";

dayjs.extend(isoWeek);

export const MIN_AUTO_CHECKOUT_DELAY_MINUTES = 180;

export const DEFAULT_ATTENDANCE_POLICY = {
  dailyTargetHours: 9,
  reminderDelayMinutes: 30,
  autoCheckoutDelayMinutes: MIN_AUTO_CHECKOUT_DELAY_MINUTES,
  lunchIncludedInShift: true,
  autoDeductLunchMinutes: 0,
  workWeekDays: [1, 2, 3, 4, 5],
  holidays: [],
  shifts: {
    shift1: {
      name: "Shift 1",
      startTime: "09:30",
      endTime: "19:30",
      lunchBreakStart: "13:30",
      lunchBreakEnd: "16:00",
      variants: []
    },
    shift2: {
      name: "Shift 2",
      startTime: "13:00",
      endTime: "23:00",
      lunchBreakStart: "19:00",
      lunchBreakEnd: "23:00",
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
  autoCheckoutDelayMinutes: Math.max(
    MIN_AUTO_CHECKOUT_DELAY_MINUTES,
    Number(policy.autoCheckoutDelayMinutes ?? DEFAULT_ATTENDANCE_POLICY.autoCheckoutDelayMinutes)
  ),
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
      lunchBreakStart: policy.shifts?.shift1?.lunchBreakStart || DEFAULT_ATTENDANCE_POLICY.shifts.shift1.lunchBreakStart,
      lunchBreakEnd: policy.shifts?.shift1?.lunchBreakEnd || DEFAULT_ATTENDANCE_POLICY.shifts.shift1.lunchBreakEnd,
      variants: normalizeVariants(policy.shifts?.shift1?.variants || DEFAULT_ATTENDANCE_POLICY.shifts.shift1.variants)
    },
    shift2: {
      ...DEFAULT_ATTENDANCE_POLICY.shifts.shift2,
      ...(policy.shifts?.shift2 || {}),
      lunchBreakStart: policy.shifts?.shift2?.lunchBreakStart || DEFAULT_ATTENDANCE_POLICY.shifts.shift2.lunchBreakStart,
      lunchBreakEnd: policy.shifts?.shift2?.lunchBreakEnd || DEFAULT_ATTENDANCE_POLICY.shifts.shift2.lunchBreakEnd,
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
    autoDeductLunchMinutes: normalizedPolicy.autoDeductLunchMinutes,
    lunchBreakStart: shiftPolicy.lunchBreakStart || null,
    lunchBreakEnd: shiftPolicy.lunchBreakEnd || null
  };
};

export const getShiftWindow = (dateKey, shiftSnapshot) => {
  const shiftStart = dayjs(`${dateKey} ${shiftSnapshot.startTime}:00`);
  let shiftEnd = dayjs(`${dateKey} ${shiftSnapshot.endTime}:00`);
  if (!shiftEnd.isAfter(shiftStart)) {
    shiftEnd = shiftEnd.add(1, "day");
  }

  const reminderDelayMinutes = Number(shiftSnapshot?.reminderDelayMinutes || 0);
  const autoCheckoutDelayMinutes = Math.max(
    MIN_AUTO_CHECKOUT_DELAY_MINUTES,
    Number(shiftSnapshot?.autoCheckoutDelayMinutes ?? DEFAULT_ATTENDANCE_POLICY.autoCheckoutDelayMinutes)
  );

  return {
    shiftStart,
    shiftEnd,
    reminderAt: shiftEnd.add(reminderDelayMinutes, "minute"),
    autoCheckoutAt: shiftEnd.add(autoCheckoutDelayMinutes, "minute")
  };
};

export const computeAttendanceSummary = (sessions = [], shiftSnapshot = null) => {
  let totalMilliseconds = 0;
  let totalLunchMinutes = 0;
  let totalPermissionMinutes = 0;
  let missedCheckoutCount = 0;

  sessions.forEach((session) => {
    if (session.checkIn && session.checkOut) {
      const sessionMs = new Date(session.checkOut) - new Date(session.checkIn);
      totalLunchMinutes += session.lunchMinutes || 0;
      totalPermissionMinutes += session.permissionMinutes || 0;
      if (!session.isSystemLunchBreak) {
        totalMilliseconds += sessionMs;
      }
    }

    if (session.autoCheckoutApplied) {
      missedCheckoutCount += 1;
    }
  });

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

const parseDateTime = (dateKey, timeValue) => {
  if (!dateKey || !timeValue) return null;
  const parsed = dayjs(`${dateKey} ${timeValue}`);
  return parsed.isValid() ? parsed : null;
};

const hasLunchGapBetweenSessions = (sessions, lunchStart, lunchEnd) => {
  for (let index = 0; index < sessions.length - 1; index += 1) {
    const current = sessions[index];
    const next = sessions[index + 1];
    if (!current?.checkOut || !next?.checkIn || current?.isSystemLunchBreak || next?.isSystemLunchBreak) {
      continue;
    }

    const gapStart = dayjs(current.checkOut);
    const gapEnd = dayjs(next.checkIn);
    if (!gapStart.isValid() || !gapEnd.isValid() || !gapEnd.isAfter(gapStart)) {
      continue;
    }

    const overlapsLunchWindow = gapStart.isBefore(lunchEnd) && gapEnd.isAfter(lunchStart);
    if (!overlapsLunchWindow) {
      continue;
    }

    current.reason = "Lunch";
    current.lunchMinutes = Math.max(Number(current.lunchMinutes || 0), 60);
    current.permissionMinutes = 0;
    return true;
  }

  return false;
};

const workedThroughLunchWindow = (sessions, lunchStart, lunchEnd) =>
  sessions.some((session) => {
    if (!session?.checkIn || !session?.checkOut || session?.isSystemLunchBreak) {
      return false;
    }

    const checkIn = dayjs(session.checkIn);
    const checkOut = dayjs(session.checkOut);
    if (!checkIn.isValid() || !checkOut.isValid() || !checkOut.isAfter(checkIn)) {
      return false;
    }

    return checkIn.isBefore(lunchEnd) && checkOut.isAfter(lunchStart);
  });

export const applyLunchBreakPolicy = (attendance, referenceMoment = dayjs()) => {
  const lunchStart = parseDateTime(attendance?.date, attendance?.shiftSnapshot?.lunchBreakStart);
  const lunchEnd = parseDateTime(attendance?.date, attendance?.shiftSnapshot?.lunchBreakEnd);
  if (!lunchStart || !lunchEnd || !lunchEnd.isAfter(lunchStart)) {
    return false;
  }

  const sessions = attendance?.sessions || [];
  if (!sessions.length) {
    return false;
  }

  sessions.sort((left, right) => dayjs(left.checkIn).valueOf() - dayjs(right.checkIn).valueOf());

  const alreadyTaggedLunch = sessions.some((session) => session?.isSystemLunchBreak || Number(session?.lunchMinutes || 0) >= 60 || session?.reason === "Lunch");
  if (alreadyTaggedLunch) {
    return false;
  }

  const detectedLunchGap = hasLunchGapBetweenSessions(sessions, lunchStart, lunchEnd);
  if (detectedLunchGap) {
    return true;
  }

  if (!referenceMoment || !dayjs(referenceMoment).isAfter(lunchEnd)) {
    return false;
  }

  const hasOpenSession = Boolean(sessions.at(-1) && !sessions.at(-1).checkOut);
  if (hasOpenSession) {
    return false;
  }

  if (!workedThroughLunchWindow(sessions, lunchStart, lunchEnd)) {
    return false;
  }

  const candidateLunchEnd = lunchStart.add(60, "minute");
  const autoLunchEnd = candidateLunchEnd.isAfter(lunchEnd) ? lunchEnd : candidateLunchEnd;
  sessions.push({
    checkIn: lunchStart.toDate(),
    checkOut: autoLunchEnd.toDate(),
    reason: "Lunch",
    reasonNote: "Auto-created lunch break as per shift lunch policy",
    lunchMinutes: 60,
    permissionMinutes: 0,
    autoCheckoutApplied: false,
    autoCheckedOutAt: null,
    reminderSentAt: null,
    lunchReminderSentAt: null,
    isSystemLunchBreak: true,
    shiftSnapshot: attendance.shiftSnapshot || null
  });

  sessions.sort((left, right) => dayjs(left.checkIn).valueOf() - dayjs(right.checkIn).valueOf());
  return true;
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
