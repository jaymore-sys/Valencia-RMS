const db = require("../config/db");

const {
  sendProjectAssignmentEmails,
} = require("../utils/projectemailnotifications");

const {
  calculateEmployeeWorkTimeline,
  getIndiaNowLocalString,
} = require("../utils/worktimecalculator");

const escapeId = (value) => {
  return `\`${String(value).replace(/`/g, "``")}\``;
};

const getTableColumnInfo = async (tableName) => {
  const [columns] = await db.query(`SHOW COLUMNS FROM ${escapeId(tableName)}`);
  return columns;
};

const pickColumn = (columns, possibleNames) => {
  return possibleNames.find((name) => columns.includes(name));
};

const getColumnInfo = (columnInfo, columnName) => {
  return columnInfo.find((col) => col.Field === columnName);
};

const getSafeTodoStatus = (columnInfo, statusColumn) => {
  if (!statusColumn) return undefined;

  const statusInfo = getColumnInfo(columnInfo, statusColumn);

  if (!statusInfo) return "todo";

  const type = String(statusInfo.Type || "").toLowerCase();

  if (!type.startsWith("enum")) {
    return "todo";
  }

  const enumValues = type
    .replace(/^enum\(/, "")
    .replace(/\)$/, "")
    .split(",")
    .map((value) => value.trim().replace(/^'/, "").replace(/'$/, ""));

  const preferredValues = [
    "not_started",
    "todo",
    "to_do",
    "pending",
    "ongoing",
  ];

  const matchedValue = preferredValues.find((value) =>
    enumValues.includes(value)
  );

  if (matchedValue) {
    return matchedValue;
  }

  return enumValues[0] || "todo";
};

const insertIntoTable = async (tableName, data) => {
  const keys = Object.keys(data).filter(
    (key) => data[key] !== undefined && data[key] !== null
  );

  if (keys.length === 0) {
    throw new Error(`No insertable columns found for table ${tableName}`);
  }

  const sql = `
    INSERT INTO ${escapeId(tableName)}
    (${keys.map(escapeId).join(", ")})
    VALUES (${keys.map(() => "?").join(", ")})
  `;

  const values = keys.map((key) => data[key]);
  const [result] = await db.query(sql, values);

  return result;
};

const getLoggedInAdmin = async (req) => {
  const loggedInUserId =
    req.user?.user_id ||
    req.user?.id ||
    req.user?.uid ||
    req.user?.userId;

  if (!loggedInUserId) {
    return {
      error: {
        status: 401,
        message: "Unauthorized. User not found in token.",
      },
    };
  }

  const [adminRows] = await db.query(
    `
    SELECT 
      u.user_id,
      u.employee_code,
      u.full_name,
      u.email,
      u.phone,
      u.designation,
      u.department_id,
      u.role_id,
      r.role_name,
      d.department_name
    FROM users u
    LEFT JOIN roles r 
      ON u.role_id = r.role_id
    LEFT JOIN departments d 
      ON u.department_id = d.department_id
    WHERE u.user_id = ?
    LIMIT 1
    `,
    [loggedInUserId]
  );

  if (!adminRows || adminRows.length === 0) {
    return {
      error: {
        status: 404,
        message: "Logged-in admin user not found.",
      },
    };
  }

  const adminUser = adminRows[0];

  const adminRole = String(adminUser.role_name || "")
    .toLowerCase()
    .trim();

  if (adminRole !== "admin") {
    return {
      error: {
        status: 403,
        message: "Access denied. Admin role required.",
      },
    };
  }

  return {
    adminUser,
  };
};

const getAdminDepartmentUsers = async (req, res) => {
  try {
    const { adminUser, error } =
      await getLoggedInAdmin(req);

    if (error) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    /* =====================================================
       ADMIN ASSIGNED DEPARTMENTS
    ===================================================== */

    const [adminDepartments] =
      await db.query(
        `
        SELECT DISTINCT
          d.department_id,
          d.department_name
        FROM departments d

        INNER JOIN user_departments ud
          ON ud.department_id =
             d.department_id

        WHERE ud.user_id = ?

        UNION

        SELECT
          d.department_id,
          d.department_name
        FROM departments d
        WHERE d.department_id = ?
        `,
        [
          adminUser.user_id,
          adminUser.department_id,
        ]
      );

    const adminDepartmentIds =
      adminDepartments.map(
        (department) =>
          Number(
            department.department_id
          )
      );

      /* =====================================================
   ADMIN ASSIGNED DIVISIONS
===================================================== */

const [adminDivisions] =
  await db.query(
    `
      SELECT DISTINCT
        d.division_id,
        d.division_name

      FROM divisions d

      INNER JOIN admin_divisions ad
        ON ad.division_id =
           d.division_id

      WHERE
        ad.user_id = ?
        AND d.is_active = 1

      ORDER BY
        d.division_name ASC
    `,
    [adminUser.user_id]
  );

const adminDivisionIds =
  adminDivisions.map(
    (division) =>
      Number(
        division.division_id
      )
  );

    /* =====================================================
       ALL COMPANY EMPLOYEES
    ===================================================== */

    const [allEmployees] =
      await db.query(
        `
        SELECT
          u.user_id AS id,
          u.user_id,
          u.employee_code,
          u.full_name,
          u.email,
          u.phone,
          u.designation,
          u.department_id,
          u.role_id,
          r.role_name,

          COALESCE(
            GROUP_CONCAT(
              DISTINCT employee_department.department_name
              ORDER BY employee_department.department_name
              SEPARATOR ', '
            ),
            primary_department.department_name
          ) AS department_name,

          COALESCE(
            GROUP_CONCAT(
              DISTINCT es.skill_name
              ORDER BY es.skill_name
              SEPARATOR ', '
            ),
            ''
          ) AS skills

        FROM users u

        LEFT JOIN roles r
          ON r.role_id = u.role_id

        LEFT JOIN user_departments employee_ud
          ON employee_ud.user_id =
             u.user_id

        LEFT JOIN departments employee_department
          ON employee_department.department_id =
             employee_ud.department_id

        LEFT JOIN departments primary_department
          ON primary_department.department_id =
             u.department_id

        LEFT JOIN employee_skills es
          ON es.user_id = u.user_id

        WHERE LOWER(
  COALESCE(r.role_name, '')
) IN ('employee', 'administrator')

        GROUP BY
          u.user_id,
          u.employee_code,
          u.full_name,
          u.email,
          u.phone,
          u.designation,
          u.department_id,
          u.role_id,
          r.role_name,
          primary_department.department_name

        ORDER BY
          u.full_name ASC
        `
      );

    /* =====================================================
       MY TEAM
       Employees belonging to Admin's assigned departments
    ===================================================== */

    let myTeamUsers = [];

    if (adminDepartmentIds.length) {
      const placeholders =
        adminDepartmentIds
          .map(() => "?")
          .join(", ");

      const [teamRows] =
        await db.query(
          `
          SELECT
            u.user_id AS id,
            u.user_id,
            u.employee_code,
            u.full_name,
            u.email,
            u.phone,
            u.designation,
            u.department_id,
            u.role_id,
            r.role_name,

            COALESCE(
              GROUP_CONCAT(
                DISTINCT employee_department.department_name
                ORDER BY employee_department.department_name
                SEPARATOR ', '
              ),
              primary_department.department_name
            ) AS department_name,

            COALESCE(
              GROUP_CONCAT(
                DISTINCT es.skill_name
                ORDER BY es.skill_name
                SEPARATOR ', '
              ),
              ''
            ) AS skills

          FROM users u

          LEFT JOIN roles r
            ON r.role_id = u.role_id

          LEFT JOIN user_departments employee_ud
            ON employee_ud.user_id =
               u.user_id

          LEFT JOIN departments employee_department
            ON employee_department.department_id =
               employee_ud.department_id

          LEFT JOIN departments primary_department
            ON primary_department.department_id =
               u.department_id

          LEFT JOIN employee_skills es
            ON es.user_id = u.user_id

          WHERE
            LOWER(
              COALESCE(r.role_name, '')
           ) IN ('employee', 'administrator')

            AND (
              employee_ud.department_id
                IN (${placeholders})

              OR

              u.department_id
                IN (${placeholders})
            )

          GROUP BY
            u.user_id,
            u.employee_code,
            u.full_name,
            u.email,
            u.phone,
            u.designation,
            u.department_id,
            u.role_id,
            r.role_name,
            primary_department.department_name

          ORDER BY
            u.full_name ASC
          `,
          [
            ...adminDepartmentIds,
            ...adminDepartmentIds,
          ]
        );

      myTeamUsers = teamRows;
    }

    return res.status(200).json({
      department_ids:
        adminDepartmentIds,

      departments:
        adminDepartments,

      department:
        adminDepartments
          .map(
            (department) =>
              department.department_name
          )
          .join(", "),

        division_ids:
  adminDivisionIds,

divisions:
  adminDivisions, 

      total:
        myTeamUsers.length,

      users:
        myTeamUsers,

      my_team:
        myTeamUsers,

      all_employees:
        allEmployees,
    });
  } catch (error) {
    console.error(
      "Get admin department users error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to fetch department users.",
      error:
        error.message,
      sqlMessage:
        error.sqlMessage || null,
    });
  }
};

