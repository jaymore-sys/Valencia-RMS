const POLICY_START_DATE = "2026-09-01";

const MONTHLY_PRIVILEGED_CREDIT = 1.5;

/*
========================================================
INDIA DATE
========================================================
*/

const getIndiaToday = () => {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(
      new Date()
    );

  const values = {};

  parts.forEach((part) => {
    values[part.type] =
      part.value;
  });

  return `${values.year}-${values.month}-${values.day}`;
};

const formatNumber = (value) => {
  const number =
    Number(value || 0);

  return Number.isInteger(number)
    ? number
    : Number(
        number.toFixed(1)
      );
};

/*
========================================================
YEARLY POLICY

2026 transition:
Sep-Dec
Sick = 2
Casual = 2
Festival = 2

2027 onward:
Sick = 7
Casual = 7
Festival = 4

Privileged never resets.
========================================================
*/

const getAnnualEntitlements = (
  year
) => {
  const numericYear =
    Number(year);

  if (
    numericYear === 2026
  ) {
    return {
      sick: 2,
      casual: 2,
      festival: 2,
    };
  }

  if (
    numericYear >= 2027
  ) {
    return {
      sick: 7,
      casual: 7,
      festival: 4,
    };
  }

  return {
    sick: 0,
    casual: 0,
    festival: 0,
  };
};

const getAnnualPeriod = (
  year
) => {
  const numericYear =
    Number(year);

  if (
    numericYear === 2026
  ) {
    return {
      startDate:
        "2026-09-01",

      endDate:
        "2026-12-31",
    };
  }

  if (
    numericYear >= 2027
  ) {
    return {
      startDate:
        `${numericYear}-01-01`,

      endDate:
        `${numericYear}-12-31`,
    };
  }

  return {
    startDate: null,
    endDate: null,
  };
};

/*
========================================================
PRIVILEGED LEAVE

Starts:
September 2026

Credits:
1.5 every month

Never resets.

Example:
Sep 2026 = 1.5
Oct = 3
Nov = 4.5
Dec = 6
Jan 2027 = 7.5
========================================================
*/

const getPrivilegedEarned = (
  asOfDate = getIndiaToday()
) => {
  if (
    asOfDate <
    POLICY_START_DATE
  ) {
    return 0;
  }

  const [
    year,
    month,
  ] = String(asOfDate)
    .slice(0, 7)
    .split("-")
    .map(Number);

  const monthsSinceStart =
    (year - 2026) * 12 +
    (month - 9);

  const lastCalendarDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dayOfMonth = Number(String(asOfDate).slice(8, 10));
  const creditedMonths = monthsSinceStart + (dayOfMonth >= lastCalendarDay ? 1 : 0);

  return formatNumber(
    Math.max(
      0,
      creditedMonths
    ) *
      MONTHLY_PRIVILEGED_CREDIT
  );
};

/*
========================================================
GET NORMAL YEAR USAGE
========================================================
*/

const getAnnualUsage = async (
  db,
  employeeId,
  leaveType,
  year,
  excludeLeaveId = null
) => {
  const period =
    getAnnualPeriod(year);

  if (
    !period.startDate ||
    !period.endDate
  ) {
    return {
      used: 0,
      pending: 0,
    };
  }

  const parameters = [
    employeeId,
    leaveType,
    period.startDate,
    period.endDate,
  ];

  let excludeSql = "";

  if (excludeLeaveId) {
    excludeSql =
      "AND leave_id <> ?";

    parameters.push(
      excludeLeaveId
    );
  }

  const [rows] =
    await db.query(
      `
      SELECT

        COALESCE(
          SUM(
            CASE
              WHEN status = 'approved'
              THEN total_days
              ELSE 0
            END
          ),
          0
        ) AS used_days,

        COALESCE(
          SUM(
            CASE
              WHEN status = 'pending'
              THEN total_days
              ELSE 0
            END
          ),
          0
        ) AS pending_days

      FROM leave_applications

      WHERE
        employee_id = ?

        AND leave_type = ?

        AND start_date >= ?

       AND start_date <= ?

AND COALESCE(
  revert_status,
  'none'
) <> 'approved'

${excludeSql}
      `,
      parameters
    );

  return {
    used:
      Number(
        rows[0]?.used_days ||
          0
      ),

    pending:
      Number(
        rows[0]?.pending_days ||
          0
      ),
  };
};

