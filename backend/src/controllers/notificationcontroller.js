const db = require("../config/db");


/* =========================================================
   CONSTANTS
========================================================= */

const GLOBAL_LEAVE_APPROVER_EMAILS = [
  "premal.mehta@valencianutrition.com",
  "rathika.haleangadi@valencianutrition.com",
];

const GENERATED_PREFIX = "rms:";


/* =========================================================
   HELPERS
========================================================= */

const getLoggedInUserId = (req) =>
  Number(
    req.user?.user_id ||
      req.user?.id ||
      req.user?.userId ||
      0
  );


const normalizeRole = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();


const normalizeStatus = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");


const isFinishedStatus = (status) =>
  [
    "done",
    "completed",
    "complete",
    "cancelled",
    "canceled",
  ].includes(
    normalizeStatus(status)
  );


const getLeaveLabel = (type) => {
  const value =
    normalizeStatus(type);

  if (value === "sick") {
    return "Sick Leave";
  }

  if (value === "casual") {
    return "Casual Leave";
  }

  if (value === "mandatory") {
    return "Privileged Leave";
  }

  if (value === "festival") {
    return "Festival Leave";
  }

  if (value === "unpaid") {
    return "Unpaid Leave";
  }

  return type || "Leave";
};


const getUserContext = async (
  req
) => {
  const userId =
    getLoggedInUserId(req);

  if (!userId) {
    return {
      error: {
        status: 401,
        message: "Unauthorized.",
      },
    };
  }

  const [rows] =
    await db.query(
      `
      SELECT
        u.user_id,
        u.full_name,
        u.email,
        u.department_id,

        d.department_name,

        r.role_name

      FROM users u

      LEFT JOIN departments d
        ON d.department_id =
           u.department_id

      LEFT JOIN roles r
        ON r.role_id =
           u.role_id

      WHERE u.user_id = ?

      LIMIT 1
      `,
      [userId]
    );

  if (!rows.length) {
    return {
      error: {
        status: 404,
        message:
          "User account not found.",
      },
    };
  }

  const user = rows[0];

  const roleName =
    normalizeRole(
      user.role_name
    );

  if (
    roleName !== "admin" &&
    roleName !== "superadmin"
  ) {
    return {
      error: {
        status: 403,
        message:
          "Notifications are available only for Admin and Superadmin.",
      },
    };
  }

  return {
    user: {
      ...user,

      role_name:
        roleName,

      email_normalized:
        String(
          user.email || ""
        )
          .trim()
          .toLowerCase(),
    },
  };
};


const addEvent = (
  events,
  event
) => {
  if (
    !event?.event_key ||
    !event?.notification_type ||
    !event?.message
  ) {
    return;
  }

  events.push({
    actor_user_id:
      event.actor_user_id ||
      null,

    event_key:
      `${GENERATED_PREFIX}${event.event_key}`,

    project_id:
      event.project_id ||
      null,

    task_id:
      event.task_id ||
      null,

    reference_type:
      event.reference_type ||
      null,

    reference_id:
      event.reference_id ||
      null,

    notification_type:
      event.notification_type,

    category:
      event.category ||
      "update",

    priority:
      event.priority ||
      "normal",

    title:
      event.title ||
      "Notification",

    message:
      event.message,

    target_url:
      event.target_url ||
      null,
  });
};


/* =========================================================
   PROJECT DEADLINES
========================================================= */

