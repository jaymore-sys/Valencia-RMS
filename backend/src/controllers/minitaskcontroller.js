const db = require("../config/db");

/* =========================================================
   LOGGED-IN USER
========================================================= */

const getLoggedInUser = async (req) => {
  const loggedInUserId =
    req.user?.user_id || req.user?.id || req.user?.userId || req.user?.uid;

  if (!loggedInUserId) {
    return {
      error: {
        status: 401,
        message: "Unauthorized. User not found in token.",
      },
    };
  }

  const [rows] = await db.query(
    `
      SELECT
        u.user_id,
        u.full_name,
        u.email,
        u.employee_code,
        u.department_id,
        u.designation,
        r.role_name,
        d.department_name
      FROM users u
      LEFT JOIN roles r
        ON r.role_id = u.role_id
      LEFT JOIN departments d
        ON d.department_id = u.department_id
      WHERE u.user_id = ?
      LIMIT 1
    `,
    [loggedInUserId]
  );

  if (!rows.length) {
    return {
      error: {
        status: 404,
        message: "Logged-in user not found.",
      },
    };
  }

  return {
    user: rows[0],
  };
};

/* =========================================================
   HELPERS
========================================================= */

const timeToMinutes = (timeValue) => {
  const value = String(timeValue || "").trim();

  const parts = value.split(":").map(Number);

  if (
    parts.length < 2 ||
    Number.isNaN(parts[0]) ||
    Number.isNaN(parts[1])
  ) {
    return null;
  }

  const hours = parts[0];
  const minutes = parts[1];

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
};

const isValidDateString = (value) => {
  const cleanValue = String(value || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) {
    return false;
  }

  const [year, month, day] = cleanValue.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};

const buildDateTime = (dateValue, timeValue) => {
  const cleanDate = String(dateValue || "").trim();
  const cleanTime = String(timeValue || "").trim();

  if (!isValidDateString(cleanDate)) {
    return null;
  }

  const timeMinutes = timeToMinutes(cleanTime);

  if (timeMinutes === null) {
    return null;
  }

  const [year, month, day] = cleanDate.split("-").map(Number);

  const hours = Math.floor(timeMinutes / 60);
  const minutes = timeMinutes % 60;

  const dateTime = new Date(
    year,
    month - 1,
    day,
    hours,
    minutes,
    0,
    0
  );

  if (Number.isNaN(dateTime.getTime())) {
    return null;
  }

  return dateTime;
};

const calculateTotalMinutes = (
  startDate,
  startTime,
  endDate,
  endTime
) => {
  const startDateTime = buildDateTime(startDate, startTime);
  const endDateTime = buildDateTime(endDate, endTime);

  if (!startDateTime || !endDateTime) {
    return null;
  }

  const difference = endDateTime.getTime() - startDateTime.getTime();

  if (difference <= 0) {
    return null;
  }

  return Math.floor(difference / 60000);
};

