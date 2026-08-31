const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

/*
========================================================
FIXED LEAVE RECIPIENTS

Premal is NOT hard-coded here.

He will be automatically included only
when the employee belongs to the department
where Premal is registered as Admin.
========================================================
*/

const FIXED_LEAVE_RECIPIENTS = [
  "manish@valencianutrition.com",
  "rathika.haleangadi@valencianutrition.com",
];

/*
========================================================
LOGIN
========================================================
*/

const login = async (req, res) => {
  try {
    const {
      email,
      password,
    } = req.body;

    if (
      !email ||
      !password
    ) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "Email and password are required.",
        });
    }

    const [rows] =
      await db.query(
        `
        SELECT
          u.user_id,
          u.department_id,
          u.role_id,
          u.employee_code,
          u.full_name,
          u.email,
          u.password_hash,
          u.phone,
          u.designation,
          u.status,
          u.force_password_change,

          r.role_name,

          d.department_name

        FROM users u

        JOIN roles r
          ON r.role_id =
            u.role_id

        LEFT JOIN departments d
          ON d.department_id =
            u.department_id

        WHERE
          LOWER(u.email) =
          LOWER(?)

        LIMIT 1
        `,
        [email]
      );

    if (!rows.length) {
      return res
        .status(401)
        .json({
          success: false,

          message:
            "Invalid email or password.",
        });
    }

    const user =
      rows[0];

    if (
      user.status ===
      "blocked"
    ) {
      return res
        .status(403)
        .json({
          success: false,

          message:
            "Your account is blocked. Please contact administrator.",
        });
    }

    if (
      user.status ===
      "deleted"
    ) {
      return res
        .status(403)
        .json({
          success: false,

          message:
            "Your account has been deleted.",
        });
    }

    const isPasswordValid =
      await bcrypt.compare(
        password,
        user.password_hash
      );

    if (
      !isPasswordValid
    ) {
      return res
        .status(401)
        .json({
          success: false,

          message:
            "Invalid email or password.",
        });
    }

    const token =
      jwt.sign(
        {
          user_id:
            user.user_id,

          email:
            user.email,

          role_name:
            user.role_name,
        },

        process.env.JWT_SECRET ||
          "valencia_rms_secret_key",

        {
          expiresIn:
            "7d",
        }
      );

    delete user.password_hash;

    return res.json({
      success: true,

      message:
        "Login successful.",

      token,

      user,
    });
  } catch (error) {
    console.error(
      "LOGIN ERROR:",
      error
    );

    return res
      .status(500)
      .json({
        success: false,

        message:
          "Login failed.",

        error:
          error.message,
      });
  }
};

/*
========================================================
GET LOGGED-IN USER
========================================================
*/

const getMe = async (
  req,
  res
) => {
  return res.json({
    success: true,

    user:
      req.user,
  });
};

/*
========================================================
GET LEAVE MAIL INFORMATION

Used to prepare leave email recipient list.

Final recipients:
1. manish@valencianutrition.com
2. rathika.haleangadi@valencianutrition.com
3. Active Admin(s) of employee's department
========================================================
*/

const getLeaveMailInfo =
  async (req, res) => {
    try {
      const userId =
        req.user.user_id;

      /*
      ------------------------------
      LOGGED-IN USER
      ------------------------------
      */

      const [userRows] =
        await db.query(
          `
          SELECT
            u.user_id,
            u.full_name,
            u.email,
            u.employee_code,
            u.designation,
            u.department_id,

            d.department_name,

            r.role_name

          FROM users u

          JOIN roles r
            ON r.role_id =
              u.role_id

          LEFT JOIN departments d
            ON d.department_id =
              u.department_id

          WHERE
            u.user_id = ?

          LIMIT 1
          `,
          [userId]
        );

      if (
        !userRows.length
      ) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Logged-in user not found.",
          });
      }

      const user =
        userRows[0];

      /*
      ------------------------------
      FIXED RECIPIENTS
      ------------------------------
      */

      const recipients = [
        ...FIXED_LEAVE_RECIPIENTS,
      ];

      /*
      ======================================================
      FIND ACTIVE ADMIN(S)
      OF THIS EMPLOYEE'S DEPARTMENT
      ======================================================
      */

      if (
        user.department_id
      ) {
        const [departmentAdmins] =
          await db.query(
            `
            SELECT DISTINCT
              u.user_id,
              u.full_name,
              u.email

            FROM users u

            JOIN roles r
              ON r.role_id =
                u.role_id

            WHERE
              LOWER(
                COALESCE(
                  r.role_name,
                  ''
                )
              ) = 'admin'

              AND LOWER(
                COALESCE(
                  u.status,
                  'active'
                )
              ) = 'active'

              AND u.department_id = ?

              AND u.email IS NOT NULL

              AND TRIM(u.email) != ''

            ORDER BY
              u.full_name ASC,
              u.user_id ASC
            `,
            [
              user.department_id,
            ]
          );

        departmentAdmins.forEach(
          (admin) => {
            if (
              admin.email
            ) {
              recipients.push(
                admin.email
              );
            }
          }
        );
      }

      /*
      ======================================================
      REMOVE DUPLICATES

      Example IT:
      Manish
      Rathika
      Premal

      Example Finance:
      Manish
      Rathika
      Finance Admin
      ======================================================
      */

      const finalRecipients = [
        ...new Set(
          recipients
            .map((email) =>
              String(
                email || ""
              )
                .trim()
                .toLowerCase()
            )
            .filter(Boolean)
        ),
      ];

      const subject =
        "LEAVE APPLICATION";

      const body = `Dear Sir/Madam,

I would like to apply for leave.

Employee Name: ${user.full_name || ""}
Employee Code: ${user.employee_code || ""}
Department: ${user.department_name || ""}
Designation: ${user.designation || ""}
From Email: ${user.email || ""}

Leave Details:
`;

      return res.json({
        success: true,

        from_email:
          user.email,

        from_name:
          user.full_name,

        department_id:
          user.department_id,

        department_name:
          user.department_name,

        to:
          finalRecipients,

        subject,

        body,
      });
    } catch (error) {
      console.error(
        "Get leave mail info error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to prepare leave application email.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    }
  };

module.exports = {
  login,
  getMe,
  getLeaveMailInfo,
};