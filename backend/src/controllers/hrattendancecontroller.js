const db = require("../config/db");
const { parse } = require("csv-parse/sync");
const XLSX = require("xlsx");

const HR_EMAILS = [
  "rathika.haleangadi@valencianutrition.com",
];

const FIXED_HOLIDAYS = {
  "01-26": "Republic Day",
  "05-01": "Maharashtra Day",
  "08-15": "Independence Day",
  "10-02": "Gandhi Jayanti",
};

/* =========================================================
   AUTH
========================================================= */

const isAuthorizedHR = (req) => {
  const email = String(req.user?.email || "")
    .trim()
    .toLowerCase();

  return HR_EMAILS.includes(email);
};

/* =========================================================
   DATE / TIME HELPERS
========================================================= */

const formatDate = (value) => {
  if (!value) return null;

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const addOneDay = (dateString) => {
  const date = new Date(`${dateString}T00:00:00`);

  date.setDate(date.getDate() + 1);

  return formatDate(date);
};

const getDayName = (dateString) => {
  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("en-US", {
    weekday: "long",
  });
};

const getHolidayName = (dateString) => {
  const monthDay = String(dateString || "").slice(5);

  return FIXED_HOLIDAYS[monthDay] || null;
};

const formatTime = (value) => {
  if (!value) return null;

  const text = String(value);

  if (text.includes("T")) {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return date.toTimeString().slice(0, 8);
    }
  }

  return text.slice(0, 8);
};

const calculateWorkingMinutes = (
  checkIn,
  checkOut,
  savedMinutes = 0
) => {
  const existing = Number(savedMinutes || 0);

  if (existing > 0) {
    return existing;
  }

  if (!checkIn || !checkOut) {
    return 0;
  }

  const [inHour, inMinute] = String(checkIn)
    .split(":")
    .map(Number);

  const [outHour, outMinute] = String(checkOut)
    .split(":")
    .map(Number);

  if (
    Number.isNaN(inHour) ||
    Number.isNaN(inMinute) ||
    Number.isNaN(outHour) ||
    Number.isNaN(outMinute)
  ) {
    return 0;
  }

  const start = inHour * 60 + inMinute;
  const end = outHour * 60 + outMinute;

  return Math.max(end - start, 0);
};

const formatWorkingHours = (minutes) => {
  const total = Number(minutes || 0);

  if (!total) return "-";

  const hours = Math.floor(total / 60);
  const remainingMinutes = total % 60;

  if (hours && remainingMinutes) {
    return `${hours}h ${remainingMinutes}m`;
  }

  if (hours) {
    return `${hours}h`;
  }

  return `${remainingMinutes}m`;
};

/* =========================================================
   LEAVE HELPERS
========================================================= */

const getLeaveLabel = (leaveType) => {
  switch (String(leaveType || "").toLowerCase()) {
    case "sick":
      return "Sick Leave";

    case "casual":
      return "Casual Leave";

    case "mandatory":
      return "Privileged Leave";

    case "festival":
      return "Festival Leave";

    case "unpaid":
      return "Unpaid Leave";

    default:
      return "Leave";
  }
};

/* =========================================================
   IMPORT HELPERS
========================================================= */

const cleanText = (value) => {
  return String(value || "").trim();
};

const normalizeEmail = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase();
};

const normalizeKey = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
};

const getValue = (row, keys) => {
  for (const key of keys) {
    if (
      row[key] !== undefined &&
      row[key] !== null &&
      String(row[key]).trim() !== ""
    ) {
      return String(row[key]).trim();
    }
  }

  const normalizedRow = {};

  Object.keys(row).forEach((key) => {
    normalizedRow[normalizeKey(key)] = row[key];
  });

  for (const key of keys) {
    const normalizedKey = normalizeKey(key);

    if (
      normalizedRow[normalizedKey] !== undefined &&
      normalizedRow[normalizedKey] !== null &&
      String(normalizedRow[normalizedKey]).trim() !== ""
    ) {
      return String(normalizedRow[normalizedKey]).trim();
    }
  }

  return "";
};

const parseUploadedAttendanceFile = (file) => {
  const fileName = String(file.originalname || "").toLowerCase();

  if (
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".xls")
  ) {
    const workbook = XLSX.read(file.buffer, {
      type: "buffer",
      raw: false,
    });

    const worksheet =
      workbook.Sheets[workbook.SheetNames[0]];

    const rows = XLSX.utils.sheet_to_json(
      worksheet,
      {
        header: 1,
        defval: "",
        raw: false,
        blankrows: false,
      }
    );

    let headerRowIndex = -1;

    for (let index = 0; index < rows.length; index += 1) {
      const text = rows[index]
        .map((cell) =>
          String(cell || "")
            .trim()
            .toLowerCase()
        )
        .join(" | ");

      const hasEmployee =
        text.includes("employee id") ||
        text.includes("employee code") ||
        text.includes("first name") ||
        text.includes("full name");

      if (
        hasEmployee &&
        text.includes("date")
      ) {
        headerRowIndex = index;
        break;
      }
    }

    if (headerRowIndex === -1) {
      throw new Error(
        "Could not find attendance header row."
      );
    }

    const headers =
      rows[headerRowIndex].map((header) =>
        String(header || "").trim()
      );

    return rows
      .slice(headerRowIndex + 1)
      .filter((row) =>
        row.some(
          (cell) =>
            String(cell || "").trim() !== ""
        )
      )
      .map((row) => {
        const object = {};

        headers.forEach((header, index) => {
          if (header) {
            object[header] = row[index] ?? "";
          }
        });

        return object;
      });
  }

  return parse(
    file.buffer.toString("utf8"),
    {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }
  );
};

