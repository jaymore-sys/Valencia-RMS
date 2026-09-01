const db = require("../config/db");

const mainTaskCondition = `(t.parent_task_id IS NULL OR t.parent_task_id = 0)`;

const PROJECT_DIVISIONS = [
  "POS",
  "NutraCare",
  "ADV",
  "Cans",
  "PET",
  "Crunzo",
  "Healthybites",
];

/* =========================================================
   HELPERS
========================================================= */

// Add before module.exports in superadmincontroller.js

const getSuperadminFieldVisits = async (req, res) => {
  try {
    const [visits] = await db.query(`
      SELECT
        fv.visit_id,
        fv.employee_id,
        u.full_name,
        u.email,
        u.employee_code,
        d.department_name,
        fv.visit_type,
        fv.visit_date,
        fv.start_time,
        fv.end_time,
        fv.location,
        fv.comment,
        fv.status,
        fv.review_remark,
        fv.created_at,
        fv.updated_at
      FROM employee_field_visits fv
      INNER JOIN users u
        ON fv.employee_id = u.user_id
      LEFT JOIN departments d
        ON u.department_id = d.department_id
      ORDER BY fv.created_at DESC
    `);

    res.json({
      success:true,
      summary:{
        total:visits.length,
        approved:visits.filter(v=>v.status==="approved").length,
        pending:visits.filter(v=>v.status==="pending").length,
        rejected:visits.filter(v=>v.status==="rejected").length,
        employees:new Set(visits.map(v=>v.employee_id)).size
      },
      visits
    });

  } catch(error){
    res.status(500).json({
      success:false,
      message:"Failed to fetch field visits"
    });
  }
};


const getLoggedInUserId = (req) =>
  Number(
    req.user?.user_id ||
      req.user?.id ||
      req.userId ||
      0
  );