const buildProjectNotifications =
  async (
    user,
    events
  ) => {

  const params = [];

  let scope = "";

  if (
    user.role_name ===
    "admin"
  ) {
    if (
      user.department_id &&
      user.user_id
    ) {
      scope = `
        AND (
          p.department_id = ?
          OR p.created_by_user_id = ?
        )
      `;

      params.push(
        user.department_id,
        user.user_id
      );
    } else {
      scope = `
        AND p.created_by_user_id = ?
      `;

      params.push(
        user.user_id
      );
    }
  }

  const [projects] =
    await db.query(
      `
      SELECT
        p.project_id,
        p.project_title,
        p.status,

        DATE_FORMAT(
          p.due_date,
          '%Y-%m-%d'
        ) AS due_date,

        DATEDIFF(
          p.due_date,
          CURDATE()
        ) AS days_remaining

      FROM projects p

      WHERE
        p.due_date IS NOT NULL

        ${scope}

      ORDER BY
        p.due_date ASC
      `,
      params
    );


  projects.forEach(
    (project) => {

    if (
      isFinishedStatus(
        project.status
      )
    ) {
      return;
    }

    const days =
      Number(
        project.days_remaining
      );

    const target =
      user.role_name ===
      "superadmin"
        ? "/superadmin/projects"
        : "/admin/projects";


    if (days < 0) {
      const overdueDays =
        Math.abs(days);

      addEvent(
        events,
        {
          event_key:
            `project_overdue:${project.project_id}`,

          notification_type:
            "project_overdue",

          category:
            "action",

          priority:
            "high",

          title:
            "Project Overdue",

          message:
            `${project.project_title || "Project"} is overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}.`,

          project_id:
            project.project_id,

          reference_type:
            "project",

          reference_id:
            project.project_id,

          target_url:
            target,
        }
      );

      return;
    }


    if (
      ![
        7,
        3,
        1,
        0,
      ].includes(days)
    ) {
      return;
    }


    let title =
      "Project Deadline";

    let message =
      `${project.project_title || "Project"} is due in ${days} days.`;


    if (days === 0) {
      title =
        "Project Due Today";

      message =
        `${project.project_title || "Project"} is due today.`;
    }

    if (days === 1) {
      title =
        "Project Due Tomorrow";

      message =
        `${project.project_title || "Project"} is due tomorrow.`;
    }


    addEvent(
      events,
      {
        event_key:
          `project_due_${days}:${project.project_id}`,

        notification_type:
          "project_deadline",

        category:
          "deadline",

        priority:
          days <= 1
            ? "high"
            : "normal",

        title,

        message,

        project_id:
          project.project_id,

        reference_type:
          "project",

        reference_id:
          project.project_id,

        target_url:
          target,
      }
    );
  });
};


/* =========================================================
   TASK NOTIFICATIONS
========================================================= */

const buildTaskNotifications =
  async (
    user,
    events
  ) => {

  const params = [];

  let scope = "";

  if (
    user.role_name ===
    "admin"
  ) {
    if (!user.department_id) {
      return;
    }

    scope = `
      AND p.department_id = ?
    `;

    params.push(
      user.department_id
    );
  }


  const [tasks] =
    await db.query(
      `
      SELECT
        t.task_id,
        t.project_id,
        t.task_title,
        t.status,

        COALESCE(
          t.progress,
          0
        ) AS progress,

        DATE_FORMAT(
          t.due_date,
          '%Y-%m-%d'
        ) AS due_date,

        DATEDIFF(
          CURDATE(),
          t.due_date
        ) AS overdue_days,

        p.project_title

      FROM tasks t

      LEFT JOIN projects p
        ON p.project_id =
           t.project_id

      WHERE
        (
          t.parent_task_id IS NULL
          OR t.parent_task_id = 0
        )

        AND (
          t.task_type IS NULL
          OR LOWER(
            t.task_type
          ) NOT IN (
            'subtask',
            'sub_task'
          )
        )

        ${scope}

      ORDER BY
        t.task_id DESC
      `,
      params
    );


  const target =
    user.role_name ===
    "superadmin"
      ? "/superadmin/tasks"
      : "/admin/tasks";


  tasks.forEach(
    (task) => {

    const status =
      normalizeStatus(
        task.status
      );


    /*
    ADMIN TASK WAITING FOR REVIEW
    */

    if (
      user.role_name ===
        "admin" &&
      status ===
        "under_review"
    ) {
      addEvent(
        events,
        {
          event_key:
            `task_review:${task.task_id}`,

          notification_type:
            "task_review",

          category:
            "action",

          priority:
            "high",

          title:
            "Task Waiting For Review",

          message:
            `${task.task_title || "Task"}${task.project_title ? ` from ${task.project_title}` : ""} is waiting for your review.`,

          project_id:
            task.project_id,

          task_id:
            task.task_id,

          reference_type:
            "task",

          reference_id:
            task.task_id,

          target_url:
            target,
        }
      );
    }


    /*
    OVERDUE TASK
    */

    if (
      !task.due_date ||
      isFinishedStatus(status) ||
      Number(task.progress) >= 100
    ) {
      return;
    }

    const overdueDays =
      Number(
        task.overdue_days
      );

    if (overdueDays <= 0) {
      return;
    }


    addEvent(
      events,
      {
        event_key:
          `task_overdue:${task.task_id}`,

        notification_type:
          "task_overdue",

        category:
          "action",

        priority:
          "high",

        title:
          "Task Overdue",

        message:
          `${task.task_title || "Task"}${task.project_title ? ` from ${task.project_title}` : ""} is overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}.`,

        project_id:
          task.project_id,

        task_id:
          task.task_id,

        reference_type:
          "task",

        reference_id:
          task.task_id,

        target_url:
          target,
      }
    );
  });
};