const normalizeDateForMySQL = (value) => {
  if (!value) return null;

  const text = String(value).trim();

  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(text)) {
    const [day, month, year] = text.split("-");

    return `${year}-${month}-${day}`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    const [day, month, year] = text.split("/");

    return `${year}-${month}-${day}`;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return formatDate(date);
};

const normalizeTimeForMySQL = (value) => {
  if (!value) return null;

  const text = String(value).trim();

  if (!text) return null;

  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) {
    return text;
  }

  if (/^\d{1,2}:\d{2}$/.test(text)) {
    const [hour, minute] = text.split(":");

    return `${String(hour).padStart(2, "0")}:${minute}:00`;
  }

  const date = new Date(`1970-01-01 ${text}`);

  if (!Number.isNaN(date.getTime())) {
    return `${String(date.getHours()).padStart(
      2,
      "0"
    )}:${String(date.getMinutes()).padStart(
      2,
      "0"
    )}:${String(date.getSeconds()).padStart(
      2,
      "0"
    )}`;
  }

  return null;
};

const parseDurationToMinutes = (value) => {
  if (!value) return 0;

  const text = String(value).trim();

  if (!text) return 0;

  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) {
    const parts = text.split(":").map(Number);

    return (
      Number(parts[0] || 0) * 60 +
      Number(parts[1] || 0)
    );
  }

  const numeric = Number(text);

  return Number.isNaN(numeric)
    ? 0
    : numeric;
};

const normalizeImportedStatus = (value) => {
  const status = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  const map = {
    p: "present",
    present: "present",

    a: "absent",
    absent: "absent",

    hd: "half_day",
    halfday: "half_day",
    half_day: "half_day",

    late: "late",
    l: "late",

    holiday: "holiday",
    h: "holiday",
  };

  return map[status] || "present";
};

const findAttendanceUser = async ({
  employeeCode,
  email,
  fullName,
}) => {
  if (employeeCode) {
    const [rows] = await db.query(
      `
      SELECT
        user_id,
        employee_code,
        full_name,
        email

      FROM users

      WHERE TRIM(employee_code) = TRIM(?)
        AND LOWER(COALESCE(status, 'active')) != 'deleted'

      LIMIT 1
      `,
      [employeeCode]
    );

    if (rows.length) {
      return rows[0];
    }
  }

  if (email) {
    const [rows] = await db.query(
      `
      SELECT
        user_id,
        employee_code,
        full_name,
        email

      FROM users

      WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
        AND LOWER(COALESCE(status, 'active')) != 'deleted'

      LIMIT 1
      `,
      [email]
    );

    if (rows.length) {
      return rows[0];
    }
  }

  if (fullName) {
    const [rows] = await db.query(
      `
      SELECT
        user_id,
        employee_code,
        full_name,
        email

      FROM users

      WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?))
        AND LOWER(COALESCE(status, 'active')) != 'deleted'

      ORDER BY user_id ASC
      LIMIT 1
      `,
      [fullName]
    );

    if (rows.length) {
      return rows[0];
    }
  }

  return null;
};

/* =========================================================
   MASTER HR REGISTER BUILDER
========================================================= */

