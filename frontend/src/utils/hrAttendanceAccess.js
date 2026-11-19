const HR_ATTENDANCE_EMAILS = [
  "rathika.haleangadi@valencianutrition.com",
  "premal.mehta@valencianutrition.com",
];

export const canOpenHrAttendance = (user) =>
  HR_ATTENDANCE_EMAILS.includes(String(user?.email || "").trim().toLowerCase());
