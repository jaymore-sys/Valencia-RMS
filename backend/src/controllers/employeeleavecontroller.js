const crypto = require("crypto");
const db = require("../config/db");
const { sendMail } = require("../utils/emailservice");

const {
  POLICY_START_DATE,
  MONTHLY_PRIVILEGED_CREDIT,
  getAnnualEntitlements,
  buildLeaveBalances,
} = require("../utils/leavepolicy");

/*
========================================================
FIXED LEAVE EMAIL RECIPIENTS
========================================================
*/

const PREMAL_LEAVE_EMAIL =
  "premal.mehta@valencianutrition.com";

const RATHIKA_LEAVE_EMAIL =
  "rathika.haleangadi@valencianutrition.com";


/*
========================================================
2026 HOLIDAY CALENDAR
========================================================
*/

const HOLIDAYS_2026 = [
  // =========================
  // FIXED COMPANY HOLIDAYS
  // =========================

  {
    date: "2026-01-26",
    name: "Republic Day",
    type: "fixed",
  },

  {
    date: "2026-05-01",
    name: "Maharashtra Day",
    type: "fixed",
  },

  {
    date: "2026-08-15",
    name: "Independence Day",
    type: "fixed",
  },

  {
    date: "2026-10-02",
    name: "Mahatma Gandhi Jayanti",
    type: "fixed",
  },

  // =========================
  // OPTIONAL FESTIVAL LEAVES
  // EMPLOYEE CAN TAKE ANY 2
  // =========================

  {
    date: "2026-09-04",
    name: "Krishna Janmashtami",
    type: "optional",
  },

  {
    date: "2026-09-08",
    name: "Paryushana Parvarambha",
    type: "optional",
  },

  {
    date: "2026-09-14",
    name: "Ganesh Chaturthi",
    type: "optional",
  },

  {
    date: "2026-09-15",
    name: "Samvatsari Parva",
    type: "optional",
  },

  {
    date: "2026-09-25",
    name: "Anant Chaturdashi / Ganesh Visarjan",
    type: "optional",
  },

  {
    date: "2026-10-11",
    name: "Sharad Navratri",
    type: "optional",
  },

  {
    date: "2026-10-20",
    name: "Dussehra / Vijayadashami",
    type: "optional",
  },

  {
    date: "2026-10-25",
    name: "Sharad Purnima",
    type: "optional",
  },

  {
    date: "2026-10-29",
    name: "Karva Chauth",
    type: "optional",
  },

  {
    date: "2026-11-06",
    name: "Dhanteras",
    type: "optional",
  },

  {
    date: "2026-11-08",
    name: "Diwali / Deepavali",
    type: "optional",
  },

  {
    date: "2026-11-11",
    name: "Bhai Dooj",
    type: "optional",
  },

  {
    date: "2026-11-15",
    name: "Chhath Puja",
    type: "optional",
  },

  {
    date: "2026-12-25",
    name: "Christmas Day",
    type: "optional",
  },
];

/*
========================================================
HELPERS
========================================================
*/

const normalizeLeaveType = (value) => {
  const type = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (
    type === "sick" ||
    type === "sick_leave"
  ) {
    return "sick";
  }

  if (
    type === "casual" ||
    type === "casual_leave"
  ) {
    return "casual";
  }

  if (
    type === "mandatory" ||
    type === "mandatory_leave" ||
    type === "privileged" ||
    type === "privileged_leave"
  ) {
    return "mandatory";
  }

  if (
    type === "festival" ||
    type === "festival_leave" ||
    type === "holiday" ||
    type === "holiday_leave"
  ) {
    return "festival";
  }

  /*
  ======================================================
  NEW: UNPAID LEAVE / LWP
  ======================================================
  */

  if (
    type === "unpaid" ||
    type === "unpaid_leave" ||
    type === "lwp" ||
    type === "leave_without_pay"
  ) {
    return "unpaid";
  }

  return "";
};

const getLeaveLabel = (type) => {
  if (type === "sick") {
    return "Sick Leave";
  }

  if (type === "casual") {
    return "Casual Leave";
  }

  if (type === "mandatory") {
    return "Privileged Leave";
  }

  if (type === "festival") {
  return "Festival Leave";
}

  /*
  ======================================================
  NEW: UNPAID LEAVE LABEL
  ======================================================
  */

  if (type === "unpaid") {
    return "Unpaid Leave (LWP)";
  }

  return "Leave";
};

