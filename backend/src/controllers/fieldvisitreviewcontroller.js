const db = require("../config/db");

const getFieldVisitReview = async (req, res) => {
  try {
    const { token } = req.params;

    const [rows] = await db.query(
      `
      SELECT
        fv.*,
        u.full_name AS employee_name,
        u.email AS employee_email
      FROM field_visit_review_tokens fvt
      INNER JOIN employee_field_visits fv
        ON fv.visit_id = fvt.visit_id
      INNER JOIN users u
        ON u.user_id = fv.employee_id
      WHERE
        fvt.token = ?
        AND fvt.expires_at > NOW()
      LIMIT 1
      `,
      [token]
    );

    if (!rows.length) {
      return res.status(404).json({
        success:false,
        message:"Invalid or expired field visit review link."
      });
    }

    return res.json({
      success:true,
      fieldVisit: rows[0]
    });

  } catch(error) {
    return res.status(500).json({
      success:false,
      message:"Failed to load field visit.",
      error:error.message
    });
  }
};

module.exports = {
  getFieldVisitReview
};