/*
========================================================
PRIVILEGED USAGE

Important:
All Privileged Leave from Sep 2026 onward counts
because unused balance carries forever.
========================================================
*/

const getPrivilegedUsage =
  async (
    db,
    employeeId,
    excludeLeaveId = null
  ) => {
    const parameters = [
      employeeId,
    ];

    let excludeSql = "";

    if (excludeLeaveId) {
      excludeSql =
        "AND leave_id <> ?";

      parameters.push(
        excludeLeaveId
      );
    }

    const [rows] =
      await db.query(
        `
        SELECT

          COALESCE(
            SUM(
              CASE
                WHEN status = 'approved'
                THEN total_days
                ELSE 0
              END
            ),
            0
          ) AS used_days,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'pending'
                THEN total_days
                ELSE 0
              END
            ),
            0
          ) AS pending_days

        FROM leave_applications

        WHERE
          employee_id = ?

          AND leave_type = 'mandatory'

          AND start_date >=
  '${POLICY_START_DATE}'

AND COALESCE(
  revert_status,
  'none'
) <> 'approved'

${excludeSql}
        `,
        parameters
      );

    return {
      used:
        Number(
          rows[0]?.used_days ||
            0
        ),

      pending:
        Number(
          rows[0]?.pending_days ||
            0
        ),
    };
  };

/*
========================================================
ADMINISTRATOR EXTRA LEAVE

Extra Leave:
- Is not tied to a calendar year.
- Does not expire.
- Carries forward until consumed.
- Applies to:
  sick
  casual
  mandatory / privileged
  festival
========================================================
*/

const getExtraLeaveGranted = async (
  db,
  employeeId,
  leaveType
) => {
  const [rows] =
    await db.query(
      `
      SELECT
        COALESCE(
          SUM(adjustment_days),
          0
        ) AS extra_days

      FROM employee_leave_adjustments

      WHERE employee_id = ?
        AND leave_type = ?
      `,
      [
        employeeId,
        leaveType,
      ]
    );

  return Number(
    rows[0]?.extra_days ||
      0
  );
};

/*
========================================================
CALCULATE EXTRA LEAVE ALREADY CONSUMED
IN PREVIOUS YEARS

Example:

Normal Sick entitlement = 2
Administrator added      = 2 extra

2026 employee used 3

Normal entitlement used  = 2
Extra consumed           = 1

So next year:
1 Extra Sick Leave still carries forward.
========================================================
*/

const getHistoricalExtraConsumed =
  async (
    db,
    employeeId,
    leaveType,
    beforeYear
  ) => {
    const numericYear =
      Number(beforeYear);

    if (
      !Number.isFinite(
        numericYear
      ) ||
      numericYear <= 2026
    ) {
      return 0;
    }

    const [rows] =
      await db.query(
        `
        SELECT
          YEAR(start_date) AS leave_year,

          COALESCE(
            SUM(total_days),
            0
          ) AS used_days

        FROM leave_applications

        WHERE employee_id = ?
          AND leave_type = ?
          AND status = 'approved'

AND COALESCE(
  revert_status,
  'none'
) <> 'approved'

AND start_date >= ?
          AND YEAR(start_date) < ?

        GROUP BY
          YEAR(start_date)

        ORDER BY
          YEAR(start_date) ASC
        `,
        [
          employeeId,
          leaveType,
          POLICY_START_DATE,
          numericYear,
        ]
      );

    let consumedExtra = 0;

    rows.forEach((row) => {
      const leaveYear =
        Number(
          row.leave_year
        );

      const usage =
        Number(
          row.used_days ||
            0
        );

      const yearlyEntitlements =
        getAnnualEntitlements(
          leaveYear
        );

      const normalEntitlement =
        Number(
          yearlyEntitlements[
            leaveType
          ] || 0
        );

      consumedExtra +=
        Math.max(
          0,
          usage -
            normalEntitlement
        );
    });

    return formatNumber(
      consumedExtra
    );
  };