const formatNumber = (value) => {
  const number = Number(value || 0);

  return Number.isInteger(number)
    ? number
    : Number(number.toFixed(1));
};

const calculateInclusiveDays = (
  startDate,
  endDate
) => {
  const startParts = String(startDate)
    .split("-")
    .map(Number);

  const endParts = String(endDate)
    .split("-")
    .map(Number);

  if (
    startParts.length !== 3 ||
    endParts.length !== 3
  ) {
    return 0;
  }

  const start = Date.UTC(
    startParts[0],
    startParts[1] - 1,
    startParts[2]
  );

  const end = Date.UTC(
    endParts[0],
    endParts[1] - 1,
    endParts[2]
  );

  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    end < start
  ) {
    return 0;
  }

  return (
    Math.floor(
      (end - start) /
        (24 * 60 * 60 * 1000)
    ) + 1
  );
};

const getIndiaToday = () => {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(new Date());

  const values = {};

  parts.forEach((part) => {
    values[part.type] =
      part.value;
  });

  return `${values.year}-${values.month}-${values.day}`;
};
const getIndiaTomorrow = () => {
  const today = getIndiaToday();

  const [year, month, day] =
    today.split("-").map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  date.setUTCDate(
    date.getUTCDate() + 1
  );

  return date
    .toISOString()
    .slice(0, 10);
};
/*
========================================================
GET ACTUAL DATABASE COLUMNS
========================================================
*/

const getLeaveColumns = async () => {
  const [rows] =
    await db.query(
      "SHOW COLUMNS FROM leave_applications"
    );

  return new Set(
    rows.map((row) =>
      String(row.Field)
    )
  );
};

/*
========================================================
GET DEPARTMENT ADMINS
========================================================
*/

const getDepartmentAdmins = async (
  departmentId
) => {
  if (!departmentId) {
    return [];
  }

  const [adminRows] =
    await db.query(
      `
      SELECT DISTINCT
        a.user_id,
        a.full_name,
        a.email,
        a.department_id

      FROM users a

      INNER JOIN roles r
        ON r.role_id =
          a.role_id

      WHERE
        a.department_id = ?

        AND LOWER(
          COALESCE(
            r.role_name,
            ''
          )
        ) = 'admin'

        AND LOWER(
          COALESCE(
            a.status,
            'active'
          )
        ) = 'active'

        AND a.email IS NOT NULL

        AND TRIM(a.email) != ''

      ORDER BY
        a.full_name ASC,
        a.user_id ASC
      `,
      [departmentId]
    );

  return adminRows || [];
};

/*
========================================================
GET ACTIVE SUPERADMINS
========================================================
*/

const getActiveSuperadmins = async () => {
  const [superadminRows] =
    await db.query(
      `
      SELECT DISTINCT
        u.user_id,
        u.full_name,
        u.email,
        u.department_id

      FROM users u

      INNER JOIN roles r
        ON r.role_id =
          u.role_id

      WHERE
        LOWER(
          COALESCE(
            r.role_name,
            ''
          )
        ) = 'superadmin'

        AND LOWER(
          COALESCE(
            u.status,
            'active'
          )
        ) = 'active'

        AND u.email IS NOT NULL

        AND TRIM(u.email) != ''

      ORDER BY
        u.full_name ASC,
        u.user_id ASC
      `
    );

  return superadminRows || [];
};

/*
========================================================
BUILD FINAL EMAIL RECIPIENTS
========================================================
*/



/*
========================================================
GET EMPLOYEE LEAVE SUMMARY
GET /api/employee-leaves/summary
========================================================
*/

