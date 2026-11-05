const db = require("../config/db");
const { parse } = require("csv-parse/sync");
const XLSX = require("xlsx");
const {
  buildLeaveBalances,
} = require("../utils/leavepolicy");
const {
  applyEmployeeLeave,
} = require("./employeeleavecontroller");

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

const isLateCheckIn = (checkIn) => {
  if (!checkIn || checkIn === "-") {
    return false;
  }

  const [hour, minute] = String(checkIn)
    .slice(0, 8)
    .split(":")
    .map(Number);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return false;
  }

  const totalMinutes =
    hour * 60 + minute;

  // After 11:00 AM = Late
  return totalMinutes > 11 * 60;
};

const isHalfDayCheckIn = (checkIn) => {
  if (!checkIn || checkIn === "-") {
    return false;
  }

  const [hour, minute] = String(checkIn)
    .slice(0, 8)
    .split(":")
    .map(Number);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return false;
  }

  const totalMinutes =
    hour * 60 + minute;

  // After 12:00 PM = Half Day
  return totalMinutes > 12 * 60;
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

const getHrLeaveDisplayStatus = (leave) => {
  const status = String(
    leave?.status || ""
  )
    .trim()
    .toLowerCase();

  const revertStatus = String(
    leave?.revert_status || "none"
  )
    .trim()
    .toLowerCase();

  const escalated =
    Number(
      leave?.escalated_for_approval || 0
    ) === 1;

  if (revertStatus === "pending") {
    return "Revert Applied";
  }

  if (revertStatus === "approved") {
    return "Reverted";
  }

  if (revertStatus === "rejected") {
    return "Revert Rejected";
  }

  if (
    status === "pending" &&
    escalated
  ) {
    return "Escalated";
  }

  if (status === "pending") {
    return "Pending";
  }

  if (status === "approved") {
    return "Approved";
  }

  if (status === "rejected") {
    return "Rejected";
  }

  return status || "-";
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
      leave_applications: [],
      leave_application_summary: {
        total: 0,
        pending: 0,
        escalated: 0,
        approved: 0,
        rejected: 0,
      },
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

  const [leaveRows] = await db.query(
    `
    SELECT
      la.leave_id,
      la.employee_id,
      la.leave_type,

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

    WHERE la.employee_id IN (${placeholders})
      AND LOWER(TRIM(la.status)) = 'approved'
      AND COALESCE(la.revert_status, 'none') <> 'approved'
      AND la.start_date <= ?
      AND la.end_date >= ?
    `,
    [
      ...userIds,
      toDate,
      fromDate,
    ]
  );

  const [hrLeaveRows] = await db.query(
    `
    SELECT
      la.leave_id,
      la.employee_id,
      la.leave_type,
      la.total_days,
      la.duration_type,
      la.half_day_session,
      la.reason,
      la.status,
      la.review_remark,

      COALESCE(
        la.revert_status,
        'none'
      ) AS revert_status,

      la.revert_reason,

      DATE_FORMAT(
        la.revert_requested_at,
        '%Y-%m-%d %H:%i:%s'
      ) AS revert_requested_at,

      la.revert_reviewed_by,

      DATE_FORMAT(
        la.revert_reviewed_at,
        '%Y-%m-%d %H:%i:%s'
      ) AS revert_reviewed_at,

      la.revert_review_remark,

      COALESCE(
        la.escalated_for_approval,
        0
      ) AS escalated_for_approval,

      DATE_FORMAT(
        la.start_date,
        '%Y-%m-%d'
      ) AS start_date,

      DATE_FORMAT(
        la.end_date,
        '%Y-%m-%d'
      ) AS end_date,

      la.reviewed_by,

      DATE_FORMAT(
        la.reviewed_at,
        '%Y-%m-%d %H:%i:%s'
      ) AS reviewed_at,

      la.escalated_by,

      DATE_FORMAT(
        la.escalated_at,
        '%Y-%m-%d %H:%i:%s'
      ) AS escalated_at,

      DATE_FORMAT(
        la.applied_at,
        '%Y-%m-%d %H:%i:%s'
      ) AS applied_at,

      employee.employee_code,
      employee.full_name AS employee_name,
      employee.email AS employee_email,
      employee.designation,
      employee.department_id,

      department.department_name,
      role.role_name,

      reviewer.full_name AS reviewed_by_name,
      reviewer.email AS reviewed_by_email,

      escalator.full_name AS escalated_by_name,
      escalator.email AS escalated_by_email,

      revert_reviewer.full_name
        AS revert_reviewed_by_name,

      revert_reviewer.email
        AS revert_reviewed_by_email

    FROM leave_applications la

    INNER JOIN users employee
      ON employee.user_id = la.employee_id

    LEFT JOIN departments department
      ON department.department_id =
         employee.department_id

    LEFT JOIN roles role
      ON role.role_id = employee.role_id

    LEFT JOIN users reviewer
      ON reviewer.user_id = la.reviewed_by

    LEFT JOIN users escalator
      ON escalator.user_id = la.escalated_by

    LEFT JOIN users revert_reviewer
      ON revert_reviewer.user_id =
         la.revert_reviewed_by

    WHERE
      la.employee_id IN (${placeholders})

      AND LOWER(
        TRIM(la.status)
      ) IN (
        'pending',
        'approved',
        'rejected'
      )

    ORDER BY
      CASE
        WHEN LOWER(
          TRIM(la.status)
        ) = 'pending'
        THEN 1

        WHEN LOWER(
          TRIM(la.status)
        ) = 'approved'
        THEN 2

        WHEN LOWER(
          TRIM(la.status)
        ) = 'rejected'
        THEN 3

        ELSE 4
      END,

      la.applied_at DESC,
      la.leave_id DESC
    `,
    userIds
  );

  const [fieldVisitRows] = await db.query(
    `
    SELECT
      fv.visit_id,
      fv.employee_id,

      DATE_FORMAT(
        fv.visit_date,
        '%Y-%m-%d'
      ) AS visit_date,

      DATE_FORMAT(
        COALESCE(fv.end_date, fv.visit_date),
        '%Y-%m-%d'
      ) AS end_date,

      fv.visit_type,
      fv.duration_type,
      fv.half_day_session,
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
      AND fv.visit_date <= ?
      AND COALESCE(fv.end_date, fv.visit_date) >= ?
    `,
    [
      toDate,
      fromDate,
    ]
  );

  /* =========================================================
     HR FIELD VISIT LIST
     ALL STATUSES / ALL DATES
  ========================================================= */

  const [hrFieldVisitRows] = await db.query(
    `
    SELECT
      fv.visit_id,
      fv.employee_id,

      fv.visit_type,

      DATE_FORMAT(
        fv.visit_date,
        '%Y-%m-%d'
      ) AS visit_date,

      DATE_FORMAT(
        COALESCE(fv.end_date, fv.visit_date),
        '%Y-%m-%d'
      ) AS end_date,

      fv.duration_type,
      fv.half_day_session,
      fv.start_time,
      fv.end_time,

      fv.location,
      fv.comment,
      fv.status,

      fv.reviewed_by,
      fv.review_remark,

      DATE_FORMAT(
        fv.reviewed_at,
        '%Y-%m-%d %H:%i:%s'
      ) AS reviewed_at,

      employee.employee_code,
      employee.full_name AS employee_name,
      employee.email AS employee_email,
      employee.designation,
      employee.department_id,

      department.department_name,
      role.role_name,

      reviewer.full_name AS reviewed_by_name,
      reviewer.email AS reviewed_by_email

    FROM employee_field_visits fv

    INNER JOIN users employee
      ON employee.user_id = fv.employee_id

    LEFT JOIN departments department
      ON department.department_id =
         employee.department_id

    LEFT JOIN roles role
      ON role.role_id =
         employee.role_id

    LEFT JOIN users reviewer
      ON reviewer.user_id =
         fv.reviewed_by

    WHERE
      fv.employee_id IN (${placeholders})

      AND LOWER(
        TRIM(fv.status)
      ) IN (
        'pending',
        'approved',
        'rejected'
      )

    ORDER BY
      CASE
        WHEN LOWER(
          TRIM(fv.status)
        ) = 'pending'
        THEN 1

        WHEN LOWER(
          TRIM(fv.status)
        ) = 'approved'
        THEN 2

        WHEN LOWER(
          TRIM(fv.status)
        ) = 'rejected'
        THEN 3

        ELSE 4
      END,

      fv.visit_date DESC,
      fv.visit_id DESC
    `,
    userIds
  );

  /* =========================================================
     PENDING REQUEST MAP INPUTS
     Pending requests must not appear as Absent while awaiting review.
  ========================================================= */

  const pendingLeaveMap = new Map();

  hrLeaveRows
    .filter((leave) => {
      const status = String(leave.status || "")
        .trim()
        .toLowerCase();

      const revertStatus = String(
        leave.revert_status || "none"
      )
        .trim()
        .toLowerCase();

      return (
        status === "pending" &&
        revertStatus !== "approved"
      );
    })
    .forEach((leave) => {
      let date = String(
        leave.start_date || ""
      ).slice(0, 10);

      const endDate = String(
        leave.end_date ||
        leave.start_date ||
        ""
      ).slice(0, 10);

      while (
        date &&
        endDate &&
        date <= endDate
      ) {
        if (
          date >= fromDate &&
          date <= toDate
        ) {
          pendingLeaveMap.set(
            `${Number(
              leave.employee_id
            )}|${date}`,
            leave
          );
        }

        date = addOneDay(date);
      }
    });

  const pendingFieldVisitRows = hrFieldVisitRows.filter((visit) =>
    String(visit.status || "").trim().toLowerCase() === "pending" &&
    visit.visit_date <= toDate &&
    (visit.end_date || visit.visit_date) >= fromDate
  );

  const visitIds = [
    ...new Set(
      [
        ...fieldVisitRows,
        ...pendingFieldVisitRows,
      ]
        .map((visit) =>
          Number(visit.visit_id)
        )
        .filter(Boolean)
    ),
  ];

  let fieldVisitMembers = [];

  if (visitIds.length) {
    const [memberColumns] =
      await db.query(
        `SHOW COLUMNS FROM field_visit_members`
      );

    const columnNames =
      memberColumns.map((column) =>
        String(
          column.Field || ""
        ).toLowerCase()
      );

    let visitForeignKey = null;

    if (
      columnNames.includes(
        "field_visit_id"
      )
    ) {
      visitForeignKey =
        "field_visit_id";
    } else if (
      columnNames.includes(
        "visit_id"
      )
    ) {
      visitForeignKey =
        "visit_id";
    }

    const memberKey = ['employee_id','user_id','member_id'].find(name => columnNames.includes(name));
    if (visitForeignKey && memberKey) {
      const visitPlaceholders =
        visitIds
          .map(() => "?")
          .join(",");

      const [memberRows] =
        await db.query(
          `
          SELECT
            ${visitForeignKey}
              AS visit_id,

            ${memberKey} AS employee_id

          FROM field_visit_members

          WHERE ${visitForeignKey}
            IN (${visitPlaceholders})
          `,
          visitIds
        );

      fieldVisitMembers =
        memberRows;
    }
  }

  // HR_RECURRING_RULES_V4: Read-only overlay; never edits source biometric punches.
  const [employeeRuleRows] = await db.query(`
    SELECT id, employee_id, rule_type, arrangement_name, attendance_mode,
      weekdays_mask, ignore_late, ignore_early, credit_mode,
      DATE_FORMAT(effective_from,'%Y-%m-%d') start_date,
      DATE_FORMAT(effective_to,'%Y-%m-%d') end_date,
      shift_start,shift_end,grace_minutes,reason
    FROM hr_employee_attendance_rules
    WHERE is_active=1 AND employee_id IN (${placeholders})
      AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
    ORDER BY effective_from DESC,id DESC
  `,[...userIds,toDate,fromDate]);
  const employeeRulesMap=new Map();
  employeeRuleRows.forEach(r=>{const k=Number(r.employee_id);if(!employeeRulesMap.has(k))employeeRulesMap.set(k,[]);employeeRulesMap.get(k).push(r);});

  const attendanceMap = new Map();

  attendanceRows.forEach((row) => {
    attendanceMap.set(
      `${Number(row.employee_id)}|${row.attendance_date}`,
      row
    );
  });

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

    for (
      let day = visit.visit_date;
      day <= (visit.end_date || visit.visit_date);
      day = addOneDay(day)
    ) {
      if (day < fromDate || day > toDate) continue;
      employeeIds.forEach((employeeId) => {
        visitMap.set(`${employeeId}|${day}`, visit);
      });
    }
  });

  const pendingVisitMap = new Map();

  pendingFieldVisitRows.forEach((visit) => {
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

    for (
      let day = visit.visit_date;
      day <= (visit.end_date || visit.visit_date);
      day = addOneDay(day)
    ) {
      if (day < fromDate || day > toDate) continue;
      employeeIds.forEach((employeeId) => {
        pendingVisitMap.set(`${employeeId}|${day}`, visit);
      });
    }
  });

  const records = [];

  for (const user of users) {
    const firstAttendanceDate =
      firstAttendanceMap.get(
        Number(user.user_id)
      ) || null;

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

      const pendingLeave =
        pendingLeaveMap.get(key);

      const pendingFieldVisit =
        pendingVisitMap.get(key);

      if (
        effectiveStartDate &&
        currentDate < effectiveStartDate
      ) {
        currentDate = addOneDay(currentDate);
        continue;
      }

      if (
        !effectiveStartDate &&
        !attendance &&
        !leave &&
        !fieldVisit &&
        !pendingLeave &&
        !pendingFieldVisit
      ) {
        currentDate = addOneDay(currentDate);
        continue;
      }

      if (
        biometricLastDate &&
        currentDate > biometricLastDate &&
        !attendance &&
        !leave &&
        !fieldVisit &&
        !pendingLeave &&
        !pendingFieldVisit &&
        !(employeeRulesMap.get(Number(user.user_id)) || []).some(r =>
          (r.rule_type === 'wfh' || r.attendance_mode === 'present_wfh') &&
          r.start_date <= currentDate && (!r.end_date || r.end_date >= currentDate) &&
          ((Number(r.weekdays_mask) & (1 << new Date(`${currentDate}T00:00:00`).getDay())) !== 0)
        )
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

      let finalStatus = null;
      let source = null;
      let detail = "-";

      let leaveCode = null;
      let leaveType = null;
      let leaveDuration = null;
      let leaveSession = null;

      let fieldVisitType = null;
      let fieldVisitLocation = null;

      let isLateMark = false;
      let lateMarkReason = null;
      let needsAttention = false;
      let fieldVisitAttendanceStatus = null;
      let requestStatus = null;
      let pendingRequestType = null;
      let pendingRequestId = null;

      let approvedByName = null;
      let approvedByEmail = null;
      let approvedAt = null;

      let conflictReason = null;

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

      if (conflictReason) {
        finalStatus = "Needs Review";
        source = "conflict";
        detail = conflictReason;
      } else if (leave) {
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
          leaveType;

        approvedByName =
          leave.reviewed_by_name || null;

        approvedByEmail =
          leave.reviewed_by_email || null;

        approvedAt =
          leave.reviewed_at || null;
      } else if (fieldVisit) {
        finalStatus = "Field Visit";
        source = "rms_field_visit";

        fieldVisitType =
          fieldVisit.visit_type || null;

        fieldVisitLocation =
          fieldVisit.location || null;

        const fieldVisitDuration = String(
          fieldVisit.duration_type || ""
        )
          .trim()
          .toLowerCase();

        const fieldVisitSession = String(
          fieldVisit.half_day_session || ""
        )
          .trim()
          .toLowerCase();

        const fullDayFieldVisit =
          fieldVisitDuration === "full_day";

        const firstHalfFieldVisit =
          fieldVisitDuration === "half_day" &&
          [
            "first_half",
            "first half",
            "first",
            "first_half_day",
          ].includes(fieldVisitSession);

        const secondHalfFieldVisit =
          fieldVisitDuration === "half_day" &&
          [
            "second_half",
            "second half",
            "second",
            "second_half_day",
          ].includes(fieldVisitSession);

        if (secondHalfFieldVisit) {
          if (!checkIn) {
            fieldVisitAttendanceStatus =
              "No Punch";

            needsAttention = true;

            isLateMark = false;

            lateMarkReason =
              "No office check-in found before second-half field visit";
          } else if (
            isHalfDayCheckIn(checkIn)
          ) {
            fieldVisitAttendanceStatus =
              "Half Day";

            needsAttention = true;

            isLateMark = false;

            lateMarkReason =
              `Office check-in ${checkIn} is after 12:00 PM before second-half field visit`;
          } else if (
            isLateCheckIn(checkIn)
          ) {
            fieldVisitAttendanceStatus =
              "Late";

            isLateMark = true;

            lateMarkReason =
              `Late office check-in ${checkIn} before second-half field visit`;
          }
        }

        if (
          fullDayFieldVisit ||
          firstHalfFieldVisit
        ) {
          isLateMark = false;
          lateMarkReason = null;
          needsAttention = false;
          fieldVisitAttendanceStatus = null;
        }

        detail =
          fieldVisit.comment ||
          [
            fieldVisit.visit_type,
            fieldVisit.duration_type,
            fieldVisit.half_day_session,
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
      } else if (
        (pendingLeave || pendingFieldVisit) &&
        !checkIn &&
        !checkOut &&
        !sunday &&
        !holidayName
      ) {
        finalStatus = "Pending Approval";

        source = pendingLeave
          ? "pending_leave"
          : "pending_field_visit";

        requestStatus = "pending";

        if (pendingLeave) {
          pendingRequestType =
            `${getLeaveLabel(
              pendingLeave.leave_type
            )}${
              pendingLeave.duration_type ===
              "half_day"
                ? ` · Half Day${
                    pendingLeave.half_day_session
                      ? ` · ${String(
                          pendingLeave.half_day_session
                        ).replace(/_/g, " ")}`
                      : ""
                  }`
                : ""
            }`;

          pendingRequestId =
            pendingLeave.leave_id;

          detail =
            pendingLeave.reason ||
            `${getLeaveLabel(
              pendingLeave.leave_type
            )} pending approval`;
        } else {
          const pendingDuration =
            String(
              pendingFieldVisit.duration_type ||
                ""
            )
              .trim()
              .toLowerCase();

          const pendingSession =
            String(
              pendingFieldVisit.half_day_session ||
                ""
            )
              .trim()
              .replace(/_/g, " ");

          pendingRequestType = [
            "Field Visit",
            pendingFieldVisit.visit_type,
            pendingDuration === "half_day"
              ? `Half Day${
                  pendingSession
                    ? ` · ${pendingSession}`
                    : ""
                }`
              : pendingDuration === "full_day"
              ? "Full Day"
              : null,
          ]
            .filter(Boolean)
            .join(" · ");

          pendingRequestId =
            pendingFieldVisit.visit_id;

          detail =
            pendingFieldVisit.comment ||
            pendingFieldVisit.location ||
            "Field visit pending approval";
        }
      } else if (attendance) {
        // HR-approved full-day correction does not synthesize punch times.
        // The original biometric values and total minutes remain unchanged.
        const hrFullDayOverride =
          /^Bulk Present: /i.test(String(attendance.remarks || "")) &&
          String(attendance.status || "").toLowerCase() === "present" &&
          (!checkIn || !checkOut);
        const rawStatus = String(
          attendance.status || "present"
        )
          .trim()
          .toLowerCase();

        if (hrFullDayOverride) {
          finalStatus = "Present";
          isLateMark = false;
          lateMarkReason = null;
        } else if (
          rawStatus === "absent" &&
          !checkIn &&
          !checkOut
        ) {
          finalStatus = "Absent";
        } else if (
          (checkIn && !checkOut) ||
          (!checkIn && checkOut)
        ) {
          finalStatus = "No Punch";
        } else if (
          rawStatus === "half_day"
        ) {
          finalStatus = "Half Day";
        } else if (
          rawStatus === "holiday"
        ) {
          finalStatus = "Holiday";
        } else if (
          checkIn &&
          checkOut &&
          isHalfDayCheckIn(checkIn)
        ) {
          finalStatus = "Half Day";

          isLateMark = false;
          lateMarkReason = null;
        } else if (
          rawStatus === "late"
        ) {
          finalStatus = "Late";

          isLateMark = true;
          lateMarkReason =
            "Attendance explicitly marked late";
        } else if (
          checkIn &&
          checkOut &&
          isLateCheckIn(checkIn)
        ) {
          finalStatus = "Late";

          isLateMark = true;
          lateMarkReason =
            `First punch ${checkIn} is after 11:00 AM`;
        } else if (
          checkIn &&
          checkOut
        ) {
          finalStatus = "Present";
        } else if (
          rawStatus === "present"
        ) {
          finalStatus = "Present";
        } else {
          finalStatus = "Absent";
        }

        source = "attendance";
        detail =
          attendance.remarks || "-";
      } else if (sunday) {
        finalStatus = "Weekly Off";
        source = "calendar";
        detail = "Sunday";
      } else if (holidayName) {
        finalStatus = "Holiday";
        source = "calendar";
        detail = holidayName;
      } else {
        finalStatus = "Absent";
        source = "system";
        detail =
          "No biometric attendance found";
      }

      // Sundays remain weekly offs. Valid biometric work is an extra day,
      // never a normal present/late/half-day or a salary deduction.
      if (sunday && !conflictReason && !leave) {
        isLateMark = false;
        lateMarkReason = null;
        if (checkIn && checkOut && totalMinutes > 0) {
          finalStatus = "Extra Working Day";
          source = "attendance";
          detail = attendance?.remarks || "Sunday work";
        } else if (checkIn || checkOut) {
          finalStatus = "Needs Review";
          source = "attendance";
          detail = "Incomplete Sunday biometric punches";
          needsAttention = true;
        } else {
          finalStatus = "Weekly Off";
          source = "calendar";
          detail = "Sunday";
        }
      }

      // HR_RECURRING_RULES_V4: employee-specific overlay on existing status.
      // Never modifies raw punch fields, LOP formulas, approved leave or Field Visit.
      let appliedHrRule = null;
      if (!sunday && !holidayName && !leave && !fieldVisit &&
          !pendingLeave && !pendingFieldVisit && !conflictReason) {
        const weekday = new Date(`${currentDate}T00:00:00`).getDay();
        const rules = (employeeRulesMap.get(Number(user.user_id)) || []).filter(r =>
          r.start_date <= currentDate && (!r.end_date || r.end_date >= currentDate) &&
          (Number(r.weekdays_mask) & (1 << weekday)) !== 0
        );
        const wfh = rules.find(r => r.rule_type === 'wfh' || r.attendance_mode === 'present_wfh');
        const scheduled = rules.find(r => ['part_time','flexible','custom'].includes(r.rule_type) &&
          r.attendance_mode !== 'present_wfh' && r.shift_start && r.shift_end);
        const exempt = rules.find(r => r.rule_type === 'late_exempt' || Number(r.ignore_late) === 1);
        if (wfh && !checkIn && !checkOut) {
          // The employee receives an approved day credit, not fabricated time.
          finalStatus = 'Present'; source = 'hr_wfh';
          detail = wfh.reason ? `WFH · ${wfh.reason}` : 'Work From Home';
          isLateMark = false; lateMarkReason = null; needsAttention = false;
          appliedHrRule = wfh;
        } else if (scheduled && checkIn && checkOut) {
          const minutes = t => {
            const p = String(t || '').slice(0,5).split(':').map(Number);
            return p.length === 2 && p.every(Number.isFinite) ? p[0]*60+p[1] : null;
          };
          const arrival=minutes(checkIn), departure=minutes(checkOut);
          const start=minutes(scheduled.shift_start), end=minutes(scheduled.shift_end);
          if ([arrival,departure,start,end].every(Number.isFinite)) {
            const grace = Number(scheduled.grace_minutes || 0);
            const late = arrival > start + grace;
            const early = departure < end - grace;
            if (early && !Number(scheduled.ignore_early)) {
              finalStatus = 'Needs Review'; needsAttention = true;
              detail = 'Departed before HR-approved end time';
            } else if (late && !Number(scheduled.ignore_late) && !exempt) {
              finalStatus = 'Late'; isLateMark = true;
              lateMarkReason = 'Check-in after HR-approved start time';
            } else {
              finalStatus = 'Present'; isLateMark = false; lateMarkReason = null;
              needsAttention = false;
              detail = `${scheduled.arrangement_name || 'Approved working arrangement'} · ${scheduled.reason || 'HR approved'}`;
            }
            source = 'hr_schedule'; appliedHrRule = scheduled;
          }
        } else if (exempt && checkIn && checkOut &&
          (finalStatus === 'Late' || (finalStatus === 'Half Day' &&
           String(attendance?.status || '').toLowerCase() !== 'half_day' && isHalfDayCheckIn(checkIn)))) {
          finalStatus = 'Present'; isLateMark = false; lateMarkReason = null;
          source = 'hr_exception'; detail = exempt.reason || 'HR-approved arrival exemption';
          appliedHrRule = exempt;
        }
      }

      records.push({
        user_id:
          user.user_id,

        employee_code:
          user.employee_code,

        full_name:
          user.full_name,

        email:
          user.email,

        designation:
          user.designation,

        department_id:
          user.department_id,

        department_name:
          user.department_name,

        role_name:
          user.role_name,

        joining_date:
          user.joining_date,

        first_attendance_date:
          firstAttendanceDate,

        attendance_id:
          attendance?.attendance_id ||
          null,

        attendance_date:
          currentDate,

        day_name:
          dayName,

        is_sunday: sunday,
        extra_working_day: sunday && finalStatus === "Extra Working Day",
        extra_working_minutes: sunday && finalStatus === "Extra Working Day" ? totalMinutes : 0,

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

        is_late:
          isLateMark,

        late_mark_reason:
          lateMarkReason,

        needs_attention:
          needsAttention,

        field_visit_attendance_status:
          fieldVisitAttendanceStatus,

        request_status:
          requestStatus,

        pending_request_type:
          pendingRequestType,

        pending_request_id:
          pendingRequestId,

        source,
        detail,
        hr_rule_id: appliedHrRule?.id || null,
        hr_arrangement: appliedHrRule?.arrangement_name || (source === 'hr_wfh' ? 'Work From Home' : null),
        hr_attendance_label: source === 'hr_wfh' ? 'Present · WFH' : null,
        approved_shift_start: appliedHrRule?.shift_start || null,
        approved_shift_end: appliedHrRule?.shift_end || null,

        conflict_reason:
          conflictReason,

        attendance_status:
          attendance?.status ||
          null,

        attendance_remarks:
          attendance?.remarks ||
          null,

        leave_id:
          leave?.leave_id ||
          null,

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
          null,

        field_visit_id:
          fieldVisit?.visit_id ||
          null,

        field_visit_type:
          fieldVisitType,

        field_visit_duration:
          fieldVisit?.duration_type ||
          null,

        field_visit_half_day_session:
          fieldVisit?.half_day_session ||
          null,

        field_visit_location:
          fieldVisitLocation,

        field_visit_reason:
          fieldVisit?.comment ||
          null,

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

  const summary = {
    employees:
      users.length,

    present: 0,
    late: 0,
    half_day: 0,
    absent: 0,
    no_punch: 0,
    needs_review: 0,
    pending_approval: 0,

    weekly_off: 0,
    holiday: 0,
    extra_working_days: 0,

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

    if (record.is_sunday) {
      summary.weekly_off += 1;
      if (record.extra_working_day) summary.extra_working_days += 1;
      return;
    }

    if (
      status === "present" ||
      status === "late"
    ) {
      summary.present += 1;
    }

    if (record.is_late) {
      summary.late += 1;
    }

    if (status === "half day") {
      summary.half_day += 1;
    }

    if (
      status === "half day leave"
    ) {
      summary.half_day += 1;
    }

    if (status === "absent") {
      summary.absent += 1;
    }

    if (status === "no punch") {
      summary.no_punch += 1;
    }

    if (
      status === "needs review" ||
      record.needs_attention
    ) {
      summary.needs_review += 1;
    }

    if (
      status === "pending approval"
    ) {
      summary.pending_approval += 1;
    }

    if (
      status === "weekly off"
    ) {
      summary.weekly_off += 1;
    }

    if (status === "holiday") {
      summary.holiday += 1;
    }

    if (
      status === "field visit"
    ) {
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

  const leaveApplications =
    hrLeaveRows.map((leave) => ({
      revert_status:
        leave.revert_status ||
        "none",

      revert_reason:
        leave.revert_reason ||
        null,

      revert_requested_at:
        leave.revert_requested_at ||
        null,

      revert_reviewed_by:
        leave.revert_reviewed_by ||
        null,

      revert_reviewed_by_name:
        leave.revert_reviewed_by_name ||
        null,

      revert_reviewed_by_email:
        leave.revert_reviewed_by_email ||
        null,

      revert_reviewed_at:
        leave.revert_reviewed_at ||
        null,

      revert_review_remark:
        leave.revert_review_remark ||
        null,

      leave_id:
        leave.leave_id,

      employee_id:
        leave.employee_id,

      employee_code:
        leave.employee_code,

      employee_name:
        leave.employee_name,

      employee_email:
        leave.employee_email,

      designation:
        leave.designation,

      department_id:
        leave.department_id,

      department_name:
        leave.department_name,

      role_name:
        leave.role_name,

      leave_type:
        getLeaveLabel(
          leave.leave_type
        ),

      leave_code:
        leave.leave_type,

      start_date:
        leave.start_date,

      end_date:
        leave.end_date,

      total_days:
        leave.total_days,

      duration_type:
        leave.duration_type,

      half_day_session:
        leave.half_day_session,

      reason:
        leave.reason,

      display_status:
        getHrLeaveDisplayStatus(
          leave
        ),

      status:
        leave.status,

      escalated_for_approval:
        Number(
          leave.escalated_for_approval ||
            0
        ),

      escalated_by_name:
        leave.escalated_by_name ||
        null,

      escalated_at:
        leave.escalated_at ||
        null,

      reviewed_by_name:
        leave.reviewed_by_name ||
        null,

      reviewed_at:
        leave.reviewed_at ||
        null,

      review_remark:
        leave.review_remark ||
        null,
    }));

  // Group visits: return the same visit once per participant for HR visibility.
  const hrVisitIds = [...new Set(hrFieldVisitRows.map(v => Number(v.visit_id)).filter(Boolean))];
  let hrVisitMembers = [];
  if (hrVisitIds.length) {
    const [memberCols] = await db.query('SHOW COLUMNS FROM field_visit_members');
    const cols = memberCols.map(c => String(c.Field).toLowerCase());
    const visitCol = cols.includes('field_visit_id') ? 'field_visit_id' : cols.includes('visit_id') ? 'visit_id' : null;
    const personCol = ['employee_id','user_id','member_id'].find(c => cols.includes(c));
    if (visitCol && personCol) {
      const placeholders = hrVisitIds.map(() => '?').join(',');
      [hrVisitMembers] = await db.query(`SELECT ${visitCol} visit_id, ${personCol} employee_id FROM field_visit_members WHERE ${visitCol} IN (${placeholders})`,hrVisitIds);
    }
  }
  const hrMemberMap = new Map();
  hrVisitMembers.forEach(m=>{
    const id=Number(m.visit_id);
    if (!hrMemberMap.has(id)) hrMemberMap.set(id, new Set());
    hrMemberMap.get(id).add(Number(m.employee_id));
  });

  const hrFieldVisitsOriginal =
    hrFieldVisitRows.map(
      (visit) => ({
        visit_id:
          visit.visit_id,
        participant_ids: [...new Set([Number(visit.employee_id), ...(hrMemberMap.get(Number(visit.visit_id)) || [])])],

        employee_id:
          visit.employee_id,

        employee_name:
          visit.employee_name,

        employee_code:
          visit.employee_code,

        employee_email:
          visit.employee_email,

        designation:
          visit.designation,

        department_id:
          visit.department_id,

        department_name:
          visit.department_name,

        role_name:
          visit.role_name,

        visit_type:
          visit.visit_type,

        visit_date:
          visit.visit_date,

        end_date:
          visit.end_date,

        duration_type:
          visit.duration_type,

        half_day_session:
          visit.half_day_session,

        start_time:
          visit.start_time,

        end_time:
          visit.end_time,

        location:
          visit.location,

        status:
          visit.status,

        reviewed_by:
          visit.reviewed_by,

        reviewed_by_name:
          visit.reviewed_by_name ||
          null,

        reviewed_by_email:
          visit.reviewed_by_email ||
          null,

        reviewed_at:
          visit.reviewed_at ||
          null,

        comment:
          visit.comment ||
          null,

        review_remark:
          visit.review_remark ||
          null,
      })
    );

  const hrUserMap = new Map(users.map(u => [Number(u.user_id),u]));
  const hrFieldVisits = hrFieldVisitsOriginal.flatMap(visit =>
    visit.participant_ids.map(employeeId => {
      const participant=hrUserMap.get(Number(employeeId));
      if (!participant) return null;
      return { ...visit, employee_id:employeeId, employee_name:participant.full_name,
        employee_code:participant.employee_code,employee_email:participant.email,
        designation:participant.designation,department_id:participant.department_id,
        department_name:participant.department_name,role_name:participant.role_name,
        submitted_by_name:visit.employee_name };
    }).filter(Boolean)
  );

  const fieldVisitSummary = {
    total:
      hrFieldVisits.length,

    pending:
      hrFieldVisits.filter(
        (item) =>
          String(item.status)
            .toLowerCase() ===
          "pending"
      ).length,

    approved:
      hrFieldVisits.filter(
        (item) =>
          String(item.status)
            .toLowerCase() ===
          "approved"
      ).length,

    rejected:
      hrFieldVisits.filter(
        (item) =>
          String(item.status)
            .toLowerCase() ===
          "rejected"
      ).length,

    employees:
      new Set(
        hrFieldVisits
          .map(
            (item) =>
              Number(
                item.employee_id
              )
          )
          .filter(Boolean)
      ).size,

    locations:
      new Set(
        hrFieldVisits
          .map(
            (item) =>
              String(
                item.location || ""
              ).trim()
          )
          .filter(Boolean)
      ).size,
  };

  const leaveApplicationSummary = {
    total:
      leaveApplications.length,

    pending:
      leaveApplications.filter(
        (item) =>
          item.display_status ===
          "Pending"
      ).length,

    escalated:
      leaveApplications.filter(
        (item) =>
          item.display_status ===
          "Escalated"
      ).length,

    approved:
      leaveApplications.filter(
        (item) =>
          item.display_status ===
          "Approved"
      ).length,

    rejected:
      leaveApplications.filter(
        (item) =>
          item.display_status ===
          "Rejected"
      ).length,
  };

  return {
    users,
    records,
    summary,

    leave_applications:
      leaveApplications,

    leave_application_summary:
      leaveApplicationSummary,

    field_visits:
      hrFieldVisits,

    field_visit_summary:
      fieldVisitSummary,

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

const getHrAttendance = async (
  req,
  res
) => {
  try {
    if (!isAuthorizedHR(req)) {
      return res.status(403).json({
        success: false,
        message:
          "HR Attendance access denied.",
      });
    }

    const today = new Date();

    const defaultDate =
      formatDate(today);

    const defaultFrom =
      defaultDate;

    const defaultTo =
      defaultDate;

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
        result.records.slice(
          (Math.max(
            Number(
              req.query.page || 1
            ),
            1
          ) -
            1) *
            Math.min(
              Math.max(
                Number(
                  req.query.page_size ||
                    100
                ),
                1
              ),
              100
            ),

          Math.max(
            Number(
              req.query.page || 1
            ),
            1
          ) *
            Math.min(
              Math.max(
                Number(
                  req.query.page_size ||
                    100
                ),
                1
              ),
              100
            )
        ),

      summary:
        result.summary,

      leave_applications:
        result.leave_applications ||
        [],

      leave_application_summary:
        result.leave_application_summary ||
        {
          total: 0,
          pending: 0,
          escalated: 0,
          approved: 0,
          rejected: 0,
        },

      field_visits:
        result.field_visits ||
        [],

      field_visit_summary:
        result.field_visit_summary ||
        {
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          employees: 0,
          locations: 0,
        },

      pagination: {
        page:
          Math.max(
            Number(
              req.query.page ||
                1
            ),
            1
          ),

        page_size:
          Math.min(
            Math.max(
              Number(
                req.query.page_size ||
                  100
              ),
              1
            ),
            100
          ),

        total_records:
          result.records.length,

        total_pages:
          Math.max(
            Math.ceil(
              result.records.length /
                Math.min(
                  Math.max(
                    Number(
                      req.query
                        .page_size ||
                        100
                    ),
                    1
                  ),
                  100
                )
            ),
            1
          ),
      },
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
        error.sqlMessage ||
        null,
    });
  }
};

/* =========================================================
   MANUAL ADD / UPDATE
========================================================= */

const saveHrAttendance = async (
  req,
  res
) => {
  try {
    if (!isAuthorizedHR(req)) {
      return res.status(403).json({
        success: false,
        message:
          "HR Attendance access denied.",
      });
    }

    const employeeId =
      Number(
        req.body?.employee_id ||
        0
      );

    const attendanceDate =
      String(
        req.body
          ?.attendance_date ||
        ""
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
        req.body?.remarks ||
        ""
      ).trim() ||
      null;

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
      !allowedStatuses.includes(
        status
      )
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

    if (
      existingRows.length
    ) {
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
          existingRows[0]
            .attendance_id,
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
        error.sqlMessage ||
        null,
    });
  }
};

/* =========================================================
   IMPORT
========================================================= */

const importHrAttendance = async (
  req,
  res
) => {
  const connection =
    await db.getConnection();

  try {
    if (!isAuthorizedHR(req)) {
      return res.status(403).json({
        success: false,
        message:
          "HR Attendance access denied.",
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

    await connection
      .beginTransaction();

    for (
      const row of rows
    ) {
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
          !unmatchedEmployees
            .has(
              unmatchedKey
            )
        ) {
          unmatchedEmployees
            .set(
              unmatchedKey,
              {
                employee_code:
                  employeeCode ||
                  null,

                full_name:
                  fullName ||
                  null,

                email:
                  email ||
                  null,

                rows: 0,
              }
            );
        }

        unmatchedEmployees
          .get(
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
        ) ||
        null;

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

      if (
        existingRows.length
      ) {
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
            existingRows[0]
              .attendance_id,
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
          unmatchedEmployees
            .values()
        ),
    });
  } catch (error) {
    try {
      await connection
        .rollback();
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
        error.sqlMessage ||
        null,
    });
  } finally {
    connection.release();
  }
};

/* =========================================================
   EXPORT HELPERS
========================================================= */

const escapeCsvValue = (
  value
) => {
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

const exportHrAttendance = async (
  req,
  res
) => {
  try {
    if (!isAuthorizedHR(req)) {
      return res.status(403).json({
        success: false,
        message:
          "HR Attendance access denied.",
      });
    }

    const today =
      new Date();

    const defaultFrom =
      `${today.getFullYear()}-${String(
        today.getMonth() + 1
      ).padStart(
        2,
        "0"
      )}-01`;

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

    const exportView =
      String(
        req.query.view ||
        "attendance"
      )
        .trim()
        .toLowerCase();

    if (
      fromDate > toDate
    ) {
      return res.status(
        400
      ).json({
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

    if (
      exportView ===
      "employee-summary"
    ) {
      const recordsByUser =
        new Map();

      result.records.forEach(
        (record) => {
          const userId =
            Number(
              record.user_id
            );

          if (
            !recordsByUser.has(
              userId
            )
          ) {
            recordsByUser.set(
              userId,
              []
            );
          }

          recordsByUser
            .get(userId)
            .push(record);
        }
      );

      const summaryRows =
        result.users
          .map((user) => {
            const employeeRecords =
              recordsByUser.get(
                Number(
                  user.user_id
                )
              ) ||
              [];

            if (
              !employeeRecords.length
            ) {
              return null;
            }

            const totals = {
              working_days: 0,
              extra_working_days: 0,
              extra_working_minutes: 0,
              present: 0,
              absent: 0,
              late: 0,
              half_day: 0,
              field_visit: 0,
              leave: 0,
              no_punch: 0,
              needs_review: 0,
              pending_approval: 0,
              weekly_off: 0,
              holiday: 0,
              sick_leave: 0,
              casual_leave: 0,
              privileged_leave: 0,
              festival_leave: 0,
              unpaid_leave: 0,
              total_days: 0,
              lop: 0,
            };

            employeeRecords
              .forEach(
                (record) => {
                  const status =
                    String(
                      record
                        .final_status ||
                      ""
                    )
                      .trim()
                      .toLowerCase();

                  if (record.is_sunday) {
                    totals.weekly_off += 1;
                    if (record.extra_working_day) {
                      totals.extra_working_days += 1;
                      totals.extra_working_minutes += Number(record.extra_working_minutes || 0);
                    }
                    return;
                  }

                  if (
                    status !==
                      "weekly off" &&
                    status !==
                      "holiday"
                  ) {
                    totals
                      .working_days +=
                      1;
                  }

                  if (
                    status ===
                      "present" ||
                    status ===
                      "late"
                  ) {
                    totals.present +=
                      1;
                  }

                  if (
                    status ===
                      "late" ||
                    record.is_late
                  ) {
                    totals.late +=
                      record
                        .is_late ||
                      status ===
                        "late"
                        ? 1
                        : 0;
                  }

                  if (
                    status ===
                    "half day"
                  ) {
                    totals.present +=
                      0.5;

                    totals.half_day +=
                      0.5;

                    totals.lop +=
                      0.5;
                  }

                  if (
                    status ===
                    "absent"
                  ) {
                    totals.absent +=
                      1;

                    totals.lop +=
                      1;
                  }

                  if (
                    status ===
                    "field visit"
                  ) {
                    const visitDays =
                      String(
                        record
                          .field_visit_duration ||
                        ""
                      )
                        .trim()
                        .toLowerCase() ===
                      "half_day"
                        ? 0.5
                        : 1;

                    totals.field_visit +=
                      visitDays;

                    if (
                      String(
                        record
                          .field_visit_attendance_status ||
                        ""
                      )
                        .trim()
                        .toLowerCase() ===
                      "half day"
                    ) {
                      totals.lop +=
                        0.5;
                    }
                  }

                  if (
                    status ===
                    "weekly off"
                  ) {
                    totals.weekly_off +=
                      1;
                  }

                  if (
                    status ===
                    "holiday"
                  ) {
                    totals.holiday +=
                      1;
                  }

                  if (
                    status ===
                    "no punch"
                  ) {
                    totals.no_punch +=
                      1;
                  }

                  if (
                    status ===
                      "needs review" ||
                    record
                      .needs_attention
                  ) {
                    totals.needs_review +=
                      1;
                  }

                  if (
                    status ===
                    "pending approval"
                  ) {
                    totals
                      .pending_approval +=
                      1;
                  }

                  if (
                    record.leave_id
                  ) {
                    const leaveDays =
                      String(
                        record
                          .leave_duration ||
                        ""
                      )
                        .trim()
                        .toLowerCase() ===
                      "half day"
                        ? 0.5
                        : 1;

                    totals.leave +=
                      leaveDays;

                    if (
                      record
                        .leave_code ===
                      "unpaid"
                    ) {
                      totals
                        .unpaid_leave +=
                        leaveDays;

                      totals.lop +=
                        leaveDays;
                    } else if (
                      record
                        .leave_code ===
                      "sick"
                    ) {
                      totals
                        .sick_leave +=
                        leaveDays;
                    } else if (
                      record
                        .leave_code ===
                      "casual"
                    ) {
                      totals
                        .casual_leave +=
                        leaveDays;
                    } else if (
                      record
                        .leave_code ===
                      "mandatory"
                    ) {
                      totals
                        .privileged_leave +=
                        leaveDays;
                    } else if (
                      record
                        .leave_code ===
                      "festival"
                    ) {
                      totals
                        .festival_leave +=
                        leaveDays;
                    }
                  }
                }
              );

            const latePenaltyDays =
  Math.floor(totals.late / 5);

totals.lop +=
  latePenaltyDays;

totals.total_days =
  totals.working_days +
  totals.weekly_off +
  totals.holiday;

            return {
              "Employee ID":
                user.employee_code ||
                "",

              "Employee Name":
                user.full_name ||
                "",

              Email:
                user.email ||
                "",

              Department:
                user
                  .department_name ||
                "",

              Designation:
                user.designation ||
                "",

              "Period From":
                fromDate,

              "Period To":
                toDate,

              "Working Days":
                totals
                  .working_days,

              "Extra Working Days": totals.extra_working_days,
              "Extra Working Hours": formatWorkingHours(totals.extra_working_minutes),

              Present:
                totals.present,

              Absent:
                totals.absent,

              Late:
                totals.late,

              "Half Day":
                totals.half_day,

              "Field Visit":
                totals
                  .field_visit,

              Leave:
                totals.leave,

              "No Punch":
                totals.no_punch,

              "Needs Review":
                totals
                  .needs_review,

              "Pending Approval":
                totals
                  .pending_approval,

              "Weekly Off":
                totals
                  .weekly_off,

              Holiday:
                totals.holiday,

              "Sick Leave":
                totals
                  .sick_leave,

              "Casual Leave":
                totals
                  .casual_leave,

              "Privileged Leave":
                totals
                  .privileged_leave,

              "Festival Leave":
                totals
                  .festival_leave,

              "Unpaid Leave":
                totals
                  .unpaid_leave,

              "Total Days":
                totals
                  .total_days,

              LOP:
                totals.lop,
            };
          })
          .filter(Boolean);

      const detailRows =
        result.records.map(
          (record) => ({
            "Employee ID":
              record.employee_code ||
              "",

            "Employee Name":
              record.full_name ||
              "",

            Department:
              record
                .department_name ||
              "",

            Date:
              record
                .attendance_date ||
              "",

            Day:
              record.day_name ||
              "",

            Status:
              record.final_status ===
                "Field Visit" &&
              record
                .field_visit_attendance_status
                ? `Field Visit · ${record.field_visit_attendance_status}`
                : record
                    .final_status ||
                  "",

            "First Punch":
              record
                .check_in_time ===
              "-"
                ? ""
                : record
                    .check_in_time,

            "Last Punch":
              record
                .check_out_time ===
              "-"
                ? ""
                : record
                    .check_out_time,

            "Total Time":
              record
                .working_hours ===
              "-"
                ? ""
                : record
                    .working_hours,

            "Leave Type":
              record.leave_type ||
              "",

            "Leave Duration":
              record
                .leave_duration ||
              "",

            "Leave Half":
              record.leave_session ||
              "",

            "Field Visit Type":
              record
                .field_visit_type ||
              "",

            "Field Visit Duration":
              record
                .field_visit_duration ||
              "",

            "Field Visit Half":
              record
                .field_visit_half_day_session ||
              "",

            "Field Visit Location":
              record
                .field_visit_location ||
              "",

            "Request Status":
              record.request_status ||
              (
                record.leave_id ||
                record
                  .field_visit_id
                  ? "approved"
                  : ""
              ),

            "Pending Request":
              record
                .pending_request_type ||
              "",

            "Approved By":
              record
                .approved_by_name ||
              "",

            "Approved At":
              record
                .approved_at ||
              "",

            "Needs Attention":
              record
                .needs_attention
                ? "Yes"
                : "",

            Remark:
              record
                .leave_reason ||
              record
                .field_visit_reason ||
              record
                .attendance_remarks ||
              record.detail ||
              "",
          })
        );

      if (
        exportFormat ===
        "csv"
      ) {
        const headers =
          Object.keys(
            summaryRows[0] ||
            {}
          );

        const csvLines = [
          headers
            .map(
              escapeCsvValue
            )
            .join(","),

          ...summaryRows.map(
            (row) =>
              headers
                .map(
                  (header) =>
                    escapeCsvValue(
                      row[
                        header
                      ]
                    )
                )
                .join(",")
          ),
        ];

        const csv =
          "\uFEFF" +
          csvLines.join(
            "\r\n"
          );

        res.setHeader(
          "Content-Type",
          "text/csv; charset=utf-8"
        );

        res.setHeader(
          "Content-Disposition",
          `attachment; filename="hr-employee-summary-${fromDate}-to-${toDate}.csv"`
        );

        return res.send(csv);
      }

      if (
        exportFormat !==
        "xlsx"
      ) {
        return res.status(
          400
        ).json({
          success: false,
          message:
            "Export format must be xlsx or csv.",
        });
      }

      const workbook =
        XLSX.utils
          .book_new();

      const summarySheet =
        XLSX.utils
          .json_to_sheet(
            summaryRows
          );

      summarySheet["!cols"] =
        Object.keys(
          summaryRows[0] ||
          {}
        ).map(() => ({
          wch: 18,
        }));

      const detailSheet =
        XLSX.utils
          .json_to_sheet(
            detailRows
          );

      detailSheet["!cols"] =
        Object.keys(
          detailRows[0] ||
          {}
        ).map(() => ({
          wch: 20,
        }));

      XLSX.utils
        .book_append_sheet(
          workbook,
          summarySheet,
          "Employee Summary"
        );

      XLSX.utils
        .book_append_sheet(
          workbook,
          detailSheet,
          "Day-wise Details"
        );

      const buffer =
        XLSX.write(
          workbook,
          {
            bookType:
              "xlsx",
            type:
              "buffer",
          }
        );

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="hr-employee-summary-${fromDate}-to-${toDate}.xlsx"`
      );

      return res.send(
        buffer
      );
    }

    const exportRows =
      result.records.map(
        (record) => ({
          "Employee ID":
            record.employee_code ||
            "",

          "Employee Name":
            record.full_name ||
            "",

          Email:
            record.email ||
            "",

          Department:
            record
              .department_name ||
            "",

          Designation:
            record.designation ||
            "",

          Date:
            record
              .attendance_date ||
            "",

          Day:
            record.day_name ||
            "",

          "First Punch":
            record
              .check_in_time ===
            "-"
              ? ""
              : record
                  .check_in_time,

          "Last Punch":
            record
              .check_out_time ===
            "-"
              ? ""
              : record
                  .check_out_time,

          "Total Time":
            record
              .working_hours ===
            "-"
              ? ""
              : record
                  .working_hours,

          Status:
            record
              .final_status ||
            "",

          "Leave Type":
            record.leave_type ||
            "",

          "Leave Duration":
            record
              .leave_duration ||
            "",

          "Leave Session":
            record
              .leave_session ||
            "",

          "Field Visit Type":
            record
              .field_visit_type ||
            "",

          "Field Visit Duration":
            record
              .field_visit_duration ||
            "",

          "Field Visit Half":
            record
              .field_visit_half_day_session ||
            "",

          "Field Visit Location":
            record
              .field_visit_location ||
            "",

          "Request Status":
            record.request_status ||
            (
              record.leave_id ||
              record
                .field_visit_id
                ? "approved"
                : ""
            ),

          "Pending Request":
            record
              .pending_request_type ||
            "",

          "Needs Attention":
            record
              .needs_attention
              ? "Yes"
              : "",

          "Approved By":
            record
              .approved_by_name ||
            "",

          "Approved At":
            record
              .approved_at ||
            "",

          Remark:
            record
              .leave_reason ||
            record
              .field_visit_reason ||
            record
              .attendance_remarks ||
            record.detail ||
            "",
        })
      );

    if (
      exportFormat === "csv"
    ) {
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
        "Field Visit Duration",
        "Field Visit Half",
        "Field Visit Location",
        "Request Status",
        "Pending Request",
        "Needs Attention",
        "Approved By",
        "Approved At",
        "Remark",
      ];

      const csvLines = [
        headers
          .map(
            escapeCsvValue
          )
          .join(","),

        ...exportRows.map(
          (row) =>
            headers
              .map(
                (header) =>
                  escapeCsvValue(
                    row[header]
                  )
              )
              .join(",")
        ),
      ];

      const csv =
        "\uFEFF" +
        csvLines.join(
          "\r\n"
        );

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

    if (
      exportFormat !==
      "xlsx"
    ) {
      return res.status(
        400
      ).json({
        success: false,
        message:
          "Export format must be xlsx or csv.",
      });
    }

    const workbook =
      XLSX.utils
        .book_new();

    const worksheet =
      XLSX.utils
        .json_to_sheet(
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

    XLSX.utils
      .book_append_sheet(
        workbook,
        worksheet,
        "HR Attendance"
      );

    const buffer =
      XLSX.write(
        workbook,
        {
          bookType:
            "xlsx",

          type:
            "buffer",
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
        error.sqlMessage ||
        null,
    });
  }
};

const approveHrLeaveApplication = async (
  req,
  res
) => {
  let connection;

  try {
    if (!isAuthorizedHR(req)) {
      return res.status(403).json({
        success: false,
        message:
          "HR Attendance access denied.",
      });
    }

    const hrUserId =
      Number(
        req.user?.user_id ||
        0
      );

    const leaveId =
      Number(
        req.params.leaveId
      );

    if (!hrUserId) {
      return res.status(
        401
      ).json({
        success: false,
        message:
          "Invalid HR user.",
      });
    }

    if (
      !Number.isFinite(
        leaveId
      ) ||
      leaveId <= 0
    ) {
      return res.status(
        400
      ).json({
        success: false,
        message:
          "Invalid leave application ID.",
      });
    }

    connection =
      await db
        .getConnection();

    await connection
      .beginTransaction();

    const [leaveRows] =
      await connection.query(
        `
        SELECT
          la.leave_id,
          la.employee_id,
          la.status,

          COALESCE(
            la.escalated_for_approval,
            0
          ) AS escalated_for_approval

        FROM leave_applications la

        WHERE la.leave_id = ?

        LIMIT 1

        FOR UPDATE
        `,
        [
          leaveId,
        ]
      );

    if (
      !leaveRows.length
    ) {
      await connection
        .rollback();

      return res.status(
        404
      ).json({
        success: false,
        message:
          "Leave application not found.",
      });
    }

    const leave =
      leaveRows[0];

    const status =
      String(
        leave.status ||
        ""
      )
        .trim()
        .toLowerCase();

    const escalated =
      Number(
        leave
          .escalated_for_approval ||
        0
      ) === 1;

    if (escalated) {
      await connection
        .rollback();

      return res.status(
        400
      ).json({
        success: false,
        message:
          "This leave application is escalated and requires final review by Manish.",
      });
    }

    if (
      status !==
      "pending"
    ) {
      await connection
        .rollback();

      return res.status(
        400
      ).json({
        success: false,
        message:
          `Leave application is already ${status}.`,
      });
    }

    await connection.query(
      `
      UPDATE leave_applications

      SET
        status = 'approved',
        reviewed_by = ?,
        reviewed_at = NOW()

      WHERE leave_id = ?
        AND LOWER(
          TRIM(status)
        ) = 'pending'

        AND COALESCE(
          escalated_for_approval,
          0
        ) = 0
      `,
      [
        hrUserId,
        leaveId,
      ]
    );

    await connection
      .commit();

    return res.json({
      success: true,
      message:
        "Leave approved successfully.",
    });
  } catch (error) {
    if (connection) {
      try {
        await connection
          .rollback();
      } catch {}
    }

    console.error(
      "HR leave approval error:",
      error
    );

    return res.status(
      500
    ).json({
      success: false,
      message:
        "Failed to approve leave application.",
      error:
        error.message,
      sqlMessage:
        error.sqlMessage ||
        null,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/* =========================================================
   HR EMPLOYEE ATTENDANCE SUMMARY
========================================================= */

const getHrEmployeeSummary = async (
  req,
  res
) => {
  try {
    // HR, or the superadmin (read-only summary shown in the superadmin Attendance page)
    const isSuperadminViewer =
      String(req.user?.role_name || "").toLowerCase() === "superadmin";

    if (!isAuthorizedHR(req) && !isSuperadminViewer) {
      return res.status(
        403
      ).json({
        success: false,
        message:
          "HR Attendance access denied.",
      });
    }

    const today =
      formatDate(
        new Date()
      );

    const fromDate =
      String(
        req.query
          .from_date ||
        today
      ).slice(
        0,
        10
      );

    const toDate =
      String(
        req.query
          .to_date ||
        today
      ).slice(
        0,
        10
      );

    const search =
      String(
        req.query.search ||
        ""
      )
        .trim()
        .toLowerCase();

    const department =
      String(
        req.query.department ||
        ""
      ).trim();

    if (
      fromDate >
      toDate
    ) {
      return res.status(
        400
      ).json({
        success: false,
        message:
          "From date cannot be after To date.",
      });
    }

    const balanceYear =
      Number(
        toDate.slice(
          0,
          4
        )
      );

    const attendanceData =
      await buildHrAttendanceData(
        fromDate,
        toDate
      );

    const users =
      attendanceData.users ||
      [];

    const records =
      attendanceData.records ||
      [];

    const recordsByUser =
      new Map();

    records.forEach(
      (record) => {
        const userId =
          Number(
            record.user_id
          );

        if (
          !recordsByUser.has(
            userId
          )
        ) {
          recordsByUser.set(
            userId,
            []
          );
        }

        recordsByUser
          .get(userId)
          .push(record);
      }
    );

    const employeeSummaries =
      [];

    for (
      const user of users
    ) {
      const employeeRecords =
        recordsByUser.get(
          Number(
            user.user_id
          )
        ) ||
        [];

      if (
        !employeeRecords.length
      ) {
        continue;
      }

      const summary = {
        working_days: 0,
        extra_working_days: 0,
        extra_working_minutes: 0,

        present: 0,
        absent: 0,
        late: 0,

        half_day: 0,

        field_visit: 0,

        leave: 0,

        sick_leave: 0,
        casual_leave: 0,
        privileged_leave: 0,
        festival_leave: 0,
        unpaid_leave: 0,

        weekly_off: 0,
        holiday: 0,

        no_punch: 0,
        needs_review: 0,
        pending_approval: 0,

        total_days: 0,
        lop: 0,
      };

      employeeRecords
        .forEach(
          (record) => {
            const status =
              String(
                record
                  .final_status ||
                ""
              )
                .trim()
                .toLowerCase();

            if (record.is_sunday) {
              summary.weekly_off += 1;
              if (record.extra_working_day) {
                summary.extra_working_days += 1;
                summary.extra_working_minutes += Number(record.extra_working_minutes || 0);
              }
              return;
            }

            const isWeeklyOff =
              status ===
              "weekly off";

            const isHoliday =
              status ===
              "holiday";

            if (
              !isWeeklyOff &&
              !isHoliday
            ) {
              summary
                .working_days +=
                1;
            }

            if (
              status ===
                "present" ||
              status ===
                "late"
            ) {
              summary.present +=
                1;
            }

            if (
              record.is_late
            ) {
              summary.late +=
                1;
            }

            if (
              status ===
              "half day"
            ) {
              summary.present +=
                0.5;

              summary.half_day +=
                0.5;
            }

            if (
              status ===
              "half day leave"
            ) {
              summary.half_day +=
                0.5;
            }

            if (
              status ===
              "field visit"
            ) {
              const visitDuration =
                String(
                  record
                    .field_visit_duration ||
                  ""
                )
                  .trim()
                  .toLowerCase();

              summary.field_visit +=
                visitDuration ===
                "half_day"
                  ? 0.5
                  : 1;
            }

            if (
              status ===
              "weekly off"
            ) {
              summary.weekly_off +=
                1;
            }

            if (
              status ===
              "holiday"
            ) {
              summary.holiday +=
                1;
            }

            if (
              status ===
              "no punch"
            ) {
              summary.no_punch +=
                1;
            }

            if (
              status ===
                "needs review" ||
              record
                .needs_attention
            ) {
              summary
                .needs_review +=
                1;
            }

            if (
              status ===
              "pending approval"
            ) {
              summary
                .pending_approval +=
                1;
            }

            if (
              record.leave_id
            ) {
              const leaveDays =
                String(
                  record
                    .leave_duration ||
                  ""
                )
                  .toLowerCase() ===
                "half day"
                  ? 0.5
                  : 1;

              summary.leave +=
                leaveDays;

              switch (
                record.leave_code
              ) {
                case "sick":
                  summary
                    .sick_leave +=
                    leaveDays;
                  break;

                case "casual":
                  summary
                    .casual_leave +=
                    leaveDays;
                  break;

                case "mandatory":
                  summary
                    .privileged_leave +=
                    leaveDays;
                  break;

                case "festival":
                  summary
                    .festival_leave +=
                    leaveDays;
                  break;

                case "unpaid":
                  summary
                    .unpaid_leave +=
                    leaveDays;
                  break;

                default:
                  break;
              }
            }
          }
        );

      summary.absent =
        employeeRecords.filter(
          (record) =>
            String(
              record
                .final_status ||
              ""
            )
              .trim()
              .toLowerCase() ===
            "absent"
        ).length;

      const attendanceHalfDayLoss =
        employeeRecords.reduce(
          (
            total,
            record
          ) =>
            String(
              record
                .final_status ||
              ""
            )
              .trim()
              .toLowerCase() ===
            "half day"
              ? total +
                0.5
              : total,
          0
        );

      const fieldVisitHalfDayLoss =
        employeeRecords.reduce(
          (
            total,
            record
          ) =>
            String(
              record
                .final_status ||
              ""
            )
              .trim()
              .toLowerCase() ===
              "field visit" &&
            String(
              record
                .field_visit_attendance_status ||
              ""
            )
              .trim()
              .toLowerCase() ===
              "half day"
              ? total +
                0.5
              : total,
          0
        );

      const latePenaltyDays =
  Math.floor(summary.late / 5);

summary.lop =
  summary.absent +
  attendanceHalfDayLoss +
  fieldVisitHalfDayLoss +
  summary.unpaid_leave +
  latePenaltyDays;

summary.total_days =
  summary.working_days +
  summary.weekly_off +
  summary.holiday;

      let leaveBalances =
        {};

      try {
        leaveBalances =
          await buildLeaveBalances(
            db,
            user.user_id,
            balanceYear
          );
      } catch (
        balanceError
      ) {
        console.error(
          `HR leave balance error for user ${user.user_id}:`,
          balanceError.message
        );

        leaveBalances =
          {};
      }

      employeeSummaries
        .push({
          user_id:
            user.user_id,

          employee_code:
            user
              .employee_code,

          full_name:
            user.full_name,

          email:
            user.email,

          designation:
            user.designation,

          department_id:
            user
              .department_id,

          department_name:
            user
              .department_name,

          role_name:
            user.role_name,

          attendance:
            summary,

          leave_balance:
            leaveBalances,

          daily_records:
            employeeRecords,
        });
    }

    let filtered =
      employeeSummaries;

    if (department) {
      filtered =
        filtered.filter(
          (item) =>
            String(
              item
                .department_name ||
              ""
            ) ===
            department
        );
    }

    if (search) {
      filtered =
        filtered.filter(
          (item) => {
            const text = [
              item.full_name,
              item.employee_code,
              item.email,
              item
                .department_name,
              item.designation,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

            return text
              .includes(
                search
              );
          }
        );
    }

    return res.json({
      success: true,

      date_range: {
        from_date:
          fromDate,

        to_date:
          toDate,
      },

      balance_year:
        balanceYear,

      total_employees:
        filtered.length,

      employees:
        filtered,
    });
  } catch (error) {
    console.error(
      "HR employee attendance summary error:",
      error
    );

    return res.status(
      500
    ).json({
      success: false,

      message:
        "Failed to load employee attendance summary.",

      error:
        error.message,

      sqlMessage:
        error.sqlMessage ||
        null,
    });
  }
};

/* =========================================================
   HR LEAVE MANAGEMENT
========================================================= */

const HR_MANAGED_LEAVE_TYPES = [
  "sick",
  "casual",
  "mandatory",
  "festival",
];

const normalizeHrManagedLeaveType = (value) => {
  const type = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (["sick", "sick_leave"].includes(type)) return "sick";
  if (["casual", "casual_leave"].includes(type)) return "casual";
  if (
    [
      "mandatory",
      "mandatory_leave",
      "privileged",
      "privileged_leave",
    ].includes(type)
  ) {
    return "mandatory";
  }
  if (["festival", "festival_leave"].includes(type)) return "festival";

  return "";
};

const getHrManagedUser = async (connectionOrDb, userId) => {
  const [rows] = await connectionOrDb.query(
    `
    SELECT
      u.user_id,
      u.employee_code,
      u.full_name,
      u.email,
      u.status,
      u.department_id,
      d.department_name,
      r.role_name
    FROM users u
    LEFT JOIN departments d
      ON d.department_id = u.department_id
    LEFT JOIN roles r
      ON r.role_id = u.role_id
    WHERE u.user_id = ?
      AND LOWER(COALESCE(u.status, 'active')) != 'deleted'
    LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
};

const getIndiaTodayForHrLeave = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = {};
  parts.forEach((part) => {
    values[part.type] = part.value;
  });

  return `${values.year}-${values.month}-${values.day}`;
};

const calculateHrManagedLeaveDays = (startDate, endDate) => {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0;
  }

  return Math.floor((end - start) / 86400000) + 1;
};

const getHrLeaveManagement = async (req, res) => {
  try {
    if (!isAuthorizedHR(req)) {
      return res.status(403).json({
        success: false,
        message: "HR Attendance access denied.",
      });
    }

    const userId = Number(req.params.userId);
    const requestedYear = Number(req.query.year);
    const year =
      Number.isInteger(requestedYear) && requestedYear >= 2000
        ? requestedYear
        : Number(getIndiaTodayForHrLeave().slice(0, 4));

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid employee ID is required.",
      });
    }

    const user = await getHrManagedUser(db, userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Employee not found.",
      });
    }

    const balances = await buildLeaveBalances(db, userId, year);

    const [leaveHistory] = await db.query(
      `
      SELECT
        la.leave_id,
        la.leave_type,
        DATE_FORMAT(la.start_date, '%Y-%m-%d') AS start_date,
        DATE_FORMAT(la.end_date, '%Y-%m-%d') AS end_date,
        la.total_days,
        la.reason,
        la.status,
        COALESCE(la.revert_status, 'none') AS revert_status,
        la.revert_reason,
        DATE_FORMAT(la.applied_at, '%Y-%m-%d %H:%i:%s') AS applied_at,
        DATE_FORMAT(la.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
        reviewer.full_name AS reviewed_by_name
      FROM leave_applications la
      LEFT JOIN users reviewer
        ON reviewer.user_id = la.reviewed_by
      WHERE la.employee_id = ?
        AND YEAR(la.start_date) = ?
      ORDER BY la.applied_at DESC, la.leave_id DESC
      LIMIT 50
      `,
      [userId, year]
    );

    let adjustmentHistory = [];

    try {
      const [adjustmentColumns] = await db.query(
        "SHOW COLUMNS FROM employee_leave_adjustments"
      );
      const columns = new Set(
        adjustmentColumns.map((row) => String(row.Field))
      );
      const timeColumn = columns.has("created_at")
        ? "created_at"
        : columns.has("adjusted_at")
        ? "adjusted_at"
        : null;
      const noteColumn = columns.has("reason")
        ? "reason"
        : columns.has("remark")
        ? "remark"
        : columns.has("remarks")
        ? "remarks"
        : null;

      const [rows] = await db.query(
        `
        SELECT
          ela.adjustment_id,
          ela.leave_type,
          ela.adjustment_days,
          ela.adjusted_by,
          ${
            timeColumn
              ? `DATE_FORMAT(ela.${timeColumn}, '%Y-%m-%d %H:%i:%s')`
              : "NULL"
          } AS adjusted_at,
          ${noteColumn ? `ela.${noteColumn}` : "NULL"} AS reason,
          adjusted_by_user.full_name AS adjusted_by_name
        FROM employee_leave_adjustments ela
        LEFT JOIN users adjusted_by_user
          ON adjusted_by_user.user_id = ela.adjusted_by
        WHERE ela.employee_id = ?
        ORDER BY ${
          timeColumn
            ? `ela.${timeColumn} DESC, ela.adjustment_id DESC`
            : "ela.adjustment_id DESC"
        }
        LIMIT 50
        `,
        [userId]
      );

      adjustmentHistory = rows;
    } catch (adjustmentError) {
      console.error(
        "HR leave adjustment history error:",
        adjustmentError.message
      );
    }

    return res.json({
      success: true,
      year,
      user,
      balances,
      leave_history: leaveHistory.map((leave) => ({
        ...leave,
        total_days: Number(leave.total_days || 0),
      })),
      adjustment_history: adjustmentHistory.map((adjustment) => ({
        ...adjustment,
        adjustment_days: Number(adjustment.adjustment_days || 0),
      })),
    });
  } catch (error) {
    console.error("getHrLeaveManagement error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load employee leave management.",
      error: error.message,
      sqlMessage: error.sqlMessage || null,
    });
  }
};

const addHrEmployeeExtraLeave = async (req, res) => {
  let connection;

  try {
    if (!isAuthorizedHR(req)) {
      return res.status(403).json({
        success: false,
        message: "HR Attendance access denied.",
      });
    }

    const userId = Number(req.params.userId);
    const hrUserId = Number(req.user?.user_id || 0);
    const leaveType = normalizeHrManagedLeaveType(req.body.leave_type);
    const adjustmentDays = Number(
      req.body.adjustment_days ?? req.body.days
    );
    const reason = String(req.body.reason || "").trim();

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid employee ID is required.",
      });
    }

    if (!HR_MANAGED_LEAVE_TYPES.includes(leaveType)) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid leave type.",
      });
    }

    if (!Number.isFinite(adjustmentDays) || adjustmentDays <= 0) {
      return res.status(400).json({
        success: false,
        message: "Extra leave days must be greater than 0.",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const user = await getHrManagedUser(connection, userId);

    if (!user) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Employee not found.",
      });
    }

    const [adjustmentColumns] = await connection.query(
      "SHOW COLUMNS FROM employee_leave_adjustments"
    );
    const columns = new Set(
      adjustmentColumns.map((row) => String(row.Field))
    );
    const insertColumns = [
  "employee_id",
  "leave_type",
  "adjustment_type",
  "adjustment_days",
  "adjusted_by",
  "created_by",
];

