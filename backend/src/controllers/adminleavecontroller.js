const crypto = require("crypto");
const db = require("../config/db");

const { sendMail } = require("../utils/emailservice");
const {
  buildLeaveBalances,
} = require("../utils/leavepolicy");

const PREMAL_LEAVE_EMAIL =
  "premal.mehta@valencianutrition.com";

const RATHIKA_LEAVE_EMAIL =
  "rathika.haleangadi@valencianutrition.com";

const GLOBAL_LEAVE_APPROVER_EMAILS = [
  PREMAL_LEAVE_EMAIL,
  RATHIKA_LEAVE_EMAIL,
];

const GLOBAL_LEAVE_VIEWER_EMAILS = [
  PREMAL_LEAVE_EMAIL,
  RATHIKA_LEAVE_EMAIL,
];
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

  return "Leave";
};

const getLoggedInAdmin = async (userId) => {
  const [rows] = await db.query(
    `
    SELECT
      u.user_id,
      u.full_name,
      u.email,
      u.department_id,
      d.department_name,
      r.role_name

    FROM users u

    LEFT JOIN departments d
      ON d.department_id =
         u.department_id

    LEFT JOIN roles r
      ON r.role_id =
         u.role_id

    WHERE u.user_id = ?

    LIMIT 1
    `,
    [userId]
  );

  if (!rows.length) {
    return {
      error: {
        status: 404,
        message:
          "Reviewer account not found.",
      },
    };
  }

  const admin = rows[0];

  const email = String(
    admin.email || ""
  )
    .trim()
    .toLowerCase();

  const roleName = String(
    admin.role_name || ""
  )
    .trim()
    .toLowerCase();

 const isGlobalApprover =
  GLOBAL_LEAVE_APPROVER_EMAILS.includes(
    email
  );

const isGlobalViewer =
  GLOBAL_LEAVE_VIEWER_EMAILS.includes(
    email
  );

const isDepartmentAdmin =
  roleName === "admin";

if (
  !isGlobalViewer &&
  !isDepartmentAdmin
) {
    return {
      error: {
        status: 403,
        message:
          "You are not authorized to review leave applications.",
      },
    };
  }

  if (
  !isGlobalViewer &&
  !admin.department_id
) {
    return {
      error: {
        status: 400,
        message:
          "Admin department is not assigned.",
      },
    };
  }

 return {
  admin: {
    ...admin,

    is_global_leave_approver:
      isGlobalApprover,

    is_global_leave_viewer:
      isGlobalViewer,

    can_review_leave:
  isGlobalApprover ||
  isDepartmentAdmin,
  },
};
};

