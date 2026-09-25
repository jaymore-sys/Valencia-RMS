const cron = require("node-cron");

const db = require("../config/db");

const INDIA_NOW_SQL =
  "CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30')";

/* =========================================================
   PROCESS MINI TASK STARTS
========================================================= */

const processMiniTaskStarts = async () => {
  const [miniTasks] =
    await db.query(
      `
        SELECT
          mini_task_id,
          employee_id,

          DATE_FORMAT(
            TIMESTAMP(
              COALESCE(
                start_date,
                task_date
              ),
              start_time
            ),
            '%Y-%m-%d %H:%i:%s'
          ) AS scheduled_start

        FROM mini_tasks

        WHERE
          timer_started_at IS NULL

          AND TIMESTAMP(
            COALESCE(
              start_date,
              task_date
            ),
            start_time
          ) <= ${INDIA_NOW_SQL}

          AND TIMESTAMP(
            COALESCE(
              end_date,
              start_date,
              task_date
            ),
            end_time
          ) > ${INDIA_NOW_SQL}

        ORDER BY
          COALESCE(
            start_date,
            task_date
          ) ASC,
          start_time ASC,
          mini_task_id ASC
      `
    );

  for (
    const miniTask of
    miniTasks
  ) {
    let connection;

    try {
      connection =
        await db.getConnection();

      await connection.beginTransaction();

      /* =====================================================
         LOCK MINI TASK
      ===================================================== */

      const [lockedRows] =
        await connection.query(
          `
            SELECT
              mini_task_id,
              employee_id,
              paused_main_task_id,
              timer_started_at,

              DATE_FORMAT(
                TIMESTAMP(
                  COALESCE(
                    start_date,
                    task_date
                  ),
                  start_time
                ),
                '%Y-%m-%d %H:%i:%s'
              ) AS scheduled_start

            FROM mini_tasks

            WHERE
              mini_task_id = ?

            LIMIT 1

            FOR UPDATE
          `,
          [
            miniTask.mini_task_id,
          ]
        );

      if (
        !lockedRows.length ||
        lockedRows[0]
          .timer_started_at
      ) {
        await connection.rollback();

        continue;
      }

      const lockedMiniTask =
        lockedRows[0];

      /* =====================================================
         FIND ALL OPEN MAIN TASK SESSIONS
      ===================================================== */

      const [runningSessions] =
        await connection.query(
          `
            SELECT
              tws.session_id,
              tws.task_id,
              tws.started_at

            FROM task_work_sessions tws

            INNER JOIN tasks t
              ON t.task_id =
                 tws.task_id

            WHERE
              tws.employee_id = ?

              AND tws.ended_at
                  IS NULL

              AND (
                t.parent_task_id
                  IS NULL

                OR

                t.parent_task_id = 0
              )

            ORDER BY
              tws.started_at DESC,
              tws.session_id DESC

            FOR UPDATE
          `,
          [
            lockedMiniTask.employee_id,
          ]
        );

      let pausedMainTaskId =
        null;

      if (
        runningSessions.length
      ) {
        /*
          Newest running Main Task is treated
          as the active task.
        */
        pausedMainTaskId =
          runningSessions[0].task_id;

        /*
          Close ALL accidentally open Main sessions
          at the exact Mini Task start boundary.

          This prevents old duplicated timers
          from multiplying time.
        */
        await connection.query(
          `
            UPDATE task_work_sessions

            SET
              ended_at =
                GREATEST(
                  started_at,
                  TIMESTAMP(?)
                ),

              end_reason =
                'paused'

            WHERE
              employee_id = ?

              AND ended_at
                  IS NULL
          `,
          [
            lockedMiniTask.scheduled_start,
            lockedMiniTask.employee_id,
          ]
        );
      } else {
        /* ===================================================
           OVERLAPPING MINI TASK SUPPORT

           Example:

           Mini A:
           4:00 - 5:00
           paused Main Task 20

           Mini B:
           4:30 - 5:30

           At 4:30 there is no active Main Task because
           Mini A already paused it.

           So Mini B must inherit Main Task 20.
        =================================================== */

        const [activeMiniRows] =
          await connection.query(
            `
              SELECT
                mini_task_id,
                paused_main_task_id

              FROM mini_tasks

              WHERE
                employee_id = ?

                AND mini_task_id <> ?

                AND timer_started_at
                    IS NOT NULL

                AND timer_ended_at
                    IS NULL

                AND paused_main_task_id
                    IS NOT NULL

                AND TIMESTAMP(
                  COALESCE(
                    start_date,
                    task_date
                  ),
                  start_time
                ) <= TIMESTAMP(?)

                AND TIMESTAMP(
                  COALESCE(
                    end_date,
                    start_date,
                    task_date
                  ),
                  end_time
                ) > TIMESTAMP(?)

              ORDER BY
                COALESCE(
                  start_date,
                  task_date
                ) DESC,

                start_time DESC,

                mini_task_id DESC

              LIMIT 1

              FOR UPDATE
            `,
            [
              lockedMiniTask.employee_id,

              lockedMiniTask.mini_task_id,

              lockedMiniTask.scheduled_start,

              lockedMiniTask.scheduled_start,
            ]
          );

        if (
          activeMiniRows.length &&
          activeMiniRows[0]
            .paused_main_task_id
        ) {
          pausedMainTaskId =
            activeMiniRows[0]
              .paused_main_task_id;
        }
      }

      /* =====================================================
         STORE MINI TASK START

         Use scheduled time, not cron execution time.
      ===================================================== */

      await connection.query(
        `
          UPDATE mini_tasks

          SET
            paused_main_task_id = ?,

            timer_started_at =
              TIMESTAMP(?)

          WHERE
            mini_task_id = ?
        `,
        [
          pausedMainTaskId,

          lockedMiniTask.scheduled_start,

          lockedMiniTask.mini_task_id,
        ]
      );

      await connection.commit();

      console.log(
        `Mini task ${lockedMiniTask.mini_task_id} started.` +
          (
            pausedMainTaskId
              ? ` Main task ${pausedMainTaskId} preserved for resume.`
              : " No running main task found."
          )
      );
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (
          rollbackError
        ) {
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

const processMiniTaskEnds =
  async () => {
    const [miniTasks] =
      await db.query(
        `
          SELECT
            mini_task_id,
            employee_id,
            paused_main_task_id,

            DATE_FORMAT(
              TIMESTAMP(
                COALESCE(
                  end_date,
                  start_date,
                  task_date
                ),
                end_time
              ),
              '%Y-%m-%d %H:%i:%s'
            ) AS scheduled_end

          FROM mini_tasks

          WHERE
            timer_started_at
              IS NOT NULL

            AND timer_ended_at
                IS NULL

            AND TIMESTAMP(
              COALESCE(
                end_date,
                start_date,
                task_date
              ),
              end_time
            ) <= ${INDIA_NOW_SQL}

          ORDER BY
            COALESCE(
              end_date,
              start_date,
              task_date
            ) ASC,

            end_time ASC,

            mini_task_id ASC
        `
      );

    for (
      const miniTask of
      miniTasks
    ) {
      let connection;

      try {
        connection =
          await db.getConnection();

        await connection.beginTransaction();

        /* ===================================================
           LOCK MINI TASK
        =================================================== */

        const [lockedRows] =
          await connection.query(
            `
              SELECT
                mini_task_id,
                employee_id,
                paused_main_task_id,
                timer_started_at,
                timer_ended_at,

                DATE_FORMAT(
                  TIMESTAMP(
                    COALESCE(
                      end_date,
                      start_date,
                      task_date
                    ),
                    end_time
                  ),
                  '%Y-%m-%d %H:%i:%s'
                ) AS scheduled_end

              FROM mini_tasks

              WHERE
                mini_task_id = ?

              LIMIT 1

              FOR UPDATE
            `,
            [
              miniTask.mini_task_id,
            ]
          );

        if (
          !lockedRows.length ||
          lockedRows[0]
            .timer_ended_at
        ) {
          await connection.rollback();

          continue;
        }

        const lockedMiniTask =
          lockedRows[0];

        /* ===================================================
           CHECK ANOTHER ACTIVE MINI TASK

           Do not resume Main Task while another Mini Task
           is still active.
        =================================================== */

        const [otherMiniRows] =
          await connection.query(
            `
              SELECT
                mini_task_id,
                paused_main_task_id

              FROM mini_tasks

              WHERE
                employee_id = ?

                AND mini_task_id <> ?

                AND timer_started_at
                    IS NOT NULL

                AND timer_ended_at
                    IS NULL

                AND TIMESTAMP(
                  COALESCE(
                    start_date,
                    task_date
                  ),
                  start_time
                ) <= TIMESTAMP(?)

                AND TIMESTAMP(
                  COALESCE(
                    end_date,
                    start_date,
                    task_date
                  ),
                  end_time
                ) > TIMESTAMP(?)

              ORDER BY
                COALESCE(
                  end_date,
                  start_date,
                  task_date
                ) DESC,

                end_time DESC,

                mini_task_id DESC

              LIMIT 1

              FOR UPDATE
            `,
            [
              lockedMiniTask.employee_id,

              lockedMiniTask.mini_task_id,

              lockedMiniTask.scheduled_end,

              lockedMiniTask.scheduled_end,
            ]
          );

        /* ===================================================
           CHECK IF EMPLOYEE ALREADY HAS ACTIVE MAIN SESSION
        =================================================== */

        const [activeSessions] =
          await connection.query(
            `
              SELECT
                session_id,
                task_id

              FROM task_work_sessions

              WHERE
                employee_id = ?

                AND ended_at IS NULL

              LIMIT 1

              FOR UPDATE
            `,
            [
              lockedMiniTask.employee_id,
            ]
          );

        /* ===================================================
           RESUME ORIGINAL MAIN TASK
        =================================================== */

        if (
          lockedMiniTask
            .paused_main_task_id &&

          !otherMiniRows.length &&

          !activeSessions.length
        ) {
          const [taskRows] =
            await connection.query(
              `
                SELECT
                  t.task_id

                FROM tasks t

                WHERE
                  t.task_id = ?

                  AND (
                    t.parent_task_id
                      IS NULL

                    OR

                    t.parent_task_id = 0
                  )

                  AND (
                    EXISTS (
                      SELECT 1

                      FROM task_assignments ta

                      WHERE
                        ta.task_id =
                          t.task_id

                        AND ta.employee_id = ?
                    )

                    OR

                    t.assigned_to_user_id = ?
                  )

                  AND LOWER(
                    REPLACE(
                      COALESCE(
                        t.status,
                        ''
                      ),
                      ' ',
                      '_'
                    )
                  ) NOT IN (
                    'under_review',
                    'completed',
                    'done',
                    'complete',
                    'rejected',
                    'on_hold'
                  )

                LIMIT 1

                FOR UPDATE
              `,
              [
                lockedMiniTask
                  .paused_main_task_id,

                lockedMiniTask.employee_id,

                lockedMiniTask.employee_id,
              ]
            );

          if (
            taskRows.length
          ) {
            /*
              Exact scheduled Mini Task end time.
            */
            await connection.query(
              `
                INSERT INTO task_work_sessions (
                  task_id,
                  employee_id,
                  started_at
                )

                VALUES (
                  ?,
                  ?,
                  TIMESTAMP(?)
                )
              `,
              [
                lockedMiniTask
                  .paused_main_task_id,

                lockedMiniTask.employee_id,

                lockedMiniTask.scheduled_end,
              ]
            );
          }
        }

        /* ===================================================
           STORE MINI TASK END
        =================================================== */

        await connection.query(
          `
            UPDATE mini_tasks

            SET
              timer_ended_at =
                TIMESTAMP(?)

            WHERE
              mini_task_id = ?
          `,
          [
            lockedMiniTask.scheduled_end,

            lockedMiniTask.mini_task_id,
          ]
        );

        await connection.commit();

        console.log(
          `Mini task ${lockedMiniTask.mini_task_id} ended.` +
            (
              lockedMiniTask
                .paused_main_task_id
                ? ` Main task ${lockedMiniTask.paused_main_task_id} resume checked.`
                : ""
            )
        );
      } catch (error) {
        if (connection) {
          try {
            await connection.rollback();
          } catch (
            rollbackError
          ) {
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

const processMiniTaskTimers =
  async () => {
    await processMiniTaskStarts();

    await processMiniTaskEnds();
  };

/* =========================================================
   START CRON
========================================================= */

const startMiniTaskTimerJob =
  () => {
    cron.schedule(
      "* * * * *",

      async () => {
        try {
          await processMiniTaskTimers();
        } catch (error) {
          console.error(
            "Mini task timer job error:",
            error.message
          );
        }
      },

      {
        timezone:
          "Asia/Kolkata",
      }
    );

    console.log(
      "Mini task timer cron job scheduled every minute (Asia/Kolkata)."
    );
  };

module.exports = {
  startMiniTaskTimerJob,

  processMiniTaskTimers,
};