const getEmployeeLeaveSummary =
  async (req, res) => {
    try {
      const employeeId =
        req.user.user_id;

      const currentYear =
        new Date().getFullYear();

      const requestedYear =
        Number(
          req.query.year
        );

      const year =
        Number.isFinite(
          requestedYear
        ) &&
        requestedYear >= 2000
          ? requestedYear
          : currentYear;

      const balances =
        await buildLeaveBalances(
          db,
          employeeId,
          year
        );

      const columns =
        await getLeaveColumns();

      const durationSelect =
        columns.has(
          "duration_type"
        )
          ? "la.duration_type"
          : `
            CASE
              WHEN la.total_days = 0.5
              THEN 'half_day'
              ELSE 'full_day'
            END AS duration_type
          `;

      const halfDaySelect =
        columns.has(
          "half_day_session"
        )
          ? "la.half_day_session"
          : "NULL AS half_day_session";

      const reviewRemarkSelect =
        columns.has(
          "review_remark"
        )
          ? "la.review_remark"
          : "NULL AS review_remark";

      const subjectSelect =
        columns.has(
          "subject"
        )
          ? "la.subject"
          : "NULL AS subject";

      const [applications] =
        await db.query(
          `
          SELECT
            la.leave_id,
            la.employee_id,
            la.leave_type,

            ${subjectSelect},

            DATE_FORMAT(
              la.start_date,
              '%Y-%m-%d'
            ) AS start_date,

            DATE_FORMAT(
              la.end_date,
              '%Y-%m-%d'
            ) AS end_date,

            la.total_days,

            ${durationSelect},

            ${halfDaySelect},

            la.reason,
            la.status,

            ${reviewRemarkSelect},

            la.reviewed_by,

            DATE_FORMAT(
              la.reviewed_at,
              '%Y-%m-%d %H:%i:%s'
            ) AS reviewed_at,

            DATE_FORMAT(
              la.applied_at,
              '%Y-%m-%d %H:%i:%s'
            ) AS applied_at,

            reviewer.full_name
              AS reviewed_by_name,

            reviewer.email
              AS reviewed_by_email

          FROM leave_applications la

          LEFT JOIN users reviewer
            ON reviewer.user_id =
              la.reviewed_by

          WHERE
            la.employee_id = ?

            AND YEAR(
              la.start_date
            ) = ?

          ORDER BY
            la.applied_at DESC,
            la.leave_id DESC
          `,
          [
            employeeId,
            year,
          ]
        );

      return res.json({
        success: true,

        year,

        configuration: {
          policy_start_date:
            POLICY_START_DATE,

          sick_entitlement:
            getAnnualEntitlements(
              year
            ).sick,

          casual_entitlement:
            getAnnualEntitlements(
              year
            ).casual,

          privileged_monthly_credit:
            MONTHLY_PRIVILEGED_CREDIT,

          privileged_carry_forward:
            true,

          holiday_entitlement:
            getAnnualEntitlements(
              year
            ).festival,
        },

        balances,

        applications:
          applications.map(
            (application) => ({
              ...application,

              total_days:
                formatNumber(
                  application.total_days
                ),
            })
          ),
      });
    } catch (error) {
      console.error(
        "Get employee leave summary error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to fetch leave information.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    }
  };

/*
========================================================
APPLY FOR LEAVE
POST /api/employee-leaves/apply
========================================================
*/

const applyEmployeeLeave =
  async (req, res) => {
    try {
      const employeeId =
        req.user.user_id;

      const leaveType =
        normalizeLeaveType(
          req.body.leave_type
        );

      /*
      ======================================================
      NEW: SUBJECT
      Used mainly for Unpaid Leave.
      ======================================================
      */

      const subject =
        String(
          req.body.subject ||
            ""
        ).trim();

      const durationType =
        String(
          req.body
            .duration_type ||
            "full_day"
        )
          .trim()
          .toLowerCase();

      const halfDaySession =
        String(
          req.body
            .half_day_session ||
            ""
        )
          .trim()
          .toLowerCase();

      const startDate =
        String(
          req.body
            .start_date ||
            ""
        ).trim();

      let endDate =
        String(
          req.body
            .end_date ||
            ""
        ).trim();

      const reason =
        String(
          req.body.reason ||
            ""
        ).trim();

      /*
      ------------------------------
      BASIC VALIDATION
      ------------------------------
      */

      if (!leaveType) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Please select a valid leave type.",
          });
      }

      /*
      ======================================================
      NEW: SUBJECT REQUIRED FOR UNPAID
      ======================================================
      */

      if (
        leaveType === "unpaid" &&
        !subject
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Please enter the subject for unpaid leave.",
          });
      }

      if (
        subject.length > 255
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Leave subject cannot exceed 255 characters.",
          });
      }

      if (
        ![
          "full_day",
          "half_day",
        ].includes(
          durationType
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Please select Full Day or Half Day.",
          });
      }

      if (!startDate) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Please select the leave date.",
          });
      }

      const datePattern =
        /^\d{4}-\d{2}-\d{2}$/;

      if (
        !datePattern.test(
          startDate
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid leave date.",
          });
      }

      if (
        startDate <
        POLICY_START_DATE
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "The new Leave policy starts from 01-09-2026.",
          });
      }

      /*
======================================================
PRIVILEGED LEAVE DATE RULE

Half Day  → Today onwards
Full Day  → Minimum 1 day in advance
======================================================
*/