/* =========================================================
   LEAVE APPLICATIONS
========================================================= */

const buildLeaveNotifications =
  async (
    user,
    events
  ) => {

  let query = "";

  let params = [];


  /*
  SUPERADMIN
  */

  if (
    user.role_name ===
    "superadmin"
  ) {
    query = `
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

        employee.full_name
          AS employee_name,

        employee_role.role_name
          AS applicant_role

      FROM leave_applications la

      INNER JOIN users employee
        ON employee.user_id =
           la.employee_id

      INNER JOIN roles employee_role
        ON employee_role.role_id =
           employee.role_id

      WHERE
        LOWER(
          COALESCE(
            la.status,
            ''
          )
        ) = 'pending'

        AND LOWER(
          TRIM(
            COALESCE(
              employee_role.role_name,
              ''
            )
          )
        ) IN (
          'employee',
          'admin',
          'administrator'
        )

      ORDER BY
        la.applied_at DESC
    `;
  }


  /*
  ADMIN
  */

  else {
    const isGlobalApprover =
      GLOBAL_LEAVE_APPROVER_EMAILS
        .includes(
          user.email_normalized
        );


    if (isGlobalApprover) {

      query = `
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

          employee.full_name
            AS employee_name,

          employee_role.role_name
            AS applicant_role

        FROM leave_applications la

        INNER JOIN users employee
          ON employee.user_id =
             la.employee_id

        INNER JOIN roles employee_role
          ON employee_role.role_id =
             employee.role_id

        WHERE
          LOWER(
            COALESCE(
              la.status,
              ''
            )
          ) = 'pending'

          AND COALESCE(
            la.escalated_for_approval,
            0
          ) = 0

          AND LOWER(
            TRIM(
              COALESCE(
                employee_role.role_name,
                ''
              )
            )
          ) IN (
            'employee',
            'admin',
            'administrator'
          )

        ORDER BY
          la.applied_at DESC
      `;

    } else {

      if (!user.department_id) {
        return;
      }

      query = `
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

          employee.full_name
            AS employee_name,

          employee_role.role_name
            AS applicant_role

        FROM leave_applications la

        INNER JOIN users employee
          ON employee.user_id =
             la.employee_id

        INNER JOIN roles employee_role
          ON employee_role.role_id =
             employee.role_id

        WHERE
          LOWER(
            COALESCE(
              la.status,
              ''
            )
          ) = 'pending'

          AND COALESCE(
            la.escalated_for_approval,
            0
          ) = 0

          AND LOWER(
            TRIM(
              COALESCE(
                employee_role.role_name,
                ''
              )
            )
          ) = 'employee'

          AND (
            EXISTS (
              SELECT 1

              FROM user_departments employee_ud

              WHERE
                employee_ud.user_id =
                  employee.user_id

                AND employee_ud.department_id
                IN (
                  SELECT
                    admin_ud.department_id

                  FROM user_departments admin_ud

                  WHERE
                    admin_ud.user_id = ?
                )
            )

            OR employee.department_id
            IN (
              SELECT
                admin_ud.department_id

              FROM user_departments admin_ud

              WHERE
                admin_ud.user_id = ?
            )

            OR EXISTS (
              SELECT 1

              FROM user_departments employee_ud

              WHERE
                employee_ud.user_id =
                  employee.user_id

                AND employee_ud.department_id = ?
            )

            OR employee.department_id = ?
          )

        ORDER BY
          la.applied_at DESC
      `;

      params = [
        user.user_id,
        user.user_id,
        user.department_id,
        user.department_id,
      ];
    }
  }


  const [applications] =
    await db.query(
      query,
      params
    );


  const target =
    user.role_name ===
    "superadmin"
      ? "/superadmin/leave-applications"
      : "/admin/leave-applications";


  applications.forEach(
    (leave) => {

    const leaveLabel =
      getLeaveLabel(
        leave.leave_type
      );


    addEvent(
      events,
      {
        actor_user_id:
          leave.employee_id,

        event_key:
          `leave_pending:${leave.leave_id}`,

        notification_type:
          "leave_pending",

        category:
          "action",

        priority:
          "high",

        title:
          "Leave Approval Required",

        message:
          `${leave.employee_name || "Employee"} submitted ${leaveLabel} from ${leave.start_date || "-"} to ${leave.end_date || "-"}.`,

        reference_type:
          "leave",

        reference_id:
          leave.leave_id,

        target_url:
          target,
      }
    );
  });
};