/*
========================================================
EXTRA LEAVE AVAILABLE AT START OF YEAR
========================================================
*/

const getCarryForwardExtraLeave =
  async (
    db,
    employeeId,
    leaveType,
    year
  ) => {
    const granted =
      await getExtraLeaveGranted(
        db,
        employeeId,
        leaveType
      );

    const previouslyConsumed =
      await getHistoricalExtraConsumed(
        db,
        employeeId,
        leaveType,
        year
      );

    return formatNumber(
      Math.max(
        0,
        granted -
          previouslyConsumed
      )
    );
  };

/*
========================================================
BUILD FINAL BALANCES
========================================================
*/

// Leave policy helper, injected into leavepolicy.js immediately before buildLeaveBalances.
// Applies a nine-day ceiling only to year-end carried accrued Privileged Leave.
// Separate HR-granted extra leave remains outside that ceiling, consistent with prior policy.
const MAX_PRIVILEGED_CARRY = 9;
const getPrivilegedBalanceInYear = async (db, employeeId, year, excludeLeaveId = null) => {
  const indiaToday = getIndiaToday();
  const currentYear = Number(indiaToday.slice(0, 4));
  const currentMonth = Number(indiaToday.slice(5, 7));
  const currentDay = Number(indiaToday.slice(8, 10));
  const lastCalendarDayOfCurrentMonth = new Date(Date.UTC(currentYear, currentMonth, 0)).getUTCDate();
  const lastCreditedMonth = currentMonth - (currentDay >= lastCalendarDayOfCurrentMonth ? 0 : 1);
  const y = Number(year);
  if (!Number.isInteger(y) || y < 2026) return { earned: 0, used: 0, pending: 0, carry_in: 0 };
  const params = [employeeId, POLICY_START_DATE, `${y}-12-31`];
  const exclusion = excludeLeaveId ? ' AND leave_id <> ? ' : '';
  if (excludeLeaveId) params.push(excludeLeaveId);
  const [rows] = await db.query(`SELECT YEAR(start_date) yr,
    SUM(CASE WHEN status = 'approved' THEN total_days ELSE 0 END) used,
    SUM(CASE WHEN status = 'pending' THEN total_days ELSE 0 END) pending
    FROM leave_applications WHERE employee_id=? AND leave_type='mandatory'
    AND start_date >= ? AND start_date <= ?
    AND COALESCE(revert_status, 'none') <> 'approved' ${exclusion}
    GROUP BY YEAR(start_date)`, params);
  const map = new Map(rows.map(r => [Number(r.yr),r]));
  let carry = 0, earned = 0, used = 0, pending = 0, carryIn = 0;
  for(let yr = 2026; yr <= y; yr++) {
    carryIn = Math.min(MAX_PRIVILEGED_CARRY, Math.max(0,carry));
    const firstMonth = yr === 2026 ? 9 : 1;
    const lastMonth = yr < currentYear ? 12 : yr === currentYear ? lastCreditedMonth : 0;
    const months = Math.max(0, lastMonth - firstMonth + 1);
    earned = formatNumber(carryIn + months * MONTHLY_PRIVILEGED_CREDIT);
    used = Number(map.get(yr)?.used || 0);
    pending = Number(map.get(yr)?.pending || 0);
    carry = Math.max(0, earned - used - pending);
  }
  return { earned, used, pending, carry_in: formatNumber(carryIn), carry_cap: MAX_PRIVILEGED_CARRY };
};

