export const computeAttendanceSummary = (sessions = []) => {
  let totalMilliseconds = 0;
  let totalLunchMinutes = 0;
  let totalPermissionMinutes = 0;

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
  });

  return {
    totalMilliseconds,
    totalHours: Number((totalMilliseconds / (1000 * 60 * 60)).toFixed(2)),
    totalLunchMinutes,
    totalPermissionMinutes
  };
};
