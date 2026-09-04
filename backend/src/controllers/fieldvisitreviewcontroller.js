
const db = require("../config/db");

const getFieldVisitReview = async (req,res)=>{
  try{
    const { token } = req.params;

    const [rows] = await db.query(
      `
      SELECT
        fv.*,
        u.full_name AS employee_name,
        u.email AS employee_email,
        d.department_name
      FROM field_visit_review_tokens frt
      INNER JOIN employee_field_visits fv
        ON fv.visit_id = frt.visit_id
      INNER JOIN users u
        ON u.user_id = fv.employee_id
      LEFT JOIN departments d
        ON d.department_id = u.department_id
      WHERE
        frt.token = ?
        AND frt.expires_at > NOW()
      LIMIT 1
      `,
      [token]
    );

    if(!rows.length){
      return res.status(404).json({
        success:false,
        message:"Invalid or expired field visit review link."
      });
    }

    return res.json({
      success:true,
      visit:rows[0]
    });

  }catch(error){
    return res.status(500).json({
      success:false,
      message:"Failed to load field visit.",
      error:error.message
    });
  }
};

module.exports={
  getFieldVisitReview
};