const buildHrAttendanceData = async (
  fromDate,
  toDate
) => {
  /* =======================================================
     USERS
  ======================================================= */

  const [users] = await db.query(
    `
    SELECT
      u.user_id,
      u.employee_code,
      u.full_name,
      u.email,
      u.designation,
      u.department_id,

      d.department_name,
      r.role_name,

      DATE_FORMAT(
        ep.joining_date,
        '%Y-%m-%d'
      ) AS joining_date

    FROM users u

    LEFT JOIN departments d
      ON d.department_id = u.department_id

    LEFT JOIN roles r
      ON r.role_id = u.role_id

    LEFT JOIN employee_profiles ep
      ON ep.user_id = u.user_id

    WHERE LOWER(
      COALESCE(
        u.status,
        'active'
      )
    ) = 'active'

    ORDER BY
      d.department_name ASC,
      u.full_name ASC
    `
  );

  if (!users.length) {
    return {
      users: [],
      records: [],
      summary: {},
      biometric_range: {
        first_date: null,
        last_date: null,
      },
    };
  }

  const userIds = users
    .map((user) => Number(user.user_id))
    .filter(Boolean);

  const placeholders =
    userIds.map(() => "?").join(",");

  /* =======================================================
     BIOMETRIC RANGE
  ======================================================= */

  const [rangeRows] = await db.query(
    `
    SELECT
      DATE_FORMAT(
        MIN(attendance_date),
        '%Y-%m-%d'
      ) AS first_date,

      DATE_FORMAT(
        MAX(attendance_date),
        '%Y-%m-%d'
      ) AS last_date

    FROM attendance
    `
  );

  const biometricFirstDate =
    rangeRows[0]?.first_date || null;

  const biometricLastDate =
    rangeRows[0]?.last_date || null;

  /* =======================================================
     FIRST ATTENDANCE PER EMPLOYEE
  ======================================================= */

  const [firstAttendanceRows] = await db.query(
    `
    SELECT
      employee_id,

      DATE_FORMAT(
        MIN(attendance_date),
        '%Y-%m-%d'
      ) AS first_attendance_date

    FROM attendance

    WHERE employee_id IN (${placeholders})

    GROUP BY employee_id
    `,
    userIds
  );

  const firstAttendanceMap = new Map();

  firstAttendanceRows.forEach((row) => {
    firstAttendanceMap.set(
      Number(row.employee_id),
      row.first_attendance_date
    );
  });

  /* =======================================================
     ATTENDANCE
  ======================================================= */

  const [attendanceRows] = await db.query(
    `
    SELECT
      attendance_id,
      employee_id,

      DATE_FORMAT(
        attendance_date,
        '%Y-%m-%d'
      ) AS attendance_date,

      check_in_time,
      check_out_time,
      total_minutes,
      status,
      remarks

    FROM attendance

    WHERE employee_id IN (${placeholders})
      AND attendance_date BETWEEN ? AND ?

    ORDER BY attendance_date ASC
    `,
    [
      ...userIds,
      fromDate,
      toDate,
    ]
  );

  /* =======================================================
     APPROVED LEAVES
  ======================================================= */

  const [leaveRows] = await db.query(
    `
    SELECT
      la.leave_id,
      la.employee_id,
      la.leave_type,
      la.subject,

      DATE_FORMAT(
        la.start_date,
        '%Y-%m-%d'
      ) AS start_date,

      DATE_FORMAT(
        la.end_date,
        '%Y-%m-%d'
      ) AS end_date,

      la.total_days,
      la.duration_type,
      la.half_day_session,
      la.reason,
      la.status,
      la.review_remark,
      la.reviewed_by,

      DATE_FORMAT(
        la.reviewed_at,
        '%Y-%m-%d %H:%i:%s'
      ) AS reviewed_at,

      reviewer.full_name AS reviewed_by_name,
      reviewer.email AS reviewed_by_email

    FROM leave_applications la

    LEFT JOIN users reviewer
      ON reviewer.user_id = la.reviewed_by

    WHERE LOWER(la.status) = 'approved'
      AND la.start_date <= ?
      AND la.end_date >= ?
    `,
    [
      toDate,
      fromDate,
    ]
  );

  /* =======================================================
     APPROVED FIELD VISITS
  ======================================================= */

  const [fieldVisitRows] = await db.query(
    `
    SELECT
      fv.visit_id,
      fv.employee_id,

      DATE_FORMAT(
        fv.visit_date,
        '%Y-%m-%d'
      ) AS visit_date,

      fv.visit_type,
      fv.start_time,
      fv.end_time,
      fv.location,
      fv.comment,
      fv.status,
      fv.review_remark,
      fv.reviewed_by,

      DATE_FORMAT(
        fv.reviewed_at,
        '%Y-%m-%d %H:%i:%s'
      ) AS reviewed_at,

      reviewer.full_name AS reviewed_by_name,
      reviewer.email AS reviewed_by_email

    FROM employee_field_visits fv

    LEFT JOIN users reviewer
      ON reviewer.user_id = fv.reviewed_by

    WHERE LOWER(fv.status) = 'approved'
      AND fv.visit_date BETWEEN ? AND ?
    `,
    [
      fromDate,
      toDate,
    ]
  );

  /* =======================================================
     FIELD VISIT MEMBERS
  ======================================================= */

  const visitIds =
    fieldVisitRows
      .map((visit) => Number(visit.visit_id))
      .filter(Boolean);

  let fieldVisitMembers = [];

  if (visitIds.length) {
    const visitPlaceholders =
      visitIds.map(() => "?").join(",");

    const [memberRows] = await db.query(
      `
      SELECT
        visit_id,
        employee_id

      FROM field_visit_members

      WHERE visit_id IN (${visitPlaceholders})
      `,
      visitIds
    );

    fieldVisitMembers = memberRows;
  }

  /* =======================================================
     MAP ATTENDANCE
  ======================================================= */

  const attendanceMap = new Map();

  attendanceRows.forEach((row) => {
    attendanceMap.set(
      `${Number(row.employee_id)}|${row.attendance_date}`,
      row
    );
  });

  /* =======================================================
     MAP LEAVE
  ======================================================= */

  const leaveMap = new Map();

  leaveRows.forEach((leave) => {
    let date = leave.start_date;

    while (date <= leave.end_date) {
      leaveMap.set(
        `${Number(leave.employee_id)}|${date}`,
        leave
      );

      date = addOneDay(date);
    }
  });

  /* =======================================================
     MAP FIELD VISITS
  ======================================================= */

  const visitMap = new Map();

  fieldVisitRows.forEach((visit) => {
    const employeeIds = new Set([
      Number(visit.employee_id),
    ]);

    fieldVisitMembers
      .filter(
        (member) =>
          Number(member.visit_id) ===
          Number(visit.visit_id)
      )
      .forEach((member) => {
        employeeIds.add(
          Number(member.employee_id)
        );
      });

    employeeIds.forEach((employeeId) => {
      visitMap.set(
        `${employeeId}|${visit.visit_date}`,
        visit
      );
    });
  });

  /* =======================================================
     BUILD FINAL REGISTER
  ======================================================= */

  const records = [];

  for (const user of users) {
    const firstAttendanceDate =
      firstAttendanceMap.get(
        Number(user.user_id)
      ) || null;

    /*
      For old biometric data:
      use joining date where available.

      If missing:
      fall back to first known biometric attendance.
    */

    const effectiveStartDate =
      user.joining_date ||
      firstAttendanceDate ||
      null;

    let currentDate = fromDate;

    while (currentDate <= toDate) {
      const key =
        `${Number(user.user_id)}|${currentDate}`;

      const attendance =
        attendanceMap.get(key);

      const leave =
        leaveMap.get(key);

      const fieldVisit =
        visitMap.get(key);

      /* =====================================================
         BEFORE JOINING
      ===================================================== */

      if (
        effectiveStartDate &&
        currentDate < effectiveStartDate
      ) {
        currentDate = addOneDay(currentDate);
        continue;
      }

      /*
        No reliable employment start and no actual record:
        do not invent attendance.
      */

      if (
        !effectiveStartDate &&
        !attendance &&
        !leave &&
        !fieldVisit
      ) {
        currentDate = addOneDay(currentDate);
        continue;
      }

      /* =====================================================
         AFTER LATEST BIOMETRIC IMPORT

         Going forward, RMS leave and field visits still show,
         but we do not create fake absence after the latest
         biometric import date.
      ===================================================== */

      if (
        biometricLastDate &&
        currentDate > biometricLastDate &&
        !attendance &&
        !leave &&
        !fieldVisit
      ) {
        currentDate = addOneDay(currentDate);
        continue;
      }

      const dayName =
        getDayName(currentDate);

      const sunday =
        dayName === "Sunday";

      const holidayName =
        getHolidayName(currentDate);

      const checkIn =
        attendance
          ? formatTime(attendance.check_in_time)
          : null;

      const checkOut =
        attendance
          ? formatTime(attendance.check_out_time)
          : null;

      const totalMinutes =
        attendance
          ? calculateWorkingMinutes(
              checkIn,
              checkOut,
              attendance.total_minutes
            )
          : 0;

      /* =====================================================
         RESULT DEFAULTS
      ===================================================== */

      let finalStatus = null;
      let source = null;
      let detail = "-";

      let leaveCode = null;
      let leaveType = null;
      let leaveDuration = null;
      let leaveSession = null;

      let fieldVisitType = null;
      let fieldVisitLocation = null;

      let approvedByName = null;
      let approvedByEmail = null;
      let approvedAt = null;

      let conflictReason = null;

      /* =====================================================
         DETECT SELECTIVE CONFLICTS
      ===================================================== */

      if (leave && fieldVisit) {
        conflictReason =
          "Approved leave and approved field visit exist on the same date.";
      }

      if (
        leave &&
        leave.duration_type === "full_day" &&
        checkIn &&
        checkOut
      ) {
        conflictReason =
          "Full-day approved leave exists together with biometric punches.";
      }

      if (
        attendance &&
        String(attendance.status || "").toLowerCase() === "absent" &&
        (checkIn || checkOut)
      ) {
        conflictReason =
          "Attendance is marked absent but biometric punch data exists.";
      }

      /* =====================================================
         NEEDS REVIEW

         Only genuine conflicts come here.
      ===================================================== */

      if (conflictReason) {
        finalStatus = "Needs Review";
        source = "conflict";
        detail = conflictReason;
      }

      /* =====================================================
         APPROVED LEAVE
      ===================================================== */

      else if (leave) {
        leaveCode = leave.leave_type;

        leaveType =
          getLeaveLabel(
            leave.leave_type
          );

        leaveDuration =
          leave.duration_type === "half_day"
            ? "Half Day"
            : "Full Day";

        leaveSession =
          leave.half_day_session || null;

        finalStatus =
          leave.duration_type === "half_day"
            ? "Half Day Leave"
            : leaveType;

        source = "rms_leave";

        detail =
          leave.reason ||
          leave.subject ||
          leaveType;

        approvedByName =
          leave.reviewed_by_name || null;

        approvedByEmail =
          leave.reviewed_by_email || null;

        approvedAt =
          leave.reviewed_at || null;
      }

      /* =====================================================
         FIELD VISIT
      ===================================================== */

      else if (fieldVisit) {
        finalStatus = "Field Visit";
        source = "rms_field_visit";

        fieldVisitType =
          fieldVisit.visit_type || null;

        fieldVisitLocation =
          fieldVisit.location || null;

        detail =
          fieldVisit.comment ||
          [
            fieldVisit.visit_type,
            fieldVisit.location,
          ]
            .filter(Boolean)
            .join(" · ") ||
          "Field Visit";

        approvedByName =
          fieldVisit.reviewed_by_name || null;

        approvedByEmail =
          fieldVisit.reviewed_by_email || null;

        approvedAt =
          fieldVisit.reviewed_at || null;
      }

      /* =====================================================
         BIOMETRIC / MANUAL ATTENDANCE
      ===================================================== */

      else if (attendance) {
        const rawStatus = String(
          attendance.status || "present"
        )
          .trim()
          .toLowerCase();

        /*
          Explicit manual absence.
        */

        if (
          rawStatus === "absent" &&
          !checkIn &&
          !checkOut
        ) {
          finalStatus = "Absent";
        }

        /*
          Only one punch.
        */

        else if (
          (checkIn && !checkOut) ||
          (!checkIn && checkOut)
        ) {
          finalStatus = "No Punch";
        }

        /*
          Explicit half day.
        */

        else if (
          rawStatus === "half_day"
        ) {
          finalStatus = "Half Day";
        }

        /*
          Explicit late.
        */

        else if (
          rawStatus === "late"
        ) {
          finalStatus = "Late";
        }

        /*
          Holiday record.
        */

        else if (
          rawStatus === "holiday"
        ) {
          finalStatus = "Holiday";
        }

        /*
          Both punches.
        */

        else if (
          checkIn &&
          checkOut
        ) {
          finalStatus = "Present";
        }

        /*
          Attendance record but no punches.
        */

        else {
          finalStatus = "Absent";
        }

        source = "attendance";
        detail =
          attendance.remarks || "-";
      }

      /* =====================================================
         CALENDAR
      ===================================================== */

      else if (sunday) {
        finalStatus = "Weekly Off";
        source = "calendar";
        detail = "Sunday";
      }

      else if (holidayName) {
        finalStatus = "Holiday";
        source = "calendar";
        detail = holidayName;
      }

      /* =====================================================
         NO PUNCH + NO RMS EXCEPTION = ABSENT

         This is the normal past-data rule.
      ===================================================== */

      else {
        finalStatus = "Absent";
        source = "system";
        detail = "No biometric attendance found";
      }

      records.push({
        user_id: user.user_id,
        employee_code: user.employee_code,
        full_name: user.full_name,
        email: user.email,
        designation: user.designation,
        department_id: user.department_id,
        department_name: user.department_name,
        role_name: user.role_name,

        joining_date:
          user.joining_date,

        first_attendance_date:
          firstAttendanceDate,

        attendance_id:
          attendance?.attendance_id || null,

        attendance_date:
          currentDate,

        day_name:
          dayName,

        check_in_time:
          checkIn || "-",

        check_out_time:
          checkOut || "-",

        total_minutes:
          totalMinutes,

        working_hours:
          formatWorkingHours(
            totalMinutes
          ),

        final_status:
          finalStatus,

        source,
        detail,

        conflict_reason:
          conflictReason,

        attendance_status:
          attendance?.status || null,

        attendance_remarks:
          attendance?.remarks || null,

        leave_id:
          leave?.leave_id || null,

        leave_code:
          leaveCode,

        leave_type:
          leaveType,

        leave_duration:
          leaveDuration,

        leave_session:
          leaveSession,

        leave_reason:
          leave?.reason ||
          leave?.subject ||
          null,

        field_visit_id:
          fieldVisit?.visit_id || null,

        field_visit_type:
          fieldVisitType,

        field_visit_location:
          fieldVisitLocation,

        field_visit_reason:
          fieldVisit?.comment || null,

        approved_by_name:
          approvedByName,

        approved_by_email:
          approvedByEmail,

        approved_at:
          approvedAt,
      });

      currentDate =
        addOneDay(currentDate);
    }
  }

  /* =======================================================
     SORT
  ======================================================= */

  records.sort((a, b) => {
    const dateComparison =
      String(
        b.attendance_date
      ).localeCompare(
        String(
          a.attendance_date
        )
      );

    if (dateComparison !== 0) {
      return dateComparison;
    }

    return String(
      a.full_name || ""
    ).localeCompare(
      String(
        b.full_name || ""
      )
    );
  });

  /* =======================================================
     SUMMARY
  ======================================================= */

  const summary = {
    employees:
      users.length,

    present: 0,
    late: 0,
    half_day: 0,
    absent: 0,
    no_punch: 0,
    needs_review: 0,

    weekly_off: 0,
    holiday: 0,

    field_visit: 0,

    leave: 0,
    sick_leave: 0,
    casual_leave: 0,
    privileged_leave: 0,
    festival_leave: 0,
    unpaid_leave: 0,
  };

  records.forEach((record) => {
    const status = String(
      record.final_status || ""
    )
      .trim()
      .toLowerCase();

    if (status === "present") {
      summary.present += 1;
    }

    if (status === "late") {
      summary.late += 1;
    }

    if (status === "half day") {
      summary.half_day += 1;
    }

    if (status === "half day leave") {
      summary.half_day += 1;
    }

    if (status === "absent") {
      summary.absent += 1;
    }

    if (status === "no punch") {
      summary.no_punch += 1;
    }

    if (status === "needs review") {
      summary.needs_review += 1;
    }

    if (status === "weekly off") {
      summary.weekly_off += 1;
    }

    if (status === "holiday") {
      summary.holiday += 1;
    }

    if (status === "field visit") {
      summary.field_visit += 1;
    }

    if (record.leave_id) {
      summary.leave += 1;

      switch (record.leave_code) {
        case "sick":
          summary.sick_leave += 1;
          break;

        case "casual":
          summary.casual_leave += 1;
          break;

        case "mandatory":
          summary.privileged_leave += 1;
          break;

        case "festival":
          summary.festival_leave += 1;
          break;

        case "unpaid":
          summary.unpaid_leave += 1;
          break;

        default:
          break;
      }
    }
  });

  return {
    users,
    records,
    summary,

    biometric_range: {
      first_date:
        biometricFirstDate,

      last_date:
        biometricLastDate,
    },
  };
};

