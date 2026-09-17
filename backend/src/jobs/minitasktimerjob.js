const cron = require("node-cron");
const db = require("../config/db");

/* =========================================================
   PROCESS MINI TASK STARTS
========================================================= */

const processMiniTaskStarts = async () => {
  const [miniTasks] = await db.query(
    `
      SELECT
        mini_task_id,
        employee_id
      FROM mini_tasks
      WHERE timer_started_at IS NULL
        AND TIMESTAMP(
          COALESCE(start_date, task_date),
          start_time
        ) <= NOW()
        AND TIMESTAMP(
          COALESCE(end_date, task_date),
          end_time
        ) > NOW()
      ORDER BY
        COALESCE(start_date, task_date) ASC,
        start_time ASC,
        mini_task_id ASC
    `
  );

  for (const miniTask of miniTasks) {
    let connection;

    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      /*
        Lock the Mini Task so the same start cannot be
        processed twice.
      */
      const [lockedMiniTasks] = await connection.query(
        `
          SELECT
            mini_task_id,
            employee_id,
            timer_started_at
          FROM mini_tasks
          WHERE mini_task_id = ?
          LIMIT 1
          FOR UPDATE
        `,
        [miniTask.mini_task_id]
      );

      if (
        !lockedMiniTasks.length ||
        lockedMiniTasks[0].timer_started_at
      ) {
        await connection.rollback();
        continue;
      }

      /*
        Find the employee's currently running Main Task.

        A running Main Task has an open task_work_sessions
        record where ended_at is NULL.
      */
      const [runningSessions] = await connection.query(
        `
          SELECT
            tws.session_id,
            tws.task_id
          FROM task_work_sessions tws
          INNER JOIN tasks t
            ON t.task_id = tws.task_id
          WHERE tws.user_id = ?
            AND tws.ended_at IS NULL
            AND (
              t.parent_task_id IS NULL
              OR t.parent_task_id = 0
            )
          ORDER BY tws.started_at DESC
          LIMIT 1
          FOR UPDATE
        `,
        [miniTask.employee_id]
      );

      let pausedMainTaskId = null;

      if (runningSessions.length) {
        const runningSession = runningSessions[0];

        pausedMainTaskId = runningSession.task_id;

        /*
          Pause only the active work session.

          DO NOT change the Main Task Kanban status.
        */
        await connection.query(
          `
            UPDATE task_work_sessions
            SET
              ended_at = NOW(),
              end_reason = 'paused'
            WHERE session_id = ?
              AND ended_at IS NULL
          `,
          [runningSession.session_id]
        );
      }

      await connection.query(
        `
          UPDATE mini_tasks
          SET
            paused_main_task_id = ?,
            timer_started_at = NOW()
          WHERE mini_task_id = ?
        `,
        [
          pausedMainTaskId,
          miniTask.mini_task_id,
        ]
      );

      await connection.commit();

      console.log(
        `Mini task ${miniTask.mini_task_id} started.` +
          (
            pausedMainTaskId
              ? ` Main task ${pausedMainTaskId} paused.`
              : " No running main task found."
          )
      );
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error(
            "Mini task start rollback error:",
            rollbackError.message
          );
        }
      }

      console.error(
        `Mini task ${miniTask.mini_task_id} start processing failed:`,
        error.message
      );
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
};

/* =========================================================
   PROCESS MINI TASK ENDS
========================================================= */

