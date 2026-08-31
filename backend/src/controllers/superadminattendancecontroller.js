const db = require("../config/db");

/* =========================================================
   HELPERS
========================================================= */

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

const parseDateOnly = (value) => {
  return new Date(
    `${value}T00:00:00`
  );
};

const addOneDay = (date) => {
  const next =
    new Date(date);

  next.setDate(
    next.getDate() + 1
  );

  return next;
};

const buildWorkingDates = (
  startDate,
  endDate
) => {
  if (
    !startDate ||
    !endDate
  ) {
    return [];
  }

  const dates = [];

  let current =
    parseDateOnly(startDate);

  const last =
    parseDateOnly(endDate);

  while (
    current <= last
  ) {
    /*
      Sunday excluded exactly
      like Admin Attendance.
    */

    if (
      current.getDay() !== 0
    ) {
      const year =
        current.getFullYear();

      const month =
        String(
          current.getMonth() + 1
        ).padStart(
          2,
          "0"
        );

      const day =
        String(
          current.getDate()
        ).padStart(
          2,
          "0"
        );

      dates.push(
        `${year}-${month}-${day}`
      );
    }

    current =
      addOneDay(current);
  }

  return dates;
};

const normalizeStatus = (
  status
) => {
  const value =
    String(
      status || ""
    )
      .toLowerCase()
      .trim();

  if (
    value.includes("leave")
  ) {
    return "leave";
  }

  if (
    value.includes("late")
  ) {
    return "late";
  }

  if (
    value.includes("absent")
  ) {
    return "absent";
  }

  if (
    value.includes("half")
  ) {
    return "half_day";
  }

  if (
    value.includes("holiday")
  ) {
    return "holiday";
  }

  if (
    value.includes("present")
  ) {
    return "present";
  }

  return value || "present";
};

const getDisplayStatus = (
  status
) => {
  const value =
    normalizeStatus(status);

  if (
    value === "leave"
  ) {
    return "Leave";
  }

  if (
    value === "late"
  ) {
    return "Late";
  }

  if (
    value === "absent"
  ) {
    return "Absent";
  }

  if (
    value === "half_day"
  ) {
    return "Half Day";
  }

  if (
    value === "holiday"
  ) {
    return "Holiday";
  }

  return "Present";
};

const timeToMinutes = (
  timeValue
) => {
  if (!timeValue) {
    return null;
  }

  const parts =
    String(timeValue)
      .split(":");

  if (
    parts.length < 2
  ) {
    return null;
  }

  const hours =
    Number(parts[0]);

  const minutes =
    Number(parts[1]);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return null;
  }

  return (
    hours * 60 +
    minutes
  );
};

const formatMinutes = (
  minutes
) => {
  const value =
    Number(
      minutes || 0
    );

  if (
    value <= 0
  ) {
    return "-";
  }

  const hours =
    Math.floor(
      value / 60
    );

  const mins =
    value % 60;

  if (
    hours &&
    mins
  ) {
    return `${hours}h ${mins}m`;
  }

  if (hours) {
    return `${hours}h`;
  }

  return `${mins}m`;
};

const calculateWorkingHours = (
  record
) => {
  if (
    Number(
      record.total_minutes ||
        0
    ) > 0
  ) {
    return formatMinutes(
      record.total_minutes
    );
  }

  const checkIn =
    timeToMinutes(
      record.check_in_time
    );

  const checkOut =
    timeToMinutes(
      record.check_out_time
    );

  if (
    checkIn === null ||
    checkOut === null
  ) {
    return "-";
  }

  let difference =
    checkOut -
    checkIn;

  if (
    difference < 0
  ) {
    difference +=
      24 * 60;
  }

  return formatMinutes(
    difference
  );
};

/* =========================================================
   LOGGED-IN SUPERADMIN
========================================================= */

