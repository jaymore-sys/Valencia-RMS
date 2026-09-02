const db = require("../config/db");

const getLeaveReview = async (req, res) => {
  try {
    const { token } = req.params;

    const [rows] = await db.query(
      `
      SELECT
        la.*,
        u.full_name AS employee_name,
        u.email AS employee_email
      FROM leave_review_tokens lrt
      INNER JOIN leave_applications la
        ON la.leave_id = lrt.leave_id
      INNER JOIN users u
        ON u.user_id = la.employee_id
      WHERE
        lrt.token = ?
        AND lrt.expires_at > NOW()
      LIMIT 1
      `,
      [token]
    );

    if (!rows.length) {
      return res.status(404).json({
        success:false,
        message:"Invalid or expired leave review link."
      });
    }

    return res.json({
      success:true,
      leave:rows[0]
    });

  } catch(error) {
    return res.status(500).json({
      success:false,
      message:"Failed to load leave request.",
      error:error.message
    });
  }
};

module.exports = {
  getLeaveReview
};