const processMiniTaskEnds = async () => {
  const [miniTasks] = await db.query(
    `
      SELECT
        mini_task_id,
        employee_id,
        paused_main_task_id
      FROM mini_tasks
      WHERE timer_started_at IS NOT NULL
        AND timer_ended_at IS NULL
        AND TIMESTAMP(
          COALESCE(end_date, task_date),
          end_time
        ) <= NOW()
      ORDER BY
        COALESCE(end_date, task_date) ASC,
        end_time ASC,
        mini_task_id ASC
    `
  );

  for (const miniTask of miniTasks) {
    let connection;

    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      const [lockedMiniTasks] = await connection.query(
        `
          SELECT
            mini_task_id,
            employee_id,
            paused_main_task_id,
            timer_started_at,
            timer_ended_at
          FROM mini_tasks
          WHERE mini_task_id = ?
          LIMIT 1
          FOR UPDATE
        `,
        [miniTask.mini_task_id]
      );

      if (
        !lockedMiniTasks.length ||
        lockedMiniTasks[0].timer_ended_at
      ) {
        await connection.rollback();
        continue;
      }

      const lockedMiniTask = lockedMiniTasks[0];

      /*
        Resume only the Main Task that this Mini Task
        actually paused.
      */
      if (lockedMiniTask.paused_main_task_id) {

                /*
          Do not resume the Main Task while another
          Mini Task for this employee is still active.

          This handles overlapping Mini Tasks safely.
        */
        const [otherActiveMiniTasks] =
          await connection.query(
            `
              SELECT mini_task_id
              FROM mini_tasks
              WHERE employee_id = ?
                AND mini_task_id <> ?
                AND timer_started_at IS NOT NULL
                AND timer_ended_at IS NULL
                AND TIMESTAMP(
                  COALESCE(start_date, task_date),
                  start_time
                ) <= NOW()
                AND TIMESTAMP(
                  COALESCE(end_date, task_date),
                  end_time
                ) > NOW()
              LIMIT 1
              FOR UPDATE
            `,
            [
              lockedMiniTask.employee_id,
              lockedMiniTask.mini_task_id,
            ]
          );
        /*
          First make sure the employee has not manually
          started/resumed another Main Task while the
          Mini Task was running.

          We must never create two active work sessions.
        */
        const [activeSessions] = await connection.query(
          `
            SELECT session_id
            FROM task_work_sessions
            WHERE user_id = ?
              AND ended_at IS NULL
            LIMIT 1
            FOR UPDATE
          `,
          [lockedMiniTask.employee_id]
        );

        if (
  !otherActiveMiniTasks.length &&
  !activeSessions.length
) {
          /*
            Make sure the Main Task still exists and is
            assigned to this employee before resuming it.
          */
          const [activityLog] = await db.query(
  `
    SELECT
      activity_id,
      title,
      description,
      created_at

    FROM (
      /* COMPLETED SUBTASKS */

      SELECT
        CONCAT(
          'task-',
          st.task_id
        ) AS activity_id,

        'Subtask Completed' AS title,

        CONCAT(
          st.task_title,
          ' is Done.'
        ) AS description,

        COALESCE(
          st.updated_at,
          st.created_at
        ) AS activity_datetime,

        DATE_FORMAT(
          COALESCE(
            st.updated_at,
            st.created_at
          ),
          '%Y-%m-%d %H:%i'
        ) AS created_at

      FROM tasks st

      INNER JOIN tasks mt
        ON mt.task_id = st.parent_task_id

      INNER JOIN task_assignments ta
        ON ta.task_id = mt.task_id
       AND ta.employee_id = ?

      WHERE
        (
          st.is_checked = 1

          OR LOWER(
            REPLACE(
              st.status,
              ' ',
              '_'
            )
          ) IN (
            'completed',
            'done',
            'complete'
          )
        )


      UNION ALL


      /* MINI TASKS */

      SELECT
        CONCAT(
          'mini-task-',
          mini.mini_task_id
        ) AS activity_id,

        'Mini Task' AS title,

        CONCAT(
          mini.mini_task_title,

          CASE
            WHEN mini.division IS NOT NULL
              AND TRIM(mini.division) <> ''
            THEN CONCAT(
              ' · ',
              mini.division
            )
            ELSE ''
          END
        ) AS description,

        COALESCE(
          mini.edited_at,
          mini.created_at
        ) AS activity_datetime,

        DATE_FORMAT(
          COALESCE(
            mini.edited_at,
            mini.created_at
          ),
          '%Y-%m-%d %H:%i'
        ) AS created_at

      FROM mini_tasks mini

      WHERE mini.employee_id = ?

    ) activity

    ORDER BY
      activity_datetime DESC

    LIMIT 5
  `,
  [
    userId,
    userId,
  ]
);

          if (taskRows.length) {
            await connection.query(
              `
                INSERT INTO task_work_sessions (
                  task_id,
                  user_id,
                  started_at
                )
                VALUES (?, ?, NOW())
              `,
              [
                lockedMiniTask.paused_main_task_id,
                lockedMiniTask.employee_id,
              ]
            );
          }
        }
      }

      await connection.query(
        `
          UPDATE mini_tasks
          SET timer_ended_at = NOW()
          WHERE mini_task_id = ?
        `,
        [miniTask.mini_task_id]
      );

      await connection.commit();

      console.log(
        `Mini task ${miniTask.mini_task_id} ended.` +
          (
            lockedMiniTask.paused_main_task_id
              ? ` Main task ${lockedMiniTask.paused_main_task_id} resume processed.`
              : ""
          )
      );
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error(
            "Mini task end rollback error:",
            rollbackError.message
          );
        }
      }

      console.error(
        `Mini task ${miniTask.mini_task_id} end processing failed:`,
        error.message
      );
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
};

/* =========================================================
   PROCESS MINI TASK TIMERS
========================================================= */

const processMiniTaskTimers = async () => {
  await processMiniTaskStarts();
  await processMiniTaskEnds();
};

/* =========================================================
   START CRON
========================================================= */

const startMiniTaskTimerJob = () => {
  cron.schedule("* * * * *", async () => {
    try {
      await processMiniTaskTimers();
    } catch (error) {
      console.error(
        "Mini task timer job error:",
        error.message
      );
    }
  });

  console.log(
    "Mini task timer cron job scheduled to run every minute."
  );
};

module.exports = {
  startMiniTaskTimerJob,
  processMiniTaskTimers,
};