const getAdminAssignableUsers = async (req, res) => {
  try {
    const [users] = await db.query(`
      SELECT
        u.user_id,
        u.full_name,
        u.email,
        u.department_id,
        d.department_name
      FROM users u
      LEFT JOIN departments d
        ON d.department_id = u.department_id
      LEFT JOIN roles r
        ON r.role_id = u.role_id
      WHERE LOWER(r.role_name) IN ('employee', 'administrator')
      ORDER BY u.full_name ASC
    `);

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("getAdminAssignableUsers error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch assignable employees",
    });
  }
};

const createAdminProject = async (req, res) => {
  try {
    const { adminUser, error } = await getLoggedInAdmin(req);

    if (error) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    const {
      project_title,
      project_description,
      main_task,
      assignee_ids,
      start_date,
      due_date,
      end_date,
    } = req.body;

    const cleanProjectTitle = String(project_title || "").trim();

    const cleanMainTask = String(
      main_task || project_description || project_title || ""
    ).trim();

    const cleanProjectDescription = String(
      project_description || main_task || ""
    ).trim();

    const cleanAssigneeIds = Array.isArray(assignee_ids)
      ? [...new Set(assignee_ids.map(Number).filter(Boolean))]
      : [];

    if (!cleanProjectTitle) {
      return res.status(400).json({
        message: "Project title is required.",
      });
    }

    if (!cleanMainTask) {
      return res.status(400).json({
        message: "Main task is required.",
      });
    }

    if (cleanAssigneeIds.length === 0) {
      return res.status(400).json({
        message: "Please select at least one assignee.",
      });
    }

    const projectColumnInfo = await getTableColumnInfo("projects");
    const taskColumnInfo = await getTableColumnInfo("tasks");
    const assignmentColumnInfo = await getTableColumnInfo("project_assignments");

    const projectColumns = projectColumnInfo.map((col) => col.Field);
    const taskColumns = taskColumnInfo.map((col) => col.Field);
    const assignmentColumns = assignmentColumnInfo.map((col) => col.Field);

    const projectTitleColumn = pickColumn(projectColumns, [
      "project_title",
      "title",
      "project_name",
      "name",
    ]);

    if (!projectTitleColumn) {
      return res.status(500).json({
        message: "Could not find project title column in projects table.",
        projectColumns,
      });
    }

    const projectDescriptionColumn = pickColumn(projectColumns, [
      "project_description",
      "description",
      "main_task",
      "details",
    ]);

    const projectStatusColumn = pickColumn(projectColumns, [
      "status",
      "project_status",
    ]);

    const projectCreatedByColumn = pickColumn(projectColumns, [
      "created_by_user_id",
      "created_by",
      "created_by_id",
      "admin_id",
    ]);

    const projectDepartmentColumn = pickColumn(projectColumns, [
      "department_id",
    ]);

    const projectStartDateColumn = pickColumn(projectColumns, [
      "start_date",
      "project_start_date",
    ]);

    const projectDueDateColumn = pickColumn(projectColumns, [
      "due_date",
      "end_date",
      "project_end_date",
      "deadline",
    ]);

    const projectCreatedAtColumn = pickColumn(projectColumns, ["created_at"]);
    const projectUpdatedAtColumn = pickColumn(projectColumns, ["updated_at"]);

    const projectTodoStatus = getSafeTodoStatus(
      projectColumnInfo,
      projectStatusColumn
    );

    const projectData = {};

    projectData[projectTitleColumn] = cleanProjectTitle;

    if (projectDescriptionColumn) {
      projectData[projectDescriptionColumn] = cleanProjectDescription;
    }

    if (projectStatusColumn) {
      projectData[projectStatusColumn] = projectTodoStatus;
    }

    if (projectCreatedByColumn) {
      projectData[projectCreatedByColumn] = adminUser.user_id;
    }

    if (projectDepartmentColumn) {
      projectData[projectDepartmentColumn] = adminUser.department_id;
    }

    if (projectStartDateColumn && start_date) {
      projectData[projectStartDateColumn] = start_date;
    }

    if (projectDueDateColumn && (due_date || end_date)) {
      projectData[projectDueDateColumn] = due_date || end_date;
    }

    if (projectCreatedAtColumn) {
      projectData[projectCreatedAtColumn] = new Date();
    }

    if (projectUpdatedAtColumn) {
      projectData[projectUpdatedAtColumn] = new Date();
    }

    const projectResult = await insertIntoTable("projects", projectData);
    const projectId = projectResult.insertId;

    const taskProjectIdColumn = pickColumn(taskColumns, ["project_id"]);

    const taskTitleColumn = pickColumn(taskColumns, [
      "task_title",
      "title",
      "task_name",
      "name",
    ]);

    const taskDescriptionColumn = pickColumn(taskColumns, [
      "task_description",
      "description",
      "details",
      "main_task",
    ]);

    const taskStatusColumn = pickColumn(taskColumns, [
      "status",
      "task_status",
    ]);

    const taskAssignedToColumn = pickColumn(taskColumns, [
      "assigned_to_user_id",
      "assigned_to",
      "assignee_id",
      "user_id",
    ]);

    const taskCreatedByColumn = pickColumn(taskColumns, [
      "created_by_user_id",
      "created_by",
      "created_by_id",
      "admin_id",
    ]);

    const taskStartDateColumn = pickColumn(taskColumns, [
      "start_date",
      "task_start_date",
    ]);

    const taskDueDateColumn = pickColumn(taskColumns, [
      "due_date",
      "end_date",
      "task_end_date",
      "deadline",
    ]);

    const taskParentTaskColumn = pickColumn(taskColumns, ["parent_task_id"]);
    const taskTypeColumn = pickColumn(taskColumns, ["task_type"]);
    const taskProgressColumn = pickColumn(taskColumns, ["progress"]);
    const taskCheckedColumn = pickColumn(taskColumns, ["is_checked"]);

    const taskCreatedAtColumn = pickColumn(taskColumns, ["created_at"]);
    const taskUpdatedAtColumn = pickColumn(taskColumns, ["updated_at"]);

    if (!taskProjectIdColumn || !taskTitleColumn) {
      return res.status(500).json({
        message: "Could not find required task columns in tasks table.",
        taskColumns,
      });
    }

    const taskTodoStatus = getSafeTodoStatus(taskColumnInfo, taskStatusColumn);

    const createdTaskIds = [];

    for (const assigneeId of cleanAssigneeIds) {
      const taskData = {};

      taskData[taskProjectIdColumn] = projectId;
      taskData[taskTitleColumn] = cleanMainTask;

      if (taskDescriptionColumn) {
        taskData[taskDescriptionColumn] = cleanProjectDescription || cleanMainTask;
      }

      if (taskStatusColumn) {
        taskData[taskStatusColumn] = taskTodoStatus;
      }

      if (taskAssignedToColumn) {
        taskData[taskAssignedToColumn] = assigneeId;
      }

      if (taskCreatedByColumn) {
        taskData[taskCreatedByColumn] = adminUser.user_id;
      }

      if (taskStartDateColumn && start_date) {
        taskData[taskStartDateColumn] = start_date;
      }

      if (taskDueDateColumn && (due_date || end_date)) {
        taskData[taskDueDateColumn] = due_date || end_date;
      }

      if (taskParentTaskColumn) {
        taskData[taskParentTaskColumn] = null;
      }

      if (taskTypeColumn) {
        taskData[taskTypeColumn] = "main";
      }

      if (taskProgressColumn) {
        taskData[taskProgressColumn] = 0;
      }

      if (taskCheckedColumn) {
        taskData[taskCheckedColumn] = 0;
      }

      if (taskCreatedAtColumn) {
        taskData[taskCreatedAtColumn] = new Date();
      }

      if (taskUpdatedAtColumn) {
        taskData[taskUpdatedAtColumn] = new Date();
      }

      const taskResult = await insertIntoTable("tasks", taskData);
      createdTaskIds.push(taskResult.insertId);
    }

    const assignmentProjectIdColumn = pickColumn(assignmentColumns, [
      "project_id",
    ]);

    const assignmentUserIdColumn = pickColumn(assignmentColumns, [
      "user_id",
      "assigned_user_id",
      "assigned_to_user_id",
      "assignee_id",
      "employee_id",
    ]);

    const assignmentAssignedByColumn = pickColumn(assignmentColumns, [
      "assigned_by_user_id",
      "assigned_by",
      "created_by",
      "admin_id",
    ]);

    const assignmentCreatedAtColumn = pickColumn(assignmentColumns, [
      "assigned_at",
      "created_at",
    ]);

    if (assignmentProjectIdColumn && assignmentUserIdColumn) {
      for (const assigneeId of cleanAssigneeIds) {
        const assignmentData = {};

        assignmentData[assignmentProjectIdColumn] = projectId;
        assignmentData[assignmentUserIdColumn] = assigneeId;

        if (assignmentAssignedByColumn) {
          assignmentData[assignmentAssignedByColumn] = adminUser.user_id;
        }

        if (assignmentCreatedAtColumn) {
          assignmentData[assignmentCreatedAtColumn] = new Date();
        }

        await insertIntoTable("project_assignments", assignmentData);
      }
    }

    const emailSummary = await sendProjectAssignmentEmails(projectId, adminUser);

    return res.status(201).json({
      message: "Project assigned successfully.",
      project_id: projectId,
      task_ids: createdTaskIds,
      assignee_ids: cleanAssigneeIds,
      email_summary: emailSummary,
    });
  } catch (error) {
    console.error("Create admin project error:", error);

    return res.status(500).json({
      message: "Failed to create project.",
      error: error.message,
      sqlMessage: error.sqlMessage || null,
    });
  }
};

