const db = require("../config/db");

/*
========================================================
GET ADMINISTRATOR DEPARTMENT LEAVES
GET /api/administrator-leaves/department
========================================================
*/

const getAdministratorDepartmentLeaves = async (req, res) => {
  try {
    const administratorId = req.user.user_id;

    /*
    --------------------------------------------------------
    FIND ADMINISTRATOR DEPARTMENT
    --------------------------------------------------------
    */

    const [administratorRows] = await db.query(
      `
      SELECT
        u.user_id,
        u.full_name,
        u.email,
        u.department_id,
        d.department_name

      FROM users u

      LEFT JOIN departments d
        ON d.department_id = u.department_id

      WHERE u.user_id = ?

      LIMIT 1
      `,
      [administratorId]
    );

    if (!administratorRows.length) {
      return res.status(404).json({
        success: false,
        message: "Administrator account not found.",
      });
    }

    const administrator = administratorRows[0];

    if (!administrator.department_id) {
      return res.status(400).json({
        success: false,
        message: "Administrator department is not assigned.",
      });
    }

    /*
    --------------------------------------------------------
    GET DEPARTMENT LEAVE APPLICATIONS

    Excludes Administrator's own leave because that is
    already shown under My Leave.
    --------------------------------------------------------
    */

    const [leaves] = await db.query(
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

        DATE_FORMAT(
          la.applied_at,
          '%Y-%m-%d %H:%i:%s'
        ) AS applied_at,

        DATE_FORMAT(
          la.reviewed_at,
          '%Y-%m-%d %H:%i:%s'
        ) AS reviewed_at,

        employee.full_name AS employee_name,
        employee.email AS employee_email,
        employee.employee_code,
        employee.designation,
        employee.department_id,

        department.department_name,

        role.role_name AS employee_role,

        reviewer.full_name AS reviewed_by_name,
        reviewer.email AS reviewed_by_email

      FROM leave_applications la

      INNER JOIN users employee
        ON employee.user_id = la.employee_id

      LEFT JOIN departments department
        ON department.department_id =
           employee.department_id

      LEFT JOIN roles role
        ON role.role_id =
           employee.role_id

      LEFT JOIN users reviewer
        ON reviewer.user_id =
           la.reviewed_by

      WHERE
        employee.department_id = ?

        AND employee.user_id != ?

      ORDER BY
        CASE
          WHEN la.status = 'pending' THEN 1
          WHEN la.status = 'approved' THEN 2
          WHEN la.status = 'rejected' THEN 3
          ELSE 4
        END,

        la.applied_at DESC,
        la.leave_id DESC
      `,
      [
        administrator.department_id,
        administratorId,
      ]
    );

    return res.json({
      success: true,

      administrator: {
        user_id: administrator.user_id,
        full_name: administrator.full_name,
        email: administrator.email,
        department_id: administrator.department_id,
        department_name: administrator.department_name,
      },

      leaves: leaves.map((leave) => ({
        ...leave,
        total_days: Number(
          leave.total_days || 0
        ),
      })),
    });

  } catch (error) {
    console.error(
      "Get Administrator department leaves error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch Administrator department leave applications.",
      error: error.message,
      sqlMessage:
        error.sqlMessage || null,
    });
  }
};

module.exports = {
  getAdministratorDepartmentLeaves,
};