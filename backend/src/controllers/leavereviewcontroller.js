const db = require("../config/db");

const GLOBAL_LEAVE_APPROVER_EMAILS = [
  "manish@valencianutrition.com",
  "premal.mehta@valencianutrition.com",
];

const getLeaveReview = async (req, res) => {
  try {
    const { token } = req.params;

    const [rows] = await db.query(
      `
      SELECT
        la.*,

        u.full_name AS employee_name,
        u.email AS employee_email,
        u.department_id AS employee_department_id,

        d.department_name,

        r.role_name AS employee_role,

        reviewer.full_name AS reviewed_by_name,
        reviewer.email AS reviewed_by_email

      FROM leave_review_tokens lrt

      INNER JOIN leave_applications la
        ON la.leave_id = lrt.leave_id

      INNER JOIN users u
        ON u.user_id = la.employee_id

      LEFT JOIN departments d
        ON d.department_id = u.department_id

      LEFT JOIN roles r
        ON r.role_id = u.role_id

      LEFT JOIN users reviewer
        ON reviewer.user_id = la.reviewed_by

      WHERE
        lrt.token = ?
        AND lrt.expires_at > NOW()

      LIMIT 1
      `,
      [token]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Invalid or expired leave review link.",
      });
    }

    const leave = rows[0];

    return res.json({
      success: true,
      leave,
      global_approver_emails: GLOBAL_LEAVE_APPROVER_EMAILS,
    });
  } catch (error) {
    console.error("Get leave review error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load leave request.",
      error: error.message,
    });
  }
};

module.exports = {
  getLeaveReview,
};