const getAdminUserTimeSummary = async (req, res) => {
  try {
    const { adminUser, error } =
      await getLoggedInAdmin(req);

    if (error) {
      return res
        .status(error.status)
        .json({
          message: error.message,
        });
    }

    const employeeId =
      Number(req.params.userId);

    if (!employeeId) {
      return res.status(400).json({
        message: "Invalid employee.",
      });
    }

    /* =====================================================
       PERIOD

       Default = current India month

       Supported:
       ?month=2026-09
       ?period=all
    ===================================================== */

    const periodType =
      String(
        req.query?.period || ""
      )
        .trim()
        .toLowerCase();

    const requestedMonth =
      String(
        req.query?.month || ""
      ).trim();

    const currentIndiaMonth =
      getIndiaNowLocalString()
        .slice(0, 7);

    let selectedMonth = null;

    if (periodType !== "all") {
      selectedMonth =
        requestedMonth ||
        currentIndiaMonth;

      if (
        !/^\d{4}-\d{2}$/.test(
          selectedMonth
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid month. Use YYYY-MM.",
        });
      }

      const monthNumber =
        Number(
          selectedMonth.slice(
            5,
            7
          )
        );

      if (
        monthNumber < 1 ||
        monthNumber > 12
      ) {
        return res.status(400).json({
          message:
            "Invalid month. Use YYYY-MM.",
        });
      }
    }

    const getMonthBounds = (
      monthValue
    ) => {
      if (!monthValue) {
        return {
          start: null,
          end: null,
        };
      }

      const [year, month] =
        monthValue
          .split("-")
          .map(Number);

      const start =
        `${year}-${String(
          month
        ).padStart(
          2,
          "0"
        )}-01 00:00:00`;

      const nextMonth =
        new Date(
          Date.UTC(
            year,
            month,
            1
          )
        );

      const nextYear =
        nextMonth
          .getUTCFullYear();

      const nextMonthNumber =
        String(
          nextMonth
            .getUTCMonth() +
            1
        ).padStart(
          2,
          "0"
        );

      return {
        start,

        end:
          `${nextYear}-${nextMonthNumber}-01 00:00:00`,
      };
    };

    const periodBounds =
      getMonthBounds(
        selectedMonth
      );

    /* =====================================================
       SECURITY

       Department Admin can see:
       ALL employees under every Department assigned to them.

       Once employee is valid:
       show that employee's complete Division-wise work.
    ===================================================== */

    const [employeeRows] =
      await db.query(
        `
          SELECT DISTINCT
            u.user_id,
            u.employee_code,
            u.full_name,
            u.email,
            u.designation,
            u.department_id,
            primary_department.department_name

          FROM users u

          LEFT JOIN departments primary_department
            ON primary_department.department_id =
               u.department_id

          WHERE
            u.user_id = ?

            AND (
              EXISTS (
                SELECT 1

                FROM user_departments employee_ud

                WHERE
                  employee_ud.user_id =
                    u.user_id

                  AND employee_ud.department_id IN (
                    SELECT
                      admin_ud.department_id

                    FROM user_departments admin_ud

                    WHERE
                      admin_ud.user_id = ?
                  )
              )

              OR

              u.department_id IN (
                SELECT
                  admin_ud.department_id

                FROM user_departments admin_ud

                WHERE
                  admin_ud.user_id = ?
              )

              OR

              EXISTS (
                SELECT 1

                FROM user_departments employee_ud

                WHERE
                  employee_ud.user_id =
                    u.user_id

                  AND employee_ud.department_id =
                    ?
              )

              OR

              u.department_id = ?
            )

          LIMIT 1
        `,
        [
          employeeId,
          adminUser.user_id,
          adminUser.user_id,
          adminUser.department_id,
          adminUser.department_id,
        ]
      );

    if (!employeeRows.length) {
      return res.status(404).json({
        message:
          "Employee not found under your assigned department access.",
      });
    }

    const employee =
      employeeRows[0];

    /* =====================================================
       OPTIONAL HOLIDAYS
    ===================================================== */

    const [optionalHolidayRows] =
      await db.query(
        `
          SELECT
            DATE_FORMAT(
              holiday_date,
              '%Y-%m-%d'
            ) AS holiday_date

          FROM employee_optional_holidays

          WHERE
            employee_id = ?
        `,
        [employeeId]
      );

    const optionalHolidayDates =
      optionalHolidayRows
        .map(
          (row) =>
            row.holiday_date
        )
        .filter(Boolean);

    /* =====================================================
       MAIN TASK SESSIONS
    ===================================================== */

    const sessionWhere = [
      "tws.employee_id = ?",
    ];

    const sessionValues = [
      employeeId,
    ];

    if (
      periodBounds.start &&
      periodBounds.end
    ) {
      sessionWhere.push(
        `
          tws.started_at < ?

          AND

          COALESCE(
            tws.ended_at,

            CONVERT_TZ(
              UTC_TIMESTAMP(),
              '+00:00',
              '+05:30'
            )
          ) >= ?
        `
      );

      sessionValues.push(
        periodBounds.end,
        periodBounds.start
      );
    }

    const [sessionRows] =
      await db.query(
        `
          SELECT
            tws.session_id,
            tws.task_id,
            tws.employee_id,

            DATE_FORMAT(
              tws.started_at,
              '%Y-%m-%d %H:%i:%s'
            ) AS started_at,

            CASE
              WHEN
                tws.ended_at IS NULL
              THEN NULL

              ELSE DATE_FORMAT(
                tws.ended_at,
                '%Y-%m-%d %H:%i:%s'
              )
            END AS ended_at,

            tws.end_reason,

            t.task_title,
            t.status
              AS task_status,

            t.project_id,

            p.project_title,

            p.division_id,

            COALESCE(
              divs.division_name,

              NULLIF(
                TRIM(
                  p.division
                ),
                ''
              ),

              'Unassigned Legacy'
            ) AS division

          FROM task_work_sessions tws

          INNER JOIN tasks t
            ON t.task_id =
               tws.task_id

          LEFT JOIN projects p
            ON p.project_id =
               t.project_id

          LEFT JOIN divisions divs
            ON divs.division_id =
               p.division_id

          WHERE
            ${sessionWhere.join(
              " AND "
            )}

          ORDER BY
            tws.started_at ASC,
            tws.session_id ASC
        `,
        sessionValues
      );

    /* =====================================================
       MINI TASKS

       Only reviewed Mini Tasks count officially.
    ===================================================== */

    const miniWhere = [
      "mt.employee_id = ?",
    ];

    const miniValues = [
      employeeId,
    ];

    if (
      periodBounds.start &&
      periodBounds.end
    ) {
      miniWhere.push(
        `
          TIMESTAMP(
            COALESCE(
              mt.start_date,
              mt.task_date
            ),
            mt.start_time
          ) < ?

          AND

          TIMESTAMP(
            COALESCE(
              mt.end_date,
              mt.start_date,
              mt.task_date
            ),
            mt.end_time
          ) >= ?
        `
      );

      miniValues.push(
        periodBounds.end,
        periodBounds.start
      );
    }

    const [miniTaskRows] =
      await db.query(
        `
          SELECT
            mt.mini_task_id,
            mt.employee_id,
            mt.department_id,

            mt.division_id,

            COALESCE(
              divs.division_name,

              NULLIF(
                TRIM(
                  mt.division
                ),
                ''
              ),

              'Unassigned Legacy'
            ) AS division,

            mt.mini_task_title,
            mt.mini_task_description,

            DATE_FORMAT(
              COALESCE(
                mt.start_date,
                mt.task_date
              ),
              '%Y-%m-%d'
            ) AS start_date,

            DATE_FORMAT(
              COALESCE(
                mt.end_date,
                mt.start_date,
                mt.task_date
              ),
              '%Y-%m-%d'
            ) AS end_date,

            TIME_FORMAT(
              mt.start_time,
              '%H:%i:%s'
            ) AS start_time,

            TIME_FORMAT(
              mt.end_time,
              '%H:%i:%s'
            ) AS end_time,

            mt.total_minutes,
            mt.status

          FROM mini_tasks mt

          LEFT JOIN divisions divs
            ON divs.division_id =
               mt.division_id

          WHERE
            ${miniWhere.join(
              " AND "
            )}

          ORDER BY
            COALESCE(
              mt.start_date,
              mt.task_date
            ) ASC,

            mt.start_time ASC,

            mt.mini_task_id ASC
        `,
        miniValues
      );

    /* =====================================================
       CENTRAL CALCULATION
    ===================================================== */

    const timeline =
      calculateEmployeeWorkTimeline({
        mainSessions:
          sessionRows,

        miniTasks:
          miniTaskRows,

        optionalHolidayDates,

        reviewedMiniTasksOnly:
          true,

        rangeStartLocal:
          periodBounds.start,

        rangeEndLocal:
          periodBounds.end,
      });

    /* =====================================================
       PROJECT -> TASK -> SESSION
    ===================================================== */

    const projectMap =
      new Map();

    for (
      const row of
      timeline.main_sessions
    ) {
      const projectKey =
        row.project_id ||
        `no-project-${row.task_id}`;

      if (
        !projectMap.has(
          projectKey
        )
      ) {
        projectMap.set(
          projectKey,
          {
            project_id:
              row.project_id ||
              null,

            project_title:
              row.project_title ||
              "No Project",

            division_id:
              row.division_id ??
              null,

            division:
              row.division ||
              "Unassigned Legacy",

            total_seconds: 0,

            tasks:
              new Map(),
          }
        );
      }

      const project =
        projectMap.get(
          projectKey
        );

      const countedSeconds =
        Number(
          row.counted_seconds ||
          0
        );

      project.total_seconds +=
        countedSeconds;

      if (
        !project.tasks.has(
          row.task_id
        )
      ) {
        project.tasks.set(
          row.task_id,
          {
            task_id:
              row.task_id,

            task_title:
              row.task_title ||
              "Untitled Task",

            status:
              row.task_status ||
              "",

            total_seconds: 0,

            currently_running:
              false,

            sessions: [],
          }
        );
      }

      const task =
        project.tasks.get(
          row.task_id
        );

      task.total_seconds +=
        countedSeconds;

      if (!row.ended_at) {
        task.currently_running =
          true;
      }

      task.sessions.push({
        session_id:
          row.session_id,

        started_at:
          row.started_at,

        ended_at:
          row.ended_at,

        end_reason:
          row.end_reason,

        seconds_worked:
          countedSeconds,

        currently_running:
          !row.ended_at,

        counted_segments:
          row.counted_segments ||
          [],
      });
    }

    const projects =
      Array.from(
        projectMap.values()
      ).map(
        (project) => ({
          project_id:
            project.project_id,

          project_title:
            project.project_title,

          division_id:
            project.division_id,

          division:
            project.division,

          total_seconds:
            project.total_seconds,

          tasks:
            Array.from(
              project.tasks.values()
            ),
        })
      );

    /* =====================================================
       MINI TASK RESPONSE
    ===================================================== */

    const miniTasks =
      timeline.mini_tasks.map(
        (task) => ({
          mini_task_id:
            task.mini_task_id,

          mini_task_title:
            task.mini_task_title,

          mini_task_description:
            task.mini_task_description,

          division_id:
            task.division_id ??
            null,

          division:
            task.division ||
            "Unassigned Legacy",

          start_date:
            task.start_date,

          end_date:
            task.end_date,

          start_time:
            task.start_time,

          end_time:
            task.end_time,

          status:
            task.status,

          total_seconds:
            Number(
              task.counted_seconds ||
              0
            ),

          counted_segments:
            task.counted_segments ||
            [],
        })
      );

    /* =====================================================
       AVAILABLE MONTHS
    ===================================================== */

    const [monthRows] =
      await db.query(
        `
          SELECT DISTINCT
            month_value

          FROM (
            SELECT
              DATE_FORMAT(
                tws.started_at,
                '%Y-%m'
              ) AS month_value

            FROM task_work_sessions tws

            WHERE
              tws.employee_id = ?

            UNION

            SELECT
              DATE_FORMAT(
                COALESCE(
                  mt.start_date,
                  mt.task_date
                ),
                '%Y-%m'
              ) AS month_value

            FROM mini_tasks mt

            WHERE
              mt.employee_id = ?
          ) months

          WHERE
            month_value IS NOT NULL

          ORDER BY
            month_value DESC
        `,
        [
          employeeId,
          employeeId,
        ]
      );

    const availableMonths =
      monthRows
        .map(
          (row) =>
            row.month_value
        )
        .filter(Boolean);

    if (
      !availableMonths.includes(
        currentIndiaMonth
      )
    ) {
      availableMonths.unshift(
        currentIndiaMonth
      );
    }

    /* =====================================================
       RESPONSE
    ===================================================== */

    return res.status(200).json({
      success: true,

      period:
        selectedMonth
          ? {
              type:
                "month",

              month:
                selectedMonth,
            }
          : {
              type:
                "all",

              month:
                null,
            },

      available_months:
        availableMonths,

      employee: {
        user_id:
          employee.user_id,

        employee_code:
          employee.employee_code,

        full_name:
          employee.full_name,

        email:
          employee.email,

        designation:
          employee.designation,

        department_id:
          employee.department_id,

        department_name:
          employee.department_name,
      },

      work_rules:
        timeline.work_rules,

      main_task_total_seconds:
        timeline.main_task_seconds,

      mini_task_total_seconds:
        timeline.mini_task_seconds,

      total_seconds:
        timeline.total_seconds,

      total_projects:
        projects.length,

      total_tasks:
        projects.reduce(
          (
            sum,
            project
          ) =>
            sum +
            project.tasks.length,
          0
        ),

      projects,

      mini_tasks:
        miniTasks,

      divisions:
        timeline.divisions,

      daily:
        timeline.daily,

      calculation_warnings:
        timeline.warnings,
    });
  } catch (error) {
    console.error(
      "Get admin user time summary error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to fetch employee time summary.",

      error:
        error.message,

      sqlMessage:
        error.sqlMessage ||
        null,
    });
  }
};