const getLoggedInSuperadmin =
  async (req) => {
    const userId =
      Number(
        req.user?.user_id ||
          req.user?.id ||
          req.userId ||
          0
      );

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
          u.employee_code,
          u.full_name,
          u.email,
          u.phone,
          u.designation,
          u.department_id,
          u.status,

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
            "Super Admin user not found.",
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

/* =========================================================
   BUILD USER ATTENDANCE
========================================================= */

const buildUserAttendanceSummary =
  ({
    user,
    records,
    workingDates,
  }) => {
    const recordMap =
      new Map();

    records.forEach(
      (record) => {
        const date =
          formatDateOnly(
            record.attendance_date
          );

        if (!date) {
          return;
        }

        if (
          !recordMap.has(
            date
          )
        ) {
          recordMap.set(
            date,
            record
          );
        }
      }
    );

    let present = 0;
    let absent = 0;
    let late = 0;
    let leave = 0;
    let halfDay = 0;
    let holiday = 0;

    const completedRecords =
      workingDates.map(
        (date) => {
          const record =
            recordMap.get(
              date
            );

          /*
            No row =
            Absent, same Admin logic.
          */

          if (!record) {
            absent += 1;

            return {
              attendance_id:
                null,

              employee_id:
                user.user_id,

              attendance_date:
                date,

              status:
                "Absent",

              check_in_time:
                "-",

              check_out_time:
                "-",

              total_minutes:
                0,

              working_hours:
                "-",

              remarks:
                "No attendance record",

              is_missing_date:
                true,
            };
          }

          const status =
            normalizeStatus(
              record.status
            );

          if (
            status === "leave"
          ) {
            leave += 1;
          } else if (
            status === "absent"
          ) {
            absent += 1;
          } else if (
            status === "late"
          ) {
            present += 1;
            late += 1;
          } else if (
            status ===
            "half_day"
          ) {
            halfDay += 1;
          } else if (
            status ===
            "holiday"
          ) {
            holiday += 1;
          } else {
            present += 1;
          }

          return {
            attendance_id:
              record.attendance_id,

            employee_id:
              record.employee_id,

            attendance_date:
              date,

            status:
              getDisplayStatus(
                record.status
              ),

            check_in_time:
              record.check_in_time ||
              "-",

            check_out_time:
              record.check_out_time ||
              "-",

            total_minutes:
              Number(
                record.total_minutes ||
                  0
              ),

            working_hours:
              calculateWorkingHours(
                record
              ),

            remarks:
              record.remarks ||
              "-",

            is_missing_date:
              false,
          };
        }
      );

    const actualRecords =
      records
        .map(
          (record) => ({
            ...record,

            attendance_date:
              formatDateOnly(
                record.attendance_date
              ),
          })
        )
        .filter(
          (record) =>
            record.attendance_date
        )
        .sort((a, b) =>
          String(
            b.attendance_date
          ).localeCompare(
            String(
              a.attendance_date
            )
          )
        );

    const latestAttendance =
      actualRecords[0]
        ?.attendance_date ||
      "-";

    const attendanceScore =
      present +
      halfDay * 0.5;

    const attendancePercentage =
      workingDates.length > 0
        ? Math.round(
            (
              attendanceScore /
              workingDates.length
            ) * 100
          )
        : 0;

    return {
      user_id:
        user.user_id,

      employee_code:
        user.employee_code,

      full_name:
        user.full_name,

      email:
        user.email,

      phone:
        user.phone,

      designation:
        user.designation,

      department_id:
        user.department_id,

      department_name:
        user.department_name,

      role_name:
        user.role_name,

      status:
        user.status,

      total:
        workingDates.length,

      present,

      absent,

      late,

      leave,

      half_day:
        halfDay,

      holiday,

      attendance_percentage:
        attendancePercentage,

      latest_attendance_date:
        latestAttendance,

      records:
        completedRecords.sort(
          (a, b) =>
            String(
              b.attendance_date
            ).localeCompare(
              String(
                a.attendance_date
              )
            )
        ),
    };
  };

/* =========================================================
   SUPERADMIN — ALL ORGANIZATION ATTENDANCE
========================================================= */

const getSuperadminAttendance =
  async (req, res) => {
    try {
      const {
        user: superadmin,
        error,
      } =
        await getLoggedInSuperadmin(
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
        NO department condition.

        Super Admin gets ALL
        non-deleted users.
      */

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
            u.department_id,
            u.status,

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
            LOWER(
              COALESCE(
                u.status,
                'active'
              )
            ) <> 'deleted'

          ORDER BY
            d.department_name ASC,
            u.full_name ASC
          `
        );

      const userIds =
        users
          .map(
            (user) =>
              Number(
                user.user_id
              )
          )
          .filter(Boolean);

      if (
        !userIds.length
      ) {
        return res.json({
          success: true,

          superadmin,

          date_range: {
            start_date:
              null,

            end_date:
              null,

            working_days:
              0,
          },

          my_attendance:
            null,

          employee_summary:
            [],

          organization_totals:
            {
              people: 0,
              total: 0,
              present: 0,
              absent: 0,
              late: 0,
              leave: 0,
            },
        });
      }

      const placeholders =
        userIds
          .map(() => "?")
          .join(",");

      /*
        Attendance range across
        entire company.
      */

      const [rangeRows] =
        await db.query(
          `
          SELECT
            MIN(
              attendance_date
            ) AS start_date,

            MAX(
              attendance_date
            ) AS end_date

          FROM attendance

          WHERE
            employee_id
            IN (${placeholders})
          `,
          userIds
        );

      const startDate =
        formatDateOnly(
          rangeRows[0]
            ?.start_date
        );

      const endDate =
        formatDateOnly(
          rangeRows[0]
            ?.end_date
        );

      const workingDates =
        buildWorkingDates(
          startDate,
          endDate
        );

      let attendanceRows =
        [];

      if (
        startDate &&
        endDate
      ) {
        const [rows] =
          await db.query(
            `
            SELECT
              attendance_id,
              employee_id,
              attendance_date,
              check_in_time,
              check_out_time,
              total_minutes,
              status,
              remarks

            FROM attendance

            WHERE
              employee_id
              IN (${placeholders})

              AND attendance_date
              BETWEEN ? AND ?

            ORDER BY
              attendance_date DESC
            `,
            [
              ...userIds,
              startDate,
              endDate,
            ]
          );

        attendanceRows =
          rows;
      }

      const summaries =
        users.map(
          (user) => {
            const records =
              attendanceRows.filter(
                (record) =>
                  Number(
                    record.employee_id
                  ) ===
                  Number(
                    user.user_id
                  )
              );

            return buildUserAttendanceSummary(
              {
                user,
                records,
                workingDates,
              }
            );
          }
        );

      /*
        Logged in Super Admin's
        own detailed attendance.
      */

      const myAttendance =
        summaries.find(
          (item) =>
            Number(
              item.user_id
            ) ===
            Number(
              superadmin.user_id
            )
        ) ||
        buildUserAttendanceSummary(
          {
            user:
              superadmin,

            records: [],

            workingDates,
          }
        );

      /*
        All other organization users.
      */

      const employeeSummary =
        summaries.filter(
          (item) =>
            Number(
              item.user_id
            ) !==
            Number(
              superadmin.user_id
            )
        );

      const organizationTotals =
        employeeSummary.reduce(
          (
            totals,
            item
          ) => {
            totals.people +=
              1;

            totals.total +=
              Number(
                item.total ||
                  0
              );

            totals.present +=
              Number(
                item.present ||
                  0
              );

            totals.absent +=
              Number(
                item.absent ||
                  0
              );

            totals.late +=
              Number(
                item.late ||
                  0
              );

            totals.leave +=
              Number(
                item.leave ||
                  0
              );

            return totals;
          },
          {
            people: 0,
            total: 0,
            present: 0,
            absent: 0,
            late: 0,
            leave: 0,
          }
        );

      return res.json({
        success: true,

        superadmin,

        office_hours: {
          start_time:
            "11:00:00",

          end_time:
            "19:30:00",

          late_after:
            "11:00:00",
        },

        date_range: {
          start_date:
            startDate,

          end_date:
            endDate,

          working_days:
            workingDates.length,

          note:
            "Absent count is calculated from missing attendance dates and excludes Sundays.",
        },

        my_attendance:
          myAttendance,

        employee_summary:
          employeeSummary,

        organization_totals:
          organizationTotals,
      });
    } catch (error) {
      console.error(
        "Superadmin attendance error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to fetch organization attendance.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    }
  };

module.exports = {
  getSuperadminAttendance,
};