/* =========================================================
   FIELD VISITS
========================================================= */

const buildFieldVisitNotifications =
  async (
    user,
    events
  ) => {

  let query = "";

  let params = [];


  /*
  SUPERADMIN:
  Existing Superadmin field visit page
  contains ADMIN-created visits.
  */

  if (
    user.role_name ===
    "superadmin"
  ) {

    query = `
      SELECT
        fv.visit_id,
        fv.employee_id,
        fv.visit_type,
        fv.visit_date,
        fv.location,
        fv.status,

        creator.full_name,

        (
          SELECT GROUP_CONCAT(
            DISTINCT member_user.full_name
            ORDER BY member_user.full_name
            SEPARATOR ', '
          )

          FROM field_visit_members member_link

          INNER JOIN users member_user
            ON member_user.user_id =
               member_link.employee_id

          WHERE
            member_link.visit_id =
              fv.visit_id
        ) AS team_members

      FROM employee_field_visits fv

      INNER JOIN users creator
        ON creator.user_id =
           fv.employee_id

      INNER JOIN roles creator_role
        ON creator_role.role_id =
           creator.role_id

      WHERE
        LOWER(
          COALESCE(
            creator_role.role_name,
            ''
          )
        ) = 'admin'

        AND (
          LOWER(
            COALESCE(
              fv.status,
              ''
            )
          ) = 'pending'

          OR (
            LOWER(
              COALESCE(
                fv.status,
                ''
              )
            ) = 'approved'

            AND DATE(
              fv.visit_date
            ) = CURDATE()
          )
        )

      ORDER BY
        fv.visit_date DESC,
        fv.visit_id DESC
    `;

  }


  /*
  ADMIN:
  Existing Admin field visit page
  contains Employee visits from
  their department.
  */

  else {

    if (!user.department_id) {
      return;
    }

    query = `
      SELECT
        fv.visit_id,
        fv.employee_id,
        fv.visit_type,
        fv.visit_date,
        fv.location,
        fv.status,

        creator.full_name,

        (
          SELECT GROUP_CONCAT(
            DISTINCT member_user.full_name
            ORDER BY member_user.full_name
            SEPARATOR ', '
          )

          FROM field_visit_members member_link

          INNER JOIN users member_user
            ON member_user.user_id =
               member_link.employee_id

          WHERE
            member_link.visit_id =
              fv.visit_id
        ) AS team_members

      FROM employee_field_visits fv

      INNER JOIN users creator
        ON creator.user_id =
           fv.employee_id

      INNER JOIN roles creator_role
        ON creator_role.role_id =
           creator.role_id

      WHERE
        (
          EXISTS (
            SELECT 1

            FROM user_departments creator_ud

            WHERE
              creator_ud.user_id =
                creator.user_id

              AND creator_ud.department_id
              IN (
                SELECT
                  admin_ud.department_id

                FROM user_departments admin_ud

                WHERE
                  admin_ud.user_id = ?
              )
          )

          OR creator.department_id
          IN (
            SELECT
              admin_ud.department_id

            FROM user_departments admin_ud

            WHERE
              admin_ud.user_id = ?
          )

          OR EXISTS (
            SELECT 1

            FROM user_departments creator_ud

            WHERE
              creator_ud.user_id =
                creator.user_id

              AND creator_ud.department_id = ?
          )

          OR creator.department_id = ?
        )

        AND LOWER(
          COALESCE(
            creator_role.role_name,
            ''
          )
        ) = 'employee'

        AND (
          LOWER(
            COALESCE(
              fv.status,
              ''
            )
          ) = 'pending'

          OR (
            LOWER(
              COALESCE(
                fv.status,
                ''
              )
            ) = 'approved'

            AND DATE(
              fv.visit_date
            ) = CURDATE()
          )
        )

      ORDER BY
        fv.visit_date DESC,
        fv.visit_id DESC
    `;

    params = [
      user.user_id,
      user.user_id,
      user.department_id,
      user.department_id,
    ];
  }


  const [visits] =
    await db.query(
      query,
      params
    );


  const target =
    user.role_name ===
    "superadmin"
      ? "/superadmin/field-visits"
      : "/admin/attendance?tab=fieldVisits";


  visits.forEach(
    (visit) => {

    const status =
      normalizeStatus(
        visit.status
      );


    if (status === "pending") {

      addEvent(
        events,
        {
          actor_user_id:
            visit.employee_id,

          event_key:
            `field_visit_pending:${visit.visit_id}`,

          notification_type:
            "field_visit_pending",

          category:
            "action",

          priority:
            "high",

          title:
            "Field Visit Approval Required",

          message:
            `${visit.full_name || "Employee"} submitted a ${visit.visit_type || "field"} visit${visit.location ? ` to ${visit.location}` : ""}.`,

          reference_type:
            "field_visit",

          reference_id:
            visit.visit_id,

          target_url:
            target,
        }
      );

      return;
    }


    if (status === "approved") {

      const people = [
        visit.full_name,

        ...(visit.team_members
          ? String(
              visit.team_members
            )
              .split(",")
              .map(
                (name) =>
                  name.trim()
              )
              .filter(Boolean)
          : []),
      ]
        .filter(Boolean);

      const uniquePeople =
        [
          ...new Set(
            people
          ),
        ];


      addEvent(
        events,
        {
          actor_user_id:
            visit.employee_id,

          event_key:
            `field_visit_today:${String(visit.visit_date).slice(0, 10)}:${visit.visit_id}`,

          notification_type:
            "field_visit_today",

          category:
            "update",

          priority:
            "normal",

          title:
            "Field Visit Today",

          message:
            `${uniquePeople.join(", ") || "Team"} ${uniquePeople.length > 1 ? "are" : "is"} on an approved ${visit.visit_type || "field"} visit today${visit.location ? ` at ${visit.location}` : ""}.`,

          reference_type:
            "field_visit",

          reference_id:
            visit.visit_id,

          target_url:
            target,
        }
      );
    }
  });
};