if (leaveType === "mandatory") {
  const today =
    getIndiaToday();

  const minimumPrivilegedDate =
    durationType === "half_day"
      ? today
      : getIndiaTomorrow();

  if (
    startDate <
    minimumPrivilegedDate
  ) {
    return res
      .status(400)
      .json({
        success: false,

        message:
          durationType === "half_day"
            ? "Half-day Privileged Leave can be applied from today onwards."
            : "Full-day Privileged Leave must be applied for at least 1 day in advance.",
      });
  }
}

      /*
      ------------------------------
      HOLIDAY LEAVE
      ------------------------------
      */

      let selectedHoliday =
        null;

      if (
        leaveType ===
        "festival"
      ) {
        selectedHoliday =
          HOLIDAYS_2026.find(
            (holiday) =>
              holiday.date ===
                startDate &&
              holiday.type ===
                "optional"
          );

        if (!selectedHoliday) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Please select a valid festival holiday.",
            });
        }

        const today =
          getIndiaToday();

        if (
          startDate <
          today
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Past festival holidays cannot be applied for.",
            });
        }

        const holidayDay =
          new Date(
            `${startDate}T00:00:00`
          ).getDay();

        if (
          holidayDay === 0
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "This festival falls on Sunday, which is already a weekly off.",
            });
        }

        endDate =
          startDate;
      } else if (
        durationType ===
        "half_day"
      ) {
        /*
        NORMAL HALF DAY
        */

        endDate =
          startDate;

        if (
          ![
            "first_half",
            "second_half",
          ].includes(
            halfDaySession
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Please select First Half or Second Half.",
            });
        }
      } else {
        /*
        NORMAL FULL DAY
        */

        if (
          !endDate ||
          !datePattern.test(
            endDate
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Please select the end date.",
            });
        }

        if (
          endDate <
          startDate
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Leave end date cannot be before start date.",
            });
        }
      }

      /*
      Leave application cannot cross
      calendar year.
      */

      if (
        endDate &&
        startDate.slice(
          0,
          4
        ) !==
          endDate.slice(
            0,
            4
          )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Please submit separate Leave applications for each calendar year.",
          });
      }

      /*
      Reason / Remark required except
      Holiday Leave.
      */

      if (
        !reason &&
        leaveType !==
          "festival"
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              leaveType ===
              "unpaid"
                ? "Please enter a remark for unpaid leave."
                : "Please enter the reason for leave.",
          });
      }

      const finalReason =
        leaveType ===
        "festival"
          ? `Festival: ${
              selectedHoliday
                ?.name ||
              "Holiday Leave"
            }${
              reason
                ? ` - ${reason}`
                : ""
            }`
          : reason;

      /*
      ------------------------------
      CALCULATE DAYS
      ------------------------------
      */

      const totalDays =
        leaveType ===
        "festival"
          ? 1
          : durationType ===
            "half_day"
          ? 0.5
          : calculateInclusiveDays(
              startDate,
              endDate
            );

      if (
        totalDays <= 0
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Unable to calculate leave days.",
          });
      }

      const leaveYear =
        Number(
          startDate.slice(
            0,
            4
          )
        );

      /*
      ======================================================
      BALANCE VALIDATION

      IMPORTANT:
      Unpaid Leave has NO balance.
      Existing leave balance logic is
      completely unchanged for all
      other leave types.
      ======================================================
      */

      if (
        leaveType !==
        "unpaid"
      ) {
        const balances =
          await buildLeaveBalances(
            db,
            employeeId,
            leaveYear
          );

        const selectedBalance =
          balances[
            leaveType
          ];

        if (
          !selectedBalance
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Unable to calculate leave balance.",
            });
        }

        if (
          totalDays >
          Number(
            selectedBalance
              .available ||
              0
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                `You only have ${selectedBalance.available} ${getLeaveLabel(
                  leaveType
                )} day(s) available.`,
            });
        }
      }

      /*
      ------------------------------
      PREVENT OVERLAPPING LEAVE
      ------------------------------
      */

      const [overlappingRows] =
        await db.query(
          `
          SELECT
            leave_id

          FROM leave_applications

          WHERE
            employee_id = ?

            AND status IN (
              'pending',
              'approved'
            )

            AND NOT (
              end_date < ?
              OR start_date > ?
            )

          LIMIT 1
          `,
          [
            employeeId,
            startDate,
            endDate,
          ]
        );

      if (
        overlappingRows.length >
        0
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "You already have a pending or approved leave application for these dates.",
          });
      }

      /*
      ------------------------------
      DATABASE COLUMNS
      ------------------------------
      */

      const columns =
        await getLeaveColumns();

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
        employeeId,
        leaveType,
        startDate,
        endDate,
        totalDays,
        finalReason,
        "pending",
      ];

      /*
      ======================================================
      NEW: SAVE SUBJECT
      ======================================================
      */

      if (
        columns.has(
          "subject"
        )
      ) {
        insertColumns.push(
          "subject"
        );

        insertValues.push(
          leaveType ===
            "unpaid"
            ? subject
            : null
        );
      }

      if (
        columns.has(
          "duration_type"
        )
      ) {
        insertColumns.push(
          "duration_type"
        );

        insertValues.push(
          leaveType ===
            "festival"
            ? "full_day"
            : durationType
        );
      }

      if (
        columns.has(
          "half_day_session"
        )
      ) {
        insertColumns.push(
          "half_day_session"
        );

        insertValues.push(
          leaveType !==
            "festival" &&
          durationType ===
            "half_day"
            ? halfDaySession
            : null
        );
      }

      const placeholders =
        insertColumns
          .map(() => "?")
          .join(", ");

      /*
      ------------------------------
      SAVE APPLICATION
      ------------------------------
      */

      const [result] =
        await db.query(
          `
          INSERT INTO leave_applications (
            ${insertColumns.join(
              ", "
            )}
          )

          VALUES (
            ${placeholders}
          )
          `,
          insertValues
        );

      /*
      ------------------------------
      CREATE EMAIL REVIEW TOKEN
      ------------------------------
      */

      const reviewToken =
        crypto
          .randomBytes(32)
          .toString("hex");

      await db.query(
        `
        INSERT INTO leave_review_tokens
        (
          leave_id,
          token,
          expires_at
        )
        VALUES
        (
          ?,
          ?,
          DATE_ADD(
            NOW(),
            INTERVAL 30 DAY
          )
        )
        `,
        [
          result.insertId,
          reviewToken,
        ]
      );

      /*
      ------------------------------
      GET EMPLOYEE
      ------------------------------
      */

      const [employeeRows] =
        await db.query(
          `
          SELECT
            u.user_id,
            u.full_name,
            u.email,
            u.department_id,

            d.department_name,

            r.role_name
              AS applicant_role

          FROM users u

          LEFT JOIN departments d
            ON d.department_id =
              u.department_id

          LEFT JOIN roles r
            ON r.role_id =
              u.role_id

          WHERE
            u.user_id = ?

          LIMIT 1
          `,
          [employeeId]
        );

      const employee =
        employeeRows[0] ||
        {};

      const applicantRole =
        String(
          employee.applicant_role ||
            ""
        )
          .trim()
          .toLowerCase();

    const isAdminApplicant =
  applicantRole === "admin";

      /*
      ======================================================
      FIND LEAVE REVIEWERS

      Employee:
      → Department Admin(s)

      Admin:
      → Superadmin(s)

      Superadmin is additionally
      copied on Employee leave email.
      ======================================================
      */

      let departmentAdmins =
        [];

      let superadmins =
        [];

      let reviewUsers =
        [];

      try {
        if (
          isAdminApplicant
        ) {
          superadmins =
            await getActiveSuperadmins();

          reviewUsers =
            superadmins;
        } else {
          departmentAdmins =
            await getDepartmentAdmins(
              employee.department_id
            );

          /*
          NEW:
          Superadmin also receives
          Employee leave notification.
          */

          superadmins =
            await getActiveSuperadmins();

          /*
          Existing approval owner remains
          the Department Admin.
          */

          reviewUsers = [
  ...departmentAdmins,
];
        }
      } catch (
        reviewerError
      ) {
        console.error(
          "Leave reviewer lookup failed:",
          reviewerError.message
        );

        departmentAdmins =
          [];

        superadmins =
          [];

        reviewUsers =
          [];
      }

      /*
      Keep first reviewer for
      backwards compatibility.
      */

      const admin =
        reviewUsers[0] ||
        {};
     const finalLeaveRecipients = [
  ...new Set(
    [
      PREMAL_LEAVE_EMAIL,

      ...(
        isAdminApplicant
          ? []
          : departmentAdmins.map(
              (item) =>
                item.email
            )
      ),
    ]
      .map((email) =>
        String(email || "")
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  ),
];

const finalCcRecipients = [
  ...new Set(
    [
      RATHIKA_LEAVE_EMAIL,
    ]
      .map((email) =>
        String(email || "")
          .trim()
          .toLowerCase()
      )
      .filter(
        (email) =>
          email &&
          !finalLeaveRecipients.includes(
            email
          )
      )
  ),
];
      /*
      ======================================================
      EMAIL
      ======================================================
      */

      let emailResult = {
        sent: false,
        skipped: true,
      };

      if (
        finalLeaveRecipients.length >
        0
      ) {
        try {
          const leaveLabel =
            getLeaveLabel(
              leaveType
            );

          const durationLabel =
            leaveType ===
            "festival"
              ? "Full Day"
              : durationType ===
                "half_day"
              ? halfDaySession ===
                "first_half"
                ? "Half Day - First Half"
                : "Half Day - Second Half"
              : totalDays === 1
              ? "Full Day"
              : `${totalDays} Full Days`;

          const emailSubject =
            `${leaveLabel} Application - ${
              employee.full_name ||
              (isAdminApplicant
                ? "Admin"
                : "Employee")
            }`;

          const text = `
Dear Sir/Ma'am,

A leave application has been submitted through Valencia RMS.

${isAdminApplicant ? "Admin" : "Employee"} Name: ${employee.full_name || "-"}
${isAdminApplicant ? "Admin" : "Employee"} Email: ${employee.email || "-"}
Department: ${employee.department_name || "-"}

Leave Type: ${leaveLabel}
${
  leaveType === "unpaid"
    ? `Subject: ${subject}`
    : ""
}
From Date: ${startDate}
To Date: ${endDate}
Duration: ${durationLabel}
Leave Days: ${totalDays}

${
  leaveType === "unpaid"
    ? "Remark"
    : "Reason"
}:
${finalReason}

The leave application is currently Pending and requires your review.

Regards,
Valencia RMS
`;

          const html = `
            <div style="
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #111827;
            ">

              <h2 style="
                color:#ff5733;
                margin-bottom:8px;
              ">
                Leave Application
              </h2>

              <p>
                Dear
                <strong>
                  Sir/Ma'am
                </strong>,
              </p>

              <p>
                A leave application has been submitted
                through Valencia RMS and is awaiting review.
              </p>

              <table style="
                border-collapse:collapse;
                width:100%;
                max-width:650px;
              ">

                <tr>
                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    <strong>
                      ${
                        isAdminApplicant
                          ? "Admin"
                          : "Employee"
                      }
                    </strong>
                  </td>

                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    ${
                      employee.full_name ||
                      "-"
                    }
                  </td>
                </tr>

                <tr>
                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    <strong>
                      ${
                        isAdminApplicant
                          ? "Admin Email"
                          : "Employee Email"
                      }
                    </strong>
                  </td>

                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    ${
                      employee.email ||
                      "-"
                    }
                  </td>
                </tr>

                <tr>
                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    <strong>
                      Department
                    </strong>
                  </td>

                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    ${
                      employee.department_name ||
                      "-"
                    }
                  </td>
                </tr>

                <tr>
                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    <strong>
                      Leave Type
                    </strong>
                  </td>

                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    ${leaveLabel}
                  </td>
                </tr>

                ${
                  leaveType ===
                  "unpaid"
                    ? `
                <tr>
                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    <strong>
                      Subject
                    </strong>
                  </td>

                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    ${subject}
                  </td>
                </tr>
                `
                    : ""
                }

                <tr>
                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    <strong>
                      From
                    </strong>
                  </td>

                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    ${startDate}
                  </td>
                </tr>

                <tr>
                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    <strong>
                      To
                    </strong>
                  </td>

                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    ${endDate}
                  </td>
                </tr>

                <tr>
                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    <strong>
                      Duration
                    </strong>
                  </td>

                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    ${durationLabel}
                  </td>
                </tr>

                <tr>
                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    <strong>
                      Leave Days
                    </strong>
                  </td>

                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    ${totalDays}
                  </td>
                </tr>

                <tr>
                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    <strong>
                      ${
                        leaveType ===
                        "unpaid"
                          ? "Remark"
                          : "Reason"
                      }
                    </strong>
                  </td>

                  <td style="
                    padding:8px;
                    border:1px solid #dddddd;
                  ">
                    ${finalReason}
                  </td>
                </tr>
              </table>

              <p>
                This application is currently
                <strong>Pending</strong>
                and requires review.
              </p>

              <table
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="margin:20px 0;"
              >
                <tr>
                  <td
                    style="
                      background:#ff5733;
                      border-radius:8px;
                      text-align:center;
                    "
                  >
                    <a
                      href="https://myvol.in/leave-review/${reviewToken}"
                      style="
                        display:inline-block;
                        padding:12px 24px;
                        color:#ffffff;
                        text-decoration:none;
                        font-weight:bold;
                        font-family:Arial,sans-serif;
                      "
                    >
                      Review Leave Request
                    </a>
                  </td>
                </tr>
              </table>

              <p>
                Regards,<br />
                Valencia RMS
              </p>
            </div>
          `;

          const mailResponse =
            await sendMail({
              to:
                finalLeaveRecipients,

              cc:
                finalCcRecipients,

              subject:
                emailSubject,

              text,

              html,

              replyTo:
                employee.email ||
                undefined,
            });

          emailResult = {
            sent:
              !mailResponse
                ?.skipped,

            skipped:
              Boolean(
                mailResponse
                  ?.skipped
              ),

            messageId:
              mailResponse
                ?.messageId ||
              null,

            recipients:
              finalLeaveRecipients,

            cc:
              finalCcRecipients,
          };
        } catch (
          emailError
        ) {
          console.error(
            "Leave application email failed:",
            emailError
          );

          emailResult = {
            sent: false,
            skipped: false,

            error:
              emailError.message,

            recipients:
              finalLeaveRecipients,

            cc:
              finalCcRecipients,
          };
        }
      } else {
        console.warn(
          "Leave email skipped: no recipients found."
        );

        emailResult = {
          sent: false,
          skipped: true,

          error:
            "No leave email recipients found.",
        };
      }

      /*
      ======================================================
      RESPONSE
      ======================================================
      */

      return res
        .status(201)
        .json({
          success: true,

          message:
            leaveType ===
            "unpaid"
              ? "Unpaid leave application submitted successfully."
              : "Leave application submitted successfully.",

          application: {
            leave_id:
              result.insertId,

            employee_id:
              employeeId,

            employee_name:
              employee.full_name ||
              "",

            employee_email:
              employee.email ||
              "",

            department_id:
              employee.department_id ||
              null,

            department_name:
              employee.department_name ||
              "",

            admin_id:
              admin.user_id ||
              null,

            admin_name:
              admin.full_name ||
              "",

            admin_email:
              admin.email ||
              "",

            admin_emails:
              departmentAdmins
                .map(
                  (item) =>
                    item.email
                )
                .filter(Boolean),

            applicant_role:
              applicantRole,

            approval_role:
              isAdminApplicant
                ? "superadmin"
                : "admin",

            reviewer_emails:
              reviewUsers
                .map(
                  (item) =>
                    item.email
                )
                .filter(Boolean),

            leave_type:
              leaveType,

            leave_label:
              getLeaveLabel(
                leaveType
              ),

            /*
            NEW
            */

            subject:
              leaveType ===
                "unpaid"
                ? subject
                : null,

            start_date:
              startDate,

            end_date:
              endDate,

            duration_type:
              leaveType ===
                "festival"
                ? "full_day"
                : durationType,

            half_day_session:
              leaveType !==
                "festival" &&
              durationType ===
                "half_day"
                ? halfDaySession
                : null,

            total_days:
              totalDays,

            reason:
              finalReason,

            status:
              "pending",
          },

          email:
            emailResult,
        });
    } catch (error) {
      console.error(
        "Apply employee leave error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to submit leave application.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    }
  };

/*
========================================================
GET HOLIDAY CALENDAR
GET /api/employee-leaves/holidays
========================================================
*/

const getEmployeeHolidayCalendar =
  async (req, res) => {
    try {
      const employeeId =
        req.user.user_id;

      const [selectedRows] =
        await db.query(
          `
          SELECT
            DATE_FORMAT(
              holiday_date,
              '%Y-%m-%d'
            ) AS holiday_date,

            holiday_name

          FROM employee_optional_holidays

          WHERE
            employee_id = ?

            AND holiday_year = 2026

          ORDER BY
            holiday_date ASC
          `,
          [employeeId]
        );

      const selectedDates =
        new Set(
          selectedRows.map(
            (row) =>
              row.holiday_date
          )
        );

      const holidays =
        HOLIDAYS_2026.map(
          (holiday) => ({
            ...holiday,

            selected:
              selectedDates.has(
                holiday.date
              ),
          })
        );

      return res.json({
        success: true,

        year: 2026,

        max_optional: 2,

        selected_count:
          selectedRows.length,

        holidays,
      });
    } catch (error) {
      console.error(
        "Get employee holiday calendar error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to load holiday calendar.",

          error:
            error.message,
        });
    }
  };