const buildLeaveBalances =
  async (
    db,
    employeeId,
    year,
    options = {}
  ) => {
    const excludeLeaveId =
      options.excludeLeaveId ||
      null;

    const entitlements =
      getAnnualEntitlements(
        year
      );

    const sickUsage =
      await getAnnualUsage(
        db,
        employeeId,
        "sick",
        year,
        excludeLeaveId
      );

    const casualUsage =
      await getAnnualUsage(
        db,
        employeeId,
        "casual",
        year,
        excludeLeaveId
      );

    const festivalUsage =
      await getAnnualUsage(
        db,
        employeeId,
        "festival",
        year,
        excludeLeaveId
      );

    const privilegedUsage =
      await getPrivilegedBalanceInYear(
        db, employeeId, year, excludeLeaveId
      );

    const privilegedEarned = privilegedUsage.earned;

    const [
      sickExtra,
      casualExtra,
      festivalExtra,
      privilegedExtra,
    ] = await Promise.all([
      getCarryForwardExtraLeave(
        db,
        employeeId,
        "sick",
        year
      ),

      getCarryForwardExtraLeave(
        db,
        employeeId,
        "casual",
        year
      ),

      getCarryForwardExtraLeave(
        db,
        employeeId,
        "festival",
        year
      ),

      getExtraLeaveGranted(
        db,
        employeeId,
        "mandatory"
      ),
    ]);

    const sickTotal =
      Number(
        entitlements.sick || 0
      ) +
      Number(
        sickExtra || 0
      );

    const casualTotal =
      Number(
        entitlements.casual || 0
      ) +
      Number(
        casualExtra || 0
      );

    const festivalTotal =
      Number(
        entitlements.festival || 0
      ) +
      Number(
        festivalExtra || 0
      );

    const privilegedTotal =
      Number(
        privilegedEarned || 0
      ) +
      Number(
        privilegedExtra || 0
      );

    const sickAvailable =
      Math.max(
        0,
        sickTotal -
          sickUsage.used -
          sickUsage.pending
      );

    const casualAvailable =
      Math.max(
        0,
        casualTotal -
          casualUsage.used -
          casualUsage.pending
      );

    const holidayAvailable =
      Math.max(
        0,
        festivalTotal -
          festivalUsage.used -
          festivalUsage.pending
      );

    const privilegedAvailable =
      Math.max(
        0,
        privilegedTotal -
          privilegedUsage.used -
          privilegedUsage.pending
      );

    return {
      sick: {
        label:
          "Sick Leave",

        total:
          formatNumber(
            sickTotal
          ),

        earned:
          formatNumber(
            sickTotal
          ),

        used:
          formatNumber(
            sickUsage.used
          ),

        pending:
          formatNumber(
            sickUsage.pending
          ),

        available:
          formatNumber(
            sickAvailable
          ),

        remaining:
          formatNumber(
            sickAvailable
          ),
      },

      casual: {
        label:
          "Casual Leave",

        total:
          formatNumber(
            casualTotal
          ),

        earned:
          formatNumber(
            casualTotal
          ),

        used:
          formatNumber(
            casualUsage.used
          ),

        pending:
          formatNumber(
            casualUsage.pending
          ),

        available:
          formatNumber(
            casualAvailable
          ),

        remaining:
          formatNumber(
            casualAvailable
          ),
      },

      mandatory: {
        label:
          "Privileged Leave",

        monthly_credit:
          MONTHLY_PRIVILEGED_CREDIT,

        carry_forward:
          true,
        carry_forward_cap: MAX_PRIVILEGED_CARRY,
        carry_forward_days: privilegedUsage.carry_in,

        earned:
          formatNumber(
            privilegedTotal
          ),

        total:
          formatNumber(
            privilegedTotal
          ),

        used:
          formatNumber(
            privilegedUsage.used
          ),

        pending:
          formatNumber(
            privilegedUsage.pending
          ),

        available:
          formatNumber(
            privilegedAvailable
          ),

        remaining:
          formatNumber(
            privilegedAvailable
          ),
      },

      festival: {
        label:
          "Holiday Leave",

        total:
          formatNumber(
            festivalTotal
          ),

        earned:
          formatNumber(
            festivalTotal
          ),

        used:
          formatNumber(
            festivalUsage.used
          ),

        pending:
          formatNumber(
            festivalUsage.pending
          ),

        available:
          formatNumber(
            holidayAvailable
          ),

        remaining:
          formatNumber(
            holidayAvailable
          ),
      },
    };
  };

module.exports = {
  POLICY_START_DATE,
  MONTHLY_PRIVILEGED_CREDIT,
  getIndiaToday,
  getAnnualEntitlements,
  getAnnualPeriod,
  getPrivilegedEarned,
  buildLeaveBalances,
};