/*
========================================================
GET ADMIN DEPARTMENT LEAVE APPLICATIONS
========================================================

GET /api/admin-leaves
GET /api/admin-leaves/applications
*/
const getAdminLeaveApplications = async (
  req,
  res
) => {
  try {
    const userId = req.user.user_id;

    const { admin, error } =
      await getLoggedInAdmin(userId);

    if (error) {
      return res
        .status(error.status)
        .json({
          success: false,
          message: error.message,
        });
    }

    const requestedStatus = String(
      req.query.status || "all"
    )
      .trim()
      .toLowerCase();

    const validStatuses = [
      "pending",
      "approved",
      "rejected",
    ];

    const statusFilter =
      validStatuses.includes(
        requestedStatus
      )
        ? requestedStatus
        : null;

   const whereParts = [];
const values = [];

if (
  admin.is_global_leave_viewer
) {
  whereParts.push(`
    LOWER(
      TRIM(
        employee_role.role_name
      )
    ) IN (
      'employee',
      'admin',
      'administrator'
    )
  `);

  } else {
  whereParts.push(`
    LOWER(
      TRIM(
        employee_role.role_name
      )
    ) = 'employee'
  `);

  whereParts.push(`
    (
      EXISTS (
        SELECT 1
        FROM user_departments employee_ud
        WHERE employee_ud.user_id = employee.user_id
          AND employee_ud.department_id IN (
            SELECT admin_ud.department_id
            FROM user_departments admin_ud
            WHERE admin_ud.user_id = ?
          )
      )

      OR employee.department_id IN (
        SELECT admin_ud.department_id
        FROM user_departments admin_ud
        WHERE admin_ud.user_id = ?
      )

      OR EXISTS (
        SELECT 1
        FROM user_departments employee_ud
        WHERE employee_ud.user_id = employee.user_id
          AND employee_ud.department_id = ?
      )

      OR employee.department_id = ?
    )
  `);

  values.push(
    admin.user_id,
    admin.user_id,
    admin.department_id,
    admin.department_id
  );
}



    if (statusFilter) {
      whereParts.push(
        "la.status = ?"
      );

      values.push(statusFilter);
    }

    const [applications] =
      await db.query(
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

la.escalated_for_approval,
la.escalated_by,
la.escalation_remark,

la.revert_status,
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

DATE_FORMAT(
  la.escalated_at,
  '%Y-%m-%d %H:%i:%s'
) AS escalated_at,

DATE_FORMAT(
  la.applied_at,
  '%Y-%m-%d %H:%i:%s'
) AS applied_at,

          DATE_FORMAT(
            la.reviewed_at,
            '%Y-%m-%d %H:%i:%s'
          ) AS reviewed_at,

          employee.full_name
            AS employee_name,

          employee.email
            AS employee_email,

          employee.employee_code,
          employee.designation,
          employee.department_id,

          d.department_name,

         reviewer.full_name
  AS reviewed_by_name,

reviewer.email
  AS reviewed_by_email,

escalator.full_name
  AS escalated_by_name,

escalator.email
  AS escalated_by_email,

revert_reviewer.full_name
  AS revert_reviewed_by_name,

revert_reviewer.email
  AS revert_reviewed_by_email

        FROM leave_applications la

                INNER JOIN users employee
          ON employee.user_id =
            la.employee_id

        INNER JOIN roles employee_role
          ON employee_role.role_id =
            employee.role_id

        LEFT JOIN departments d
          ON d.department_id =
            employee.department_id

        LEFT JOIN users reviewer
  ON reviewer.user_id =
    la.reviewed_by

        LEFT JOIN users escalator
  ON escalator.user_id =
    la.escalated_by

    LEFT JOIN users revert_reviewer
  ON revert_reviewer.user_id =
    la.revert_reviewed_by

        WHERE ${whereParts.join(
          " AND "
        )}

        ORDER BY
          CASE
            WHEN
  la.status = 'pending'
  AND COALESCE(
    la.revert_status,
    'none'
  ) <> 'approved'
THEN 1

            WHEN
  la.status = 'approved'
  AND COALESCE(
    la.revert_status,
    'none'
  ) <> 'approved'
THEN 1

            WHEN la.status = 'rejected'
            THEN 3

            ELSE 4
          END,

          la.applied_at DESC,
          la.leave_id DESC
        `,
        values
      );

     const summaryWhereParts = [];
const summaryValues = [];

if (
  admin.is_global_leave_viewer
) {
  summaryWhereParts.push(`
    LOWER(
      TRIM(
        employee_role.role_name
      )
    ) IN (
      'employee',
      'admin',
      'administrator'
    )
  `);
} else {
  summaryWhereParts.push(`
    LOWER(
      TRIM(
        employee_role.role_name
      )
    ) = 'employee'
  `);

  summaryWhereParts.push(`
    (
      EXISTS (
        SELECT 1
        FROM user_departments employee_ud
        WHERE employee_ud.user_id = employee.user_id
          AND employee_ud.department_id IN (
            SELECT admin_ud.department_id
            FROM user_departments admin_ud
            WHERE admin_ud.user_id = ?
          )
      )

      OR employee.department_id IN (
        SELECT admin_ud.department_id
        FROM user_departments admin_ud
        WHERE admin_ud.user_id = ?
      )

      OR EXISTS (
        SELECT 1
        FROM user_departments employee_ud
        WHERE employee_ud.user_id = employee.user_id
          AND employee_ud.department_id = ?
      )

      OR employee.department_id = ?
    )
  `);

  summaryValues.push(
    admin.user_id,
    admin.user_id,
    admin.department_id,
    admin.department_id
  );
}

const [summaryRows] =
  await db.query(
    `
    SELECT
      COUNT(*) AS total,

      SUM(
        CASE
          WHEN
  la.status = 'pending'
  AND COALESCE(
    la.revert_status,
    'none'
  ) <> 'approved'
THEN 1
          ELSE 0
        END
      ) AS pending,

      SUM(
        CASE
          WHEN
  la.status = 'approved'
  AND COALESCE(
    la.revert_status,
    'none'
  ) <> 'approved'
THEN 1
          ELSE 0
        END
      ) AS approved,

      SUM(
        CASE
          WHEN la.status = 'rejected'
          THEN 1
          ELSE 0
        END
      ) AS rejected

    FROM leave_applications la

    INNER JOIN users employee
      ON employee.user_id =
         la.employee_id

    INNER JOIN roles employee_role
      ON employee_role.role_id =
         employee.role_id

    WHERE
      ${summaryWhereParts.join(
        " AND "
      )}
    `,
    summaryValues
  );



    const summary =
      summaryRows[0] || {};

    return res.json({
      success: true,

      admin,

      summary: {
        total: Number(
          summary.total || 0
        ),

        pending: Number(
          summary.pending || 0
        ),

        approved: Number(
          summary.approved || 0
        ),

        rejected: Number(
          summary.rejected || 0
        ),
      },

      applications:
        applications.map(
          (application) => ({
            ...application,

            total_days: Number(
              application.total_days ||
                0
            ),
          })
        ),
    });
  } catch (error) {
    console.error(
      "Get admin leave applications error:",
      error
    );

    return res
      .status(500)
      .json({
        success: false,

        message:
          "Failed to fetch leave applications.",

        error:
          error.message,

        sqlMessage:
          error.sqlMessage || null,
      });
  }
};

/*
========================================================
APPROVE / REJECT LEAVE
========================================================

PATCH /api/admin-leaves/:leaveId/status
*/
const reviewLeaveApplication = async (
  req,
  res
) => {
  let connection;

  try {
    connection =
      await db.getConnection();

    const adminUserId =
      req.user.user_id;

    const leaveId =
      Number(
        req.params.leaveId
      );

    if (
      !Number.isFinite(
        leaveId
      ) ||
      leaveId <= 0
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Invalid leave application ID.",
        });
    }

    let status = String(
      req.body.status ||
        req.body.action ||
        ""
    )
      .trim()
      .toLowerCase();

    const reviewRemark = String(
      req.body.review_remark ||
        req.body.remark ||
        ""
    ).trim();

    if (
      status === "approve"
    ) {
      status = "approved";
    }

    if (
      status === "reject"
    ) {
      status = "rejected";
    }

    if (
      ![
        "approved",
        "rejected",
      ].includes(status)
    ) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "Status must be approved or rejected.",
        });
    }

    if (
      status ===
        "rejected" &&
      !reviewRemark
    ) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "Please enter a reason before rejecting the leave application.",
        });
    }

    

    const { admin, error } =
      await getLoggedInAdmin(
        adminUserId
      );
      if (error) {
  return res
    .status(error.status)
    .json({
      success: false,
      message:
        error.message,
    });
}

    if (!admin.can_review_leave) {
  return res
    .status(403)
    .json({
      success: false,
      message:
        "You have view-only access to leave applications.",
    });
}

    await connection
      .beginTransaction();

    const leaveWhereParts = [
  "la.leave_id = ?",
];

const leaveValues = [
  leaveId,
];

if (
  admin.is_global_leave_approver
) {
  leaveWhereParts.push(`
    LOWER(
      TRIM(
        employee_role.role_name
      )
    ) IN (
      'employee',
      'admin',
      'administrator'
    )
  `);
} else {
  leaveWhereParts.push(`
    LOWER(
      TRIM(
        employee_role.role_name
      )
    ) = 'employee'
  `);

  leaveWhereParts.push(`
    (
      EXISTS (
        SELECT 1
        FROM user_departments employee_ud
        WHERE employee_ud.user_id = employee.user_id
          AND employee_ud.department_id IN (
            SELECT admin_ud.department_id
            FROM user_departments admin_ud
            WHERE admin_ud.user_id = ?
          )
      )

      OR employee.department_id IN (
        SELECT admin_ud.department_id
        FROM user_departments admin_ud
        WHERE admin_ud.user_id = ?
      )

      OR EXISTS (
        SELECT 1
        FROM user_departments employee_ud
        WHERE employee_ud.user_id = employee.user_id
          AND employee_ud.department_id = ?
      )

      OR employee.department_id = ?
    )
  `);

  leaveValues.push(
    admin.user_id,
    admin.user_id,
    admin.department_id,
    admin.department_id
  );
}



const [leaveRows] =
  await connection.query(
    `
    SELECT
      la.leave_id,
      la.employee_id,
      la.leave_type,
      la.total_days,
     la.reason,
la.status,
la.escalated_for_approval,

COALESCE(
  la.revert_status,
  'none'
) AS revert_status,

la.duration_type,
      la.half_day_session,

      DATE_FORMAT(
        la.start_date,
        '%Y-%m-%d'
      ) AS start_date,

      DATE_FORMAT(
        la.end_date,
        '%Y-%m-%d'
      ) AS end_date,

      employee.full_name
        AS employee_name,

      employee.email
        AS employee_email,

      employee.department_id,

      d.department_name

    FROM leave_applications la

    INNER JOIN users employee
      ON employee.user_id =
         la.employee_id

    INNER JOIN roles employee_role
      ON employee_role.role_id =
         employee.role_id

    LEFT JOIN departments d
      ON d.department_id =
         employee.department_id

    WHERE
      ${leaveWhereParts.join(
        " AND "
      )}

    LIMIT 1

    FOR UPDATE
    `,
    leaveValues
  );


    if (
      !leaveRows.length
    ) {
      await connection
        .rollback();

      return res
        .status(404)
        .json({
          success: false,

          message:
            "Leave application not found.",
        });
    }

    const leave =
      leaveRows[0];

      const revertStatus =
  String(
    leave.revert_status ||
    "none"
  )
    .trim()
    .toLowerCase();

if (
  revertStatus === "pending"
) {
  await connection.rollback();

  return res
    .status(409)
    .json({
      success: false,

      message:
        "This leave has a pending revert request. Review the revert request first.",
    });
}

if (
  revertStatus === "approved"
) {
  await connection.rollback();

  return res
    .status(400)
    .json({
      success: false,

      message:
        "This leave has already been reverted.",
    });
}
      if (
  Number(
    leave.escalated_for_approval
  ) === 1
) {
  await connection.rollback();

  return res
    .status(403)
    .json({
      success: false,
      message:
        "This leave application has been escalated and must now be reviewed by the Superadmin.",
    });
}

      if (
  Number(leave.employee_id) ===
  Number(admin.user_id)
) {
  await connection.rollback();

  return res.status(403).json({
    success: false,
    message:
      "You cannot approve or reject your own leave application.",
  });
}

    if (
      String(
        leave.status || ""
      )
        .trim()
        .toLowerCase() !==
      "pending"
    ) {
      await connection
        .rollback();

      return res
        .status(400)
        .json({
          success: false,

          message:
            `This leave application is already ${leave.status}.`,
        });
    }

    let remainingBalance =
      null;

    /*
    ====================================================
    VALIDATE BALANCE BEFORE APPROVAL
    ====================================================
    */
    if (
  status === "approved" &&
  leave.leave_type !== "unpaid"
) {
  const leaveYear =
    Number(
      String(
        leave.start_date
      ).slice(
        0,
        4
      )
    );

  /*
  Exclude the current pending application
  when calculating balance.

  Other pending applications remain reserved.
  */
  const balances =
    await buildLeaveBalances(
      connection,
      leave.employee_id,
      leaveYear,
      {
        excludeLeaveId:
          leaveId,
      }
    );

  const selectedBalance =
    balances[
      leave.leave_type
    ];

  if (!selectedBalance) {
    await connection.rollback();

    return res.status(400).json({
      success: false,
      message:
        "Unable to calculate employee Leave balance.",
    });
  }

  const available =
    Number(
      selectedBalance.available ||
        0
    );

  const requestedDays =
    Number(
      leave.total_days ||
        0
    );

  if (
    requestedDays >
    available
  ) {
    await connection.rollback();

    return res.status(400).json({
      success: false,

      message:
        `Cannot approve. Employee only has ${available} ${getLeaveLabel(
          leave.leave_type
        )} day(s) available.`,
    });
  }

  remainingBalance =
    available -
    requestedDays;
}

    /*
    ====================================================
    UPDATE LEAVE APPLICATION
    ====================================================
    */
    await connection.query(
      `
      UPDATE leave_applications

      SET
        status = ?,
        review_remark = ?,
        reviewed_by = ?,
        reviewed_at = NOW()

      WHERE leave_id = ?
      `,
      [
        status,
        reviewRemark ||
          null,
        admin.user_id,
        leaveId,
      ]
    );

    await connection
      .commit();

    
    let emailResult = {
  sent: false,
  skipped: false,
};

try {
  const reviewerName =
    admin.full_name ||
    "Valencia RMS";

  const leaveLabel =
    getLeaveLabel(
      leave.leave_type
    );

  const finalStatusLabel =
    status === "approved"
      ? "APPROVED"
      : "REJECTED";

  const emailSubject =
    status === "approved"
      ? `Leave Approved - ${leave.employee_name}`
      : `Leave Rejected - ${leave.employee_name}`;

  const text = `
Dear ${leave.employee_name || "Employee"},

Your leave request has been ${status}.

Leave Type: ${leaveLabel}
From Date: ${leave.start_date || "-"}
To Date: ${leave.end_date || "-"}
Total Days: ${leave.total_days || "-"}

Final Status: ${finalStatusLabel}
Reviewed By: ${reviewerName}
Review Remark: ${reviewRemark || "-"}

Regards,
Valencia RMS
`;

  const html = `
    <div style="
      font-family:Arial,sans-serif;
      line-height:1.6;
      color:#111827;
      max-width:700px;
    ">
      <h2>
        Leave ${
          status === "approved"
            ? "Approved"
            : "Rejected"
        }
      </h2>

      <p>
        Dear ${leave.employee_name || "Employee"},
      </p>

      <p>
        Your leave request has been
        <strong>${status}</strong>.
      </p>

      <table style="
        width:100%;
        border-collapse:collapse;
        margin:18px 0;
      ">
        <tr>
          <td style="border:1px solid #ddd;padding:8px;">
            <strong>Leave Type</strong>
          </td>
          <td style="border:1px solid #ddd;padding:8px;">
            ${leaveLabel}
          </td>
        </tr>

        <tr>
          <td style="border:1px solid #ddd;padding:8px;">
            <strong>From</strong>
          </td>
          <td style="border:1px solid #ddd;padding:8px;">
            ${leave.start_date || "-"}
          </td>
        </tr>

        <tr>
          <td style="border:1px solid #ddd;padding:8px;">
            <strong>To</strong>
          </td>
          <td style="border:1px solid #ddd;padding:8px;">
            ${leave.end_date || "-"}
          </td>
        </tr>

        <tr>
          <td style="border:1px solid #ddd;padding:8px;">
            <strong>Total Days</strong>
          </td>
          <td style="border:1px solid #ddd;padding:8px;">
            ${leave.total_days || "-"}
          </td>
        </tr>

        <tr>
          <td style="border:1px solid #ddd;padding:8px;">
            <strong>Final Status</strong>
          </td>
          <td style="border:1px solid #ddd;padding:8px;">
            ${finalStatusLabel}
          </td>
        </tr>

        <tr>
          <td style="border:1px solid #ddd;padding:8px;">
            <strong>Reviewed By</strong>
          </td>
          <td style="border:1px solid #ddd;padding:8px;">
            ${reviewerName}
          </td>
        </tr>

        <tr>
          <td style="border:1px solid #ddd;padding:8px;">
            <strong>Review Remark</strong>
          </td>
          <td style="border:1px solid #ddd;padding:8px;">
            ${reviewRemark || "-"}
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
      to: [
        leave.employee_email,
      ],

      subject:
        emailSubject,

      text,

      html,
    });

  emailResult = {
    sent:
      !mailResponse?.skipped,

    skipped:
      Boolean(
        mailResponse?.skipped
      ),

    messageId:
      mailResponse?.messageId ||
      null,

    recipients: [
      leave.employee_email,
    ],

    cc: [],
  };
} catch (emailError) {
  console.error(
    "Leave result email failed:",
    emailError
  );

  emailResult = {
    sent: false,
    skipped: false,
    error:
      emailError.message,
  };
}
   

    return res.json({
      success: true,

      message:
        status ===
        "approved"
          ? "Leave approved successfully."
          : "Leave rejected successfully.",

      status,

      leave_id:
        leaveId,

      remaining_balance:
        remainingBalance,

      review_remark:
        reviewRemark,

      email:
        emailResult,
    });
  } catch (error) {
    if (connection) {
      try {
        await connection
          .rollback();
      } catch {
        // Ignore rollback error.
      }
    }

    console.error(
      "Review leave application error:",
      error
    );

    return res
      .status(500)
      .json({
        success: false,

        message:
          "Failed to review leave application.",

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

/*
========================================================
APPROVE / REJECT LEAVE REVERT REQUEST

PATCH /api/admin-leaves/:leaveId/revert
========================================================
*/

const reviewLeaveRevertRequest =
  async (req, res) => {
    let connection;

    try {
      connection =
        await db.getConnection();

      const reviewerUserId =
        Number(
          req.user?.user_id || 0
        );

      const leaveId =
        Number(
          req.params.leaveId || 0
        );

      let action =
        String(
          req.body?.status ||
          req.body?.action ||
          ""
        )
          .trim()
          .toLowerCase();

      const reviewRemark =
        String(
          req.body
            ?.review_remark ||
          req.body?.remark ||
          ""
        ).trim();

      if (
        action === "approve"
      ) {
        action = "approved";
      }

      if (
        action === "reject"
      ) {
        action = "rejected";
      }

      if (
        !Number.isFinite(
          leaveId
        ) ||
        leaveId <= 0
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid leave application ID.",
          });
      }

      if (
        ![
          "approved",
          "rejected",
        ].includes(action)
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Revert status must be approved or rejected.",
          });
      }

      if (
        action ===
          "rejected" &&
        !reviewRemark
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Please enter a reason before rejecting the revert request.",
          });
      }

      const {
        admin,
        error,
      } =
        await getLoggedInAdmin(
          reviewerUserId
        );

      if (error) {
        return res
          .status(error.status)
          .json({
            success: false,

            message:
              error.message,
          });
      }

      if (
        !admin.can_review_leave
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You are not authorized to review leave revert requests.",
          });
      }

      await connection
        .beginTransaction();

      /*
      ================================================
      SAME ACCESS RULES AS NORMAL LEAVE REVIEW
      ================================================
      */

      const whereParts = [
        "la.leave_id = ?",
      ];

      const values = [
        leaveId,
      ];

      if (
        admin
          .is_global_leave_approver
      ) {
        whereParts.push(`
          LOWER(
            TRIM(
              employee_role.role_name
            )
          ) IN (
            'employee',
            'admin',
            'administrator'
          )
        `);
      } else {
        whereParts.push(`
          LOWER(
            TRIM(
              employee_role.role_name
            )
          ) = 'employee'
        `);

        whereParts.push(`
          (
            EXISTS (
              SELECT 1

              FROM user_departments
                employee_ud

              WHERE
                employee_ud.user_id =
                  employee.user_id

                AND
                employee_ud.department_id
                IN (
                  SELECT
                    admin_ud.department_id

                  FROM user_departments
                    admin_ud

                  WHERE
                    admin_ud.user_id = ?
                )
            )

            OR employee.department_id IN (
              SELECT
                admin_ud.department_id

              FROM user_departments
                admin_ud

              WHERE
                admin_ud.user_id = ?
            )

            OR EXISTS (
              SELECT 1

              FROM user_departments
                employee_ud

              WHERE
                employee_ud.user_id =
                  employee.user_id

                AND
                employee_ud.department_id = ?
            )

            OR employee.department_id = ?
          )
        `);

        values.push(
          admin.user_id,
          admin.user_id,
          admin.department_id,
          admin.department_id
        );
      }

      const [leaveRows] =
        await connection.query(
          `
          SELECT
            la.leave_id,
            la.employee_id,
            la.leave_type,
            la.total_days,
            la.reason,
            la.status,

            COALESCE(
              la.revert_status,
              'none'
            ) AS revert_status,

            la.revert_reason,

            DATE_FORMAT(
              la.start_date,
              '%Y-%m-%d'
            ) AS start_date,

            DATE_FORMAT(
              la.end_date,
              '%Y-%m-%d'
            ) AS end_date,

            employee.full_name
              AS employee_name,

            employee.email
              AS employee_email,

            employee.department_id,

            d.department_name,

            employee_role.role_name
              AS applicant_role

          FROM leave_applications la

          INNER JOIN users employee
            ON employee.user_id =
              la.employee_id

          INNER JOIN roles
            employee_role
            ON employee_role.role_id =
              employee.role_id

          LEFT JOIN departments d
            ON d.department_id =
              employee.department_id

          WHERE
            ${whereParts.join(
              " AND "
            )}

          LIMIT 1

          FOR UPDATE
          `,
          values
        );

      if (
        !leaveRows.length
      ) {
        await connection
          .rollback();

        return res
          .status(404)
          .json({
            success: false,

            message:
              "Leave application not found.",
          });
      }

      const leave =
        leaveRows[0];

      /*
      Reviewer cannot approve their
      own revert request.
      */

      if (
        Number(
          leave.employee_id
        ) ===
        Number(
          admin.user_id
        )
      ) {
        await connection
          .rollback();

        return res
          .status(403)
          .json({
            success: false,

            message:
              "You cannot review your own leave revert request.",
          });
      }

      const leaveStatus =
        String(
          leave.status || ""
        )
          .trim()
          .toLowerCase();

      const revertStatus =
        String(
          leave.revert_status ||
          "none"
        )
          .trim()
          .toLowerCase();

      /*
      Only original Pending or Approved
      Leave can have a Revert Request.
      */

      if (
        ![
          "pending",
          "approved",
        ].includes(
          leaveStatus
        )
      ) {
        await connection
          .rollback();

        return res
          .status(400)
          .json({
            success: false,

            message:
              "This leave application cannot be reverted.",
          });
      }

      if (
        revertStatus !==
        "pending"
      ) {
        await connection
          .rollback();

        return res
          .status(400)
          .json({
            success: false,

            message:
              revertStatus ===
                "approved"
                ? "This leave has already been reverted."
                : revertStatus ===
                    "rejected"
                ? "This revert request has already been rejected."
                : "There is no pending revert request for this leave.",
          });
      }

      /*
      ================================================
      UPDATE REVERT REQUEST
      ================================================
      */

      await connection.query(
        `
        UPDATE leave_applications

        SET
          revert_status = ?,
          revert_reviewed_by = ?,
          revert_reviewed_at = NOW(),
          revert_review_remark = ?

        WHERE leave_id = ?
        `,
        [
          action,
          admin.user_id,
          reviewRemark ||
            null,
          leaveId,
        ]
      );

      await connection.commit();

      /*
      ================================================
      AFTER APPROVAL

      Balance automatically returns because
      leavepolicy.js ignores:
      revert_status = 'approved'
      ================================================
      */

      let updatedBalance =
        null;

      if (
        action ===
          "approved" &&
        leave.leave_type !==
          "unpaid"
      ) {
        try {
          const leaveYear =
            Number(
              String(
                leave.start_date
              ).slice(
                0,
                4
              )
            );

          const balances =
            await buildLeaveBalances(
              db,
              leave.employee_id,
              leaveYear
            );

          updatedBalance =
            balances[
              leave.leave_type
            ] ||
            null;
        } catch (
          balanceError
        ) {
          console.error(
            "Revert balance refresh failed:",
            balanceError.message
          );
        }
      }

      /*
      ================================================
      EMAIL RESULT TO EMPLOYEE
      ================================================
      */

      let emailResult = {
        sent: false,
        skipped: false,
      };

      try {
        const leaveLabel =
          getLeaveLabel(
            leave.leave_type
          );

        const reviewerName =
          admin.full_name ||
          "Valencia RMS";

        const actionLabel =
          action ===
          "approved"
            ? "APPROVED"
            : "REJECTED";

        const mailResponse =
          await sendMail({
            to: [
              leave.employee_email,
            ],

            subject:
              action ===
              "approved"
                ? `Leave Revert Approved - ${leave.employee_name}`
                : `Leave Revert Rejected - ${leave.employee_name}`,

            text: `
Dear ${leave.employee_name || "Employee"},

Your leave revert request has been ${action}.

Leave Type: ${leaveLabel}
From: ${leave.start_date}
To: ${leave.end_date}
Leave Days: ${leave.total_days}

Revert Reason:
${leave.revert_reason || "-"}

Revert Status: ${actionLabel}
Reviewed By: ${reviewerName}
Review Remark: ${reviewRemark || "-"}

${
  action === "approved"
    ? "The leave has been reverted and the applicable leave balance has been restored."
    : "The original leave application remains unchanged."
}

Regards,
Valencia RMS
            `.trim(),

            html: `
              <div
                style="
                  font-family:Arial,sans-serif;
                  line-height:1.6;
                  color:#111827;
                  max-width:700px;
                "
              >
                <h2>
                  Leave Revert ${
                    action ===
                    "approved"
                      ? "Approved"
                      : "Rejected"
                  }
                </h2>

                <p>
                  Dear ${
                    leave.employee_name ||
                    "Employee"
                  },
                </p>

                <p>
                  Your leave revert
                  request has been
                  <strong>
                    ${action}
                  </strong>.
                </p>

                <table
                  style="
                    width:100%;
                    border-collapse:collapse;
                    margin:18px 0;
                  "
                >
                  <tr>
                    <td
                      style="
                        border:1px solid #ddd;
                        padding:8px;
                      "
                    >
                      <strong>
                        Leave Type
                      </strong>
                    </td>

                    <td
                      style="
                        border:1px solid #ddd;
                        padding:8px;
                      "
                    >
                      ${leaveLabel}
                    </td>
                  </tr>

                  <tr>
                    <td
                      style="
                        border:1px solid #ddd;
                        padding:8px;
                      "
                    >
                      <strong>
                        From
                      </strong>
                    </td>

                    <td
                      style="
                        border:1px solid #ddd;
                        padding:8px;
                      "
                    >
                      ${leave.start_date}
                    </td>
                  </tr>

                  <tr>
                    <td
                      style="
                        border:1px solid #ddd;
                        padding:8px;
                      "
                    >
                      <strong>
                        To
                      </strong>
                    </td>

                    <td
                      style="
                        border:1px solid #ddd;
                        padding:8px;
                      "
                    >
                      ${leave.end_date}
                    </td>
                  </tr>

                  <tr>
                    <td
                      style="
                        border:1px solid #ddd;
                        padding:8px;
                      "
                    >
                      <strong>
                        Revert Reason
                      </strong>
                    </td>

                    <td
                      style="
                        border:1px solid #ddd;
                        padding:8px;
                      "
                    >
                      ${
                        leave.revert_reason ||
                        "-"
                      }
                    </td>
                  </tr>

                  <tr>
                    <td
                      style="
                        border:1px solid #ddd;
                        padding:8px;
                      "
                    >
                      <strong>
                        Reviewed By
                      </strong>
                    </td>

                    <td
                      style="
                        border:1px solid #ddd;
                        padding:8px;
                      "
                    >
                      ${reviewerName}
                    </td>
                  </tr>

                  <tr>
                    <td
                      style="
                        border:1px solid #ddd;
                        padding:8px;
                      "
                    >
                      <strong>
                        Review Remark
                      </strong>
                    </td>

                    <td
                      style="
                        border:1px solid #ddd;
                        padding:8px;
                      "
                    >
                      ${
                        reviewRemark ||
                        "-"
                      }
                    </td>
                  </tr>
                </table>

                ${
                  action ===
                  "approved"
                    ? `
                      <p>
                        The leave has
                        been reverted
                        and the applicable
                        leave balance has
                        been restored.
                      </p>
                    `
                    : `
                      <p>
                        The original leave
                        application remains
                        unchanged.
                      </p>
                    `
                }

                <p>
                  Regards,<br />
                  Valencia RMS
                </p>
              </div>
            `,
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

          recipients: [
            leave.employee_email,
          ],
        };
      } catch (
        emailError
      ) {
        console.error(
          "Leave revert result email failed:",
          emailError
            .message
        );

        emailResult = {
          sent: false,

          skipped: false,

          error:
            emailError
              .message,
        };
      }

      return res.json({
        success: true,

        message:
          action ===
          "approved"
            ? "Leave reverted successfully. Employee leave balance has been restored."
            : "Leave revert request rejected.",

        leave_id:
          leaveId,

        original_leave_status:
          leaveStatus,

        revert_status:
          action,

        revert_review_remark:
          reviewRemark,

        balance:
          updatedBalance,

        email:
          emailResult,
      });
    } catch (error) {
      if (connection) {
        try {
          await connection
            .rollback();
        } catch {
          // Ignore rollback error.
        }
      }

      console.error(
        "Review leave revert request error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to review leave revert request.",

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

const furtherApproveLeaveApplication = async (
  req,
  res
) => {
  let connection;

  try {
    connection =
      await db.getConnection();

    const adminUserId =
      req.user.user_id;

    const leaveId =
      Number(
        req.params.leaveId
      );

      const escalationRemark = String(
  req.body?.review_remark ||
  req.body?.remark ||
  ""
).trim();

    if (
      !Number.isFinite(
        leaveId
      ) ||
      leaveId <= 0
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Invalid leave application ID.",
        });
    }

    const { admin, error } =
      await getLoggedInAdmin(
        adminUserId
      );

    if (error) {
      return res
        .status(error.status)
        .json({
          success: false,
          message:
            error.message,
        });
    }

    /*
    Only actual Department Admins
    can send a leave for
    Further Approval.
    */

    const roleName = String(
      admin.role_name || ""
    )
      .trim()
      .toLowerCase();

    const adminEmail = String(
  admin.email || ""
)
  .trim()
  .toLowerCase();

  if (
  !admin.is_global_leave_approver &&
  (
    roleName !== "admin" ||
    adminEmail === RATHIKA_LEAVE_EMAIL
  )
) {
  return res
    .status(403)
    .json({
      success: false,
      message:
        "You are not authorized to escalate this leave application.",
    });
}

 await connection
  .beginTransaction();


    const escalationWhereParts = [
  "la.leave_id = ?",
];

const escalationValues = [
  leaveId,
];

if (
  admin.is_global_leave_approver
) {
  escalationWhereParts.push(`
    LOWER(
      TRIM(
        employee_role.role_name
      )
    ) IN (
      'employee',
      'admin',
      'administrator'
    )
  `);
} else {
  escalationWhereParts.push(`
    LOWER(
      TRIM(
        employee_role.role_name
      )
    ) = 'employee'
  `);

  escalationWhereParts.push(`
    (
      EXISTS (
        SELECT 1
        FROM user_departments employee_ud
        WHERE employee_ud.user_id = employee.user_id
          AND employee_ud.department_id IN (
            SELECT admin_ud.department_id
            FROM user_departments admin_ud
            WHERE admin_ud.user_id = ?
          )
      )

      OR employee.department_id IN (
        SELECT admin_ud.department_id
        FROM user_departments admin_ud
        WHERE admin_ud.user_id = ?
      )

      OR EXISTS (
        SELECT 1
        FROM user_departments employee_ud
        WHERE employee_ud.user_id = employee.user_id
          AND employee_ud.department_id = ?
      )

      OR employee.department_id = ?
    )
  `);

  escalationValues.push(
    admin.user_id,
    admin.user_id,
    admin.department_id,
    admin.department_id
  );
}

    const [leaveRows] =
      await connection.query(
        `
        SELECT
          la.leave_id,
          la.employee_id,
          la.leave_type,
          la.total_days,
          la.reason,
          la.status,
          la.escalated_for_approval,

          COALESCE(
  la.revert_status,
  'none'
) AS revert_status,

          DATE_FORMAT(
            la.start_date,
            '%Y-%m-%d'
          ) AS start_date,

          DATE_FORMAT(
            la.end_date,
            '%Y-%m-%d'
          ) AS end_date,

          employee.full_name
            AS employee_name,

         employee.email
  AS employee_email,

employee.department_id
  AS employee_department_id,

d.department_name,

          employee_role.role_name
            AS applicant_role

        FROM leave_applications la

        INNER JOIN users employee
          ON employee.user_id =
             la.employee_id

        INNER JOIN roles employee_role
          ON employee_role.role_id =
             employee.role_id

        LEFT JOIN departments d
          ON d.department_id =
             employee.department_id

       WHERE
  ${escalationWhereParts.join(
    " AND "
  )}

        LIMIT 1

        FOR UPDATE
        `,
        escalationValues
      );


    if (!leaveRows.length) {
      await connection.rollback();

      return res
        .status(404)
        .json({
          success: false,
          message:
            "Leave application not found.",
        });
    }

    const leave =
      leaveRows[0];

      const revertStatus =
  String(
    leave.revert_status ||
    "none"
  )
    .trim()
    .toLowerCase();

if (
  revertStatus === "pending"
) {
  await connection.rollback();

  return res
    .status(409)
    .json({
      success: false,

      message:
        "This leave has a pending revert request and cannot be escalated.",
    });
}

if (
  revertStatus === "approved"
) {
  await connection.rollback();

  return res
    .status(400)
    .json({
      success: false,

      message:
        "This leave has already been reverted.",
    });
}

     

    if (
      String(
        leave.status || ""
      )
        .trim()
        .toLowerCase() !==
      "pending"
    ) {
      await connection.rollback();

      return res
        .status(400)
        .json({
          success: false,
          message:
            `This leave application is already ${leave.status}.`,
        });
    }

    if (
      Number(
        leave.escalated_for_approval
      ) === 1
    ) {
      await connection.rollback();

      return res
        .status(400)
        .json({
          success: false,
          message:
            "This leave application has already been escalated.",
        });
    }

    /*
    Mark as escalated.
    Status remains pending.
    */

    await connection.query(
  `
  UPDATE leave_applications

  SET
    escalated_for_approval = 1,
    escalated_by = ?,
    escalated_at = NOW(),
    escalation_remark = ?

  WHERE leave_id = ?
  `,
  [
    admin.user_id,
    escalationRemark || null,
    leaveId,
  ]
);

    /*
    Create fresh review token
for escalated leave review.
    */

    const reviewToken =
      crypto
        .randomBytes(32)
        .toString("hex");

    await connection.query(
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
        leaveId,
        reviewToken,
      ]
    );

    /*
    Get all other Admins
    allocated to same department.
    */

    const [adminRows] =
  await connection.query(
    `
      SELECT DISTINCT
        u.email

      FROM users u

      INNER JOIN roles r
        ON r.role_id = u.role_id

      WHERE
        LOWER(
          TRIM(r.role_name)
        ) = 'admin'

        AND LOWER(
          COALESCE(
            u.status,
            'active'
          )
        ) = 'active'

        AND u.email IS NOT NULL

        AND TRIM(u.email) != ''

        AND (
          EXISTS (
            SELECT 1
            FROM user_departments admin_ud
            WHERE admin_ud.user_id = u.user_id
              AND admin_ud.department_id IN (
                SELECT employee_ud.department_id
                FROM user_departments employee_ud
                WHERE employee_ud.user_id = ?
              )
          )

          OR u.department_id IN (
            SELECT employee_ud.department_id
            FROM user_departments employee_ud
            WHERE employee_ud.user_id = ?
          )

          OR EXISTS (
            SELECT 1
            FROM user_departments admin_ud
            WHERE admin_ud.user_id = u.user_id
              AND admin_ud.department_id = ?
          )

          OR u.department_id = ?
        )
    `,
    [
      leave.employee_id,
      leave.employee_id,
      leave.employee_department_id,
      leave.employee_department_id,
    ]
  );

    const otherAdminEmails =
      adminRows
        .map(
          (item) =>
            String(
              item.email || ""
            )
              .trim()
              .toLowerCase()
        )
        .filter(Boolean);

     const applicantRole = String(
  leave.applicant_role || ""
)
  .trim()
  .toLowerCase();

const toRecipients = [
  ...new Set(
    [
      PREMAL_LEAVE_EMAIL,

      ...(
        applicantRole === "employee"
          ? otherAdminEmails
          : []
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

const ccRecipients = [
  RATHIKA_LEAVE_EMAIL,
].filter(
  (email) =>
    email &&
    !toRecipients.includes(
      String(email)
        .trim()
        .toLowerCase()
    )
);

  

    const leaveLabel =
      getLeaveLabel(
        leave.leave_type
      );

    const emailSubject =
      `Escalated Leave Request - ${leaveLabel} - ${leave.employee_name}`;

    const reviewUrl =
      `https://myvol.in/leave-review/${reviewToken}`;

    const text = `
Dear Sir,

A leave application has been escalated through Valencia RMS and requires your review.

Employee Name: ${leave.employee_name || "-"}
Employee Email: ${leave.employee_email || "-"}
Department: ${leave.department_name || "-"}

Leave Type: ${leaveLabel}
From Date: ${leave.start_date}
To Date: ${leave.end_date}
Leave Days: ${leave.total_days}

Reason:
${leave.reason || "-"}

The leave application is currently Pending and requires your review.

Review Leave Request:
${reviewUrl}

Regards,
Valencia RMS
`;

    const html = `
      <div style="
        font-family:Arial,sans-serif;
        line-height:1.6;
        color:#111827;
      ">

        <h2 style="
          color:#ff5733;
          margin-bottom:8px;
        ">
          Escalated Leave Request
        </h2>

        <p>
          Dear Sir,
        </p>

        <p>
          A leave application has been
<strong>escalated</strong>
through Valencia RMS and requires your review.
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
              <strong>Employee</strong>
            </td>

            <td style="
              padding:8px;
              border:1px solid #dddddd;
            ">
              ${leave.employee_name || "-"}
            </td>
          </tr>

          <tr>
            <td style="
              padding:8px;
              border:1px solid #dddddd;
            ">
              <strong>Email</strong>
            </td>

            <td style="
              padding:8px;
              border:1px solid #dddddd;
            ">
              ${leave.employee_email || "-"}
            </td>
          </tr>

          <tr>
            <td style="
              padding:8px;
              border:1px solid #dddddd;
            ">
              <strong>Department</strong>
            </td>

            <td style="
              padding:8px;
              border:1px solid #dddddd;
            ">
              ${leave.department_name || "-"}
            </td>
          </tr>

          <tr>
            <td style="
              padding:8px;
              border:1px solid #dddddd;
            ">
              <strong>Leave Type</strong>
            </td>

            <td style="
              padding:8px;
              border:1px solid #dddddd;
            ">
              ${leaveLabel}
            </td>
          </tr>

          <tr>
            <td style="
              padding:8px;
              border:1px solid #dddddd;
            ">
              <strong>From</strong>
            </td>

            <td style="
              padding:8px;
              border:1px solid #dddddd;
            ">
              ${leave.start_date}
            </td>
          </tr>

          <tr>
            <td style="
              padding:8px;
              border:1px solid #dddddd;
            ">
              <strong>To</strong>
            </td>

            <td style="
              padding:8px;
              border:1px solid #dddddd;
            ">
              ${leave.end_date}
            </td>
          </tr>

          <tr>
            <td style="
              padding:8px;
              border:1px solid #dddddd;
            ">
              <strong>Leave Days</strong>
            </td>

            <td style="
              padding:8px;
              border:1px solid #dddddd;
            ">
              ${leave.total_days}
            </td>
          </tr>

          <tr>
            <td style="
              padding:8px;
              border:1px solid #dddddd;
            ">
              <strong>Reason</strong>
            </td>

            <td style="
              padding:8px;
              border:1px solid #dddddd;
            ">
              ${leave.reason || "-"}
            </td>
          </tr>

        </table>

        <p>
          This application is currently
          <strong>Pending – Escalated</strong>.
        </p>

        <table
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="margin:20px 0;"
        >
          <tr>
            <td style="
              background:#ff5733;
              border-radius:8px;
              text-align:center;
            ">
              <a
                href="${reviewUrl}"
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

    await connection.commit();

    let emailResult = {
      sent: false,
      skipped: false,
    };

    try {
      const mailResponse =
        await sendMail({
          to:
  toRecipients,

cc:
  ccRecipients,

          subject:
            emailSubject,

          text,

          html,

          replyTo:
            leave.employee_email ||
            undefined,
        });

      emailResult = {
        sent:
          !mailResponse?.skipped,

        skipped:
          Boolean(
            mailResponse?.skipped
          ),

        messageId:
          mailResponse?.messageId ||
          null,

        recipients:
  toRecipients,

        cc:
          ccRecipients,
      };
    } catch (emailError) {
      console.error(
        "Further approval email failed:",
        emailError
      );

      emailResult = {
        sent: false,
        skipped: false,
        error:
          emailError.message,
      };
    }

    return res.json({
      success: true,

      message:
        "Leave application escalated successfully.",

      leave_id:
        leaveId,

      status:
        "pending",

      escalated_for_approval:
        true,

      email:
        emailResult,
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        // Ignore rollback error.
      }
    }

    console.error(
      "Further approval error:",
      error
    );

    return res
      .status(500)
      .json({
        success: false,
        message:
          "Failed to escalate leave application.",
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

module.exports = {
  getAdminLeaveApplications,
  reviewLeaveApplication,
  reviewLeaveRevertRequest,
  furtherApproveLeaveApplication,
};