const formatDateOnly = (value) => {
  if (!value) return null;

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const normalizeIdArray = (value) => {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  return [
    ...new Set(
      source
        .map((item) =>
          Number(
            item?.user_id ??
              item?.employee_id ??
              item
          )
        )
        .filter(
          (item) =>
            Number.isInteger(item) &&
            item > 0
        )
    ),
  ];
};

const normalizeStatus = (
  status,
  progress = 0
) => {
  const value = String(status || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  if (
    [
      "done",
      "completed",
      "complete",
    ].includes(value)
  ) {
    return "completed";
  }

  if (
    [
      "ongoing",
      "in_progress",
      "progress",
    ].includes(value)
  ) {
    return "in_progress";
  }

  if (
    [
      "under_review",
      "review",
      "pending_review",
    ].includes(value)
  ) {
    return "under_review";
  }

  if (
    [
      "rejected",
      "reject",
    ].includes(value)
  ) {
    return "rejected";
  }

  if (
    [
      "blocked",
      "on_hold",
      "hold",
    ].includes(value)
  ) {
    return "on_hold";
  }

  if (
    [
      "cancelled",
      "canceled",
    ].includes(value)
  ) {
    return "cancelled";
  }

  if (Number(progress) >= 100) {
    return "completed";
  }

  if (Number(progress) > 0) {
    return "in_progress";
  }

  return "not_started";
};

const combineCsvValues = (
  ...values
) => {
  const output = [];

  values.forEach((value) => {
    String(value || "")
      .split(",")
      .map((item) =>
        item.trim()
      )
      .filter(Boolean)
      .forEach((item) => {
        if (
          !output.includes(item)
        ) {
          output.push(item);
        }
      });
  });

  return output.join(", ");
};

/* =========================================================
   PROJECT ASSIGNMENT USER COLUMN
========================================================= */

const getProjectAssignmentUserColumn =
  async () => {
    try {
      const [columns] =
        await db.query(
          "SHOW COLUMNS FROM project_assignments"
        );

      const columnNames =
        columns.map(
          (column) =>
            column.Field
        );

      const possibleColumns = [
        "employee_id",
        "assigned_to_user_id",
        "user_id",
        "assigned_user_id",
      ];

      return (
        possibleColumns.find(
          (column) =>
            columnNames.includes(
              column
            )
        ) || null
      );
    } catch (error) {
      return null;
    }
  };

/* =========================================================
   VALIDATE ASSIGNABLE USERS
========================================================= */

const validateAssignableUsers =
  async (
    connection,
    userIds
  ) => {
    if (!userIds.length) {
      return [];
    }

    const [rows] =
      await connection.query(
        `
        SELECT
          u.user_id,
          u.full_name,
          u.email,
          u.employee_code,
          u.designation,
          u.department_id,
          u.status,

          d.department_name,

          r.role_name

        FROM users u

        LEFT JOIN departments d
          ON d.department_id =
             u.department_id

        LEFT JOIN roles r
          ON r.role_id =
             u.role_id

        WHERE
          u.user_id IN (?)

          AND LOWER(
            COALESCE(
              u.status,
              'active'
            )
          ) = 'active'

          AND LOWER(
            COALESCE(
              r.role_name,
              ''
            )
          ) IN (
            'employee',
            'admin',
            'administrator'
          )
        `,
        [userIds]
      );

    const validIds =
      new Set(
        rows.map((row) =>
          Number(
            row.user_id
          )
        )
      );

    const invalidIds =
      userIds.filter(
        (id) =>
          !validIds.has(
            Number(id)
          )
      );

    if (
      invalidIds.length
    ) {
      const error =
        new Error(
          "One or more selected users are invalid, inactive or cannot receive projects."
        );

      error.statusCode = 400;

      throw error;
    }

    return rows;
  };

/* =========================================================
   PROJECT ASSIGNMENTS

   Keeps existing progress for users already on project.
========================================================= */

const syncProjectAssignments =
  async (
    connection,
    projectId,
    employeeIds,
    assignedByUserId
  ) => {
    const [existingRows] =
      await connection.query(
        `
        SELECT
          employee_id,

          COALESCE(
            employee_progress,
            0
          ) AS employee_progress

        FROM project_assignments

        WHERE project_id = ?
        `,
        [projectId]
      );

    const progressMap =
      new Map(
        existingRows.map(
          (row) => [
            Number(
              row.employee_id
            ),

            Number(
              row.employee_progress ||
                0
            ),
          ]
        )
      );

    await connection.query(
      `
      DELETE FROM project_assignments
      WHERE project_id = ?
      `,
      [projectId]
    );

    for (
      const employeeId
      of employeeIds
    ) {
      await connection.query(
        `
        INSERT INTO project_assignments (
          project_id,
          employee_id,
          assigned_by_user_id,
          assignment_status,
          employee_progress,
          assigned_at
        )

        VALUES (
          ?,
          ?,
          ?,
          'assigned',
          ?,
          NOW()
        )
        `,
        [
          projectId,

          employeeId,

          assignedByUserId ||
            null,

          progressMap.get(
            Number(
              employeeId
            )
          ) || 0,
        ]
      );
    }
  };

/* =========================================================
   MAIN TASK ASSIGNMENTS

   One Main Task row
   Multiple employees through task_assignments.
========================================================= */

const syncMainTaskAssignments =
  async (
    connection,
    taskId,
    employeeIds,
    assignedByUserId
  ) => {
    await connection.query(
      `
      DELETE FROM task_assignments
      WHERE task_id = ?
      `,
      [taskId]
    );

    for (
      const employeeId
      of employeeIds
    ) {
      await connection.query(
        `
        INSERT INTO task_assignments (
          task_id,
          employee_id,
          assigned_by_user_id,
          assigned_at
        )

        VALUES (
          ?,
          ?,
          ?,
          NOW()
        )
        `,
        [
          taskId,
          employeeId,
          assignedByUserId ||
            null,
        ]
      );
    }

    /*
    Keep first employee in old
    assigned_to_user_id field for
    compatibility with older RMS code.
    */

    await connection.query(
      `
      UPDATE tasks

      SET assigned_to_user_id = ?

      WHERE task_id = ?
      `,
      [
        employeeIds[0] ||
          null,

        taskId,
      ]
    );
  };

/* =========================================================
   SUBTASKS + PROGRESS
========================================================= */

const attachSubtasksAndProgress =
  async (tasks) => {
    if (!tasks.length) {
      return [];
    }

    const taskIds =
      tasks.map(
        (task) =>
          task.task_id
      );

    const [subtasks] =
      await db.query(
        `
        SELECT
          task_id,
          project_id,
          parent_task_id,
          task_title,
          task_description,
          status,

          COALESCE(
            progress,
            0
          ) AS progress,

          COALESCE(
            is_checked,
            0
          ) AS is_checked,

          DATE_FORMAT(
            start_date,
            '%Y-%m-%d'
          ) AS start_date,

          DATE_FORMAT(
            due_date,
            '%Y-%m-%d'
          ) AS due_date

        FROM tasks

        WHERE
          parent_task_id
          IN (?)

        ORDER BY
          created_at ASC,
          task_id ASC
        `,
        [taskIds]
      );

    return tasks.map(
      (task) => {
        const taskSubtasks =
          subtasks.filter(
            (subtask) =>
              Number(
                subtask.parent_task_id
              ) ===
              Number(
                task.task_id
              )
          );

        const totalSubtasks =
          taskSubtasks.length;

        const completedSubtasks =
          taskSubtasks.filter(
            (subtask) => {
              return (
                Number(
                  subtask.is_checked
                ) === 1 ||

                [
                  "completed",
                  "done",
                  "complete",
                ].includes(
                  String(
                    subtask.status ||
                      ""
                  ).toLowerCase()
                ) ||

                Number(
                  subtask.progress ||
                    0
                ) >= 100
              );
            }
          ).length;

        let computedProgress =
          Number(
            task.progress ||
              0
          );

        let computedStatus =
          normalizeStatus(
            task.status,
            computedProgress
          );

        if (
          totalSubtasks > 0
        ) {
          computedProgress =
            Math.round(
              (
                completedSubtasks /
                totalSubtasks
              ) * 100
            );

          computedStatus =
            completedSubtasks ===
            0
              ? "not_started"
              : completedSubtasks <
                totalSubtasks
              ? "in_progress"
              : "completed";
        }

        return {
          ...task,

          progress:
            computedProgress,

          computed_progress:
            computedProgress,

          status_group:
            computedStatus,

          total_subtasks:
            totalSubtasks,

          completed_subtasks:
            completedSubtasks,

          pending_subtasks:
            totalSubtasks -
            completedSubtasks,

          subtasks:
            taskSubtasks,
        };
      }
    );
  };

/* =========================================================
   ALL MAIN TASKS
========================================================= */

const getAllMainTasks =
  async () => {
    const [tasks] =
      await db.query(
        `
        SELECT
          t.task_id,
          t.project_id,
          t.assigned_to_user_id,
          t.created_by_user_id,

          t.task_title,
          t.task_description,
          t.task_type,
          t.priority,
          t.status,

          COALESCE(
            t.progress,
            0
          ) AS progress,

          DATE_FORMAT(
            t.start_date,
            '%Y-%m-%d'
          ) AS start_date,

          DATE_FORMAT(
            t.due_date,
            '%Y-%m-%d'
          ) AS due_date,

          DATE_FORMAT(
            t.created_at,
            '%Y-%m-%d %H:%i'
          ) AS created_at,

          p.project_title,
          p.project_description,

          p.department_id
            AS project_department_id,

          p.division
            AS project_division,

          p.status
            AS project_status,

          COALESCE(
            p.overall_progress,
            0
          ) AS project_progress,

          DATE_FORMAT(
            p.start_date,
            '%Y-%m-%d'
          ) AS project_start_date,

          DATE_FORMAT(
            p.due_date,
            '%Y-%m-%d'
          ) AS project_due_date,

          primary_assignee.full_name
            AS primary_assignee_name,

          primary_assignee.email
            AS primary_assignee_email,

          primary_assignee.employee_code
            AS primary_assignee_employee_code,

          primary_assignee.designation
            AS primary_assignee_designation,

          creator.full_name
            AS assigned_by_name,

          creator.email
            AS assigned_by_email,

          creator.designation
            AS assigned_by_designation,

          d.department_name

        FROM tasks t

        LEFT JOIN projects p
          ON p.project_id =
             t.project_id

        LEFT JOIN users
          primary_assignee
          ON primary_assignee.user_id =
             t.assigned_to_user_id

        LEFT JOIN users creator
          ON creator.user_id =
             t.created_by_user_id

        LEFT JOIN departments d
          ON d.department_id =
             p.department_id

        WHERE
          ${mainTaskCondition}

        ORDER BY
          CASE
            WHEN t.status IN (
              'in_progress',
              'ongoing'
            ) THEN 1

            WHEN t.status IN (
              'not_started',
              'todo'
            ) THEN 2

            WHEN t.status =
              'under_review'
            THEN 3

            WHEN t.status IN (
              'completed',
              'done'
            ) THEN 4

            ELSE 5
          END,

          t.due_date ASC,
          t.created_at DESC
        `
      );

    if (!tasks.length) {
      return [];
    }

    const taskIds =
      tasks.map(
        (task) =>
          task.task_id
      );

    let assignmentRows = [];

    /*
    task_assignments is used in
    current RMS for multi-user tasks.

    Fallback to primary assignee if
    old rows do not have assignments.
    */

    try {
      const [rows] =
        await db.query(
          `
          SELECT
            ta.task_id,
            ta.employee_id,

            u.full_name,
            u.email,
            u.employee_code,
            u.designation,
            u.department_id,

            d.department_name,

            r.role_name

          FROM task_assignments ta

          INNER JOIN users u
            ON u.user_id =
               ta.employee_id

          LEFT JOIN departments d
            ON d.department_id =
               u.department_id

          LEFT JOIN roles r
            ON r.role_id =
               u.role_id

          WHERE
            ta.task_id IN (?)

          ORDER BY
            u.full_name ASC
          `,
          [taskIds]
        );

      assignmentRows =
        rows;
    } catch (error) {
      assignmentRows = [];
    }

    const assignmentMap =
      new Map();

    assignmentRows.forEach(
      (row) => {
        const taskId =
          Number(
            row.task_id
          );

        if (
          !assignmentMap.has(
            taskId
          )
        ) {
          assignmentMap.set(
            taskId,
            []
          );
        }

        assignmentMap
          .get(taskId)
          .push({
            user_id:
              row.employee_id,

            employee_id:
              row.employee_id,

            full_name:
              row.full_name,

            email:
              row.email,

            employee_code:
              row.employee_code,

            designation:
              row.designation,

            department_id:
              row.department_id,

            department_name:
              row.department_name,

            role_name:
              row.role_name,
          });
      }
    );

    const enrichedTasks =
      tasks.map((task) => {
        let assignees =
          assignmentMap.get(
            Number(
              task.task_id
            )
          ) || [];

        /*
        Compatibility fallback for
        old tasks.
        */

        if (
          !assignees.length &&
          task.assigned_to_user_id
        ) {
          assignees = [
            {
              user_id:
                task.assigned_to_user_id,

              employee_id:
                task.assigned_to_user_id,

              full_name:
                task.primary_assignee_name,

              email:
                task.primary_assignee_email,

              employee_code:
                task.primary_assignee_employee_code,

              designation:
                task.primary_assignee_designation,
            },
          ];
        }

        const assignedUserIds =
          assignees
            .map(
              (user) =>
                user.user_id
            )
            .filter(Boolean)
            .join(", ");

        const assignedNames =
          assignees
            .map(
              (user) =>
                user.full_name
            )
            .filter(Boolean)
            .join(", ");

        const assignedEmails =
          assignees
            .map(
              (user) =>
                user.email
            )
            .filter(Boolean)
            .join(", ");

        return {
          ...task,

          assignees,

          assigned_user_ids:
            assignedUserIds,

          assigned_names:
            assignedNames,

          assigned_emails:
            assignedEmails,

          assignee_name:
            assignedNames ||
            task.primary_assignee_name ||
            null,

          assignee_email:
            assignedEmails ||
            task.primary_assignee_email ||
            null,

          assignee_employee_code:
            task.primary_assignee_employee_code ||
            null,

          assignee_designation:
            task.primary_assignee_designation ||
            null,
        };
      });

    return attachSubtasksAndProgress(
      enrichedTasks
    );
  };

/* =========================================================
   ALL PROJECTS
========================================================= */

const getAllProjects =
  async () => {
    const assignmentUserColumn =
      await getProjectAssignmentUserColumn();

    const assignmentJoin =
      assignmentUserColumn
        ? `
          LEFT JOIN project_assignments pa
            ON pa.project_id =
               p.project_id

            AND COALESCE(
              pa.assignment_status,
              'assigned'
            ) <> 'removed'

          LEFT JOIN users
            assigned_from_project

            ON assigned_from_project.user_id =
               pa.${assignmentUserColumn}
        `
        : "";

    const assignmentSelect =
      assignmentUserColumn
        ? `
          GROUP_CONCAT(
            DISTINCT
            assigned_from_project.user_id
            SEPARATOR ', '
          ) AS project_assigned_user_ids,

          GROUP_CONCAT(
            DISTINCT
            assigned_from_project.full_name
            SEPARATOR ', '
          ) AS project_assigned_names,

          GROUP_CONCAT(
            DISTINCT
            assigned_from_project.email
            SEPARATOR ', '
          ) AS project_assigned_emails,
        `
        : `
          NULL AS project_assigned_user_ids,
          NULL AS project_assigned_names,
          NULL AS project_assigned_emails,
        `;

    const [rows] =
      await db.query(
        `
        SELECT
          p.project_id,
          p.created_by_user_id,
          p.department_id,
          p.division,

          p.project_title,
          p.project_description,
          p.priority,
          p.status,
          p.rejection_remark,

          COALESCE(
            p.overall_progress,
            0
          ) AS overall_progress,

          DATE_FORMAT(
            p.start_date,
            '%Y-%m-%d'
          ) AS start_date,

          DATE_FORMAT(
            p.due_date,
            '%Y-%m-%d'
          ) AS due_date,

          DATE_FORMAT(
            p.created_at,
            '%Y-%m-%d %H:%i'
          ) AS created_at,

          d.department_name,

          creator.full_name
            AS created_by_name,

          creator.email
            AS created_by_email,

          ${assignmentSelect}

          GROUP_CONCAT(
            DISTINCT
            task_assignee.user_id
            SEPARATOR ', '
          ) AS task_assigned_user_ids,

          GROUP_CONCAT(
            DISTINCT
            task_assignee.full_name
            SEPARATOR ', '
          ) AS task_assigned_names,

          GROUP_CONCAT(
            DISTINCT
            task_assignee.email
            SEPARATOR ', '
          ) AS task_assigned_emails,

          COUNT(
            DISTINCT
            t.task_id
          ) AS total_tasks,

          COUNT(
            DISTINCT
            CASE
              WHEN t.status IN (
                'completed',
                'done'
              )
              THEN t.task_id
            END
          ) AS completed_tasks,

          COUNT(
            DISTINCT
            CASE
              WHEN t.status IN (
                'in_progress',
                'ongoing'
              )
              THEN t.task_id
            END
          ) AS in_progress_tasks,

          COUNT(
            DISTINCT
            CASE
              WHEN
                t.status IS NULL

                OR t.status IN (
                  'not_started',
                  'todo'
                )

              THEN t.task_id
            END
          ) AS todo_tasks,

          ROUND(
            AVG(
              COALESCE(
                t.progress,
                0
              )
            )
          ) AS task_average_progress

        FROM projects p

        LEFT JOIN departments d
          ON d.department_id =
             p.department_id

        LEFT JOIN users creator
          ON creator.user_id =
             p.created_by_user_id

        ${assignmentJoin}

        LEFT JOIN tasks t
          ON t.project_id =
             p.project_id

          AND (
            t.parent_task_id
            IS NULL

            OR t.parent_task_id =
               0
          )

        LEFT JOIN users
          task_assignee

          ON task_assignee.user_id =
             t.assigned_to_user_id

        GROUP BY
          p.project_id,
          p.created_by_user_id,
          p.department_id,
          p.division,

          p.project_title,
          p.project_description,
          p.priority,
          p.status,
          p.rejection_remark,
          p.overall_progress,
          p.start_date,
          p.due_date,
          p.created_at,

          d.department_name,

          creator.full_name,
          creator.email

        ORDER BY
          p.created_at DESC
        `
      );

    return rows.map(
      (project) => {
        const assignedUserIds =
          combineCsvValues(
            project.project_assigned_user_ids,
            project.task_assigned_user_ids
          );

        const assignedNames =
          combineCsvValues(
            project.project_assigned_names,
            project.task_assigned_names
          );

        const assignedEmails =
          combineCsvValues(
            project.project_assigned_emails,
            project.task_assigned_emails
          );

        const taskAverageProgress =
          Number(
            project.task_average_progress ||
              0
          );

        return {
          ...project,

          assigned_user_ids:
            assignedUserIds,

          assigned_names:
            assignedNames,

          assigned_emails:
            assignedEmails,

          overall_progress:
            Number(
              project.overall_progress ||
                0
            ) > 0
              ? Number(
                  project.overall_progress ||
                    0
                )
              : taskAverageProgress,
        };
      }
    );
  };

/* =========================================================
   ALL USERS
========================================================= */

const getAllUsersBase =
  async () => {
    const [users] =
      await db.query(
        `
        SELECT
          u.user_id,
          u.employee_code,
          u.full_name,
          u.email,
          u.phone,
          u.designation,
          u.status,

          u.department_id,
          u.role_id,

          DATE_FORMAT(
            u.created_at,
            '%Y-%m-%d'
          ) AS created_at,

          r.role_name,

          d.department_name,

          ep.skills

        FROM users u

        JOIN roles r
          ON r.role_id =
             u.role_id

        LEFT JOIN departments d
          ON d.department_id =
             u.department_id

        LEFT JOIN employee_profiles ep
          ON ep.user_id =
             u.user_id

        WHERE
          u.status != 'deleted'

        ORDER BY
          u.full_name ASC
        `
      );

    return users;
  };

/* =========================================================
   ATTENDANCE
========================================================= */

const getAttendanceSummaryMap =
  async () => {
    const [rows] =
      await db.query(
        `
        SELECT
          employee_id
            AS user_id,

          COUNT(*)
            AS total_days,

          SUM(
            CASE
              WHEN LOWER(status) =
                   'present'
              THEN 1
              ELSE 0
            END
          ) AS present_days,

          SUM(
            CASE
              WHEN LOWER(status) =
                   'absent'
              THEN 1
              ELSE 0
            END
          ) AS absent_days,

          SUM(
            CASE
              WHEN LOWER(status) =
                   'half_day'
              THEN 1
              ELSE 0
            END
          ) AS half_day_days,

          SUM(
            CASE
              WHEN LOWER(status) =
                   'leave'
              THEN 1
              ELSE 0
            END
          ) AS leave_days,

          SUM(
            CASE
              WHEN LOWER(status) =
                   'holiday'
              THEN 1
              ELSE 0
            END
          ) AS holiday_days

        FROM attendance

        GROUP BY
          employee_id
        `
      );

    const map =
      new Map();

    rows.forEach(
      (row) => {
        const totalDays =
          Number(
            row.total_days ||
              0
          );

        const presentDays =
          Number(
            row.present_days ||
              0
          );

        map.set(
          Number(
            row.user_id
          ),
          {
            total_days:
              totalDays,

            present_days:
              presentDays,

            absent_days:
              Number(
                row.absent_days ||
                  0
              ),

            half_day_days:
              Number(
                row.half_day_days ||
                  0
              ),

            leave_days:
              Number(
                row.leave_days ||
                  0
              ),

            holiday_days:
              Number(
                row.holiday_days ||
                  0
              ),

            attendance_percentage:
              totalDays > 0
                ? Math.round(
                    (
                      presentDays /
                      totalDays
                    ) * 100
                  )
                : 0,
          }
        );
      }
    );

    return map;
  };

/* =========================================================
   USER WORK SUMMARY
========================================================= */

const buildUserWorkSummary =
  async () => {
    const users =
      await getAllUsersBase();

    const tasks =
      await getAllMainTasks();

    const projects =
      await getAllProjects();

    const attendanceMap =
      await getAttendanceSummaryMap();

    const userMap =
      new Map();

    users.forEach((user) => {
      userMap.set(
        Number(
          user.user_id
        ),
        {
          ...user,

          total_tasks: 0,
          todo_tasks: 0,
          in_progress_tasks: 0,
          under_review_tasks: 0,
          completed_tasks: 0,
          rejected_tasks: 0,
          blocked_tasks: 0,

          average_task_progress: 0,

          total_projects: 0,
          todo_projects: 0,
          ongoing_projects: 0,
          under_review_projects: 0,
          completed_projects: 0,

          created_tasks_count: 0,

          attendance:
            attendanceMap.get(
              Number(
                user.user_id
              )
            ) || {
              total_days: 0,
              present_days: 0,
              absent_days: 0,
              half_day_days: 0,
              leave_days: 0,
              holiday_days: 0,
              attendance_percentage: 0,
            },
        }
      );
    });

    tasks.forEach((task) => {
      const assignedIds =
        normalizeIdArray(
          task.assigned_user_ids
        );

      const creatorId =
        Number(
          task.created_by_user_id
        );

      assignedIds.forEach(
        (assigneeId) => {
          if (
            !userMap.has(
              assigneeId
            )
          ) {
            return;
          }

          const user =
            userMap.get(
              assigneeId
            );

          user.total_tasks +=
            1;

          if (
            task.status_group ===
            "completed"
          ) {
            user.completed_tasks +=
              1;
          } else if (
            task.status_group ===
            "in_progress"
          ) {
            user.in_progress_tasks +=
              1;
          } else if (
            task.status_group ===
            "under_review"
          ) {
            user.under_review_tasks +=
              1;
          } else if (
            task.status_group ===
            "rejected"
          ) {
            user.rejected_tasks +=
              1;
          } else if (
            [
              "blocked",
              "on_hold",
            ].includes(
              task.status_group
            )
          ) {
            user.blocked_tasks +=
              1;
          } else {
            user.todo_tasks +=
              1;
          }

          user.average_task_progress +=
            Number(
              task.progress ||
                0
            );
        }
      );

      if (
        userMap.has(
          creatorId
        )
      ) {
        userMap.get(
          creatorId
        ).created_tasks_count +=
          1;
      }
    });

    projects.forEach(
      (project) => {
        const assignedIds =
          normalizeIdArray(
            project.assigned_user_ids
          );

        const projectStatus =
          normalizeStatus(
            project.status,
            project.overall_progress
          );

        assignedIds.forEach(
          (userId) => {
            if (
              !userMap.has(
                userId
              )
            ) {
              return;
            }

            const user =
              userMap.get(
                userId
              );

            user.total_projects +=
              1;

            if (
              projectStatus ===
              "completed"
            ) {
              user.completed_projects +=
                1;
            } else if (
              projectStatus ===
              "under_review"
            ) {
              user.under_review_projects +=
                1;
            } else if (
              projectStatus ===
              "in_progress"
            ) {
              user.ongoing_projects +=
                1;
            } else {
              user.todo_projects +=
                1;
            }
          }
        );
      }
    );

    return Array.from(
      userMap.values()
    ).map((user) => ({
      ...user,

      average_task_progress:
        user.total_tasks > 0
          ? Math.round(
              user.average_task_progress /
                user.total_tasks
            )
          : 0,
    }));
  };

/* =========================================================
   SUPERADMIN OVERVIEW
========================================================= */

const getSuperadminOverview =
  async (req, res) => {
    try {
      const users =
        await buildUserWorkSummary();

      const tasks =
        await getAllMainTasks();

      const projects =
        await getAllProjects();

      const stats = {
        total_users:
          users.length,

        total_projects:
          projects.length,

        total_tasks:
          tasks.length,

        active_tasks:
          tasks.filter(
            (task) =>
              [
                "not_started",
                "in_progress",
                "under_review",
              ].includes(
                task.status_group
              )
          ).length,

        completed_tasks:
          tasks.filter(
            (task) =>
              task.status_group ===
              "completed"
          ).length,

        pending_tasks:
          tasks.filter(
            (task) =>
              task.status_group !==
              "completed"
          ).length,
      };

      return res.json({
        success: true,

        stats,

        employee_workload:
          users,

        recent_tasks:
          tasks,

        projects,
      });
    } catch (error) {
      console.error(
        "Superadmin overview error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to load superadmin overview.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    }
  };

/* =========================================================
   SUPERADMIN USERS
========================================================= */

const getSuperadminUsers =
  async (req, res) => {
    try {
      const users =
        await buildUserWorkSummary();

      return res.json({
        success: true,
        users,
      });
    } catch (error) {
      console.error(
        "Superadmin users error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to load superadmin users.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    }
  };

/* =========================================================
   USER DETAILS
========================================================= */

const getSuperadminUserDetails =
  async (req, res) => {
    try {
      const userId =
        Number(
          req.params.userId
        );

      const users =
        await buildUserWorkSummary();

      const user =
        users.find(
          (item) =>
            Number(
              item.user_id
            ) === userId
        );

      if (!user) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "User not found.",
          });
      }

      const tasks =
        await getAllMainTasks();

      const projects =
        await getAllProjects();

      const assignedTasks =
        tasks.filter((task) =>
          normalizeIdArray(
            task.assigned_user_ids
          ).includes(userId)
        );

      const createdTasks =
        tasks.filter(
          (task) =>
            Number(
              task.created_by_user_id
            ) === userId
        );

      const assignedProjects =
        projects.filter(
          (project) =>
            normalizeIdArray(
              project.assigned_user_ids
            ).includes(userId)
        );

      const [recentAttendance] =
        await db.query(
          `
          SELECT
            attendance_id,

            DATE_FORMAT(
              attendance_date,
              '%Y-%m-%d'
            ) AS attendance_date,

            status,
            check_in_time,
            check_out_time,
            total_minutes,
            remarks

          FROM attendance

          WHERE employee_id = ?

          ORDER BY
            attendance_date DESC

          LIMIT 30
          `,
          [userId]
        );

      return res.json({
        success: true,

        user,

        assigned_tasks:
          assignedTasks,

        created_tasks:
          createdTasks,

        assigned_projects:
          assignedProjects,

        recent_attendance:
          recentAttendance,
      });
    } catch (error) {
      console.error(
        "Superadmin user details error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to load user details.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    }
  };

/* =========================================================
   SUPERADMIN TASKS
========================================================= */

const getSuperadminTasks =
  async (req, res) => {
    try {
      const tasks =
        await getAllMainTasks();

      return res.json({
        success: true,
        tasks,
      });
    } catch (error) {
      console.error(
        "Superadmin tasks error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to load superadmin tasks.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    }
  };

/* =========================================================
   SUPERADMIN PROJECTS
========================================================= */

const getSuperadminProjects =
  async (req, res) => {
    try {
      const projects =
        await getAllProjects();

      return res.json({
        success: true,
        projects,
      });
    } catch (error) {
      console.error(
        "Superadmin projects error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to load superadmin projects.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    }
  };

/* =========================================================
   PROJECT OPTIONS

   Returns:
   - real DB departments
   - divisions
   - all active assignable users
========================================================= */

const getSuperadminProjectOptions =
  async (req, res) => {
    try {
      const [departments] =
        await db.query(
          `
          SELECT
            department_id,
            department_name

          FROM departments

          ORDER BY
            department_name ASC
          `
        );

      const allUsers =
        await getAllUsersBase();

      const users =
        allUsers.filter(
          (user) => {
            const role =
              String(
                user.role_name ||
                  ""
              ).toLowerCase();

            const status =
              String(
                user.status ||
                  ""
              ).toLowerCase();

            return (
              status ===
                "active" &&

              [
                "employee",
                "admin",
                "administrator",
              ].includes(role)
            );
          }
        );

      return res.json({
        success: true,

        departments,

        divisions:
          PROJECT_DIVISIONS,

        users,
      });
    } catch (error) {
      console.error(
        "Superadmin project options error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to load project departments and employees.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    }
  };

/* =========================================================
   COMPLETE PROJECT DETAILS

   Returns:
   - project
   - assignees
   - all Main Tasks
   - subtasks
   - can_delete
========================================================= */

const getSuperadminProjectContext =
  async (req, res) => {
    try {
      const projectId =
        Number(
          req.params.projectId
        );

      const loggedInUserId =
        getLoggedInUserId(req);

      if (!projectId) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid project ID.",
          });
      }

      const projects =
        await getAllProjects();

      const project =
        projects.find(
          (item) =>
            Number(
              item.project_id
            ) === projectId
        );

      if (!project) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Project not found.",
          });
      }

      const allUsers =
        await getAllUsersBase();

      const assignedIds =
        normalizeIdArray(
          project.assigned_user_ids
        );

      const assignees =
        allUsers.filter(
          (user) =>
            assignedIds.includes(
              Number(
                user.user_id
              )
            )
        );

      const allTasks =
        await getAllMainTasks();

      const tasks =
        allTasks.filter(
          (task) =>
            Number(
              task.project_id
            ) === projectId
        );

      return res.json({
        success: true,

        project,

        assignees,

        tasks,

        can_delete:
          Number(
            project.created_by_user_id
          ) ===
          Number(
            loggedInUserId
          ),
      });
    } catch (error) {
      console.error(
        "Superadmin project context error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to load complete project details.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    }
  };

/* =========================================================
   CREATE + ASSIGN PROJECT
========================================================= */

const createSuperadminProject =
  async (req, res) => {
    const connection =
      await db.getConnection();

    try {
      const superadminUserId =
        getLoggedInUserId(req);

      const projectTitle =
        String(
          req.body.project_title ||
            req.body.title ||
            ""
        ).trim();

      const projectDescription =
        String(
          req.body.project_description ||
            req.body.description ||
            ""
        ).trim();

      const departmentId =
        Number(
          req.body.department_id ||
            0
        );

      const division =
        String(
          req.body.division ||
            ""
        ).trim();

      const priority =
        String(
          req.body.priority ||
            "medium"
        ).toLowerCase();

      const startDate =
        formatDateOnly(
          req.body.start_date ||
            req.body.startDate
        );

      const dueDate =
        formatDateOnly(
          req.body.due_date ||
            req.body.end_date ||
            req.body.endDate
        );

      const assigneeIds =
        normalizeIdArray(
          req.body.assignee_ids ||
            req.body.assignees ||
            req.body.project_assignees
        );

      if (!superadminUserId) {
        return res
          .status(401)
          .json({
            success: false,

            message:
              "Unable to identify logged-in Superadmin.",
          });
      }

      if (!projectTitle) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Project title is required.",
          });
      }

      if (!departmentId) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Department is required.",
          });
      }

      if (
        !PROJECT_DIVISIONS.includes(
          division
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Please select a valid division.",
          });
      }

      if (
        !startDate ||
        !dueDate
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Project start date and due date are required.",
          });
      }

      if (
        startDate > dueDate
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Project due date cannot be before the start date.",
          });
      }

      if (
        !assigneeIds.length
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Select at least one project assignee.",
          });
      }

      const [departmentRows] =
        await connection.query(
          `
          SELECT
            department_id

          FROM departments

          WHERE
            department_id = ?

          LIMIT 1
          `,
          [departmentId]
        );

      if (
        !departmentRows.length
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Selected department does not exist.",
          });
      }

      await validateAssignableUsers(
        connection,
        assigneeIds
      );

      await connection.beginTransaction();

      const [result] =
        await connection.query(
          `
          INSERT INTO projects (
            created_by_user_id,
            department_id,
            division,
            project_title,
            project_description,
            priority,
            status,
            start_date,
            due_date,
            overall_progress,
            created_at,
            updated_at
          )

          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            'not_started',
            ?,
            ?,
            0,
            NOW(),
            NOW()
          )
          `,
          [
            superadminUserId,

            departmentId,

            division,

            projectTitle,

            projectDescription ||
              null,

            [
              "low",
              "medium",
              "high",
              "urgent",
            ].includes(priority)
              ? priority
              : "medium",

            startDate,

            dueDate,
          ]
        );

      const projectId =
        Number(
          result.insertId
        );

      await syncProjectAssignments(
        connection,
        projectId,
        assigneeIds,
        superadminUserId
      );

      await connection.commit();

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Project assigned successfully.",

          project_id:
            projectId,

          assignee_ids:
            assigneeIds,
        });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {}

      console.error(
        "Create Superadmin project error:",
        error
      );

      return res
        .status(
          error.statusCode ||
            500
        )
        .json({
          success: false,

          message:
            error.statusCode &&
            error.message
              ? error.message
              : "Failed to create project.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    } finally {
      connection.release();
    }
  };