/* =========================================================
   ADMIN DIVISION REPORT
========================================================= */

const getAdminDivisionReport = async (req, res) => {
  try {
    const { adminUser, error } =
      await getLoggedInAdmin(req);

    if (error) {
      return res
        .status(error.status)
        .json({
          message: error.message,
        });
    }

    /* =====================================================
       ADMIN ASSIGNED DIVISIONS
    ===================================================== */

    const [assignedDivisions] =
      await db.query(
        `
          SELECT DISTINCT
            d.division_id,
            d.division_name

          FROM admin_divisions ad

          INNER JOIN divisions d
            ON d.division_id =
               ad.division_id

          WHERE
            ad.user_id = ?
            AND d.is_active = 1

          ORDER BY
            d.division_name ASC
        `,
        [adminUser.user_id]
      );

    const assignedDivisionIds =
      assignedDivisions
        .map(
          (division) =>
            Number(
              division.division_id
            )
        )
        .filter(
          (id) =>
            Number.isInteger(id) &&
            id > 0
        );

    if (!assignedDivisionIds.length) {
      return res.status(200).json({
        success: true,

        assigned_divisions: [],

        selected_division_ids: [],

        selected_division: null,

        period: {
          type: "month",
          month:
            getIndiaNowLocalString()
              .slice(0, 7),
        },

        available_months: [
          getIndiaNowLocalString()
            .slice(0, 7),
        ],

        main_task_total_seconds: 0,
        mini_task_total_seconds: 0,
        total_seconds: 0,

        total_contributors: 0,

        contributors: [],
        divisions: [],
        main_sessions: [],
        mini_tasks: [],
      });
    }

    /* =====================================================
       SELECTED DIVISION

       No division_id =
       All My Divisions
    ===================================================== */

    const requestedDivisionId =
      req.query?.division_id
        ? Number(
            req.query.division_id
          )
        : null;

    if (
      requestedDivisionId &&
      (
        !Number.isInteger(
          requestedDivisionId
        ) ||
        requestedDivisionId <= 0
      )
    ) {
      return res.status(400).json({
        message:
          "Invalid division ID.",
      });
    }

    if (
      requestedDivisionId &&
      !assignedDivisionIds.includes(
        requestedDivisionId
      )
    ) {
      return res.status(403).json({
        message:
          "You do not have access to this Division.",
      });
    }

    const selectedDivisionIds =
      requestedDivisionId
        ? [requestedDivisionId]
        : assignedDivisionIds;

    const selectedDivision =
      requestedDivisionId
        ? assignedDivisions.find(
            (division) =>
              Number(
                division.division_id
              ) ===
              requestedDivisionId
          ) || null
        : null;

    /* =====================================================
       PERIOD

       Default:
       current India month

       Supported:
       ?month=2026-09
       ?period=all
    ===================================================== */

    const periodType =
      String(
        req.query?.period || ""
      )
        .trim()
        .toLowerCase();

    const requestedMonth =
      String(
        req.query?.month || ""
      ).trim();

    const currentIndiaMonth =
      getIndiaNowLocalString()
        .slice(0, 7);

    let selectedMonth = null;

    if (periodType !== "all") {
      selectedMonth =
        requestedMonth ||
        currentIndiaMonth;

      if (
        !/^\d{4}-\d{2}$/.test(
          selectedMonth
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid month. Use YYYY-MM.",
        });
      }

      const monthNumber =
        Number(
          selectedMonth.slice(
            5,
            7
          )
        );

      if (
        monthNumber < 1 ||
        monthNumber > 12
      ) {
        return res.status(400).json({
          message:
            "Invalid month. Use YYYY-MM.",
        });
      }
    }

    const getMonthBounds = (
      monthValue
    ) => {
      if (!monthValue) {
        return {
          start: null,
          end: null,
        };
      }

      const [year, month] =
        monthValue
          .split("-")
          .map(Number);

      const start =
        `${year}-${String(
          month
        ).padStart(
          2,
          "0"
        )}-01 00:00:00`;

      const nextMonth =
        new Date(
          Date.UTC(
            year,
            month,
            1
          )
        );

      const nextYear =
        nextMonth
          .getUTCFullYear();

      const nextMonthNumber =
        String(
          nextMonth
            .getUTCMonth() + 1
        ).padStart(
          2,
          "0"
        );

      return {
        start,

        end:
          `${nextYear}-${nextMonthNumber}-01 00:00:00`,
      };
    };

    const periodBounds =
      getMonthBounds(
        selectedMonth
      );

    /* =====================================================
       FIND CONTRIBUTORS

       Important:
       Contributor may belong to ANY Department.

       Division decides work access.
    ===================================================== */

    const divisionPlaceholders =
      selectedDivisionIds
        .map(() => "?")
        .join(",");

    const contributorParams = [
      ...selectedDivisionIds,
    ];

    let mainPeriodSql = "";
    let miniPeriodSql = "";

    if (
      periodBounds.start &&
      periodBounds.end
    ) {
      mainPeriodSql = `
        AND tws.started_at < ?

        AND COALESCE(
          tws.ended_at,
          CONVERT_TZ(
            UTC_TIMESTAMP(),
            '+00:00',
            '+05:30'
          )
        ) >= ?
      `;

      contributorParams.push(
        periodBounds.end,
        periodBounds.start
      );

      miniPeriodSql = `
        AND TIMESTAMP(
          COALESCE(
            mt.start_date,
            mt.task_date
          ),
          mt.start_time
        ) < ?

        AND TIMESTAMP(
          COALESCE(
            mt.end_date,
            mt.start_date,
            mt.task_date
          ),
          mt.end_time
        ) >= ?
      `;
    }

    const contributorMiniParams = [
      ...selectedDivisionIds,
    ];

    if (
      periodBounds.start &&
      periodBounds.end
    ) {
      contributorMiniParams.push(
        periodBounds.end,
        periodBounds.start
      );
    }

    const [contributorRows] =
      await db.query(
        `
          SELECT DISTINCT
            employee_id

          FROM (
            SELECT
              tws.employee_id

            FROM task_work_sessions tws

            INNER JOIN tasks t
              ON t.task_id =
                 tws.task_id

            INNER JOIN projects p
              ON p.project_id =
                 t.project_id

            WHERE
              p.division_id
                IN (${divisionPlaceholders})

              ${mainPeriodSql}

            UNION

            SELECT
              mt.employee_id

            FROM mini_tasks mt

            WHERE
              mt.division_id
                IN (${divisionPlaceholders})

              AND LOWER(
                COALESCE(
                  mt.status,
                  ''
                )
              ) = 'reviewed'

              ${miniPeriodSql}
          ) contributors

          WHERE employee_id
                IS NOT NULL
        `,
        [
          ...contributorParams,
          ...contributorMiniParams,
        ]
      );

    const contributorIds =
      contributorRows
        .map(
          (row) =>
            Number(
              row.employee_id
            )
        )
        .filter(
          (id) =>
            Number.isInteger(id) &&
            id > 0
        );

    /* =====================================================
       EMPTY REPORT
    ===================================================== */

    if (!contributorIds.length) {
      return res.status(200).json({
        success: true,

        assigned_divisions:
          assignedDivisions,

        selected_division_ids:
          selectedDivisionIds,

        selected_division:
          selectedDivision,

        period:
          selectedMonth
            ? {
                type: "month",
                month: selectedMonth,
              }
            : {
                type: "all",
                month: null,
              },

        available_months: [
          currentIndiaMonth,
        ],

        main_task_total_seconds: 0,
        mini_task_total_seconds: 0,
        total_seconds: 0,

        total_contributors: 0,

        contributors: [],
        divisions: [],
        main_sessions: [],
        mini_tasks: [],
      });
    }

    /* =====================================================
       EMPLOYEE DETAILS
    ===================================================== */

    const employeePlaceholders =
      contributorIds
        .map(() => "?")
        .join(",");

    const [employeeRows] =
      await db.query(
        `
          SELECT
            u.user_id,
            u.employee_code,
            u.full_name,
            u.designation,
            u.department_id,

            d.department_name

          FROM users u

          LEFT JOIN departments d
            ON d.department_id =
               u.department_id

          WHERE
            u.user_id
              IN (${employeePlaceholders})

          ORDER BY
            u.full_name ASC
        `,
        contributorIds
      );

    const employeeMap =
      new Map(
        employeeRows.map(
          (employee) => [
            Number(
              employee.user_id
            ),
            employee,
          ]
        )
      );

    /* =====================================================
       FINAL AGGREGATORS
    ===================================================== */

    const contributors = [];

    const allMainSessions = [];
    const allMiniTasks = [];

    const divisionSummaryMap =
      new Map();

    let reportMainSeconds = 0;
    let reportMiniSeconds = 0;

    /* =====================================================
       CALCULATE EACH CONTRIBUTOR

       IMPORTANT:
       We intentionally load ALL Divisions for the employee.

       Reason:
       A Mini Task in another Division may overlap a Main Task
       in the selected Division.

       The calculator must see the complete employee timeline
       so overlapping seconds are deducted correctly.

       After calculation we filter output to Admin's
       selected Division(s).
    ===================================================== */

    for (
      const employeeId of
      contributorIds
    ) {
      const employee =
        employeeMap.get(
          employeeId
        );

      if (!employee) {
        continue;
      }

      /* ===================================================
         OPTIONAL HOLIDAYS
      =================================================== */

      const [optionalHolidayRows] =
        await db.query(
          `
            SELECT
              DATE_FORMAT(
                holiday_date,
                '%Y-%m-%d'
              ) AS holiday_date

            FROM employee_optional_holidays

            WHERE
              employee_id = ?
          `,
          [employeeId]
        );

      const optionalHolidayDates =
        optionalHolidayRows
          .map(
            (row) =>
              row.holiday_date
          )
          .filter(Boolean);

      /* ===================================================
         ALL MAIN SESSIONS FOR EMPLOYEE
      =================================================== */

      const sessionWhere = [
        "tws.employee_id = ?",
      ];

      const sessionValues = [
        employeeId,
      ];

      if (
        periodBounds.start &&
        periodBounds.end
      ) {
        sessionWhere.push(
          `
            tws.started_at < ?

            AND COALESCE(
              tws.ended_at,

              CONVERT_TZ(
                UTC_TIMESTAMP(),
                '+00:00',
                '+05:30'
              )
            ) >= ?
          `
        );

        sessionValues.push(
          periodBounds.end,
          periodBounds.start
        );
      }

      const [sessionRows] =
        await db.query(
          `
            SELECT
              tws.session_id,
              tws.task_id,
              tws.employee_id,

              DATE_FORMAT(
                tws.started_at,
                '%Y-%m-%d %H:%i:%s'
              ) AS started_at,

              CASE
                WHEN tws.ended_at
                     IS NULL
                  THEN NULL

                ELSE DATE_FORMAT(
                  tws.ended_at,
                  '%Y-%m-%d %H:%i:%s'
                )
              END AS ended_at,

              tws.end_reason,

              t.task_title,

              t.status
                AS task_status,

              t.project_id,

              p.project_title,

              p.division_id,

              COALESCE(
                divs.division_name,

                NULLIF(
                  TRIM(
                    p.division
                  ),
                  ''
                ),

                'Unassigned Legacy'
              ) AS division

            FROM task_work_sessions tws

            INNER JOIN tasks t
              ON t.task_id =
                 tws.task_id

            LEFT JOIN projects p
              ON p.project_id =
                 t.project_id

            LEFT JOIN divisions divs
              ON divs.division_id =
                 p.division_id

            WHERE
              ${sessionWhere.join(
                " AND "
              )}

            ORDER BY
              tws.started_at ASC,
              tws.session_id ASC
          `,
          sessionValues
        );

      /* ===================================================
         ALL MINI TASKS FOR EMPLOYEE

         Calculator itself uses reviewedMiniTasksOnly = true.
      =================================================== */

      const miniWhere = [
        "mt.employee_id = ?",
      ];

      const miniValues = [
        employeeId,
      ];

      if (
        periodBounds.start &&
        periodBounds.end
      ) {
        miniWhere.push(
          `
            TIMESTAMP(
              COALESCE(
                mt.start_date,
                mt.task_date
              ),
              mt.start_time
            ) < ?

            AND TIMESTAMP(
              COALESCE(
                mt.end_date,
                mt.start_date,
                mt.task_date
              ),
              mt.end_time
            ) >= ?
          `
        );

        miniValues.push(
          periodBounds.end,
          periodBounds.start
        );
      }

      const [miniRows] =
        await db.query(
          `
            SELECT
              mt.mini_task_id,
              mt.employee_id,
              mt.department_id,

              mt.division_id,

              COALESCE(
                divs.division_name,

                NULLIF(
                  TRIM(
                    mt.division
                  ),
                  ''
                ),

                'Unassigned Legacy'
              ) AS division,

              mt.mini_task_title,
              mt.mini_task_description,

              DATE_FORMAT(
                COALESCE(
                  mt.start_date,
                  mt.task_date
                ),
                '%Y-%m-%d'
              ) AS start_date,

              DATE_FORMAT(
                COALESCE(
                  mt.end_date,
                  mt.start_date,
                  mt.task_date
                ),
                '%Y-%m-%d'
              ) AS end_date,

              TIME_FORMAT(
                mt.start_time,
                '%H:%i:%s'
              ) AS start_time,

              TIME_FORMAT(
                mt.end_time,
                '%H:%i:%s'
              ) AS end_time,

              mt.total_minutes,
              mt.status

            FROM mini_tasks mt

            LEFT JOIN divisions divs
              ON divs.division_id =
                 mt.division_id

            WHERE
              ${miniWhere.join(
                " AND "
              )}

            ORDER BY
              COALESCE(
                mt.start_date,
                mt.task_date
              ) ASC,

              mt.start_time ASC,

              mt.mini_task_id ASC
          `,
          miniValues
        );

      /* ===================================================
         CENTRAL CALCULATOR
      =================================================== */

      const timeline =
        calculateEmployeeWorkTimeline({
          mainSessions:
            sessionRows,

          miniTasks:
            miniRows,

          optionalHolidayDates,

          reviewedMiniTasksOnly:
            true,

          rangeStartLocal:
            periodBounds.start,

          rangeEndLocal:
            periodBounds.end,
        });

      /* ===================================================
         KEEP ONLY SELECTED DIVISION WORK
      =================================================== */

      const selectedMainSessions =
        timeline.main_sessions.filter(
          (row) =>
            selectedDivisionIds.includes(
              Number(
                row.division_id
              )
            )
        );

      const selectedMiniTasks =
        timeline.mini_tasks.filter(
          (row) =>
            selectedDivisionIds.includes(
              Number(
                row.division_id
              )
            )
        );

      const employeeMainSeconds =
        selectedMainSessions.reduce(
          (sum, row) =>
            sum +
            Number(
              row.counted_seconds ||
              0
            ),
          0
        );

      const employeeMiniSeconds =
        selectedMiniTasks.reduce(
          (sum, row) =>
            sum +
            Number(
              row.counted_seconds ||
              0
            ),
          0
        );

      const employeeTotalSeconds =
        employeeMainSeconds +
        employeeMiniSeconds;

      /*
        Do not list someone as contributor
        if all their official counted work became zero.
      */
      if (
        employeeTotalSeconds <= 0
      ) {
        continue;
      }

      reportMainSeconds +=
        employeeMainSeconds;

      reportMiniSeconds +=
        employeeMiniSeconds;

      /* ===================================================
         DIVISION BREAKDOWN FOR EMPLOYEE
      =================================================== */

      const employeeDivisionMap =
        new Map();

      const ensureEmployeeDivision =
        (
          divisionId,
          divisionName
        ) => {
          const numericId =
            Number(
              divisionId
            );

          if (
            !employeeDivisionMap.has(
              numericId
            )
          ) {
            employeeDivisionMap.set(
              numericId,
              {
                division_id:
                  numericId,

                division:
                  divisionName ||
                  "Unknown Division",

                main_task_seconds: 0,
                mini_task_seconds: 0,
                total_seconds: 0,
              }
            );
          }

          return employeeDivisionMap.get(
            numericId
          );
        };

      /* ===================================================
         MAIN SESSIONS
      =================================================== */

      for (
        const session of
        selectedMainSessions
      ) {
        const countedSeconds =
          Number(
            session.counted_seconds ||
            0
          );

        const employeeDivision =
          ensureEmployeeDivision(
            session.division_id,
            session.division
          );

        employeeDivision
          .main_task_seconds +=
            countedSeconds;

        employeeDivision
          .total_seconds +=
            countedSeconds;

        const divisionId =
          Number(
            session.division_id
          );

        if (
          !divisionSummaryMap.has(
            divisionId
          )
        ) {
          divisionSummaryMap.set(
            divisionId,
            {
              division_id:
                divisionId,

              division:
                session.division ||
                "Unknown Division",

              main_task_seconds: 0,
              mini_task_seconds: 0,
              total_seconds: 0,

              contributor_ids:
                new Set(),
            }
          );
        }

        const divisionSummary =
          divisionSummaryMap.get(
            divisionId
          );

        divisionSummary
          .main_task_seconds +=
            countedSeconds;

        divisionSummary
          .total_seconds +=
            countedSeconds;

        divisionSummary
          .contributor_ids
          .add(employeeId);

        allMainSessions.push({
          employee_id:
            employeeId,

          employee_code:
            employee.employee_code,

          employee_name:
            employee.full_name,

          department_id:
            employee.department_id,

          department_name:
            employee.department_name,

          session_id:
            session.session_id,

          task_id:
            session.task_id,

          task_title:
            session.task_title,

          task_status:
            session.task_status,

          project_id:
            session.project_id,

          project_title:
            session.project_title,

          division_id:
            session.division_id,

          division:
            session.division,

          started_at:
            session.started_at,

          ended_at:
            session.ended_at,

          end_reason:
            session.end_reason,

          total_seconds:
            countedSeconds,

          counted_segments:
            session.counted_segments ||
            [],
        });
      }

      /* ===================================================
         MINI TASKS
      =================================================== */

      for (
        const miniTask of
        selectedMiniTasks
      ) {
        const countedSeconds =
          Number(
            miniTask.counted_seconds ||
            0
          );

        const employeeDivision =
          ensureEmployeeDivision(
            miniTask.division_id,
            miniTask.division
          );

        employeeDivision
          .mini_task_seconds +=
            countedSeconds;

        employeeDivision
          .total_seconds +=
            countedSeconds;

        const divisionId =
          Number(
            miniTask.division_id
          );

        if (
          !divisionSummaryMap.has(
            divisionId
          )
        ) {
          divisionSummaryMap.set(
            divisionId,
            {
              division_id:
                divisionId,

              division:
                miniTask.division ||
                "Unknown Division",

              main_task_seconds: 0,
              mini_task_seconds: 0,
              total_seconds: 0,

              contributor_ids:
                new Set(),
            }
          );
        }

        const divisionSummary =
          divisionSummaryMap.get(
            divisionId
          );

        divisionSummary
          .mini_task_seconds +=
            countedSeconds;

        divisionSummary
          .total_seconds +=
            countedSeconds;

        divisionSummary
          .contributor_ids
          .add(employeeId);

        allMiniTasks.push({
          employee_id:
            employeeId,

          employee_code:
            employee.employee_code,

          employee_name:
            employee.full_name,

          department_id:
            employee.department_id,

          department_name:
            employee.department_name,

          mini_task_id:
            miniTask.mini_task_id,

          mini_task_title:
            miniTask.mini_task_title,

          mini_task_description:
            miniTask.mini_task_description,

          division_id:
            miniTask.division_id,

          division:
            miniTask.division,

          start_date:
            miniTask.start_date,

          end_date:
            miniTask.end_date,

          start_time:
            miniTask.start_time,

          end_time:
            miniTask.end_time,

          status:
            miniTask.status,

          total_seconds:
            countedSeconds,

          counted_segments:
            miniTask.counted_segments ||
            [],
        });
      }

      contributors.push({
        user_id:
          employee.user_id,

        employee_code:
          employee.employee_code,

        full_name:
          employee.full_name,

        designation:
          employee.designation,

        department_id:
          employee.department_id,

        department_name:
          employee.department_name,

        main_task_seconds:
          employeeMainSeconds,

        mini_task_seconds:
          employeeMiniSeconds,

        total_seconds:
          employeeTotalSeconds,

        divisions:
          Array.from(
            employeeDivisionMap.values()
          ),
      });
    }

    /* =====================================================
       DIVISION SUMMARY
    ===================================================== */

    const divisions =
      selectedDivisionIds.map(
        (divisionId) => {
          const masterDivision =
            assignedDivisions.find(
              (division) =>
                Number(
                  division.division_id
                ) ===
                Number(
                  divisionId
                )
            );

          const summary =
            divisionSummaryMap.get(
              Number(
                divisionId
              )
            );

          return {
            division_id:
              Number(
                divisionId
              ),

            division:
              masterDivision
                ?.division_name ||
              summary?.division ||
              "Unknown Division",

            main_task_seconds:
              summary
                ?.main_task_seconds ||
              0,

            mini_task_seconds:
              summary
                ?.mini_task_seconds ||
              0,

            total_seconds:
              summary
                ?.total_seconds ||
              0,

            total_contributors:
              summary
                ?.contributor_ids
                ?.size ||
              0,
          };
        }
      );

    /* =====================================================
       AVAILABLE MONTHS

       Only selected Division(s)
    ===================================================== */

    const [monthRows] =
      await db.query(
        `
          SELECT DISTINCT
            month_value

          FROM (
            SELECT
              DATE_FORMAT(
                tws.started_at,
                '%Y-%m'
              ) AS month_value

            FROM task_work_sessions tws

            INNER JOIN tasks t
              ON t.task_id =
                 tws.task_id

            INNER JOIN projects p
              ON p.project_id =
                 t.project_id

            WHERE
              p.division_id
                IN (${divisionPlaceholders})

            UNION

            SELECT
              DATE_FORMAT(
                COALESCE(
                  mt.start_date,
                  mt.task_date
                ),
                '%Y-%m'
              ) AS month_value

            FROM mini_tasks mt

            WHERE
              mt.division_id
                IN (${divisionPlaceholders})

              AND LOWER(
                COALESCE(
                  mt.status,
                  ''
                )
              ) = 'reviewed'
          ) months

          WHERE
            month_value IS NOT NULL

          ORDER BY
            month_value DESC
        `,
        [
          ...selectedDivisionIds,
          ...selectedDivisionIds,
        ]
      );

    const availableMonths =
      monthRows
        .map(
          (row) =>
            row.month_value
        )
        .filter(Boolean);

    if (
      !availableMonths.includes(
        currentIndiaMonth
      )
    ) {
      availableMonths.unshift(
        currentIndiaMonth
      );
    }

    /* =====================================================
       RESPONSE
    ===================================================== */

    return res.status(200).json({
      success: true,

      assigned_divisions:
        assignedDivisions,

      selected_division_ids:
        selectedDivisionIds,

      selected_division:
        selectedDivision,

      period:
        selectedMonth
          ? {
              type: "month",
              month: selectedMonth,
            }
          : {
              type: "all",
              month: null,
            },

      available_months:
        availableMonths,

      main_task_total_seconds:
        reportMainSeconds,

      mini_task_total_seconds:
        reportMiniSeconds,

      total_seconds:
        reportMainSeconds +
        reportMiniSeconds,

      total_contributors:
        contributors.length,

      contributors,

      divisions,

      main_sessions:
        allMainSessions,

      mini_tasks:
        allMiniTasks,
    });
  } catch (error) {
    console.error(
      "Get admin Division report error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to fetch Division report.",

      error:
        error.message,

      sqlMessage:
        error.sqlMessage ||
        null,
    });
  }
};

module.exports = {
  getAdminDepartmentUsers,
  getAdminAssignableUsers,
  createAdminProject,
  getAdminUserTimeSummary,
  getAdminDivisionReport,
};