/* =========================================================
   GET
========================================================= */

const getHrAttendance = async (req, res) => {
  try {
    if (!isAuthorizedHR(req)) {
      return res.status(403).json({
        success: false,
        message: "HR Attendance access denied.",
      });
    }

    const today = new Date();

    const defaultFrom =
      `${today.getFullYear()}-${String(
        today.getMonth() + 1
      ).padStart(2, "0")}-01`;

    const defaultTo =
      formatDate(today);

    const fromDate = String(
      req.query.from_date ||
      defaultFrom
    ).slice(0, 10);

    const toDate = String(
      req.query.to_date ||
      defaultTo
    ).slice(0, 10);

    if (fromDate > toDate) {
      return res.status(400).json({
        success: false,
        message:
          "From date cannot be after To date.",
      });
    }

    const result =
      await buildHrAttendanceData(
        fromDate,
        toDate
      );

    return res.json({
      success: true,

      date_range: {
        from_date:
          fromDate,

        to_date:
          toDate,
      },

      biometric_range:
        result.biometric_range,

      users:
        result.users,

      records:
        result.records,

      summary:
        result.summary,
    });
  } catch (error) {
    console.error(
      "HR Attendance error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load HR attendance.",
      error:
        error.message,
      sqlMessage:
        error.sqlMessage || null,
    });
  }
};