/* =========================================================
   MEETINGS
========================================================= */

const buildMeetingNotifications =
  async (
    user,
    events
  ) => {

  const params = [];

  let scope = "";

  if (
    user.role_name ===
    "admin"
  ) {
    if (!user.department_id) {
      return;
    }

    scope = `
      AND m.department_id = ?
    `;

    params.push(
      user.department_id
    );
  }


  const [meetings] =
    await db.query(
      `
      SELECT
        m.id,
        m.title,
        m.created_by,

        DATE_FORMAT(
          m.meeting_date,
          '%Y-%m-%d'
        ) AS meeting_date,

        TIME_FORMAT(
          m.start_time,
          '%H:%i'
        ) AS start_time,

        TIME_FORMAT(
          m.end_time,
          '%H:%i'
        ) AS end_time,

        DATEDIFF(
          m.meeting_date,
          CURDATE()
        ) AS days_remaining,

        m.status,

        creator.full_name
          AS created_by_name,

        GROUP_CONCAT(
          DISTINCT employee.full_name
          ORDER BY employee.full_name
          SEPARATOR ', '
        ) AS employees

      FROM meetings m

      LEFT JOIN users creator
        ON creator.user_id =
           m.created_by

      LEFT JOIN meeting_employees me
        ON me.meeting_id =
           m.id

      LEFT JOIN users employee
        ON employee.user_id =
           me.employee_id

      WHERE
        m.meeting_date >=
          CURDATE()

        AND m.meeting_date <=
          DATE_ADD(
            CURDATE(),
            INTERVAL 30 DAY
          )

        AND LOWER(
          COALESCE(
            m.status,
            ''
          )
        ) != 'cancelled'

        AND (
          m.meeting_date >
            CURDATE()

          OR m.end_time >=
            CURTIME()
        )

        ${scope}

      GROUP BY
        m.id

      ORDER BY
        m.meeting_date ASC,
        m.start_time ASC
      `,
      params
    );


  const target =
    user.role_name ===
    "superadmin"
      ? "/superadmin/calendar"
      : "/admin/calendar";


  meetings.forEach(
    (meeting) => {

    const days =
      Number(
        meeting.days_remaining
      );

    const when =
      days === 0
        ? "today"
        : days === 1
          ? "tomorrow"
          : `on ${meeting.meeting_date}`;


    addEvent(
      events,
      {
        actor_user_id:
          meeting.created_by,

        event_key:
          `meeting:${meeting.id}:${meeting.meeting_date}:${meeting.start_time}`,

        notification_type:
          "meeting",

        category:
          "update",

        priority:
          days === 0
            ? "high"
            : "normal",

        title:
          days === 0
            ? "Meeting Today"
            : "Upcoming Meeting",

        message:
          `${meeting.title || "Meeting"} is scheduled ${when} at ${meeting.start_time || "-"}.${meeting.employees ? ` Participants: ${meeting.employees}.` : ""}`,

        reference_type:
          "meeting",

        reference_id:
          meeting.id,

        target_url:
          target,
      }
    );
  });
};