/*
  Returns all departments assigned to the user.

  This keeps users.department_id as the legacy/primary department,
  while also respecting the user_departments mapping.
*/
const getUserDepartmentIds = async (userId, primaryDepartmentId = null) => {
  const [rows] = await db.query(
    `
      SELECT DISTINCT department_id
      FROM (
        SELECT ud.department_id
        FROM user_departments ud
        WHERE ud.user_id = ?

        UNION

        SELECT u.department_id
        FROM users u
        WHERE u.user_id = ?
          AND u.department_id IS NOT NULL
      ) departments
      WHERE department_id IS NOT NULL
    `,
    [userId, userId]
  );

  const departmentIds = rows
    .map((row) => Number(row.department_id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (
    primaryDepartmentId &&
    !departmentIds.includes(Number(primaryDepartmentId))
  ) {
    departmentIds.push(Number(primaryDepartmentId));
  }

  return [...new Set(departmentIds)];
};

const miniTaskSelectFields = `
  mt.mini_task_id,
  mt.employee_id,
  mt.department_id,
  mt.division,
  mt.mini_task_title,
  mt.mini_task_description,

  DATE_FORMAT(mt.task_date, '%Y-%m-%d') AS task_date,
  DATE_FORMAT(
    COALESCE(mt.start_date, mt.task_date),
    '%Y-%m-%d'
  ) AS start_date,
  DATE_FORMAT(
    COALESCE(mt.end_date, mt.task_date),
    '%Y-%m-%d'
  ) AS end_date,

  TIME_FORMAT(mt.start_time, '%H:%i') AS start_time,
  TIME_FORMAT(mt.end_time, '%H:%i') AS end_time,

  mt.total_minutes,
  mt.status,

  mt.edit_remark,
  mt.edited_at,

  mt.paused_main_task_id,
  mt.timer_started_at,
  mt.timer_ended_at,

  mt.created_at,
  mt.updated_at,

  u.full_name AS employee_name,
  u.email AS employee_email,
  u.employee_code,
  u.designation,
  d.department_name
`;

/* =========================================================
   CREATE EMPLOYEE MINI TASK
========================================================= */

const createEmployeeMiniTask = async (req, res) => {
  try {
    const { user, error } = await getLoggedInUser(req);

    if (error) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    const {
      mini_task_title,
      mini_task_description,
      division,
      start_date,
      end_date,
      task_date,
      start_time,
      end_time,
    } = req.body;

    const cleanTitle = String(mini_task_title || "").trim();
    const cleanDescription = String(
      mini_task_description || ""
    ).trim();

    const cleanDivision = String(division || "").trim();

    /*
      task_date remains supported for backward compatibility.

      New frontend should send start_date and end_date.
    */
    const cleanStartDate = String(
      start_date || task_date || ""
    ).trim();

    const cleanEndDate = String(
      end_date || start_date || task_date || ""
    ).trim();

    const cleanStartTime = String(start_time || "").trim();
    const cleanEndTime = String(end_time || "").trim();

    if (!cleanTitle) {
      return res.status(400).json({
        message: "Mini task title is required.",
      });
    }

    if (!cleanDivision) {
      return res.status(400).json({
        message: "Division is required.",
      });
    }

    if (!cleanStartDate) {
      return res.status(400).json({
        message: "Start date is required.",
      });
    }

    if (!cleanEndDate) {
      return res.status(400).json({
        message: "End date is required.",
      });
    }

    if (!isValidDateString(cleanStartDate)) {
      return res.status(400).json({
        message: "Invalid start date.",
      });
    }

    if (!isValidDateString(cleanEndDate)) {
      return res.status(400).json({
        message: "Invalid end date.",
      });
    }

    if (!cleanStartTime) {
      return res.status(400).json({
        message: "Start time is required.",
      });
    }

    if (!cleanEndTime) {
      return res.status(400).json({
        message: "End time is required.",
      });
    }

    if (
      timeToMinutes(cleanStartTime) === null ||
      timeToMinutes(cleanEndTime) === null
    ) {
      return res.status(400).json({
        message: "Invalid start time or end time.",
      });
    }

    const totalMinutes = calculateTotalMinutes(
      cleanStartDate,
      cleanStartTime,
      cleanEndDate,
      cleanEndTime
    );

    if (totalMinutes === null) {
      return res.status(400).json({
        message:
          "Mini task end date and time must be after the start date and time.",
      });
    }

    const [result] = await db.query(
      `
        INSERT INTO mini_tasks (
          employee_id,
          department_id,
          division,
          mini_task_title,
          mini_task_description,
          start_date,
          end_date,
          task_date,
          start_time,
          end_time,
          total_minutes,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'logged')
      `,
      [
        user.user_id,
        user.department_id || null,
        cleanDivision,
        cleanTitle,
        cleanDescription || null,
        cleanStartDate,
        cleanEndDate,

        // Legacy compatibility
        cleanStartDate,

        cleanStartTime,
        cleanEndTime,
        totalMinutes,
      ]
    );

    const [rows] = await db.query(
      `
        SELECT
          ${miniTaskSelectFields}
        FROM mini_tasks mt
        LEFT JOIN users u
          ON u.user_id = mt.employee_id
        LEFT JOIN departments d
          ON d.department_id = mt.department_id
        WHERE mt.mini_task_id = ?
        LIMIT 1
      `,
      [result.insertId]
    );

    return res.status(201).json({
      message: "Mini task added successfully.",
      mini_task: rows[0],
    });
  } catch (error) {
    console.error("Create employee mini task error:", error);

    return res.status(500).json({
      message: "Failed to add mini task.",
      error: error.message,
      sqlMessage: error.sqlMessage || null,
    });
  }
};

/* =========================================================
   GET MY MINI TASKS
========================================================= */

const getMyMiniTasks = async (req, res) => {
  try {
    const { user, error } = await getLoggedInUser(req);

    if (error) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    const [rows] = await db.query(
      `
        SELECT
          ${miniTaskSelectFields}
        FROM mini_tasks mt
        LEFT JOIN users u
          ON u.user_id = mt.employee_id
        LEFT JOIN departments d
          ON d.department_id = mt.department_id
        WHERE mt.employee_id = ?
        ORDER BY
          COALESCE(mt.start_date, mt.task_date) DESC,
          mt.start_time DESC,
          mt.mini_task_id DESC
      `,
      [user.user_id]
    );

    return res.status(200).json({
      total: rows.length,
      mini_tasks: rows,
    });
  } catch (error) {
    console.error("Get my mini tasks error:", error);

    return res.status(500).json({
      message: "Failed to fetch mini tasks.",
      error: error.message,
      sqlMessage: error.sqlMessage || null,
    });
  }
};

/* =========================================================
   UPDATE / EDIT EMPLOYEE MINI TASK
========================================================= */

const updateEmployeeMiniTask = async (req, res) => {
  let connection;

  try {
    const { user, error } = await getLoggedInUser(req);

    if (error) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    const miniTaskId = Number(req.params.miniTaskId);

    if (!miniTaskId) {
      return res.status(400).json({
        message: "Mini task ID is required.",
      });
    }

    const {
      mini_task_title,
      mini_task_description,
      division,
      start_date,
      end_date,
      start_time,
      end_time,
      edit_remark,
    } = req.body;

    const cleanTitle = String(mini_task_title || "").trim();
    const cleanDescription = String(
      mini_task_description || ""
    ).trim();
    const cleanDivision = String(division || "").trim();
    const cleanStartDate = String(start_date || "").trim();
    const cleanEndDate = String(end_date || "").trim();
    const cleanStartTime = String(start_time || "").trim();
    const cleanEndTime = String(end_time || "").trim();
    const cleanEditRemark = String(edit_remark || "").trim();

    if (!cleanTitle) {
      return res.status(400).json({
        message: "Mini task title is required.",
      });
    }

    if (!cleanDivision) {
      return res.status(400).json({
        message: "Division is required.",
      });
    }

    if (!isValidDateString(cleanStartDate)) {
      return res.status(400).json({
        message: "Valid start date is required.",
      });
    }

    if (!isValidDateString(cleanEndDate)) {
      return res.status(400).json({
        message: "Valid end date is required.",
      });
    }

    if (
      timeToMinutes(cleanStartTime) === null ||
      timeToMinutes(cleanEndTime) === null
    ) {
      return res.status(400).json({
        message: "Invalid start time or end time.",
      });
    }

    if (!cleanEditRemark) {
      return res.status(400).json({
        message: "Edit remark is required.",
      });
    }

    const totalMinutes = calculateTotalMinutes(
      cleanStartDate,
      cleanStartTime,
      cleanEndDate,
      cleanEndTime
    );

    if (totalMinutes === null) {
      return res.status(400).json({
        message:
          "Mini task end date and time must be after the start date and time.",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [existingRows] = await connection.query(
      `
        SELECT
          mini_task_id,
          employee_id,
          department_id,
          division,
          mini_task_title,
          mini_task_description,
          DATE_FORMAT(
            COALESCE(start_date, task_date),
            '%Y-%m-%d'
          ) AS start_date,
          DATE_FORMAT(
            COALESCE(end_date, task_date),
            '%Y-%m-%d'
          ) AS end_date,
          DATE_FORMAT(task_date, '%Y-%m-%d') AS task_date,
          TIME_FORMAT(start_time, '%H:%i') AS start_time,
          TIME_FORMAT(end_time, '%H:%i') AS end_time,
          total_minutes,
          status,
          paused_main_task_id,
          timer_started_at,
          timer_ended_at
        FROM mini_tasks
        WHERE mini_task_id = ?
          AND employee_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [miniTaskId, user.user_id]
    );

    if (!existingRows.length) {
      await connection.rollback();

      return res.status(404).json({
        message: "Mini task not found.",
      });
    }

    const existingTask = existingRows[0];

    /*
      Once automatic timer processing has started, changing the
      scheduled date/time could corrupt the Main Task pause/resume
      sequence.

      Other Mini Task details can still be edited.
    */
    if (
      existingTask.timer_started_at &&
      (
        existingTask.start_date !== cleanStartDate ||
        existingTask.end_date !== cleanEndDate ||
        existingTask.start_time !== cleanStartTime ||
        existingTask.end_time !== cleanEndTime
      )
    ) {
      await connection.rollback();

      return res.status(400).json({
        message:
          "Start/end date and time cannot be changed after this mini task has started.",
      });
    }

    const previousData = {
      mini_task_title: existingTask.mini_task_title,
      mini_task_description:
        existingTask.mini_task_description || "",
      division: existingTask.division || "",
      start_date: existingTask.start_date,
      end_date: existingTask.end_date,
      start_time: existingTask.start_time,
      end_time: existingTask.end_time,
      total_minutes: existingTask.total_minutes,
      status: existingTask.status,
    };

    const newData = {
      mini_task_title: cleanTitle,
      mini_task_description: cleanDescription,
      division: cleanDivision,
      start_date: cleanStartDate,
      end_date: cleanEndDate,
      start_time: cleanStartTime,
      end_time: cleanEndTime,
      total_minutes: totalMinutes,
      status: existingTask.status,
    };

    await connection.query(
      `
        UPDATE mini_tasks
        SET
          division = ?,
          mini_task_title = ?,
          mini_task_description = ?,
          start_date = ?,
          end_date = ?,
          task_date = ?,
          start_time = ?,
          end_time = ?,
          total_minutes = ?,
          edit_remark = ?,
          edited_at = NOW()
        WHERE mini_task_id = ?
          AND employee_id = ?
      `,
      [
        cleanDivision,
        cleanTitle,
        cleanDescription || null,
        cleanStartDate,
        cleanEndDate,

        // Keep legacy task_date synchronized with start date
        cleanStartDate,

        cleanStartTime,
        cleanEndTime,
        totalMinutes,
        cleanEditRemark,
        miniTaskId,
        user.user_id,
      ]
    );

    await connection.query(
      `
        INSERT INTO mini_task_edit_history (
          mini_task_id,
          employee_id,
          edit_remark,
          previous_data,
          new_data
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        miniTaskId,
        user.user_id,
        cleanEditRemark,
        JSON.stringify(previousData),
        JSON.stringify(newData),
      ]
    );

    await connection.commit();

    const [updatedRows] = await db.query(
      `
        SELECT
          ${miniTaskSelectFields}
        FROM mini_tasks mt
        LEFT JOIN users u
          ON u.user_id = mt.employee_id
        LEFT JOIN departments d
          ON d.department_id = mt.department_id
        WHERE mt.mini_task_id = ?
          AND mt.employee_id = ?
        LIMIT 1
      `,
      [miniTaskId, user.user_id]
    );

    return res.status(200).json({
      message: "Mini task updated successfully.",
      mini_task: updatedRows[0],
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Mini task edit rollback error:",
          rollbackError
        );
      }
    }

    console.error("Update employee mini task error:", error);

    return res.status(500).json({
      message: "Failed to update mini task.",
      error: error.message,
      sqlMessage: error.sqlMessage || null,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/* =========================================================
   GET MINI TASK EDIT HISTORY
========================================================= */

const getMiniTaskEditHistory = async (req, res) => {
  try {
    const { user, error } = await getLoggedInUser(req);

    if (error) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    const miniTaskId = Number(req.params.miniTaskId);

    if (!miniTaskId) {
      return res.status(400).json({
        message: "Mini task ID is required.",
      });
    }

    const [taskRows] = await db.query(
      `
        SELECT mini_task_id
        FROM mini_tasks
        WHERE mini_task_id = ?
          AND employee_id = ?
        LIMIT 1
      `,
      [miniTaskId, user.user_id]
    );

    if (!taskRows.length) {
      return res.status(404).json({
        message: "Mini task not found.",
      });
    }

    const [historyRows] = await db.query(
      `
        SELECT
          edit_id,
          mini_task_id,
          employee_id,
          edit_remark,
          previous_data,
          new_data,
          edited_at
        FROM mini_task_edit_history
        WHERE mini_task_id = ?
        ORDER BY edited_at DESC, edit_id DESC
      `,
      [miniTaskId]
    );

    return res.status(200).json({
      total: historyRows.length,
      edit_history: historyRows,
    });
  } catch (error) {
    console.error("Get mini task edit history error:", error);

    return res.status(500).json({
      message: "Failed to fetch mini task edit history.",
      error: error.message,
      sqlMessage: error.sqlMessage || null,
    });
  }
};

/* =========================================================
   GET ADMIN DEPARTMENT MINI TASKS
   MULTI-DEPARTMENT AWARE
========================================================= */

const getDepartmentMiniTasks = async (req, res) => {
  try {
    const { user, error } = await getLoggedInUser(req);

    if (error) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    const departmentIds = await getUserDepartmentIds(
      user.user_id,
      user.department_id
    );

    if (!departmentIds.length) {
      return res.status(400).json({
        message: "Admin department not found.",
      });
    }

    const placeholders = departmentIds.map(() => "?").join(",");

    /*
      Employee visibility is based on department overlap.

      We check user_departments plus the employee's legacy
      users.department_id so existing users continue to work.
    */
    const [rows] = await db.query(
      `
        SELECT
  ${miniTaskSelectFields}
        FROM mini_tasks mt
        LEFT JOIN users u
          ON u.user_id = mt.employee_id
        LEFT JOIN departments d
          ON d.department_id = mt.department_id

        WHERE EXISTS (
          SELECT 1
          FROM (
            SELECT ud.department_id
            FROM user_departments ud
            WHERE ud.user_id = mt.employee_id

            UNION

            SELECT u2.department_id
            FROM users u2
            WHERE u2.user_id = mt.employee_id
              AND u2.department_id IS NOT NULL
          ) employee_departments
          WHERE employee_departments.department_id
            IN (${placeholders})
        )

        ORDER BY
          COALESCE(mt.start_date, mt.task_date) DESC,
          mt.start_time DESC,
          mt.mini_task_id DESC
      `,
      departmentIds
    );

    return res.status(200).json({
      total: rows.length,
      department_ids: departmentIds,
      mini_tasks: rows,
    });
  } catch (error) {
    console.error("Get department mini tasks error:", error);

    return res.status(500).json({
      message: "Failed to fetch department mini tasks.",
      error: error.message,
      sqlMessage: error.sqlMessage || null,
    });
  }
};

/* =========================================================
   ADMIN MARK MINI TASK REVIEWED
   MULTI-DEPARTMENT AWARE
========================================================= */

const markMiniTaskReviewed = async (req, res) => {
  try {
    const { user, error } = await getLoggedInUser(req);

    if (error) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    const miniTaskId = Number(req.params.miniTaskId);

    if (!miniTaskId) {
      return res.status(400).json({
        message: "Mini task ID is required.",
      });
    }

    const departmentIds = await getUserDepartmentIds(
      user.user_id,
      user.department_id
    );

    if (!departmentIds.length) {
      return res.status(400).json({
        message: "Admin department not found.",
      });
    }

    const placeholders = departmentIds.map(() => "?").join(",");

    const [rows] = await db.query(
      `
        SELECT
          mt.mini_task_id,
          mt.employee_id
        FROM mini_tasks mt
        WHERE mt.mini_task_id = ?
          AND EXISTS (
            SELECT 1
            FROM (
              SELECT ud.department_id
              FROM user_departments ud
              WHERE ud.user_id = mt.employee_id

              UNION

              SELECT u.department_id
              FROM users u
              WHERE u.user_id = mt.employee_id
                AND u.department_id IS NOT NULL
            ) employee_departments
            WHERE employee_departments.department_id
              IN (${placeholders})
          )
        LIMIT 1
      `,
      [miniTaskId, ...departmentIds]
    );

    if (!rows.length) {
      return res.status(404).json({
        message:
          "Mini task not found for your department.",
      });
    }

    await db.query(
      `
        UPDATE mini_tasks
        SET status = 'reviewed'
        WHERE mini_task_id = ?
      `,
      [miniTaskId]
    );

    return res.status(200).json({
      message: "Mini task marked as reviewed.",
    });
  } catch (error) {
    console.error("Mark mini task reviewed error:", error);

    return res.status(500).json({
      message: "Failed to update mini task.",
      error: error.message,
      sqlMessage: error.sqlMessage || null,
    });
  }
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  createEmployeeMiniTask,
  getMyMiniTasks,
  updateEmployeeMiniTask,
  getMiniTaskEditHistory,
  getDepartmentMiniTasks,
  markMiniTaskReviewed,
};