/* =========================================================
   MANUAL ADD / UPDATE
========================================================= */

const saveHrAttendance = async (req, res) => {
  try {
    if (!isAuthorizedHR(req)) {
      return res.status(403).json({
        success: false,
        message: "HR Attendance access denied.",
      });
    }

    const employeeId =
      Number(
        req.body?.employee_id || 0
      );

    const attendanceDate =
      String(
        req.body?.attendance_date || ""
      ).trim();

    const checkIn =
      normalizeTimeForMySQL(
        req.body?.check_in_time
      );

    const checkOut =
      normalizeTimeForMySQL(
        req.body?.check_out_time
      );

    const status =
      String(
        req.body?.status ||
        "present"
      )
        .trim()
        .toLowerCase();

    const remarks =
      String(
        req.body?.remarks || ""
      ).trim() || null;

    if (
      !employeeId ||
      !attendanceDate
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Employee and attendance date are required.",
      });
    }

    const allowedStatuses = [
      "present",
      "absent",
      "late",
      "half_day",
      "holiday",
    ];

    if (
      !allowedStatuses.includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid attendance status.",
      });
    }

    const totalMinutes =
      calculateWorkingMinutes(
        checkIn,
        checkOut,
        0
      );

    const [existingRows] =
      await db.query(
        `
        SELECT
          attendance_id

        FROM attendance

        WHERE employee_id = ?
          AND attendance_date = ?

        LIMIT 1
        `,
        [
          employeeId,
          attendanceDate,
        ]
      );

    if (existingRows.length) {
      await db.query(
        `
        UPDATE attendance

        SET
          check_in_time = ?,
          check_out_time = ?,
          total_minutes = ?,
          status = ?,
          remarks = ?

        WHERE attendance_id = ?
        `,
        [
          checkIn,
          checkOut,
          totalMinutes,
          status,
          remarks,
          existingRows[0].attendance_id,
        ]
      );

      return res.json({
        success: true,
        message:
          "Attendance updated successfully.",
      });
    }

    await db.query(
      `
      INSERT INTO attendance (
        employee_id,
        attendance_date,
        check_in_time,
        check_out_time,
        total_minutes,
        status,
        remarks
      )

      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        employeeId,
        attendanceDate,
        checkIn,
        checkOut,
        totalMinutes,
        status,
        remarks,
      ]
    );

    return res.status(201).json({
      success: true,
      message:
        "Attendance added successfully.",
    });
  } catch (error) {
    console.error(
      "Save HR attendance error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to save attendance.",
      error:
        error.message,
      sqlMessage:
        error.sqlMessage || null,
    });
  }
};

/* =========================================================
   IMPORT
========================================================= */

const importHrAttendance = async (req, res) => {
  const connection =
    await db.getConnection();

  try {
    if (!isAuthorizedHR(req)) {
      return res.status(403).json({
        success: false,
        message: "HR Attendance access denied.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message:
          "Excel/CSV attendance file is required.",
      });
    }

    const rows =
      parseUploadedAttendanceFile(
        req.file
      );

    let insertedRows = 0;
    let updatedRows = 0;
    let duplicateRows = 0;
    let unmatchedRows = 0;
    let skippedRows = 0;

    const seenKeys =
      new Set();

    const unmatchedEmployees =
      new Map();

    await connection.beginTransaction();

    for (const row of rows) {
      const employeeCode =
        cleanText(
          getValue(row, [
            "Employee ID",
            "Employee Id",
            "Employee Code",
            "employee_id",
            "employee_code",
          ])
        );

      const fullName =
        cleanText(
          getValue(row, [
            "First Name",
            "Full Name",
            "Name",
            "full_name",
            "employee_name",
          ])
        );

      const email =
        normalizeEmail(
          getValue(row, [
            "Email",
            "Email ID",
            "email",
            "employee_email",
          ])
        );

      const attendanceDate =
        normalizeDateForMySQL(
          getValue(row, [
            "Date",
            "Attendance Date",
            "attendance_date",
            "date",
          ])
        );

      if (
        !attendanceDate ||
        (
          !employeeCode &&
          !email &&
          !fullName
        )
      ) {
        skippedRows += 1;
        continue;
      }

      const user =
        await findAttendanceUser({
          employeeCode,
          email,
          fullName,
        });

      if (!user) {
        unmatchedRows += 1;

        const unmatchedKey =
          employeeCode ||
          email ||
          fullName ||
          "Unknown";

        if (
          !unmatchedEmployees.has(
            unmatchedKey
          )
        ) {
          unmatchedEmployees.set(
            unmatchedKey,
            {
              employee_code:
                employeeCode || null,

              full_name:
                fullName || null,

              email:
                email || null,

              rows: 0,
            }
          );
        }

        unmatchedEmployees.get(
          unmatchedKey
        ).rows += 1;

        continue;
      }

      const duplicateKey =
        `${user.user_id}|${attendanceDate}`;

      if (
        seenKeys.has(
          duplicateKey
        )
      ) {
        duplicateRows += 1;
        continue;
      }

      seenKeys.add(
        duplicateKey
      );

      const checkIn =
        normalizeTimeForMySQL(
          getValue(row, [
            "First Punch",
            "first_punch",
            "Check In",
            "check_in",
            "check_in_time",
            "In Time",
          ])
        );

      const checkOut =
        normalizeTimeForMySQL(
          getValue(row, [
            "Last Punch",
            "last_punch",
            "Check Out",
            "check_out",
            "check_out_time",
            "Out Time",
          ])
        );

      const importedMinutes =
        parseDurationToMinutes(
          getValue(row, [
            "Total Time",
            "total_time",
            "Total Minutes",
            "total_minutes",
          ])
        );

      const calculatedMinutes =
        calculateWorkingMinutes(
          checkIn,
          checkOut,
          0
        );

      const totalMinutes =
        importedMinutes ||
        calculatedMinutes ||
        0;

      const explicitStatus =
        getValue(row, [
          "Status",
          "Attendance Status",
          "attendance_status",
          "status",
        ]);

      /*
        Completely empty row:
        don't save fake attendance.
      */

      if (
        !checkIn &&
        !checkOut &&
        !explicitStatus
      ) {
        skippedRows += 1;
        continue;
      }

      const status =
        explicitStatus
          ? normalizeImportedStatus(
              explicitStatus
            )
          : "present";

      const remarks =
        cleanText(
          getValue(row, [
            "Remarks",
            "Remark",
            "remarks",
          ])
        ) || null;

      const [existingRows] =
        await connection.query(
          `
          SELECT
            attendance_id

          FROM attendance

          WHERE employee_id = ?
            AND attendance_date = ?

          LIMIT 1
          `,
          [
            user.user_id,
            attendanceDate,
          ]
        );

      if (existingRows.length) {
        await connection.query(
          `
          UPDATE attendance

          SET
            check_in_time = ?,
            check_out_time = ?,
            total_minutes = ?,
            status = ?,
            remarks = ?

          WHERE attendance_id = ?
          `,
          [
            checkIn,
            checkOut,
            totalMinutes,
            status,
            remarks,
            existingRows[0].attendance_id,
          ]
        );

        updatedRows += 1;
      } else {
        await connection.query(
          `
          INSERT INTO attendance (
            employee_id,
            attendance_date,
            check_in_time,
            check_out_time,
            total_minutes,
            status,
            remarks
          )

          VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [
            user.user_id,
            attendanceDate,
            checkIn,
            checkOut,
            totalMinutes,
            status,
            remarks,
          ]
        );

        insertedRows += 1;
      }
    }

    await connection.commit();

    return res.json({
      success: true,
      message:
        "Attendance imported successfully.",

      inserted_rows:
        insertedRows,

      updated_rows:
        updatedRows,

      duplicate_rows:
        duplicateRows,

      unmatched_rows:
        unmatchedRows,

      skipped_rows:
        skippedRows,

      unmatched_employees:
        Array.from(
          unmatchedEmployees.values()
        ),
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch {}

    console.error(
      "HR attendance import error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to import attendance.",
      error:
        error.message,
      sqlMessage:
        error.sqlMessage || null,
    });
  } finally {
    connection.release();
  }
};