/* =========================================================
   UPSERT / DEACTIVATE
========================================================= */

const syncUserNotifications =
  async (
    user
  ) => {

  const events = [];


  await buildProjectNotifications(
    user,
    events
  );

  await buildTaskNotifications(
    user,
    events
  );

  await buildLeaveNotifications(
    user,
    events
  );

  await buildFieldVisitNotifications(
    user,
    events
  );

  await buildMeetingNotifications(
    user,
    events
  );


  for (
    const event of events
  ) {

    await db.query(
      `
      INSERT INTO notifications
      (
        receiver_user_id,
        actor_user_id,
        event_key,

        project_id,
        task_id,

        reference_type,
        reference_id,

        notification_type,
        category,
        priority,

        title,
        message,

        target_url,

        is_read,
        is_active
      )

      VALUES
      (
        ?,
        ?,
        ?,

        ?,
        ?,

        ?,
        ?,

        ?,
        ?,
        ?,

        ?,
        ?,

        ?,

        0,
        1
      )

      ON DUPLICATE KEY UPDATE

        actor_user_id =
          VALUES(
            actor_user_id
          ),

        project_id =
          VALUES(
            project_id
          ),

        task_id =
          VALUES(
            task_id
          ),

        reference_type =
          VALUES(
            reference_type
          ),

        reference_id =
          VALUES(
            reference_id
          ),

        notification_type =
          VALUES(
            notification_type
          ),

        category =
          VALUES(
            category
          ),

        priority =
          VALUES(
            priority
          ),

        title =
          VALUES(
            title
          ),

        message =
          VALUES(
            message
          ),

        target_url =
          VALUES(
            target_url
          ),

        is_read =
          IF(
            is_active = 0,
            0,
            is_read
          ),

        read_at =
          IF(
            is_active = 0,
            NULL,
            read_at
          ),

        is_active = 1,

        updated_at =
          CURRENT_TIMESTAMP
      `,
      [
        user.user_id,

        event.actor_user_id,

        event.event_key,

        event.project_id,

        event.task_id,

        event.reference_type,

        event.reference_id,

        event.notification_type,

        event.category,

        event.priority,

        event.title,

        event.message,

        event.target_url,
      ]
    );
  }


  const activeKeys =
    events.map(
      (event) =>
        event.event_key
    );


  /*
  Only notifications generated by this
  new RMS bell system are deactivated.

  Older legacy notification records
  remain untouched.
  */

  if (
    activeKeys.length
  ) {

    const placeholders =
      activeKeys
        .map(() => "?")
        .join(",");


    await db.query(
      `
      UPDATE notifications

      SET
        is_active = 0,
        updated_at =
          CURRENT_TIMESTAMP

      WHERE
        receiver_user_id = ?

        AND event_key LIKE 'rms:%'

        AND event_key NOT IN (
          ${placeholders}
        )
      `,
      [
        user.user_id,
        ...activeKeys,
      ]
    );

  } else {

    await db.query(
      `
      UPDATE notifications

      SET
        is_active = 0,
        updated_at =
          CURRENT_TIMESTAMP

      WHERE
        receiver_user_id = ?

        AND event_key LIKE 'rms:%'
      `,
      [
        user.user_id,
      ]
    );
  }
};


/* =========================================================
   GET NOTIFICATIONS
========================================================= */

