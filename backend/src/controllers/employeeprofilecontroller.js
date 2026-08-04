const db = require("../config/db");

const getLoggedInUserId = (req) => {
  return Number(req.user?.user_id || req.user?.id || req.userId || 0);
};

const ensureEmployeeProfilesTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS employee_profiles (
      profile_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      skills TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  const [columns] = await db.query("SHOW COLUMNS FROM employee_profiles");

  const columnNames = columns.map((column) => column.Field);

  if (!columnNames.includes("skills")) {
    await db.query("ALTER TABLE employee_profiles ADD COLUMN skills TEXT NULL");
  }
};

const getEmployeeProfile = async (req, res) => {
  try {
    await ensureEmployeeProfilesTable();

    const userId = getLoggedInUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. User not found.",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        u.user_id,
        u.employee_code,
        u.full_name,
        u.email,
        u.phone,
        u.designation,
        u.status,
        r.role_name,
        d.department_name,
        COALESCE(ep.skills, '') AS skills
      FROM users u
      LEFT JOIN roles r ON r.role_id = u.role_id
      LEFT JOIN departments d ON d.department_id = u.department_id
      LEFT JOIN employee_profiles ep ON ep.user_id = u.user_id
      WHERE u.user_id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Employee profile not found.",
      });
    }

    return res.status(200).json({
      success: true,
      profile: rows[0],
      employee: rows[0],
    });
  } catch (error) {
    console.error("Get employee profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load employee profile.",
      error: error.message,
      sqlMessage: error.sqlMessage || null,
    });
  }
};

const updateEmployeeSkills = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await ensureEmployeeProfilesTable();

    const userId = getLoggedInUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. User not found.",
      });
    }

    const skills = String(req.body.skills || "").trim();

    await connection.beginTransaction();

    const [existingRows] = await connection.query(
      `
      SELECT profile_id
      FROM employee_profiles
      WHERE user_id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (existingRows.length) {
      await connection.query(
        `
        UPDATE employee_profiles
        SET skills = ?
        WHERE user_id = ?
        `,
        [skills, userId]
      );
    } else {
      await connection.query(
        `
        INSERT INTO employee_profiles (user_id, skills)
        VALUES (?, ?)
        `,
        [userId, skills]
      );
    }

    await connection.commit();

    const [profileRows] = await db.query(
      `
      SELECT
        u.user_id,
        u.employee_code,
        u.full_name,
        u.email,
        u.phone,
        u.designation,
        u.status,
        r.role_name,
        d.department_name,
        COALESCE(ep.skills, '') AS skills
      FROM users u
      LEFT JOIN roles r ON r.role_id = u.role_id
      LEFT JOIN departments d ON d.department_id = u.department_id
      LEFT JOIN employee_profiles ep ON ep.user_id = u.user_id
      WHERE u.user_id = ?
      LIMIT 1
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      message: "Skills saved successfully.",
      profile: profileRows[0] || null,
      skills,
    });
  } catch (error) {
    await connection.rollback();

    console.error("Update employee skills error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to save skills.",
      error: error.message,
      sqlMessage: error.sqlMessage || null,
    });
  } finally {
    connection.release();
  }
};

module.exports = {
  getEmployeeProfile,
  getProfile: getEmployeeProfile,
  getMe: getEmployeeProfile,
  updateEmployeeSkills,
  updateSkills: updateEmployeeSkills,
};