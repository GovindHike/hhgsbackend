export const computeAttendanceSummary = (sessions = []) => {
  let totalMilliseconds = 0;

  sessions.forEach((session) => {
    if (session.checkIn && session.checkOut) {
      totalMilliseconds += new Date(session.checkOut) - new Date(session.checkIn);
    }
  });

  return {
    totalMilliseconds,
    totalHours: Number((totalMilliseconds / (1000 * 60 * 60)).toFixed(2))
  };
};