const getNotifications =
  async (
    req,
    res
  ) => {

  try {

    const {
      user,
      error,
    } =
      await getUserContext(
        req
      );


    if (error) {
      return res
        .status(
          error.status
        )
        .json({
          success: false,
          message:
            error.message,
        });
    }


    await syncUserNotifications(
      user
    );


    const [notifications] =
      await db.query(
        `
        SELECT
          notification_id,

          actor_user_id,

          event_key,

          project_id,
          task_id,

          reference_type,
          reference_id,

          notification_type,
          category,
          priority,

          title,
          message,

          target_url,

          is_read,
          is_active,

          read_at,
          created_at,
          updated_at

        FROM notifications

        WHERE
          receiver_user_id = ?

          AND is_active = 1

        ORDER BY

          is_read ASC,

          CASE
            WHEN priority = 'high'
            THEN 1

            WHEN priority = 'normal'
            THEN 2

            ELSE 3
          END,

          created_at DESC

        LIMIT 50
        `,
        [
          user.user_id,
        ]
      );


    const [[countRow]] =
      await db.query(
        `
        SELECT
          COUNT(*) AS unread_count

        FROM notifications

        WHERE
          receiver_user_id = ?

          AND is_active = 1

          AND COALESCE(
            is_read,
            0
          ) = 0
        `,
        [
          user.user_id,
        ]
      );


    return res.json({
      success: true,

      unread_count:
        Number(
          countRow
            ?.unread_count ||
          0
        ),

      notifications,
    });

  } catch (error) {

    console.error(
      "Get notifications error:",
      error
    );


    return res
      .status(500)
      .json({
        success: false,

        message:
          "Failed to load notifications.",

        error:
          error.message,

        sqlMessage:
          error.sqlMessage ||
          null,
      });
  }
};


/* =========================================================
   UNREAD COUNT
========================================================= */

const getUnreadCount =
  async (
    req,
    res
  ) => {

  try {

    const {
      user,
      error,
    } =
      await getUserContext(
        req
      );


    if (error) {
      return res
        .status(
          error.status
        )
        .json({
          success: false,
          message:
            error.message,
        });
    }


    await syncUserNotifications(
      user
    );


    const [[row]] =
      await db.query(
        `
        SELECT
          COUNT(*) AS unread_count

        FROM notifications

        WHERE
          receiver_user_id = ?

          AND is_active = 1

          AND COALESCE(
            is_read,
            0
          ) = 0
        `,
        [
          user.user_id,
        ]
      );


    return res.json({
      success: true,

      unread_count:
        Number(
          row?.unread_count ||
          0
        ),
    });

  } catch (error) {

    console.error(
      "Notification count error:",
      error
    );


    return res
      .status(500)
      .json({
        success: false,

        message:
          "Failed to load unread notification count.",
      });
  }
};


/* =========================================================
   MARK ONE READ
========================================================= */

const markNotificationRead =
  async (
    req,
    res
  ) => {

  try {

    const userId =
      getLoggedInUserId(
        req
      );


    const notificationId =
      Number(
        req.params
          .notificationId
      );


    if (
      !userId ||
      !notificationId
    ) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "Invalid notification.",
        });
    }


    const [result] =
      await db.query(
        `
        UPDATE notifications

        SET
          is_read = 1,

          read_at =
            COALESCE(
              read_at,
              NOW()
            )

        WHERE
          notification_id = ?

          AND receiver_user_id = ?
        `,
        [
          notificationId,
          userId,
        ]
      );


    if (
      result.affectedRows === 0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          message:
            "Notification not found.",
        });
    }


    return res.json({
      success: true,

      message:
        "Notification marked as read.",
    });

  } catch (error) {

    console.error(
      "Mark notification read error:",
      error
    );


    return res
      .status(500)
      .json({
        success: false,

        message:
          "Failed to update notification.",
      });
  }
};


/* =========================================================
   MARK ALL READ
========================================================= */

const markAllNotificationsRead =
  async (
    req,
    res
  ) => {

  try {

    const userId =
      getLoggedInUserId(
        req
      );


    if (!userId) {
      return res
        .status(401)
        .json({
          success: false,
          message:
            "Unauthorized.",
        });
    }


    await db.query(
      `
      UPDATE notifications

      SET
        is_read = 1,

        read_at =
          COALESCE(
            read_at,
            NOW()
          )

      WHERE
        receiver_user_id = ?

        AND is_active = 1

        AND COALESCE(
          is_read,
          0
        ) = 0
      `,
      [
        userId,
      ]
    );


    return res.json({
      success: true,

      message:
        "All notifications marked as read.",
    });

  } catch (error) {

    console.error(
      "Mark all notifications read error:",
      error
    );


    return res
      .status(500)
      .json({
        success: false,

        message:
          "Failed to update notifications.",
      });
  }
};


module.exports = {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
};