/* =========================================================
   UPDATE PROJECT ASSIGNEES
========================================================= */

const updateSuperadminProjectAssignees =
  async (req, res) => {
    const connection =
      await db.getConnection();

    try {
      const superadminUserId =
        getLoggedInUserId(req);

      const projectId =
        Number(
          req.params.projectId ||
            0
        );

      const assigneeIds =
        normalizeIdArray(
          req.body.assignee_ids ||
            req.body.assignees
        );

      if (!projectId) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid project ID.",
          });
      }

      if (
        !assigneeIds.length
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Project must have at least one assignee.",
          });
      }

      const [projectRows] =
        await connection.query(
          `
          SELECT
            project_id

          FROM projects

          WHERE
            project_id = ?

          LIMIT 1
          `,
          [projectId]
        );

      if (
        !projectRows.length
      ) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Project not found.",
          });
      }

      await validateAssignableUsers(
        connection,
        assigneeIds
      );

      await connection.beginTransaction();

      await syncProjectAssignments(
        connection,
        projectId,
        assigneeIds,
        superadminUserId
      );

      await connection.query(
        `
        UPDATE projects

        SET
          updated_at = NOW()

        WHERE
          project_id = ?
        `,
        [projectId]
      );

      await connection.commit();

      return res.json({
        success: true,

        message:
          "Project assignees updated successfully.",

        project_id:
          projectId,

        assignee_ids:
          assigneeIds,
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {}

      console.error(
        "Update Superadmin project assignees error:",
        error
      );

      return res
        .status(
          error.statusCode ||
            500
        )
        .json({
          success: false,

          message:
            error.statusCode &&
            error.message
              ? error.message
              : "Failed to update project assignees.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    } finally {
      connection.release();
    }
  };

/* =========================================================
   CREATE MAIN TASK
========================================================= */

const createSuperadminMainTask =
  async (req, res) => {
    const connection =
      await db.getConnection();

    try {
      const superadminUserId =
        getLoggedInUserId(req);

      const projectId =
        Number(
          req.params.projectId ||
            req.body.project_id ||
            0
        );

      const taskTitle =
        String(
          req.body.task_title ||
            req.body.title ||
            ""
        ).trim();

      const taskDescription =
        String(
          req.body.task_description ||
            req.body.description ||
            ""
        ).trim();

      const priority =
        String(
          req.body.priority ||
            "medium"
        ).toLowerCase();

      const assigneeIds =
        normalizeIdArray(
          req.body.assignee_ids ||
            req.body.assignees ||
            req.body.assigned_to_user_ids
        );

      const requestedStartDate =
        formatDateOnly(
          req.body.start_date ||
            req.body.startDate
        );

      const requestedDueDate =
        formatDateOnly(
          req.body.due_date ||
            req.body.end_date ||
            req.body.endDate ||
            req.body.deadline
        );

      if (!superadminUserId) {
        return res
          .status(401)
          .json({
            success: false,

            message:
              "Unable to identify logged-in Superadmin.",
          });
      }

      if (!projectId) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Project ID is required.",
          });
      }

      if (!taskTitle) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Main Task title is required.",
          });
      }

      if (
        !assigneeIds.length
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Select at least one Main Task assignee.",
          });
      }

      const [projectRows] =
        await connection.query(
          `
          SELECT
            project_id,
            project_title,

            DATE_FORMAT(
              start_date,
              '%Y-%m-%d'
            ) AS start_date,

            DATE_FORMAT(
              due_date,
              '%Y-%m-%d'
            ) AS due_date

          FROM projects

          WHERE
            project_id = ?

          LIMIT 1
          `,
          [projectId]
        );

      if (
        !projectRows.length
      ) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Project not found.",
          });
      }

      const project =
        projectRows[0];

      const taskStartDate =
        requestedStartDate ||
        project.start_date;

      const taskDueDate =
        requestedDueDate ||
        project.due_date;

      if (
        !taskStartDate ||
        !taskDueDate
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Main Task start date and due date are required.",
          });
      }

      if (
        taskStartDate >
        taskDueDate
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Main Task due date cannot be before its start date.",
          });
      }

      if (
        project.start_date &&
        taskStartDate <
          project.start_date
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              `Main Task start date cannot be before Project start date (${project.start_date}).`,
          });
      }

      if (
        project.due_date &&
        taskDueDate >
          project.due_date
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              `Main Task deadline cannot exceed Project deadline (${project.due_date}).`,
          });
      }

      /*
      Main Task assignees must
      already belong to Project.
      */

      const [assignedRows] =
        await connection.query(
          `
          SELECT
            employee_id

          FROM project_assignments

          WHERE
            project_id = ?

            AND employee_id
              IN (?)

            AND COALESCE(
              assignment_status,
              'assigned'
            ) <> 'removed'
          `,
          [
            projectId,
            assigneeIds,
          ]
        );

      const allowedIds =
        new Set(
          assignedRows.map(
            (row) =>
              Number(
                row.employee_id
              )
          )
        );

      const invalidIds =
        assigneeIds.filter(
          (id) =>
            !allowedIds.has(
              Number(id)
            )
        );

      if (
        invalidIds.length
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Main Task can only be assigned to users already assigned to this project.",
          });
      }

      await connection.beginTransaction();

      const primaryEmployeeId =
        assigneeIds[0];

      const [taskResult] =
        await connection.query(
          `
          INSERT INTO tasks (
            project_id,
            parent_task_id,
            created_by_user_id,
            assigned_to_user_id,
            task_title,
            task_description,
            task_type,
            status,
            priority,
            progress,
            is_checked,
            start_date,
            due_date,
            review_status,
            created_at,
            updated_at
          )

          VALUES (
            ?,
            NULL,
            ?,
            ?,
            ?,
            ?,
            'main',
            'not_started',
            ?,
            0,
            0,
            ?,
            ?,
            'none',
            NOW(),
            NOW()
          )
          `,
          [
            projectId,

            superadminUserId,

            primaryEmployeeId,

            taskTitle,

            taskDescription,

            [
              "low",
              "medium",
              "high",
              "urgent",
            ].includes(
              priority
            )
              ? priority
              : "medium",

            taskStartDate,

            taskDueDate,
          ]
        );

      const taskId =
        Number(
          taskResult.insertId
        );

      await syncMainTaskAssignments(
        connection,
        taskId,
        assigneeIds,
        superadminUserId
      );

      await connection.commit();

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Main Task assigned successfully.",

          task_id:
            taskId,

          task_ids: [
            taskId,
          ],

          assignee_ids:
            assigneeIds,

          start_date:
            taskStartDate,

          due_date:
            taskDueDate,
        });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {}

      console.error(
        "Create Superadmin Main Task error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to assign Main Task.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    } finally {
      connection.release();
    }
  };