const insertValues = [
  userId,
  leaveType,
  "add",
  adjustmentDays,
  hrUserId,
  hrUserId,
];
    const noteColumn = columns.has("reason")
      ? "reason"
      : columns.has("remark")
      ? "remark"
      : columns.has("remarks")
      ? "remarks"
      : null;

    if (noteColumn) {
      insertColumns.push(noteColumn);
      insertValues.push(reason || "Extra leave credited by HR");
    }

    const placeholders = insertColumns.map(() => "?").join(", ");
    const [result] = await connection.query(
      `
      INSERT INTO employee_leave_adjustments
      (${insertColumns.join(", ")})
      VALUES (${placeholders})
      `,
      insertValues
    );

    const year = Number(getIndiaTodayForHrLeave().slice(0, 4));
    const balances = await buildLeaveBalances(connection, userId, year);

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Extra leave added successfully.",
      adjustment_id: result.insertId,
      balances,
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {}
    }

    console.error("addHrEmployeeExtraLeave error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add extra leave.",
      error: error.message,
      sqlMessage: error.sqlMessage || null,
    });
  } finally {
    if (connection) connection.release();
  }
};

const reduceHrEmployeeLeave = async (req, res) => {
  let connection;

  try {
    if (!isAuthorizedHR(req)) {
      return res.status(403).json({
        success: false,
        message: "HR Attendance access denied.",
      });
    }

    const userId = Number(req.params.userId);
    const hrUserId = Number(req.user?.user_id || 0);
    const leaveType = normalizeHrManagedLeaveType(req.body.leave_type);
    const durationType = String(req.body.duration_type || "full_day")
      .trim()
      .toLowerCase();
    const halfDaySession = String(req.body.half_day_session || "")
      .trim()
      .toLowerCase();
    const startDate = String(req.body.start_date || "").trim();
    let endDate = String(req.body.end_date || "").trim();
    const reason =
      String(req.body.reason || "").trim() ||
      "Leave recorded by HR";
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid employee ID is required.",
      });
    }

    if (!HR_MANAGED_LEAVE_TYPES.includes(leaveType)) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid leave type.",
      });
    }

    if (!["full_day", "half_day"].includes(durationType)) {
      return res.status(400).json({
        success: false,
        message: "Please select Full Day or Half Day.",
      });
    }

    if (!datePattern.test(startDate)) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid leave date.",
      });
    }

    // HR Reduce Leave: Festival Leave is always a single full day.
    // Ignore any stale end_date retained when the frontend switches leave types.
    if (leaveType === "festival") {
      if (durationType !== "full_day") {
        return res.status(400).json({
          success: false,
          message: "Festival Leave must be a Full Day.",
        });
      }
      endDate = startDate;
    } else if (durationType === "half_day") {
      if (!["first_half", "second_half"].includes(halfDaySession)) {
        return res.status(400).json({
          success: false,
          message: "Please select First Half or Second Half.",
        });
      }
      endDate = startDate;
    } else if (!datePattern.test(endDate) || endDate < startDate) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid leave date range.",
      });
    }

    // Authorized HR may record eligible past, present, and future leave.
    // Balance and overlap checks below still apply.

    if (startDate.slice(0, 4) !== endDate.slice(0, 4)) {
      return res.status(400).json({
        success: false,
        message: "Please save separate leave records for each calendar year.",
      });
    }

    const totalDays =
      durationType === "half_day"
        ? 0.5
        : calculateHrManagedLeaveDays(startDate, endDate);

    if (totalDays <= 0) {
      return res.status(400).json({
        success: false,
        message: "Unable to calculate leave days.",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const user = await getHrManagedUser(connection, userId);

    if (!user) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Employee not found.",
      });
    }

    const leaveYear = Number(startDate.slice(0, 4));
    const balances = await buildLeaveBalances(connection, userId, leaveYear);
    const available = Number(balances[leaveType]?.available || 0);

    if (totalDays > available) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Employee only has ${available} day(s) available for this leave type.`,
      });
    }

    const [overlappingRows] = await connection.query(
      `
      SELECT leave_id
      FROM leave_applications
      WHERE employee_id = ?
        AND status IN ('pending', 'approved')
        AND NOT (end_date < ? OR start_date > ?)
      LIMIT 1
      FOR UPDATE
      `,
      [userId, startDate, endDate]
    );

    if (overlappingRows.length) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message:
          "This employee already has a pending or approved leave record for the selected date(s).",
      });
    }

    const [leaveColumns] = await connection.query(
      "SHOW COLUMNS FROM leave_applications"
    );
    const columns = new Set(leaveColumns.map((row) => String(row.Field)));
    const insertColumns = [
      "employee_id",
      "leave_type",
      "start_date",
      "end_date",
      "total_days",
      "reason",
      "status",
    ];
    const insertValues = [
      userId,
      leaveType,
      startDate,
      endDate,
      totalDays,
      reason,
      "approved",
    ];

    if (columns.has("duration_type")) {
      insertColumns.push("duration_type");
      insertValues.push(durationType);
    }
    if (columns.has("half_day_session")) {
      insertColumns.push("half_day_session");
      insertValues.push(
        durationType === "half_day" ? halfDaySession : null
      );
    }
    if (columns.has("reviewed_by")) {
      insertColumns.push("reviewed_by");
      insertValues.push(hrUserId);
    }
    if (columns.has("reviewed_at")) {
      insertColumns.push("reviewed_at");
      insertValues.push(new Date());
    }

    const placeholders = insertColumns.map(() => "?").join(", ");
    const [result] = await connection.query(
      `
      INSERT INTO leave_applications
      (${insertColumns.join(", ")})
      VALUES (${placeholders})
      `,
      insertValues
    );

    const updatedBalances = await buildLeaveBalances(
      connection,
      userId,
      leaveYear
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Leave recorded successfully.",
      leave_id: result.insertId,
      balances: updatedBalances,
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {}
    }

    console.error("reduceHrEmployeeLeave error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to record leave.",
      error: error.message,
      sqlMessage: error.sqlMessage || null,
    });
  } finally {
    if (connection) connection.release();
  }
};

const applyHrEmployeeLeave = async (req, res) => {
  try {
    if (!isAuthorizedHR(req)) {
      return res.status(403).json({
        success: false,
        message: "HR Attendance access denied.",
      });
    }

    const employeeId = Number(req.params.userId);

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid employee ID is required.",
      });
    }

    const employee = await getHrManagedUser(db, employeeId);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found.",
      });
    }

    const originalUser = req.user;
    const hrName = String(
      originalUser?.full_name || originalUser?.email || "HR"
    ).trim();
    const originalReason = String(req.body.reason || "").trim();

    req.body = {
      ...req.body,
      reason: originalReason
        ? `${originalReason}\n\nSubmitted by HR (${hrName}) on behalf of ${employee.full_name}.`
        : `Submitted by HR (${hrName}) on behalf of ${employee.full_name}.`,
    };
    req.user = {
      ...originalUser,
      user_id: employeeId,
    };

    try {
      return await applyEmployeeLeave(req, res, { hrAuthorized: true });
    } finally {
      req.user = originalUser;
    }
  } catch (error) {
    console.error("applyHrEmployeeLeave error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to submit employee leave application.",
        error: error.message,
      });
    }
  }
};

/* =========================================================
   EXPORTS
========================================================= */

/* =========================================================
   HR: REVERT A PENDING OR APPROVED LEAVE

   POST /api/hr-attendance/leave-management/:userId/revert/:leaveId
   body: { reason }

   Uses the same state as an approved revert request
   (revert_status = 'approved'), so the leave balance returns and
   the leave no longer counts anywhere, exactly like the existing
   employee revert flow - HR just does it directly.
========================================================= */

const revertHrEmployeeLeave = async (req, res) => {
  let connection;

  try {
    if (!isAuthorizedHR(req)) {
      return res.status(403).json({
        success: false,
        message: "HR Attendance access denied.",
      });
    }

    const userId = Number(req.params.userId);
    const leaveId = Number(req.params.leaveId);
    const hrUserId = Number(req.user?.user_id || 0);
    const reason = String(req.body?.reason || "").trim();

    if (
      !Number.isInteger(userId) ||
      userId <= 0 ||
      !Number.isInteger(leaveId) ||
      leaveId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid employee and leave IDs are required.",
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Please enter a reason for reverting this leave.",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
      SELECT
        leave_id,
        employee_id,
        leave_type,
        DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
        status,
        COALESCE(revert_status, 'none') AS revert_status
      FROM leave_applications
      WHERE leave_id = ?
        AND employee_id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [leaveId, userId]
    );

    const leave = rows[0];

    if (!leave) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Leave application not found for this employee.",
      });
    }

    const leaveStatus = String(leave.status || "").toLowerCase();

    if (!["pending", "approved"].includes(leaveStatus)) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "Only pending or approved leave can be reverted.",
      });
    }

    if (String(leave.revert_status).toLowerCase() === "approved") {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "This leave has already been reverted.",
      });
    }

    await connection.query(
      `
      UPDATE leave_applications
      SET
        revert_status = 'approved',
        revert_reason = ?,
        revert_requested_at = COALESCE(revert_requested_at, NOW()),
        revert_reviewed_by = ?,
        revert_reviewed_at = NOW(),
        revert_review_remark = 'Reverted directly by HR'
      WHERE leave_id = ?
      `,
      [reason, hrUserId || null, leaveId]
    );

    await connection.commit();

    let balances = null;

    if (leave.leave_type !== "unpaid") {
      try {
        balances = await buildLeaveBalances(
          db,
          userId,
          Number(String(leave.start_date).slice(0, 4))
        );
      } catch (balanceError) {
        console.error("HR revert balance refresh failed:", balanceError.message);
      }
    }

    return res.json({
      success: true,
      message: "Leave reverted. The leave balance has been restored.",
      leave_id: leaveId,
      balances,
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        // ignore rollback errors
      }
    }

    console.error("revertHrEmployeeLeave error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to revert leave.",
    });
  } finally {
    if (connection) connection.release();
  }
};


/* ADDITIVE: Bulk Mark Present and Attendance Activity Log */
// Additive bulk attendance workflow. Existing attendance calculation code is untouched.
const crypto = require('crypto');
const { randomUUID } = crypto;

const todayIndia = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const fixedHolidays = new Set(Object.keys(FIXED_HOLIDAYS));
const additionalExcludedDates = new Set(['2026-11-10','2027-01-01']); // Requested future holidays; verify with HR calendar before production.
const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0,10) === s;
const nextDay = s => new Date(Date.parse(`${s}T00:00:00Z`) + 86400000).toISOString().slice(0,10);
const isOff = s => new Date(`${s}T00:00:00Z`).getUTCDay() === 0 || fixedHolidays.has(s.slice(5)) || additionalExcludedDates.has(s);
const fail = (res, message, status = 400) => res.status(status).json({success:false,message});
const mysqlDate = s => s && /^\d{4}-\d{2}-\d{2}$/.test(String(s).slice(0,10)) ? String(s).slice(0,10) : null;
const previewSecret = () => process.env.JWT_SECRET;
const sign = p => crypto.createHmac('sha256', previewSecret()).update(p).digest('hex');
const encodePreview = payload => {
  const body = Buffer.from(JSON.stringify({...payload,expires:Date.now()+5*60000})).toString('base64url');
  return `${body}.${sign(body)}`;
};
const readPreview = token => {
  try {
  const [body,mac] = String(token || '').split('.');
  if (!body || !mac || mac.length !== 64 || !crypto.timingSafeEqual(Buffer.from(sign(body)),Buffer.from(mac))) return null;
  const p = JSON.parse(Buffer.from(body,'base64url').toString());
  return p.expires > Date.now() ? p : null;
  } catch { return null; }
};
const identity = req => Number(req.user?.user_id || 0);
const onlyRathika = async (req,res,next) => {
  try {
    const id = identity(req);
    if (!id) return fail(res,'Unauthorized',403);
    const [rows] = await db.query('SELECT user_id FROM users WHERE user_id=? AND LOWER(TRIM(email))=? AND LOWER(COALESCE(status,\'active\'))=\'active\' LIMIT 1',[id,'rathika.haleangadi@valencianutrition.com']);
    if (!rows.length) return fail(res,'Attendance modification not permitted',403);
    next();
  } catch(e) { console.error('Attendance authorization',e); return fail(res,'Authorization check failed',500); }
};
const clean = body => {
  const ids = [...new Set((Array.isArray(body.employee_ids)?body.employee_ids:[]).map(Number))];
  const start = String(body.start_date || ''), end = String(body.end_date || '');
  const reason = String(body.reason || '').trim(), description = String(body.description || '').trim();
  const allowNoPunch = body.allow_no_punch === true;
  if (!ids.length || ids.length > 250 || ids.some(x=>!Number.isSafeInteger(x)||x<=0)) throw Error('Select valid employees (up to 250).');
  if (!validDate(start) || !validDate(end) || end < start || (Date.parse(end)-Date.parse(start))/86400000 > 366) throw Error('Select a valid date range of up to 366 days.');
  if (!reason || reason.length > 200 || description.length > 2000) throw Error('A reason (up to 200 characters) is required.');
  return {ids:ids.sort((a,b)=>a-b),start,end,reason,description,allowNoPunch};
};
let fieldVisitMemberKey;
async function memberKey(conn) {
  if (fieldVisitMemberKey !== undefined) return fieldVisitMemberKey;
  const [columns]=await conn.query('SHOW COLUMNS FROM field_visit_members');
  fieldVisitMemberKey=columns.some(x=>x.Field==='field_visit_id')?'field_visit_id':columns.some(x=>x.Field==='visit_id')?'visit_id':null;
  return fieldVisitMemberKey;
}
// Read the relevant rows once, including field-visit members, rather than
// issuing a separate query for every employee and date in a bulk preview.
async function inspectAttendance(conn, ids, start, end, checkScheduled = true, allowNoPunch = false) {
  const marks = ids.map(() => '?').join(',');
  const [people] = await conn.query(`
    SELECT u.user_id,u.full_name,DATE_FORMAT(ep.joining_date,'%Y-%m-%d') joining_date
    FROM users u LEFT JOIN employee_profiles ep ON ep.user_id=u.user_id
    WHERE u.user_id IN (${marks}) AND LOWER(COALESCE(u.status,'active'))='active'
  `, ids);
  if (people.length !== ids.length) throw Error('One or more selected employees are inactive or invalid.');

  const [attendance] = await conn.query(`
    SELECT attendance_id,employee_id,DATE_FORMAT(attendance_date,'%Y-%m-%d') attendance_date,
           status,check_in_time,check_out_time,total_minutes,remarks
    FROM attendance WHERE employee_id IN (${marks}) AND attendance_date BETWEEN ? AND ?
  `, [...ids,start,end]);
  const [leaves] = await conn.query(`
    SELECT employee_id,DATE_FORMAT(start_date,'%Y-%m-%d') start_date,
           DATE_FORMAT(end_date,'%Y-%m-%d') end_date,LOWER(status) status
    FROM leave_applications WHERE employee_id IN (${marks})
      AND LOWER(status) IN ('pending','approved')
      AND COALESCE(revert_status,'none')<>'approved'
      AND start_date<=? AND end_date>=?
  `, [...ids,end,start]);

  const memberColumn = await memberKey(conn);
  if (!memberColumn) throw Error('Cannot safely determine field visit member key');
  const [visits] = await conn.query(`
    SELECT fv.employee_id owner_id,m.employee_id member_id,
           DATE_FORMAT(fv.visit_date,'%Y-%m-%d') start_date,
           DATE_FORMAT(COALESCE(fv.end_date,fv.visit_date),'%Y-%m-%d') end_date,
           LOWER(fv.status) status
    FROM employee_field_visits fv
    LEFT JOIN field_visit_members m ON m.${memberColumn}=fv.visit_id
    WHERE LOWER(fv.status) IN ('pending','approved')
      AND fv.visit_date<=? AND COALESCE(fv.end_date,fv.visit_date)>=?
      AND (fv.employee_id IN (${marks}) OR m.employee_id IN (${marks}))
  `, [end,start,...ids,...ids]);

  const [entries] = checkScheduled ? await conn.query(`
    SELECT employee_id,DATE_FORMAT(attendance_date,'%Y-%m-%d') attendance_date
    FROM hr_attendance_bulk_entries
    WHERE employee_id IN (${marks}) AND attendance_date BETWEEN ? AND ?
  `, [...ids,start,end]) : [[]];

  const peopleMap = new Map(people.map(u => [Number(u.user_id),u]));
  const attendanceMap = new Map(), duplicates = new Set();
  attendance.forEach(row => {
    const key = `${row.employee_id}|${row.attendance_date}`;
    if (attendanceMap.has(key)) duplicates.add(key);
    attendanceMap.set(key,row);
  });
  const leaveMap = new Map(), visitMap = new Map(), idsSet = new Set(ids);
  leaves.forEach(row => {
    const id = Number(row.employee_id);
    if (!leaveMap.has(id)) leaveMap.set(id,[]);
    leaveMap.get(id).push(row);
  });
  visits.forEach(row => {
    for (const id of new Set([Number(row.owner_id),Number(row.member_id)])) {
      if (!idsSet.has(id)) continue;
      if (!visitMap.has(id)) visitMap.set(id,[]);
      visitMap.get(id).push(row);
    }
  });
  const scheduled = new Set(entries.map(row => `${row.employee_id}|${row.attendance_date}`));
  const find = (rows,date,status) => rows?.some(r => r.start_date<=date && r.end_date>=date && r.status===status);
  const why = (id,date) => {
    if (isOff(date)) return 'Sunday or company holiday';
    const user = peopleMap.get(id);
    if (!user) return 'Employee not active';
    if (user.joining_date && date < user.joining_date) return 'Before joining date';
    const key = `${id}|${date}`, previous = attendanceMap.get(key);
    if (duplicates.has(key)) return 'Multiple attendance records require review';
    // Leave and field visits must take priority over all attendance corrections.
    if (find(leaveMap.get(id),date,'approved')) return 'Approved leave protected';
    if (find(leaveMap.get(id),date,'pending')) return 'Pending leave protected';
    if (find(visitMap.get(id),date,'approved')) return 'Approved field visit protected';
    if (find(visitMap.get(id),date,'pending')) return 'Pending field visit protected';
    if (checkScheduled && scheduled.has(key)) return 'Already scheduled or applied';
    if (previous) {
      const hasIn = previous.check_in_time != null;
      const hasOut = previous.check_out_time != null;
      const st = String(previous.status||'').trim().toLowerCase();
      // Full biometric evidence is left intact; this is for missing punches.
      if (hasIn && hasOut) return 'Complete biometric attendance protected';
      if (!['absent','half_day','late','present'].includes(st)) return 'Existing attendance status protected';
      if (st === 'present' && /^Bulk Present: /i.test(String(previous.remarks||'')))
        return 'Already corrected by HR';
      if (st === 'present' && !hasIn && !hasOut)
        return 'Already marked Present';
      if (!hasIn && !hasOut && !allowNoPunch)
        return 'No biometric punches: enable manual HR approval to include';
      if (!hasIn && hasOut) return 'Missing punch-in requires individual review';
      // With punch-in and missing punch-out, allow status correction.
      // Original punch, duration and any biometric timestamps are untouched.
    } else if (!allowNoPunch) {
      return 'No biometric punches: enable manual HR approval to include';
    }
    return null;
  };
  return {peopleMap,attendanceMap,why};
}

async function assess(body) {
  const p=clean(body), conn=await db.getConnection();
  try {
    const data=await inspectAttendance(conn,p.ids,p.start,p.end,true,p.allowNoPunch);
    const conflicts=[]; let eligible=0, scheduled=0, skipped=0;
    const today=todayIndia();
    for(const id of p.ids) for(let date=p.start;date<=p.end;date=nextDay(date)) {
      const why=data.why(id,date);
      if(why){skipped++;if(conflicts.length<100)conflicts.push({employee_name:data.peopleMap.get(id).full_name,date,reason:why});}
      else {eligible++;if(date>today)scheduled++;}
    }
    return {p,employee_names:p.ids.map(id=>data.peopleMap.get(id).full_name),eligible_count:eligible,scheduled_count:scheduled,skipped_count:skipped,conflicts};
  } finally {conn.release();}
}
const preview=async (req,res)=>{try {
  const a=await assess(req.body);
  res.json({success:true,preview_id:encodePreview({...a.p,actor:identity(req)}),eligible_count:a.eligible_count,scheduled_count:a.scheduled_count,skipped_count:a.skipped_count,conflicts:a.conflicts});
} catch(e){fail(res,e.message);}};

const commit=async (req,res)=>{
  let conn;try{
    const p=clean(req.body), signed=readPreview(req.body.preview_id);
    if(!signed||signed.actor!==identity(req)||JSON.stringify(p)!==JSON.stringify({ids:signed.ids,start:signed.start,end:signed.end,reason:signed.reason,description:signed.description,allowNoPunch:signed.allowNoPunch}))
      return fail(res,'Preview expired or selection changed. Preview again.');
    conn=await db.getConnection();await conn.beginTransaction();
    const data=await inspectAttendance(conn,p.ids,p.start,p.end,true,p.allowNoPunch);
    const batch=randomUUID(), eligible=[];
    for(const id of p.ids) for(let date=p.start;date<=p.end;date=nextDay(date)) {
      if(!data.why(id,date)) eligible.push([batch,id,date,p.reason,p.description,identity(req),p.allowNoPunch?1:0]);
    }
    if(!eligible.length){await conn.rollback();return fail(res,'No eligible attendance records remain.');}
    for(let i=0;i<eligible.length;i+=200){
      const chunk=eligible.slice(i,i+200);
      await conn.query(`INSERT INTO hr_attendance_bulk_entries
        (batch_id,employee_id,attendance_date,reason,description,created_by,allow_no_punch) VALUES ${chunk.map(()=>'(?,?,?,?,?,?,?)').join(',')}`,
        chunk.flat());
    }
    await conn.query(`INSERT INTO hr_attendance_activity
      (actor_user_id,action,batch_id,from_date,to_date,reason,description,details)
      VALUES (?,'bulk_mark_present',?,?,?,?,?,?)`,
      [identity(req),batch,p.start,p.end,p.reason,p.description,JSON.stringify({selected_employees:p.ids,employee_names:p.ids.map(id=>data.peopleMap.get(id).full_name),scheduled_entries:eligible.length})]);
    await conn.commit();conn.release();conn=null;
    await processDue(batch);
    const [[counts]]=await db.query(`SELECT
      SUM(status='applied') applied_count,SUM(status='scheduled') scheduled_count,
      SUM(status='skipped') skipped_count FROM hr_attendance_bulk_entries WHERE batch_id=?`,[batch]);
    const applied=Number(counts.applied_count||0), scheduled=Number(counts.scheduled_count||0), skipped=Number(counts.skipped_count||0);
    res.json({success:true,message:`${applied} marked Present, ${scheduled} scheduled, ${skipped} skipped.`,batch_id:batch,applied_count:applied,scheduled_count:scheduled,skipped_count:skipped});
  }catch(e){if(conn)await conn.rollback();console.error('Bulk attendance commit',e);fail(res,'Bulk attendance could not be saved',500);}finally{if(conn)conn.release();}
};

const bulkRemark = row => `Bulk Present: ${row.reason}${row.description?' | '+row.description:''}`.slice(0,240);
let processingPromise;
async function processDue(batchId) {
  if(processingPromise){
    if(!batchId)return;
    await processingPromise;
  }
  const job=processDueRows(batchId);
  processingPromise=job;
  try { await job; } finally { if(processingPromise===job)processingPromise=null; }
}
async function processDueRows(batchId) {
  for (;;) {
    let conn;
    try {
      conn = await db.getConnection();
      await conn.beginTransaction();
      const [due] = await conn.query(`
        SELECT id,employee_id,DATE_FORMAT(attendance_date,'%Y-%m-%d') attendance_date,
          reason,description,created_by,batch_id,allow_no_punch
        FROM hr_attendance_bulk_entries
        WHERE status='scheduled' AND attendance_date<=?
          ${batchId?'AND batch_id=?':''}
        ORDER BY id LIMIT 200 FOR UPDATE
      `, [todayIndia(),...(batchId?[batchId]:[])]);
      if (!due.length) { await conn.rollback(); return; }
      const ids=[...new Set(due.map(x=>Number(x.employee_id)))].sort((a,b)=>a-b);
      const dates=due.map(x=>x.attendance_date).sort();
      // Different rows may have different explicit no-punch approvals.
      const common=await inspectAttendance(conn,ids,dates[0],dates[dates.length-1],false,true);
      for (const row of due) {
        const key=`${row.employee_id}|${row.attendance_date}`;
        let why=common.why(Number(row.employee_id),row.attendance_date);
        const old=common.attendanceMap.get(key)||null;
        const hasIn=old?.check_in_time != null;
        const hasOut=old?.check_out_time != null;
        if (!why && !hasIn && !hasOut && !Number(row.allow_no_punch))
          why='No punches: manual HR approval not authorized';
        if (!why && !old && !Number(row.allow_no_punch))
          why='No attendance: manual HR approval not authorized';
        let after=null;
        if (!why) {
          const remarks=bulkRemark(row);
          if (old) {
            const [u]=await conn.query(`UPDATE attendance SET status='present',remarks=?
               WHERE attendance_id=? AND employee_id=? AND attendance_date=?`,
              [remarks,old.attendance_id,row.employee_id,row.attendance_date]);
            if (u.affectedRows!==1) throw Error('Attendance changed during correction. Transaction rolled back.');
            // Do not update check_in_time, check_out_time or total_minutes.
            after={status:'present',check_in_time:old.check_in_time,check_out_time:old.check_out_time,
              total_minutes:Number(old.total_minutes||0),remarks};
          } else {
            const [u]=await conn.query(`INSERT INTO attendance
              (employee_id,attendance_date,check_in_time,check_out_time,total_minutes,status,remarks)
              VALUES (?,?,NULL,NULL,0,'present',?)`,
              [row.employee_id,row.attendance_date,remarks]);
            if (u.affectedRows!==1) throw Error('Attendance insertion failed. Transaction rolled back.');
            after={status:'present',check_in_time:null,check_out_time:null,total_minutes:0,remarks};
          }
          // Keep map current for any duplicate checks within the same worker batch.
          common.attendanceMap.set(key,{...old,...after});
        }
        await conn.query(`UPDATE hr_attendance_bulk_entries
          SET status=?,outcome=?,processed_at=NOW() WHERE id=?`,
          [why?'skipped':'applied',why||'Present applied',row.id]);
        await conn.query(`INSERT INTO hr_attendance_activity
          (actor_user_id,action,employee_id,batch_id,from_date,to_date,reason,description,details)
          VALUES (?,?,?,?,?,?,?,?,?)`,
          [row.created_by,why?'bulk_skipped':'bulk_applied',row.employee_id,row.batch_id,
            row.attendance_date,row.attendance_date,row.reason,row.description,
            JSON.stringify({before:old,after,outcome:why||'Present applied',manual_no_punch:!!row.allow_no_punch})]);
      }
      await conn.commit();
    } catch(e) {
      if(conn) try{await conn.rollback();}catch{}
      console.error('Bulk due processing',e);
      return;
    } finally { if(conn) conn.release(); }
  }
}
// Summaries only: one row per operation, never one row per employee-day.
const parseDetails = value => {
  try { return typeof value === 'string' ? JSON.parse(value) : value || {}; }
  catch { return {}; }
};
const sameAttendance = (a,b) => !!a && !!b &&
  ['status','check_in_time','check_out_time','remarks'].every(k => String(a[k] ?? '')===String(b[k] ?? '')) &&
  Number(a.total_minutes || 0)===Number(b.total_minutes || 0);

const activity = async (req,res) => {
  try {
    const [rows]=await db.query(`SELECT a.id,a.action,a.employee_id,a.batch_id,
      DATE_FORMAT(a.from_date,'%Y-%m-%d') from_date,DATE_FORMAT(a.to_date,'%Y-%m-%d') to_date,
      a.reason,a.description,a.details,DATE_FORMAT(a.created_at,'%Y-%m-%d %H:%i:%s') created_at,
      u.full_name actor_name,affected.full_name employee_name
      FROM hr_attendance_activity a LEFT JOIN users u ON u.user_id=a.actor_user_id
      LEFT JOIN users affected ON affected.user_id=a.employee_id
      WHERE a.action NOT IN ('bulk_applied','bulk_skipped','bulk_undo_item')
      ORDER BY a.id DESC LIMIT 300`);
    const batchIds=[...new Set(rows.filter(x=>x.batch_id).map(x=>x.batch_id))];
    const [stats]=batchIds.length?await db.query(`SELECT batch_id,COUNT(*) total,
      SUM(status='applied') applied,SUM(status='scheduled') scheduled,SUM(status='skipped') skipped
      FROM hr_attendance_bulk_entries WHERE batch_id IN (${batchIds.map(()=>'?').join(',')}) GROUP BY batch_id`,batchIds):[[]];
    const [undoStats]=batchIds.length?await db.query(`SELECT batch_id,COUNT(*) undone
      FROM hr_attendance_activity WHERE action='bulk_undo_item'
      AND batch_id IN (${batchIds.map(()=>'?').join(',')}) GROUP BY batch_id`,batchIds):[[]];
    const [undos]=await db.query(`SELECT JSON_UNQUOTE(JSON_EXTRACT(details,'$.undone_activity_id')) original_id
      FROM hr_attendance_activity WHERE action='undo_attendance' AND id > ?`,[Math.max(0,Number(rows[rows.length-1]?.id||0)-1)]);
    const byBatch=new Map(stats.map(x=>[x.batch_id,x]));
    const byUndo=new Map(undoStats.map(x=>[x.batch_id,Number(x.undone)]));
    const undoneIds=new Set(undos.map(x=>Number(x.original_id)));
    const seenBatches=new Set();
    const activities=rows.filter(row=>{
      if(row.action==='bulk_mark_present' && row.batch_id){
        if(seenBatches.has(row.batch_id))return false;
        seenBatches.add(row.batch_id);
      }
      return true;
    }).map(row=>{
      const d=parseDetails(row.details),b=byBatch.get(row.batch_id);
      const applied=Number(b?.applied||0),scheduled=Number(b?.scheduled||0),skipped=Number(b?.skipped||0);
      const undone=byUndo.get(row.batch_id)||0;
      const isBulk=row.action==='bulk_mark_present';
      const status=isBulk?(undone && !applied && !scheduled?'Undone':scheduled?'Scheduled':skipped?'Completed with skips':'Completed'):
        undoneIds.has(Number(row.id))?'Undone':'Completed';
      const affectedCount=isBulk?new Set(d.selected_employees||[]).size:
        row.action==='undo_bulk'?Number(d.restored||0)+Number(d.cancelled||0):row.employee_id?1:null;
      const before=d.before?.status||(row.action==='add_attendance'?'No record':null);
      const after=d.after?.status||null;
      const summary=isBulk?`${d.employee_names?.length===1?d.employee_names[0]:`${affectedCount} employees`} · ${applied} marked Present · ${scheduled} scheduled · ${skipped} skipped${undone?` · ${undone} reversed/cancelled`:''}`:
        row.action==='undo_bulk'?`${d.restored||0} restored · ${d.cancelled||0} cancelled · ${d.conflicts||0} protected`:
        row.action==='undo_attendance'?`${row.employee_name||'Employee'} · Reverted`:
        row.action==='import'?(d.file||'Attendance file'):
        row.action==='export'?`${row.from_date||'-'} – ${row.to_date||'-'} (${d.format||'file'})`:
        `${row.employee_name||'Employee'} · ${before||'Unknown'} → ${after||'Unknown'}`;
      return {...row,start_date:row.from_date,end_date:row.to_date,
        employee_names:d.employee_names||(row.employee_name?[row.employee_name]:[]),
        affected_count:affectedCount,previous_status:before,new_status:after,
        file_name:d.file||null,status,summary,
        can_undo:(isBulk?applied+scheduled>0:
          ['add_attendance','edit_attendance'].includes(row.action) && !!d.after && !undoneIds.has(Number(row.id)))};
    });
    res.json({success:true,activities});
  } catch(e){console.error('Activity log',e);fail(res,'Unable to load activity log',500);}
};

// View fetches up to 200 employee-days at a time, including original status and outcome.
const activityDetail = async (req,res) => {
  try {
    const id=Number(req.params.id),offset=Math.max(0,Math.min(100000,Number(req.query.offset)||0));
    if(!Number.isSafeInteger(id)||id<=0)return fail(res,'Invalid activity ID');
    const [[a]]=await db.query(`SELECT *,DATE_FORMAT(from_date,'%Y-%m-%d') date_from FROM hr_attendance_activity WHERE id=?`,[id]);
    if(!a)return fail(res,'Activity not found',404);
    if(a.action!=='bulk_mark_present'){
      const d=parseDetails(a.details);
      const [[employee]]=a.employee_id?await db.query('SELECT full_name FROM users WHERE user_id=?',[a.employee_id]):[[null]];
      return res.json({success:true,items:['add_attendance','edit_attendance','undo_attendance'].includes(a.action)?[{
        employee_name:employee?.full_name||'-',date:a.date_from,
        before_status:d.before?.status||'No record',after_status:d.after?.status||'No record',
        before:d.before||null,after:d.after||null,status:'Completed'
      }]:[],has_more:false});
    }
    const [countRows]=await db.query(`SELECT
      (SELECT COUNT(*) FROM hr_attendance_bulk_entries WHERE batch_id=?) +
      (SELECT COUNT(*) FROM hr_attendance_activity WHERE batch_id=? AND action='bulk_undo_item') total`,[a.batch_id,a.batch_id]);
    const [rows]=await db.query(`SELECT x.entry_id,x.employee_id,DATE_FORMAT(x.attendance_date,'%Y-%m-%d') date,
      x.item_status,x.outcome,u.full_name employee_name,
      (SELECT h.details FROM hr_attendance_activity h WHERE h.batch_id=?
       AND h.employee_id=x.employee_id AND h.from_date=x.attendance_date
       AND h.action IN ('bulk_applied','bulk_skipped') ORDER BY h.id DESC LIMIT 1) audit_details
      FROM (
        SELECT id entry_id,employee_id,attendance_date,status item_status,outcome
        FROM hr_attendance_bulk_entries WHERE batch_id=?
        UNION ALL
        SELECT NULL entry_id,employee_id,from_date attendance_date,'undone' item_status,
          JSON_UNQUOTE(JSON_EXTRACT(details,'$.outcome')) outcome
        FROM hr_attendance_activity WHERE batch_id=? AND action='bulk_undo_item'
      ) x JOIN users u ON u.user_id=x.employee_id
      ORDER BY x.attendance_date,u.full_name LIMIT 200 OFFSET ?`,[a.batch_id,a.batch_id,a.batch_id,offset]);
    const items=rows.map(row=>{
      const d=parseDetails(row.audit_details),before=d.before||null;
      return {entry_id:row.entry_id==null?null:Number(row.entry_id),can_undo:row.entry_id!=null && ['applied','scheduled'].includes(row.item_status),employee_name:row.employee_name,date:row.date,status:row.item_status,
        before_status:before?.status||'No record',
        after_status:row.item_status==='applied'?'Present':row.item_status==='scheduled'?'Scheduled':
          row.item_status==='undone'?(before?.status||'No record'):'Unchanged',
        outcome:row.outcome||null, before,after:d.after||null};
    });
    res.json({success:true,items,total:Number(countRows[0]?.total||0),has_more:offset+items.length<Number(countRows[0]?.total||0)});
  }catch(e){console.error('Activity details',e);fail(res,'Unable to load activity details',500);}
};

// Safe, audited undo. Exports and imports have no automatic rollback.
const undoAttendanceActivity = async (req,res) => {
  let conn;
  try {
    const id=Number(req.params.id);
    if(!Number.isSafeInteger(id)||id<=0)return fail(res,'Invalid activity ID');
    if(processingPromise)await processingPromise;
    conn=await db.getConnection();await conn.beginTransaction();
    const [[a]]=await conn.query(`SELECT *,DATE_FORMAT(from_date,'%Y-%m-%d') date_from FROM hr_attendance_activity WHERE id=? FOR UPDATE`,[id]);
    if(!a){await conn.rollback();return fail(res,'Activity not found',404);}
    if(!['bulk_mark_present','add_attendance','edit_attendance'].includes(a.action) || (req.singleUndo && a.action!=='bulk_mark_present')){
      await conn.rollback();return fail(res,'Undo is unavailable for this activity',400);
    }
    let reversed=0,cancelled=0,cleared=0,conflicts=0;
    const entryId=req.singleUndo?Number(req.body?.entry_id):null;
    if(req.singleUndo && (!Number.isSafeInteger(entryId) || entryId<=0)){
      await conn.rollback();return fail(res,'Invalid employee entry',400);
    }
    if(a.action==='bulk_mark_present'){
      const [entries]=await conn.query(`SELECT id,employee_id,DATE_FORMAT(attendance_date,'%Y-%m-%d') date,
        status,reason,description FROM hr_attendance_bulk_entries
        WHERE batch_id=? ${entryId?'AND id=?':''} ORDER BY id FOR UPDATE`,
        entryId?[a.batch_id,entryId]:[a.batch_id]);
      if(!entries.length){await conn.rollback();return fail(res,'This bulk action is already undone or has no remaining entries',409);}
      const [events]=await conn.query(`SELECT employee_id,DATE_FORMAT(from_date,'%Y-%m-%d') date,details
        FROM hr_attendance_activity WHERE batch_id=? AND action='bulk_applied'`,[a.batch_id]);
      const auditMap=new Map(events.map(x=>[`${x.employee_id}|${x.date}`,parseDetails(x.details)]));
      for(const entry of entries){
        let outcome='Cancelled';
        if(entry.status==='applied'){
          const audit=auditMap.get(`${entry.employee_id}|${entry.date}`);
          if(!audit || !audit.after){
            conflicts++;
            if(req.singleUndo){
              await conn.rollback();
              return fail(res,'Original snapshot is unavailable for this employee. Nothing was changed.',409);
            }
            continue;
          }
          const [current]=await conn.query(`SELECT attendance_id,status,check_in_time,check_out_time,total_minutes,remarks
            FROM attendance WHERE employee_id=? AND attendance_date=? FOR UPDATE`,[entry.employee_id,entry.date]);
          const existing=current[0],expected={...audit.after,remarks:bulkRemark(entry)};
          if(current.length!==1 || !sameAttendance(existing,expected)) {
            conflicts++;
            if(req.singleUndo){
              let reason='The current record differs from the originally applied attendance';
              if(!current.length)reason='The originally applied attendance record no longer exists';
              else if(current.length>1)reason='Multiple records exist for the selected employee and date';
              else if(String(existing.status||'').toLowerCase()!==String(expected.status||'').toLowerCase())
                reason='The attendance status has changed';
              else if(String(existing.check_in_time??'')!==String(expected.check_in_time??'') ||
                String(existing.check_out_time??'')!==String(expected.check_out_time??'') ||
                Number(existing.total_minutes||0)!==Number(expected.total_minutes||0))
                reason='Biometric punches or working time have changed';
              else if(String(existing.remarks??'')!==String(expected.remarks??''))
                reason='The attendance remarks have changed';
              await conn.rollback();
              return fail(res,`Cannot revert ${entry.date}: ${reason}. No changes were made.`,409);
            }
            continue;
          }
          if(audit.before){
            await conn.query(`UPDATE attendance SET status=?,remarks=? WHERE attendance_id=?`,
              [audit.before.status,audit.before.remarks||null,existing.attendance_id]);
            outcome='Restored previous attendance';
          }else{
            await conn.query('DELETE FROM attendance WHERE attendance_id=?',[existing.attendance_id]);
            outcome='Removed added attendance';
          }
        }
        if(entry.status==='applied')reversed++;
        else if(entry.status==='scheduled')cancelled++;
        else cleared++;
        await conn.query('DELETE FROM hr_attendance_bulk_entries WHERE id=?',[entry.id]);
        await conn.query(`INSERT INTO hr_attendance_activity
          (actor_user_id,action,employee_id,batch_id,from_date,to_date,reason,details)
          VALUES (?,'bulk_undo_item',?,?,?,?,?,?)`,
          [identity(req),entry.employee_id,a.batch_id,entry.date,entry.date,'Undo bulk attendance',JSON.stringify({outcome})]);
      }
      if(!reversed && !cancelled && !cleared){await conn.rollback();return fail(res,'Attendance was modified after this action. No records were reversed.',409);}
      await conn.query(`INSERT INTO hr_attendance_activity
        (actor_user_id,action,batch_id,from_date,to_date,reason,details)
        VALUES (?,'undo_bulk',?,?,?,'Undo bulk attendance',?)`,
        [identity(req),a.batch_id,a.from_date,a.to_date,JSON.stringify({original_activity_id:id,entry_id:entryId,restored:reversed,cancelled,cleared,conflicts})]);
    }else{
      const d=parseDetails(a.details);
      if(!d.after){await conn.rollback();return fail(res,'The original record snapshot is unavailable; undo is not safe.',409);}
      const [undoRows]=await conn.query(`SELECT id FROM hr_attendance_activity WHERE action='undo_attendance'
        AND JSON_UNQUOTE(JSON_EXTRACT(details,'$.undone_activity_id'))=? LIMIT 1`,[String(id)]);
      if(undoRows.length){await conn.rollback();return fail(res,'This attendance action was already undone.',409);}
      const date=a.date_from,employeeId=Number(a.employee_id);
      if(!date || !employeeId){await conn.rollback();return fail(res,'Original employee/date unavailable',409);}
      const [latest]=await conn.query(`SELECT id FROM hr_attendance_activity WHERE id>? AND employee_id=?
        AND from_date=? AND action IN ('add_attendance','edit_attendance','bulk_applied') LIMIT 1`,[id,employeeId,date]);
      if(latest.length){await conn.rollback();return fail(res,'Later attendance changes exist. Undo is not safe.',409);}
      const [records]=await conn.query(`SELECT attendance_id,status,check_in_time,check_out_time,total_minutes,remarks
        FROM attendance WHERE employee_id=? AND attendance_date=? FOR UPDATE`,[employeeId,date]);
      if(records.length!==1 || !sameAttendance(records[0],d.after)){
        await conn.rollback();return fail(res,'Attendance has changed since this action; undo is blocked.',409);
      }
      if(d.before){
        await conn.query(`UPDATE attendance SET check_in_time=?,check_out_time=?,total_minutes=?,status=?,remarks=?
          WHERE attendance_id=?`,[d.before.check_in_time,d.before.check_out_time,d.before.total_minutes||0,
          d.before.status,d.before.remarks||null,records[0].attendance_id]);
      }else{
        await conn.query('DELETE FROM attendance WHERE attendance_id=?',[records[0].attendance_id]);
      }
      await conn.query(`INSERT INTO hr_attendance_activity
        (actor_user_id,action,employee_id,from_date,to_date,reason,details)
        VALUES (?,'undo_attendance',?,?,?,'Undo attendance correction',?)`,
        [identity(req),employeeId,date,date,JSON.stringify({undone_activity_id:id,before:d.after,after:d.before})]);
      reversed=1;
    }
    await conn.commit();
    return res.json({success:true,message:`${reversed} restored, ${cancelled} future entries cancelled${cleared?`, ${cleared} skipped entries cleared`:''}${conflicts?`; ${conflicts} protected because records changed`:''}.`,undone_count:reversed,cancelled_count:cancelled,conflicts});
  }catch(e){if(conn)await conn.rollback();console.error('Attendance undo',e);fail(res,'Unable to undo attendance safely',500);}
  finally{if(conn)conn.release();}
};
const undoAttendanceActivityItem=(req,res)=>{
  req.singleUndo=true;
  return undoAttendanceActivity(req,res);
};
// Audit existing actions without changing their controllers or response behavior.
const auditExisting = action => async (req,res,next) => {
  let before = null;
  const employeeId = Number(req.body?.employee_id || 0);
  const date = mysqlDate(req.body?.attendance_date);
  if (action === 'add_attendance' && employeeId && date) {
    try {
      const [rows] = await db.query('SELECT check_in_time,check_out_time,total_minutes,status,remarks FROM attendance WHERE employee_id=? AND attendance_date=? LIMIT 1',[employeeId,date]);
      before = rows[0] || null;
    } catch(e) { console.error('Attendance audit snapshot',e); }
  }
  res.once('finish',async () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    try {
      let after = null;
      if (action === 'add_attendance' && employeeId && date) {
        const [rows] = await db.query('SELECT check_in_time,check_out_time,total_minutes,status,remarks FROM attendance WHERE employee_id=? AND attendance_date=? LIMIT 1',[employeeId,date]);
        after = rows[0] || null;
      }
      const actualAction = action === 'add_attendance' && before ? 'edit_attendance' : action;
      await db.query('INSERT INTO hr_attendance_activity (actor_user_id,action,employee_id,from_date,to_date,reason,details) VALUES (?,?,?,?,?,?,?)',[
        identity(req), actualAction, employeeId || null,
        date || mysqlDate(req.query?.from_date), date || mysqlDate(req.query?.to_date),
        String(req.body?.remarks || '').slice(0,200) || null,
        JSON.stringify({before,after,file:req.file?.originalname||null,format:req.query?.format||null})
      ]);
    } catch(e) { console.error('Attendance audit insert',e); }
  });
  next();
};
// Worker starts when HR route loads. Changes status/remarks only for HR-authorized corrections.
const startProcessor=()=>{setInterval(processDue,60000).unref();processDue();};


// HR_RECURRING_RULES_V4 routes - only the authorized HR account may edit.
const hrRuleTypes = new Set(['wfh','part_time','flexible','late_exempt','custom']);
const hrRuleModes = new Set(['present_wfh','shift','exception']);
const hrRuleDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? s : null;
const hrRuleClock = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || '')) ? `${s}:00` : null;
const hrRuleError = (res,e) => {console.error('HR rules',e);return res.status(500).json({success:false,message:'HR rule operation failed.'});};
const getHrRulesV4 = async (req,res) => {
  if(!isAuthorizedHR(req)) return res.status(403).json({success:false,message:'HR only'});
  try{
    const [rows]=await db.query(`SELECT r.id,r.employee_id,u.full_name employee_name,r.rule_type,
      r.arrangement_name,r.attendance_mode,r.weekdays_mask,r.ignore_late,r.ignore_early,r.credit_mode,
      DATE_FORMAT(r.effective_from,'%Y-%m-%d') effective_from,
      DATE_FORMAT(r.effective_to,'%Y-%m-%d') effective_to,
      TIME_FORMAT(r.shift_start,'%H:%i') shift_start,TIME_FORMAT(r.shift_end,'%H:%i') shift_end,
      r.grace_minutes,r.reason,r.is_active,r.created_by,r.created_at,r.deactivated_by,r.deactivated_at,deactivation_reason
      FROM hr_employee_attendance_rules r JOIN users u ON u.user_id=r.employee_id
      ORDER BY r.is_active DESC,r.id DESC LIMIT 1000`);
    return res.json({success:true,rules:rows});
  }catch(e){return hrRuleError(res,e);}
};
const saveHrRuleV4 = async(req,res) => {
  if(!isAuthorizedHR(req)) return res.status(403).json({success:false,message:'HR only'});
  try{
    const b=req.body||{}, employeeId=Number(b.employee_id),type=String(b.rule_type||''),mode=String(b.attendance_mode||'shift');
    const start=hrRuleDate(b.effective_from),end=b.effective_to?hrRuleDate(b.effective_to):null;
    const mask=Number(b.weekdays_mask),grace=Number(b.grace_minutes||0);
    const reason=String(b.reason||'').trim(),name=String(b.arrangement_name||'').trim();
    if(!Number.isSafeInteger(employeeId)||employeeId<1||!hrRuleTypes.has(type)||!hrRuleModes.has(mode)||
      !start||(b.effective_to&&!end)||(end&&end<start)||!Number.isInteger(mask)||mask<1||mask>127||
      !Number.isInteger(grace)||grace<0||grace>180||!reason||reason.length>500||name.length>120)
      return res.status(400).json({success:false,message:'Enter valid employee, arrangement, weekdays, dates and HR reason.'});
    const startTime=b.shift_start?hrRuleClock(b.shift_start):null,endTime=b.shift_end?hrRuleClock(b.shift_end):null;
    const needsTimes=type==='part_time'||type==='flexible'||(type==='custom'&&mode==='shift');
    if(needsTimes && (!startTime||!endTime||startTime>=endTime))
      return res.status(400).json({success:false,message:'Check-in must be earlier than check-out.'});
    const [people]=await db.query("SELECT user_id FROM users WHERE user_id=? AND LOWER(COALESCE(status,'active'))='active' LIMIT 1",[employeeId]);
    if(!people.length)return res.status(404).json({success:false,message:'Employee not found.'});
    // Prevent new overlapping active schedules. Existing rows remain untouched.
    const [overlaps]=await db.query(`SELECT id FROM hr_employee_attendance_rules
      WHERE employee_id=? AND is_active=1 AND (weekdays_mask & ?) <> 0
      AND (effective_to IS NULL OR effective_to >= ?)
      AND (? IS NULL OR effective_from <= ?)
      AND (rule_type=? OR (attendance_mode='shift' AND ?='shift')
           OR (attendance_mode='present_wfh' AND ?='present_wfh'))
      LIMIT 1`,[employeeId,mask,start,end,end,type,mode,mode]);
    if(overlaps.length)return res.status(409).json({success:false,
      message:'An active overlapping attendance rule already exists for these weekdays. Disable the obsolete rule before saving a replacement.'});
    const ignoredLate=b.ignore_late?1:0,ignoredEarly=b.ignore_early?1:0;
    const credit=['full','half'].includes(String(b.credit_mode)) ? b.credit_mode : 'full';
    const params=[employeeId,type,name||null,mode,mask,ignoredLate,ignoredEarly,credit,start,end,
      startTime,endTime,grace,reason,Number(req.user.user_id)];
    const sql=`INSERT INTO hr_employee_attendance_rules
      (employee_id,rule_type,arrangement_name,attendance_mode,weekdays_mask,ignore_late,ignore_early,credit_mode,
      effective_from,effective_to,shift_start,shift_end,grace_minutes,reason,is_active,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`;
    const [result]=await db.query(sql,params);
    return res.status(201).json({success:true,id:result.insertId,message:'HR rule saved.'});
  }catch(e){return hrRuleError(res,e);}
};
const deactivateHrRuleV4 = async(req,res)=>{
  if(!isAuthorizedHR(req))return res.status(403).json({success:false,message:'HR only'});
  try{
    const id=Number(req.params.id), reason=String(req.body?.reason||'').trim();
    if(!Number.isSafeInteger(id)||id<1||!reason)return res.status(400).json({success:false,message:'Reason for disabling is required.'});
    const [result]=await db.query(`UPDATE hr_employee_attendance_rules SET is_active=0,deactivated_by=?,deactivated_at=NOW(),deactivation_reason=?
      WHERE id=? AND is_active=1`,[req.user.user_id,reason.slice(0,500),id]);
    if(!result.affectedRows)return res.status(404).json({success:false,message:'Rule not active or not found.'});
    return res.json({success:true,message:'Rule disabled; saved history retained.'});
  }catch(e){return hrRuleError(res,e);}
};
const getHrVisitDocumentsV4=async(req,res)=>{
  if(!isAuthorizedHR(req))return res.status(403).json({success:false,message:'HR only'});
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({success:false,message:'Invalid visit ID'});
  try{
    const [rows]=await db.query(`SELECT d.document_id,d.original_name,d.file_size,s.location,s.stop_id
      FROM field_visit_stop_documents d JOIN field_visit_stops s ON s.stop_id=d.stop_id
      JOIN employee_field_visits v ON v.visit_id=s.visit_id
      WHERE v.visit_id=? AND d.deleted_at IS NULL ORDER BY s.sequence_no,d.created_at DESC`,[id]);
    return res.json({success:true,documents:rows});
  }catch(e){return hrRuleError(res,e);}
};

module.exports = {
  getHrRulesV4, saveHrRuleV4, deactivateHrRuleV4, getHrVisitDocumentsV4,
  onlyRathika,
  previewBulkAttendance: preview,
  commitBulkAttendance: commit,
  getAttendanceActivity: activity,
  getAttendanceActivityDetail: activityDetail,
  undoAttendanceActivity,
  undoAttendanceActivityItem,
  auditExisting,
  startBulkProcessor: startProcessor,

  getHrAttendance,
  getHrEmployeeSummary,
  saveHrAttendance,
  importHrAttendance,
  exportHrAttendance,
  approveHrLeaveApplication,
  getHrLeaveManagement,
  addHrEmployeeExtraLeave,
  reduceHrEmployeeLeave,
  applyHrEmployeeLeave,
  revertHrEmployeeLeave,
};