/* =========================================================
   EXPORT HELPERS
========================================================= */

const escapeCsvValue = (value) => {
  const text =
    value === null ||
    value === undefined
      ? ""
      : String(value);

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return `"${text.replace(
      /"/g,
      '""'
    )}"`;
  }

  return text;
};

/* =========================================================
   EXPORT
========================================================= */

const exportHrAttendance = async (req, res) => {
  try {
    if (!isAuthorizedHR(req)) {
      return res.status(403).json({
        success: false,
        message: "HR Attendance access denied.",
      });
    }

    const today = new Date();

    const defaultFrom =
      `${today.getFullYear()}-${String(
        today.getMonth() + 1
      ).padStart(2, "0")}-01`;

    const defaultTo =
      formatDate(today);

    const fromDate = String(
      req.query.from_date ||
      defaultFrom
    ).slice(0, 10);

    const toDate = String(
      req.query.to_date ||
      defaultTo
    ).slice(0, 10);

    const exportFormat =
      String(
        req.query.format ||
        "xlsx"
      )
        .trim()
        .toLowerCase();

    if (fromDate > toDate) {
      return res.status(400).json({
        success: false,
        message:
          "From date cannot be after To date.",
      });
    }

    const result =
      await buildHrAttendanceData(
        fromDate,
        toDate
      );

    const exportRows =
      result.records.map((record) => ({
        "Employee ID":
          record.employee_code || "",

        "Employee Name":
          record.full_name || "",

        Email:
          record.email || "",

        Department:
          record.department_name || "",

        Designation:
          record.designation || "",

        Date:
          record.attendance_date || "",

        Day:
          record.day_name || "",

        "First Punch":
          record.check_in_time === "-"
            ? ""
            : record.check_in_time,

        "Last Punch":
          record.check_out_time === "-"
            ? ""
            : record.check_out_time,

        "Total Time":
          record.working_hours === "-"
            ? ""
            : record.working_hours,

        Status:
          record.final_status || "",

        "Leave Type":
          record.leave_type || "",

        "Leave Duration":
          record.leave_duration || "",

        "Leave Session":
          record.leave_session || "",

        "Field Visit Type":
          record.field_visit_type || "",

        "Field Visit Location":
          record.field_visit_location || "",

        "Approved By":
          record.approved_by_name || "",

        "Approved At":
          record.approved_at || "",

        Remark:
          record.leave_reason ||
          record.field_visit_reason ||
          record.attendance_remarks ||
          record.detail ||
          "",
      }));

    /* =====================================================
       CSV
    ===================================================== */

    if (exportFormat === "csv") {
      const headers = [
        "Employee ID",
        "Employee Name",
        "Email",
        "Department",
        "Designation",
        "Date",
        "Day",
        "First Punch",
        "Last Punch",
        "Total Time",
        "Status",
        "Leave Type",
        "Leave Duration",
        "Leave Session",
        "Field Visit Type",
        "Field Visit Location",
        "Approved By",
        "Approved At",
        "Remark",
      ];

      const csvLines = [
        headers
          .map(escapeCsvValue)
          .join(","),

        ...exportRows.map((row) =>
          headers
            .map((header) =>
              escapeCsvValue(
                row[header]
              )
            )
            .join(",")
        ),
      ];

      const csv =
        "\uFEFF" +
        csvLines.join("\r\n");

      res.setHeader(
        "Content-Type",
        "text/csv; charset=utf-8"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="hr-attendance-${fromDate}-to-${toDate}.csv"`
      );

      return res.send(csv);
    }

    /* =====================================================
       XLSX
    ===================================================== */

    if (exportFormat !== "xlsx") {
      return res.status(400).json({
        success: false,
        message:
          "Export format must be xlsx or csv.",
      });
    }

    const workbook =
      XLSX.utils.book_new();

    const worksheet =
      XLSX.utils.json_to_sheet(
        exportRows
      );

    worksheet["!cols"] = [
      { wch: 14 },
      { wch: 28 },
      { wch: 34 },
      { wch: 22 },
      { wch: 24 },
      { wch: 14 },
      { wch: 13 },
      { wch: 14 },
      { wch: 14 },
      { wch: 15 },
      { wch: 22 },
      { wch: 22 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 },
      { wch: 28 },
      { wch: 26 },
      { wch: 22 },
      { wch: 42 },
    ];

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "HR Attendance"
    );

    const buffer =
      XLSX.write(
        workbook,
        {
          bookType: "xlsx",
          type: "buffer",
        }
      );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="hr-attendance-${fromDate}-to-${toDate}.xlsx"`
    );

    return res.send(buffer);
  } catch (error) {
    console.error(
      "HR attendance export error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to export HR attendance.",
      error:
        error.message,
      sqlMessage:
        error.sqlMessage || null,
    });
  }
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getHrAttendance,
  saveHrAttendance,
  importHrAttendance,
  exportHrAttendance,
};