/* =========================================================
   DELETE PROJECT

   SUPERADMIN CAN DELETE ONLY
   PROJECTS CREATED BY THAT SUPERADMIN.
========================================================= */

const deleteOwnSuperadminProject =
  async (req, res) => {
    const connection =
      await db.getConnection();

    try {
      const superadminUserId =
        getLoggedInUserId(req);

      const projectId =
        Number(
          req.params.projectId ||
            req.params.id ||
            0
        );

      if (!projectId) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Project ID is required.",
          });
      }

      const [projectRows] =
        await connection.query(
          `
          SELECT
            project_id,
            created_by_user_id,
            project_title

          FROM projects

          WHERE
            project_id = ?

          LIMIT 1
          `,
          [projectId]
        );

      if (
        !projectRows.length
      ) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Project not found.",
          });
      }

      const project =
        projectRows[0];

      if (
        Number(
          project.created_by_user_id
        ) !==
        Number(
          superadminUserId
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You can only delete projects created by you. Projects created by other users cannot be deleted.",
          });
      }

      await connection.beginTransaction();

      /*
      Remove task assignment rows first.
      */

      await connection.query(
        `
        DELETE ta

        FROM task_assignments ta

        INNER JOIN tasks t
          ON t.task_id =
             ta.task_id

        WHERE
          t.project_id = ?
        `,
        [projectId]
      );

      /*
      Remove subtasks.
      */

      await connection.query(
        `
        DELETE FROM tasks

        WHERE
          project_id = ?

          AND parent_task_id
            IS NOT NULL

          AND parent_task_id
            <> 0
        `,
        [projectId]
      );

      /*
      Remove Main Tasks.
      */

      await connection.query(
        `
        DELETE FROM tasks

        WHERE project_id = ?
        `,
        [projectId]
      );

      /*
      Remove project assignments.
      */

      await connection.query(
        `
        DELETE FROM project_assignments

        WHERE project_id = ?
        `,
        [projectId]
      );

      /*
      Delete project only if owned
      by current Superadmin.
      */

      const [deleteResult] =
        await connection.query(
          `
          DELETE FROM projects

          WHERE
            project_id = ?

            AND created_by_user_id = ?
          `,
          [
            projectId,
            superadminUserId,
          ]
        );

      if (
        !deleteResult.affectedRows
      ) {
        throw new Error(
          "Project deletion did not affect any project row."
        );
      }

      await connection.commit();

      return res.json({
        success: true,

        message:
          "Project deleted successfully.",

        project_id:
          projectId,
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {}

      console.error(
        "Delete Superadmin project error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to delete project.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    } finally {
      connection.release();
    }
  };

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getSuperadminOverview,

  getSuperadminUsers,

  getSuperadminUserDetails,

  getSuperadminTasks,

  getSuperadminProjects,

  getSuperadminProjectOptions,

  getSuperadminProjectContext,

  createSuperadminProject,

  updateSuperadminProjectAssignees,

  createSuperadminMainTask,

  deleteOwnSuperadminProject,
};