/*
========================================================
SELECT / REMOVE OPTIONAL HOLIDAY
POST /api/employee-leaves/holidays/toggle
========================================================
*/

const toggleEmployeeOptionalHoliday =
  async (req, res) => {
    try {
      const employeeId =
        req.user.user_id;

      const holidayDate =
        String(
          req.body
            .holiday_date ||
            ""
        ).trim();

      const holiday =
        HOLIDAYS_2026.find(
          (item) =>
            item.date ===
            holidayDate
        );

      if (!holiday) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid holiday.",
          });
      }

      if (
        holiday.type ===
        "fixed"
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "This is already a fixed company holiday.",
          });
      }

      const today =
        getIndiaToday();

      if (
        holidayDate <
        today
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Past holidays cannot be selected.",
          });
      }

      
      const [existingRows] =
        await db.query(
          `
          SELECT
            selection_id

          FROM employee_optional_holidays

          WHERE
            employee_id = ?

            AND holiday_date = ?

          LIMIT 1
          `,
          [
            employeeId,
            holidayDate,
          ]
        );

      if (
        existingRows.length >
        0
      ) {
        await db.query(
          `
          DELETE FROM employee_optional_holidays

          WHERE
            employee_id = ?

            AND holiday_date = ?
          `,
          [
            employeeId,
            holidayDate,
          ]
        );

        return res.json({
          success: true,

          selected: false,

          message:
            "Optional holiday removed.",
        });
      }

      const [countRows] =
        await db.query(
          `
          SELECT
            COUNT(*) AS selected_count

          FROM employee_optional_holidays

          WHERE
            employee_id = ?

            AND holiday_year = 2026
          `,
          [employeeId]
        );

      const selectedCount =
        Number(
          countRows[0]
            ?.selected_count ||
            0
        );

      if (
        selectedCount >= 2
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
             "You have already selected your 2 optional festival holidays for 2026.",
          });
      }

      await db.query(
        `
        INSERT INTO employee_optional_holidays (
          employee_id,
          holiday_date,
          holiday_name,
          holiday_year
        )

        VALUES (
          ?, ?, ?, 2026
        )
        `,
        [
          employeeId,
          holiday.date,
          holiday.name,
        ]
      );

      return res.json({
        success: true,

        selected: true,

        message:
          `${holiday.name} selected as an optional holiday.`,
      });
    } catch (error) {
      console.error(
        "Toggle optional holiday error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to update optional holiday.",

          error:
            error.message,
        });
    }
  };

module.exports = {
  getEmployeeLeaveSummary,
  applyEmployeeLeave,
  getEmployeeHolidayCalendar,
  toggleEmployeeOptionalHoliday,
};