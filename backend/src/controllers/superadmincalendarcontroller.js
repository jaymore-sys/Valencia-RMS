const db = require("../config/db");

const {
  sendMeetingScheduledEmail,
  sendMeetingUpdatedEmail,
  sendMeetingCancelledEmail,
} = require("../utils/emailservice");

/* =========================================================
   HELPERS
========================================================= */

const getUserId = (req) =>
  Number(
    req.user?.user_id ||
      req.user?.id ||
      req.userId ||
      0
  );

const getSuperadmin =
  async (req) => {
    const userId =
      getUserId(req);

    if (!userId) {
      return {
        error: {
          status: 401,
          message:
            "Unauthorized.",
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
          u.designation,

          r.role_name,

          d.department_name

        FROM users u

        LEFT JOIN roles r
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

    if (!rows.length) {
      return {
        error: {
          status: 404,
          message:
            "Super Admin not found.",
        },
      };
    }

    const user =
      rows[0];

    if (
      String(
        user.role_name ||
          ""
      ).toLowerCase() !==
      "superadmin"
    ) {
      return {
        error: {
          status: 403,
          message:
            "Super Admin access required.",
        },
      };
    }

    return {
      user,
    };
  };

const calculateMinutes = (
  startTime,
  endTime
) => {
  if (
    !startTime ||
    !endTime
  ) {
    return 0;
  }

  const start =
    String(startTime)
      .slice(0, 5)
      .split(":")
      .map(Number);

  const end =
    String(endTime)
      .slice(0, 5)
      .split(":")
      .map(Number);

  if (
    start.length !== 2 ||
    end.length !== 2
  ) {
    return 0;
  }

  return Math.max(
    end[0] * 60 +
      end[1] -
      (
        start[0] * 60 +
        start[1]
      ),
    0
  );
};

const normalizeEmployeeIds = (
  employeeIds
) => {
  if (
    !Array.isArray(
      employeeIds
    )
  ) {
    return [];
  }

  return [
    ...new Set(
      employeeIds
        .map(Number)
        .filter(Boolean)
    ),
  ];
};

/* =========================================================
   ALL SELECTABLE USERS
========================================================= */

const getSuperadminMeetingEmployees =
  async (req, res) => {
    try {
      const {
        error,
      } =
        await getSuperadmin(
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

      /*
        Super Admin can choose users
        across ALL departments.
      */

      const [employees] =
        await db.query(
          `
          SELECT
            u.user_id,
            u.employee_code,
            u.full_name,
            u.email,
            u.designation,
            u.department_id,

            d.department_name,

            LOWER(
              r.role_name
            ) AS role_name

          FROM users u

          LEFT JOIN roles r
            ON r.role_id =
               u.role_id

          LEFT JOIN departments d
            ON d.department_id =
               u.department_id

          WHERE
            LOWER(
              COALESCE(
                u.status,
                'active'
              )
            ) <> 'deleted'

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

          ORDER BY
            d.department_name ASC,
            u.full_name ASC
          `
        );

      return res.json({
        success: true,
        employees,
      });
    } catch (error) {
      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to fetch organization users.",

          error:
            error.message,
        });
    }
  };

/* =========================================================
   ALL ORGANIZATION CALENDAR DATA
========================================================= */

const getSuperadminCalendar =
  async (req, res) => {
    try {
      const {
        error,
      } =
        await getSuperadmin(
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

      /* ================= PROJECTS ================= */

      const [projects] =
        await db.query(
          `
          SELECT
            p.project_id AS id,

            p.project_title
              AS title,

            p.project_description
              AS description,

            p.status,

            p.department_id,

            p.division,

            DATE_FORMAT(
              p.start_date,
              '%Y-%m-%d'
            ) AS start_date,

            DATE_FORMAT(
              p.due_date,
              '%Y-%m-%d'
            ) AS end_date,

            d.department_name,

            creator.full_name
              AS created_by_name

          FROM projects p

          LEFT JOIN departments d
            ON d.department_id =
               p.department_id

          LEFT JOIN users creator
            ON creator.user_id =
               p.created_by_user_id

          ORDER BY
            p.start_date ASC,
            p.project_id ASC
          `
        );

      /* ================= MAIN TASKS ================= */

      const [tasks] =
        await db.query(
          `
          SELECT
            t.task_id AS id,
            t.project_id,

            t.task_title
              AS title,

            t.task_description
              AS description,

            t.status,

            DATE_FORMAT(
              t.start_date,
              '%Y-%m-%d'
            ) AS start_date,

            DATE_FORMAT(
              t.due_date,
              '%Y-%m-%d'
            ) AS end_date,

            p.project_title,

            p.department_id,

            d.department_name,

            assigned.full_name
              AS employee_name,

            creator.full_name
              AS created_by_name

          FROM tasks t

          LEFT JOIN projects p
            ON p.project_id =
               t.project_id

          LEFT JOIN departments d
            ON d.department_id =
               p.department_id

          LEFT JOIN users assigned
            ON assigned.user_id =
               t.assigned_to_user_id

          LEFT JOIN users creator
            ON creator.user_id =
               t.created_by_user_id

          WHERE
            (
              t.parent_task_id
              IS NULL

              OR
              t.parent_task_id = 0
            )

            AND (
              t.task_type
              IS NULL

              OR LOWER(
                t.task_type
              ) NOT IN (
                'subtask',
                'sub_task'
              )
            )

          ORDER BY
            t.start_date ASC,
            t.task_id ASC
          `
        );

      /* ================= MEETINGS ================= */

      const [meetings] =
        await db.query(
          `
          SELECT
            m.id AS id,

            m.title,
            m.description,

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

            m.status,

            m.department_id,

            d.department_name,

            creator.full_name
              AS created_by_name,

            GROUP_CONCAT(
              DISTINCT
              employee.full_name

              ORDER BY
                employee.full_name

              SEPARATOR ', '
            ) AS employees,

            GROUP_CONCAT(
              DISTINCT
              employee.user_id

              ORDER BY
                employee.user_id

              SEPARATOR ','
            ) AS employee_ids

          FROM meetings m

          LEFT JOIN users creator
            ON creator.user_id =
               m.created_by

          LEFT JOIN departments d
            ON d.department_id =
               m.department_id

          LEFT JOIN meeting_employees me
            ON me.meeting_id =
               m.id

          LEFT JOIN users employee
            ON employee.user_id =
               me.employee_id

          GROUP BY
            m.id

          ORDER BY
            m.meeting_date ASC,
            m.start_time ASC
          `
        );

      const formattedMeetings =
        meetings.map(
          (meeting) => ({
            ...meeting,

            employee_ids:
              meeting.employee_ids
                ? String(
                    meeting.employee_ids
                  )
                    .split(",")
                    .map(Number)
                    .filter(Boolean)
                : [],
          })
        );

      /* ================= MINI TASKS ================= */

      const [miniTasks] =
        await db.query(
          `
          SELECT
            mt.mini_task_id
              AS id,

            mt.employee_id,

            mt.meeting_id,

            mt.department_id,

            mt.mini_task_title
              AS title,

            mt.mini_task_description
              AS description,

            DATE_FORMAT(
              mt.task_date,
              '%Y-%m-%d'
            ) AS task_date,

            TIME_FORMAT(
              mt.start_time,
              '%H:%i'
            ) AS start_time,

            TIME_FORMAT(
              mt.end_time,
              '%H:%i'
            ) AS end_time,

            mt.status,

            employee.full_name
              AS employee_name,

            d.department_name

          FROM mini_tasks mt

          LEFT JOIN users employee
            ON employee.user_id =
               mt.employee_id

          LEFT JOIN departments d
            ON d.department_id =
               mt.department_id

          /*
            Meeting Mini Tasks
            already appear as meeting.
          */

          WHERE
            mt.meeting_id
            IS NULL

          ORDER BY
            mt.task_date ASC,
            mt.start_time ASC
          `
        );

      return res.json({
        success: true,

        projects,

        tasks,

        meetings:
          formattedMeetings,

        mini_tasks:
          miniTasks,
      });
    } catch (error) {
      console.error(
        "Superadmin calendar error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to load Super Admin calendar.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    }
  };

/* =========================================================
   VALID EMPLOYEES
========================================================= */

const fetchValidEmployees =
  async (
    connection,
    employeeIds
  ) => {
    const placeholders =
      employeeIds
        .map(() => "?")
        .join(",");

    const [employees] =
      await connection.query(
        `
        SELECT
          u.user_id,
          u.full_name,
          u.email,
          u.department_id,

          d.department_name,

          LOWER(
            r.role_name
          ) AS role_name

        FROM users u

        LEFT JOIN roles r
          ON r.role_id =
             u.role_id

        LEFT JOIN departments d
          ON d.department_id =
             u.department_id

        WHERE
          u.user_id
          IN (${placeholders})

          AND LOWER(
            COALESCE(
              u.status,
              'active'
            )
          ) <> 'deleted'

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
        employeeIds
      );

    return employees;
  };

/* =========================================================
   CREATE SUPERADMIN MEETING
========================================================= */

const createSuperadminMeeting =
  async (req, res) => {
    const connection =
      await db.getConnection();

    try {
      const {
        user,
        error,
      } =
        await getSuperadmin(
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

      const {
        title,
        description,
        meeting_date,
        start_time,
        end_time,
      } = req.body;

      const employeeIds =
        normalizeEmployeeIds(
          req.body.employee_ids
        );

      const cleanTitle =
        String(
          title || ""
        ).trim();

      const cleanDescription =
        String(
          description || ""
        ).trim();

      if (!cleanTitle) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Meeting title is required.",
          });
      }

      if (
        !meeting_date ||
        !start_time ||
        !end_time
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Meeting date, start time and end time are required.",
          });
      }

      if (
        end_time <=
        start_time
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "End time must be after start time.",
          });
      }

      if (
        !employeeIds.length
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Select at least one participant.",
          });
      }

      const validEmployees =
        await fetchValidEmployees(
          connection,
          employeeIds
        );

      if (
        validEmployees.length !==
        employeeIds.length
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "One or more selected users are invalid.",
          });
      }

      /*
        Meeting table has one
        department_id.

        For cross-department meetings
        we use first participant's
        department only as an anchor.

        Participant access comes from
        meeting_employees.
      */

      const anchorDepartmentId =
        validEmployees.find(
          (employee) =>
            employee.department_id
        )?.department_id ||
        user.department_id;

      if (
        !anchorDepartmentId
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Unable to determine a department for this meeting.",
          });
      }

      await connection.beginTransaction();

      const [result] =
        await connection.query(
          `
          INSERT INTO meetings (
            title,
            description,
            meeting_date,
            start_time,
            end_time,
            created_by,
            department_id,
            status
          )

          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            'scheduled'
          )
          `,
          [
            cleanTitle,

            cleanDescription ||
              null,

            meeting_date,

            start_time,

            end_time,

            user.user_id,

            anchorDepartmentId,
          ]
        );

      const meetingId =
        result.insertId;

      const totalMinutes =
        calculateMinutes(
          start_time,
          end_time
        );

      for (
        const employee
        of validEmployees
      ) {
        await connection.query(
          `
          INSERT INTO meeting_employees (
            meeting_id,
            employee_id
          )

          VALUES (?, ?)
          `,
          [
            meetingId,
            employee.user_id,
          ]
        );

        /*
          Each user's Mini Task uses
          THEIR OWN department.
        */

        await connection.query(
          `
          INSERT INTO mini_tasks (
            employee_id,
            department_id,
            meeting_id,
            mini_task_title,
            mini_task_description,
            task_date,
            start_time,
            end_time,
            total_minutes,
            status
          )

          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            'logged'
          )
          `,
          [
            employee.user_id,

            employee.department_id ||
              anchorDepartmentId,

            meetingId,

            `Meeting - ${cleanTitle}`,

            cleanDescription ||
              `Meeting scheduled by ${user.full_name}`,

            meeting_date,

            start_time,

            end_time,

            totalMinutes,
          ]
        );
      }

      await connection.commit();

      /* ================= EMAIL ================= */

      const participants =
        validEmployees.map(
          (employee) => ({
            user_id:
              employee.user_id,

            full_name:
              employee.full_name,

            email:
              employee.email,
          })
        );

      const jobs =
        validEmployees
          .filter(
            (employee) =>
              employee.email
          )
          .map(
            async (
              employee
            ) => {
              try {
                await sendMeetingScheduledEmail(
                  {
                    to:
                      employee.email,

                    participantName:
                      employee.full_name,

                    meetingTitle:
                      cleanTitle,

                    description:
                      cleanDescription,

                    meetingDate:
                      meeting_date,

                    startTime:
                      start_time,

                    endTime:
                      end_time,

                    scheduledBy:
                      user.full_name,

                    scheduledByEmail:
                      user.email,

                    participants,
                  }
                );
              } catch (
                emailError
              ) {
                console.error(
                  "Meeting email error:",
                  emailError
                );
              }
            }
          );

      await Promise.allSettled(
        jobs
      );

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Meeting scheduled successfully.",

          meeting_id:
            meetingId,
        });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {}

      console.error(
        "Create Superadmin meeting error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to schedule meeting.",

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
   UPDATE SUPERADMIN MEETING
========================================================= */

const updateSuperadminMeeting =
  async (req, res) => {
    const connection =
      await db.getConnection();

    try {
      const {
        user,
        error,
      } =
        await getSuperadmin(
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

      const meetingId =
        Number(
          req.params.meetingId
        );

      const {
        title,
        description,
        meeting_date,
        start_time,
        end_time,
      } = req.body;

      const employeeIds =
        normalizeEmployeeIds(
          req.body.employee_ids
        );

      if (!meetingId) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid meeting.",
          });
      }

      if (
        !title ||
        !meeting_date ||
        !start_time ||
        !end_time
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Meeting title, date and time are required.",
          });
      }

      if (
        end_time <=
        start_time
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "End time must be after start time.",
          });
      }

      if (
        !employeeIds.length
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Select at least one participant.",
          });
      }

      const [meetingRows] =
        await connection.query(
          `
          SELECT
            id,
            status

          FROM meetings

          WHERE id = ?

          LIMIT 1
          `,
          [meetingId]
        );

      if (
        !meetingRows.length
      ) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Meeting not found.",
          });
      }

      if (
        String(
          meetingRows[0]
            .status ||
            ""
        ).toLowerCase() ===
        "cancelled"
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Cancelled meeting cannot be edited.",
          });
      }

      const employees =
        await fetchValidEmployees(
          connection,
          employeeIds
        );

      if (
        employees.length !==
        employeeIds.length
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "One or more selected users are invalid.",
          });
      }

      const anchorDepartmentId =
        employees.find(
          (employee) =>
            employee.department_id
        )?.department_id ||
        user.department_id;

      if (
        !anchorDepartmentId
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Unable to determine meeting department.",
          });
      }

      await connection.beginTransaction();

      await connection.query(
        `
        UPDATE meetings

        SET
          title = ?,
          description = ?,
          meeting_date = ?,
          start_time = ?,
          end_time = ?,
          department_id = ?

        WHERE id = ?
        `,
        [
          String(
            title
          ).trim(),

          String(
            description ||
              ""
          ).trim() ||
            null,

          meeting_date,

          start_time,

          end_time,

          anchorDepartmentId,

          meetingId,
        ]
      );

      await connection.query(
        `
        DELETE FROM mini_tasks
        WHERE meeting_id = ?
        `,
        [meetingId]
      );

      await connection.query(
        `
        DELETE FROM meeting_employees
        WHERE meeting_id = ?
        `,
        [meetingId]
      );

      const totalMinutes =
        calculateMinutes(
          start_time,
          end_time
        );

      for (
        const employee
        of employees
      ) {
        await connection.query(
          `
          INSERT INTO meeting_employees (
            meeting_id,
            employee_id
          )
          VALUES (?, ?)
          `,
          [
            meetingId,
            employee.user_id,
          ]
        );

        await connection.query(
          `
          INSERT INTO mini_tasks (
            employee_id,
            department_id,
            meeting_id,
            mini_task_title,
            mini_task_description,
            task_date,
            start_time,
            end_time,
            total_minutes,
            status
          )

          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            'logged'
          )
          `,
          [
            employee.user_id,

            employee.department_id ||
              anchorDepartmentId,

            meetingId,

            `Meeting - ${String(
              title
            ).trim()}`,

            String(
              description ||
                ""
            ).trim() ||
              `Meeting updated by ${user.full_name}`,

            meeting_date,

            start_time,

            end_time,

            totalMinutes,
          ]
        );
      }

      await connection.commit();

      const participants =
        employees.map(
          (employee) => ({
            user_id:
              employee.user_id,

            full_name:
              employee.full_name,

            email:
              employee.email,
          })
        );

      const jobs =
        employees
          .filter(
            (employee) =>
              employee.email
          )
          .map(
            async (
              employee
            ) => {
              try {
                await sendMeetingUpdatedEmail(
                  {
                    to:
                      employee.email,

                    participantName:
                      employee.full_name,

                    meetingTitle:
                      String(
                        title
                      ).trim(),

                    description:
                      String(
                        description ||
                          ""
                      ).trim(),

                    meetingDate:
                      meeting_date,

                    startTime:
                      start_time,

                    endTime:
                      end_time,

                    updatedBy:
                      user.full_name,

                    updatedByEmail:
                      user.email,

                    participants,
                  }
                );
              } catch (
                emailError
              ) {
                console.error(
                  "Meeting update email error:",
                  emailError
                );
              }
            }
          );

      await Promise.allSettled(
        jobs
      );

      return res.json({
        success: true,

        message:
          "Meeting updated successfully.",
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {}

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to update meeting.",

          error:
            error.message,
        });
    } finally {
      connection.release();
    }
  };

/* =========================================================
   CANCEL SUPERADMIN MEETING
========================================================= */

const cancelSuperadminMeeting =
  async (req, res) => {
    const connection =
      await db.getConnection();

    try {
      const {
        user,
        error,
      } =
        await getSuperadmin(
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

      const meetingId =
        Number(
          req.params.meetingId
        );

      if (!meetingId) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid meeting.",
          });
      }

      const [rows] =
        await connection.query(
          `
          SELECT
            id,
            title,
            description,

            DATE_FORMAT(
              meeting_date,
              '%Y-%m-%d'
            ) AS meeting_date,

            TIME_FORMAT(
              start_time,
              '%H:%i'
            ) AS start_time,

            TIME_FORMAT(
              end_time,
              '%H:%i'
            ) AS end_time,

            status

          FROM meetings

          WHERE id = ?

          LIMIT 1
          `,
          [meetingId]
        );

      if (!rows.length) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Meeting not found.",
          });
      }

      const meeting =
        rows[0];

      if (
        String(
          meeting.status ||
            ""
        ).toLowerCase() ===
        "cancelled"
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Meeting is already cancelled.",
          });
      }

      const [participants] =
        await connection.query(
          `
          SELECT
            u.user_id,
            u.full_name,
            u.email

          FROM meeting_employees me

          INNER JOIN users u
            ON u.user_id =
               me.employee_id

          WHERE
            me.meeting_id = ?

          ORDER BY
            u.full_name ASC
          `,
          [meetingId]
        );

      await connection.beginTransaction();

      await connection.query(
        `
        UPDATE meetings

        SET
          status = 'cancelled'

        WHERE id = ?
        `,
        [meetingId]
      );

      await connection.query(
        `
        UPDATE mini_tasks

        SET
          mini_task_title =
            CASE
              WHEN
                mini_task_title
                LIKE 'CANCELLED - %'

              THEN
                mini_task_title

              ELSE
                CONCAT(
                  'CANCELLED - ',
                  mini_task_title
                )
            END,

          mini_task_description =
            CONCAT(
              COALESCE(
                mini_task_description,
                ''
              ),

              CASE
                WHEN
                  COALESCE(
                    mini_task_description,
                    ''
                  ) = ''

                THEN ''

                ELSE '\\n'
              END,

              'This meeting has been cancelled.'
            )

        WHERE meeting_id = ?
        `,
        [meetingId]
      );

      await connection.commit();

      for (
        const employee
        of participants
      ) {
        if (
          !employee.email
        ) {
          continue;
        }

        try {
          await sendMeetingCancelledEmail(
            {
              to:
                employee.email,

              participantName:
                employee.full_name,

              meetingTitle:
                meeting.title,

              description:
                meeting.description,

              meetingDate:
                meeting.meeting_date,

              startTime:
                meeting.start_time,

              endTime:
                meeting.end_time,

              cancelledBy:
                user.full_name,

              cancelledByEmail:
                user.email,

              participants,
            }
          );
        } catch (
          emailError
        ) {
          console.error(
            "Cancellation email error:",
            emailError
          );
        }
      }

      return res.json({
        success: true,

        message:
          "Meeting cancelled successfully.",
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {}

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to cancel meeting.",

          error:
            error.message,
        });
    } finally {
      connection.release();
    }
  };

module.exports = {
  getSuperadminCalendar,

  getSuperadminMeetingEmployees,

  createSuperadminMeeting,

  updateSuperadminMeeting,

  cancelSuperadminMeeting,
};