// =====================================================
// SUPERADMIN FIELD VISITS
// =====================================================

exports.getSuperadminFieldVisits = async (req, res) => {
  try {

    const [visits] = await db.query(
      `
      SELECT
        fv.visit_id,
        fv.employee_id,

        u.full_name,
        u.email,
        u.employee_code,

        d.department_name,

        fv.visit_type,
        fv.visit_date,
        fv.start_time,
        fv.end_time,
        fv.location,
        fv.comment,

        fv.status,
        fv.review_remark,

        fv.created_at,
        fv.updated_at

      FROM employee_field_visits fv

      INNER JOIN users u
        ON fv.employee_id = u.user_id

      LEFT JOIN departments d
        ON u.department_id = d.department_id

      ORDER BY fv.created_at DESC
      `
    );


    const summary = {
      total: visits.length,

      approved: visits.filter(
        v => v.status === "approved"
      ).length,

      pending: visits.filter(
        v => v.status === "pending"
      ).length,

      rejected: visits.filter(
        v => v.status === "rejected"
      ).length,

      employees:
        new Set(
          visits.map(v => v.employee_id)
        ).size
    };


    res.json({
      success:true,
      summary,
      visits
    });


  } catch(error){

    console.error(
      "Superadmin field visits error:",
      error
    );


    res.status(500).json({
      success:false,
      message:
        "Failed to fetch field visits"
    });

  }
};