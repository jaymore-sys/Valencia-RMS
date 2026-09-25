/*
=========================================================
VALENCIA RMS - SHARED WORK TIME CALCULATOR

Single source of truth for:
- Monday to Saturday working days
- 11:00 AM to 7:30 PM office span
- Lunch excluded: 2:00 PM to 2:45 PM
- High tea excluded: 6:00 PM to 6:30 PM
- Sunday = 0
- Fixed company holidays = 0
- Employee optional holidays = 0
- Historical start/end timestamps
- Reviewed Mini Task precedence over Main Task time
- Protection against overlapping Main Task / Mini Task intervals
- Daily, monthly and all-time aggregation support

IMPORTANT
---------
For MySQL DATETIME values, prefer returning them from SQL as strings:

DATE_FORMAT(tws.started_at, '%Y-%m-%d %H:%i:%s') AS started_at_local

This avoids server-timezone / Node-timezone ambiguity.
=========================================================
*/

const WORK_START_TIME = "11:00:00";
const WORK_END_TIME = "19:30:00";

const LUNCH_START_TIME = "14:00:00";
const LUNCH_END_TIME = "14:45:00";

const HIGH_TEA_START_TIME = "18:00:00";
const HIGH_TEA_END_TIME = "18:30:00";

/*
Valid countable windows:
11:00 -> 14:00
14:45 -> 18:00
18:30 -> 19:30

Maximum normal countable time:
7 hours 15 minutes = 26,100 seconds
*/
const WORK_WINDOWS = Object.freeze([
  Object.freeze({
    start: WORK_START_TIME,
    end: LUNCH_START_TIME,
  }),
  Object.freeze({
    start: LUNCH_END_TIME,
    end: HIGH_TEA_START_TIME,
  }),
  Object.freeze({
    start: HIGH_TEA_END_TIME,
    end: WORK_END_TIME,
  }),
]);

const MAX_WORK_SECONDS_PER_NORMAL_DAY =
  7 * 60 * 60 + 15 * 60;

/*
Fixed holidays are recurring month/day values.
*/
const FIXED_COMPANY_HOLIDAY_MONTH_DAYS =
  new Set([
    "01-26",
    "05-01",
    "08-15",
    "10-02",
  ]);

const pad2 = (value) =>
  String(value).padStart(2, "0");

const normalizeDateString = (value) => {
  const text = String(value || "").trim();

  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const check = new Date(
    Date.UTC(year, month - 1, day)
  );

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
};

const normalizeTimeString = (value) => {
  const text = String(value || "").trim();

  const match = text.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  return `${pad2(hour)}:${pad2(
    minute
  )}:${pad2(second)}`;
};

const localPartsToMs = ({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
}) => {
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond)
  );
};

const msToLocalParts = (ms) => {
  const date = new Date(ms);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    millisecond:
      date.getUTCMilliseconds(),
  };
};

const msToDateString = (ms) => {
  const parts =
    msToLocalParts(ms);

  return (
    `${parts.year}-` +
    `${pad2(parts.month)}-` +
    `${pad2(parts.day)}`
  );
};

const msToDateTimeString = (ms) => {
  const parts =
    msToLocalParts(ms);

  return (
    `${parts.year}-` +
    `${pad2(parts.month)}-` +
    `${pad2(parts.day)} ` +
    `${pad2(parts.hour)}:` +
    `${pad2(parts.minute)}:` +
    `${pad2(parts.second)}`
  );
};

const getIndiaPartsFromDate = (
  date
) => {
  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }
    );

  const parts =
    formatter.formatToParts(
      date
    );

  const values = {};

  for (const part of parts) {
    if (
      part.type !== "literal"
    ) {
      values[part.type] =
        part.value;
    }
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(
      values.minute
    ),
    second: Number(
      values.second
    ),
    millisecond: 0,
  };
};

/*
Converts supported values to an
internal India-local wall-clock value.
*/
const parseLocalDateTime = (
  value
) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    value instanceof Date
  ) {
    if (
      Number.isNaN(
        value.getTime()
      )
    ) {
      return null;
    }

    return localPartsToMs(
      getIndiaPartsFromDate(
        value
      )
    );
  }

  if (
    typeof value === "number"
  ) {
    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return null;
    }

    return localPartsToMs(
      getIndiaPartsFromDate(
        date
      )
    );
  }

  const text =
    String(value).trim();

  /*
  MySQL / local wall-clock:
  YYYY-MM-DD HH:mm:ss
  */
  const plainMatch =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/
    );

  if (plainMatch) {
    const dateString =
      `${plainMatch[1]}-${plainMatch[2]}-${plainMatch[3]}`;

    const timeString =
      `${pad2(
        plainMatch[4]
      )}:${plainMatch[5]}:${plainMatch[6] || "00"}`;

    const validDate =
      normalizeDateString(
        dateString
      );

    const validTime =
      normalizeTimeString(
        timeString
      );

    if (
      !validDate ||
      !validTime
    ) {
      return null;
    }

    const [
      year,
      month,
      day,
    ] =
      validDate
        .split("-")
        .map(Number);

    const [
      hour,
      minute,
      second,
    ] =
      validTime
        .split(":")
        .map(Number);

    return localPartsToMs({
      year,
      month,
      day,
      hour,
      minute,
      second,
      millisecond:
        Number(
          String(
            plainMatch[7] ||
              "0"
          ).padEnd(
            3,
            "0"
          )
        ),
    });
  }

  /*
  Zoned ISO timestamp.
  */
  if (
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(
      text
    )
  ) {
    const date =
      new Date(text);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return null;
    }

    return localPartsToMs(
      getIndiaPartsFromDate(
        date
      )
    );
  }

  return null;
};

const combineDateAndTime = (
  dateValue,
  timeValue
) => {
  const dateString =
    normalizeDateString(
      dateValue
    );

  const timeString =
    normalizeTimeString(
      timeValue
    );

  if (
    !dateString ||
    !timeString
  ) {
    return null;
  }

  return parseLocalDateTime(
    `${dateString} ${timeString}`
  );
};

const addDays = (
  dateString,
  days
) => {
  const normalized =
    normalizeDateString(
      dateString
    );

  if (!normalized) {
    return null;
  }

  const [
    year,
    month,
    day,
  ] =
    normalized
      .split("-")
      .map(Number);

  const ms =
    Date.UTC(
      year,
      month - 1,
      day + Number(days || 0)
    );

  return msToDateString(ms);
};

const getDayOfWeek = (
  dateString
) => {
  const normalized =
    normalizeDateString(
      dateString
    );

  if (!normalized) {
    return null;
  }

  const [
    year,
    month,
    day,
  ] =
    normalized
      .split("-")
      .map(Number);

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  ).getUTCDay();
};

const normalizeHolidaySet = (
  values
) => {
  if (!values) {
    return new Set();
  }

  const source =
    values instanceof Set
      ? Array.from(values)
      : Array.isArray(values)
        ? values
        : [values];

  return new Set(
    source
      .map(
        normalizeDateString
      )
      .filter(Boolean)
  );
};

const isFixedCompanyHoliday = (
  dateString
) => {
  const normalized =
    normalizeDateString(
      dateString
    );

  if (!normalized) {
    return false;
  }

  return FIXED_COMPANY_HOLIDAY_MONTH_DAYS.has(
    normalized.slice(5)
  );
};

const isWorkingDate = (
  dateString,
  {
    optionalHolidayDates = [],
    additionalHolidayDates = [],
  } = {}
) => {
  const normalized =
    normalizeDateString(
      dateString
    );

  if (!normalized) {
    return false;
  }

  /*
  Sunday = 0
  */
  if (
    getDayOfWeek(
      normalized
    ) === 0
  ) {
    return false;
  }

  if (
    isFixedCompanyHoliday(
      normalized
    )
  ) {
    return false;
  }

  const optionalSet =
    normalizeHolidaySet(
      optionalHolidayDates
    );

  if (
    optionalSet.has(
      normalized
    )
  ) {
    return false;
  }

  const additionalSet =
    normalizeHolidaySet(
      additionalHolidayDates
    );

  if (
    additionalSet.has(
      normalized
    )
  ) {
    return false;
  }

  return true;
};

const getWorkingWindowsForDate =
  (
    dateString,
    options = {}
  ) => {
    const normalized =
      normalizeDateString(
        dateString
      );

    if (
      !normalized ||
      !isWorkingDate(
        normalized,
        options
      )
    ) {
      return [];
    }

    return WORK_WINDOWS.map(
      (window) => ({
        date: normalized,

        startMs:
          combineDateAndTime(
            normalized,
            window.start
          ),

        endMs:
          combineDateAndTime(
            normalized,
            window.end
          ),
      })
    );
  };

const intersectInterval = (
  startA,
  endA,
  startB,
  endB
) => {
  const startMs =
    Math.max(
      Number(startA),
      Number(startB)
    );

  const endMs =
    Math.min(
      Number(endA),
      Number(endB)
    );

  if (
    !Number.isFinite(
      startMs
    ) ||
    !Number.isFinite(
      endMs
    ) ||
    endMs <= startMs
  ) {
    return null;
  }

  return {
    startMs,
    endMs,
  };
};

const clipIntervalToWorkingWindows =
  (
    startValue,
    endValue,
    options = {}
  ) => {
    const startMs =
      parseLocalDateTime(
        startValue
      );

    const endMs =
      parseLocalDateTime(
        endValue
      );

    if (
      startMs === null ||
      endMs === null ||
      endMs <= startMs
    ) {
      return [];
    }

    const segments = [];

    let dateCursor =
      msToDateString(
        startMs
      );

    const finalDate =
      msToDateString(
        endMs
      );

    let guard = 0;

    while (
      dateCursor &&
      dateCursor <=
        finalDate &&
      guard < 3700
    ) {
      const windows =
        getWorkingWindowsForDate(
          dateCursor,
          options
        );

      for (
        const window of
        windows
      ) {
        const overlap =
          intersectInterval(
            startMs,
            endMs,
            window.startMs,
            window.endMs
          );

        if (overlap) {
          segments.push({
            date:
              dateCursor,
            startMs:
              overlap.startMs,
            endMs:
              overlap.endMs,
          });
        }
      }

      dateCursor =
        addDays(
          dateCursor,
          1
        );

      guard += 1;
    }

    return segments;
  };

const mergeIntervals = (
  intervals = []
) => {
  const clean =
    intervals
      .map(
        (interval) => ({
          startMs:
            Number(
              interval.startMs
            ),
          endMs:
            Number(
              interval.endMs
            ),
        })
      )
      .filter(
        (interval) =>
          Number.isFinite(
            interval.startMs
          ) &&
          Number.isFinite(
            interval.endMs
          ) &&
          interval.endMs >
            interval.startMs
      )
      .sort(
        (a, b) =>
          a.startMs -
            b.startMs ||
          a.endMs -
            b.endMs
      );

  if (!clean.length) {
    return [];
  }

  const merged = [
    {
      ...clean[0],
    },
  ];

  for (
    let index = 1;
    index < clean.length;
    index += 1
  ) {
    const current =
      clean[index];

    const last =
      merged[
        merged.length - 1
      ];

    if (
      current.startMs <=
      last.endMs
    ) {
      last.endMs =
        Math.max(
          last.endMs,
          current.endMs
        );
    } else {
      merged.push({
        ...current,
      });
    }
  }

  return merged;
};

const subtractIntervals = (
  baseIntervals = [],
  exclusionIntervals = []
) => {
  const exclusions =
    mergeIntervals(
      exclusionIntervals
    );

  if (
    !exclusions.length
  ) {
    return baseIntervals.map(
      (interval) => ({
        ...interval,
      })
    );
  }

  const result = [];

  for (
    const base of
    baseIntervals
  ) {
    let pieces = [
      {
        ...base,
      },
    ];

    for (
      const exclusion of
      exclusions
    ) {
      const nextPieces = [];

      for (
        const piece of
        pieces
      ) {
        if (
          exclusion.endMs <=
            piece.startMs ||
          exclusion.startMs >=
            piece.endMs
        ) {
          nextPieces.push(
            piece
          );

          continue;
        }

        if (
          exclusion.startMs >
          piece.startMs
        ) {
          nextPieces.push({
            ...piece,

            endMs:
              Math.min(
                exclusion.startMs,
                piece.endMs
              ),
          });
        }

        if (
          exclusion.endMs <
          piece.endMs
        ) {
          nextPieces.push({
            ...piece,

            startMs:
              Math.max(
                exclusion.endMs,
                piece.startMs
              ),
          });
        }
      }

      pieces =
        nextPieces.filter(
          (piece) =>
            piece.endMs >
            piece.startMs
        );

      if (!pieces.length) {
        break;
      }
    }

    result.push(
      ...pieces
    );
  }

  return result;
};

const getIntervalsSeconds = (
  intervals = []
) => {
  return Math.floor(
    intervals.reduce(
      (
        sum,
        interval
      ) =>
        sum +
        Math.max(
          0,
          Number(
            interval.endMs
          ) -
            Number(
              interval.startMs
            )
        ),
      0
    ) / 1000
  );
};

const getIndiaNowLocalString =
  () => {
    const parts =
      getIndiaPartsFromDate(
        new Date()
      );

    return (
      `${parts.year}-` +
      `${pad2(
        parts.month
      )}-` +
      `${pad2(
        parts.day
      )} ` +
      `${pad2(
        parts.hour
      )}:` +
      `${pad2(
        parts.minute
      )}:` +
      `${pad2(
        parts.second
      )}`
    );
  };

const buildMiniTaskDateTimes =
  (task) => {
    const startDate =
      normalizeDateString(
        task.start_date ||
          task.task_date
      );

    const endDate =
      normalizeDateString(
        task.end_date ||
          task.start_date ||
          task.task_date
      );

    const startTime =
      normalizeTimeString(
        task.start_time
      );

    const endTime =
      normalizeTimeString(
        task.end_time
      );

    if (
      !startDate ||
      !endDate ||
      !startTime ||
      !endTime
    ) {
      return {
        start: null,
        end: null,
      };
    }

    return {
      start:
        `${startDate} ${startTime}`,

      end:
        `${endDate} ${endTime}`,
    };
  };

const buildMainSessionDateTimes =
  (
    session,
    nowLocal
  ) => {
    const start =
      session.started_at_local ||
      session.started_at;

    const end =
      session.ended_at_local ||
      session.ended_at ||
      nowLocal;

    return {
      start,
      end,
    };
  };

const getSourceId = (
  type,
  source
) => {
  if (
    type === "mini"
  ) {
    return (
      source.mini_task_id ??
      source.id ??
      null
    );
  }

  return (
    source.session_id ??
    source.id ??
    null
  );
};

const decorateSegments = (
  segments,
  {
    type,
    source,
  }
) => {
  return segments.map(
    (segment) => ({
      ...segment,

      type,

      source_id:
        getSourceId(
          type,
          source
        ),

      employee_id:
        source.employee_id ??
        null,

      project_id:
        source.project_id ??
        null,

      task_id:
        source.task_id ??
        null,

      mini_task_id:
        source.mini_task_id ??
        null,

      division_id:
        source.division_id ??
        null,

      division:
        source.division ||
        source.division_name ||
        null,

      project_title:
        source.project_title ||
        null,

      task_title:
        source.task_title ||
        null,

      mini_task_title:
        source.mini_task_title ||
        null,
    })
  );
};

const clipSegmentsToReportRange =
  (
    segments = [],
    rangeStartLocal = null,
    rangeEndLocal = null
  ) => {
    const rangeStartMs =
      rangeStartLocal
        ? parseLocalDateTime(
            rangeStartLocal
          )
        : null;

    const rangeEndMs =
      rangeEndLocal
        ? parseLocalDateTime(
            rangeEndLocal
          )
        : null;

    if (
      rangeStartMs === null &&
      rangeEndMs === null
    ) {
      return segments.map(
        (segment) => ({
          ...segment,
        })
      );
    }

    const result = [];

    for (
      const segment of
      segments
    ) {
      const startMs =
        rangeStartMs === null
          ? segment.startMs
          : Math.max(
              segment.startMs,
              rangeStartMs
            );

      const endMs =
        rangeEndMs === null
          ? segment.endMs
          : Math.min(
              segment.endMs,
              rangeEndMs
            );

      if (
        endMs >
        startMs
      ) {
        result.push({
          ...segment,
          startMs,
          endMs,
          date:
            msToDateString(
              startMs
            ),
        });
      }
    }

    return result;
  };

const calculateEmployeeWorkTimeline =
  ({
    mainSessions = [],
    miniTasks = [],
    optionalHolidayDates = [],
    additionalHolidayDates = [],
    nowLocal = null,
    reviewedMiniTasksOnly = true,
    rangeStartLocal = null,
    rangeEndLocal = null,
  } = {}) => {
    const resolvedNowLocal =
      nowLocal ||
      getIndiaNowLocalString();

    const calendarOptions = {
      optionalHolidayDates,
      additionalHolidayDates,
    };

    const warnings = [];

    /*
    ======================================================
    1. REVIEWED MINI TASK SEGMENTS
    ======================================================
    */

    const miniCandidates = [];

    for (
      const task of
      miniTasks
    ) {
      const status =
        String(
          task.status || ""
        )
          .trim()
          .toLowerCase();

      if (
        reviewedMiniTasksOnly &&
        status !== "reviewed"
      ) {
        continue;
      }

      const {
        start,
        end,
      } =
        buildMiniTaskDateTimes(
          task
        );

      const rawStartMs =
        parseLocalDateTime(
          start
        );

      const rawEndMs =
        parseLocalDateTime(
          end
        );

      if (
        rawStartMs === null ||
        rawEndMs === null ||
        rawEndMs <= rawStartMs
      ) {
        warnings.push({
          type:
            "invalid_mini_task_interval",

          mini_task_id:
            task.mini_task_id ??
            null,
        });

        continue;
      }

      miniCandidates.push({
        task,
        start,
        end,
        rawStartMs,
        rawEndMs,
      });
    }

    miniCandidates.sort(
      (a, b) =>
        a.rawStartMs -
          b.rawStartMs ||
        a.rawEndMs -
          b.rawEndMs ||
        Number(
          a.task
            .mini_task_id ||
            0
        ) -
          Number(
            b.task
              .mini_task_id ||
              0
          )
    );

    const claimedMiniIntervals =
      [];

    const miniEntries = [];

    for (
      const candidate of
      miniCandidates
    ) {
      const validSegments =
        clipSegmentsToReportRange(
          clipIntervalToWorkingWindows(
            candidate.start,
            candidate.end,
            calendarOptions
          ),
          rangeStartLocal,
          rangeEndLocal
        );

      const countedSegments =
        subtractIntervals(
          validSegments,
          claimedMiniIntervals
        );

      const rawValidSeconds =
        getIntervalsSeconds(
          validSegments
        );

      const countedSeconds =
        getIntervalsSeconds(
          countedSegments
        );

      if (
        countedSeconds <
        rawValidSeconds
      ) {
        warnings.push({
          type:
            "overlapping_mini_tasks",

          mini_task_id:
            candidate.task
              .mini_task_id ??
            null,

          excluded_seconds:
            rawValidSeconds -
            countedSeconds,
        });
      }

      const decorated =
        decorateSegments(
          countedSegments,
          {
            type: "mini",
            source:
              candidate.task,
          }
        );

      miniEntries.push({
        ...candidate.task,

        counted_seconds:
          countedSeconds,

        counted_segments:
          decorated,
      });

      claimedMiniIntervals.push(
        ...countedSegments.map(
          (segment) => ({
            startMs:
              segment.startMs,
            endMs:
              segment.endMs,
          })
        )
      );
    }

    const mergedMiniIntervals =
      mergeIntervals(
        claimedMiniIntervals
      );

    /*
    ======================================================
    2. MAIN TASK SEGMENTS
    ======================================================
    */

    const mainCandidates = [];

    for (
      const session of
      mainSessions
    ) {
      const {
        start,
        end,
      } =
        buildMainSessionDateTimes(
          session,
          resolvedNowLocal
        );

      const rawStartMs =
        parseLocalDateTime(
          start
        );

      const rawEndMs =
        parseLocalDateTime(
          end
        );

      if (
        rawStartMs === null ||
        rawEndMs === null ||
        rawEndMs <= rawStartMs
      ) {
        warnings.push({
          type:
            "invalid_main_session_interval",

          session_id:
            session.session_id ??
            null,
        });

        continue;
      }

      mainCandidates.push({
        session,
        start,
        end,
        rawStartMs,
        rawEndMs,
      });
    }

    /*
    Newer Main Task session wins
    if old history overlaps.
    */
    mainCandidates.sort(
      (a, b) =>
        b.rawStartMs -
          a.rawStartMs ||
        b.rawEndMs -
          a.rawEndMs ||
        Number(
          b.session
            .session_id ||
            0
        ) -
          Number(
            a.session
              .session_id ||
              0
          )
    );

    const claimedMainIntervals =
      [];

    const mainEntries = [];

    for (
      const candidate of
      mainCandidates
    ) {
      const validSegments =
        clipSegmentsToReportRange(
          clipIntervalToWorkingWindows(
            candidate.start,
            candidate.end,
            calendarOptions
          ),
          rangeStartLocal,
          rangeEndLocal
        );

      /*
      Mini Task always wins
      overlapping interval.
      */
      const afterMini =
        subtractIntervals(
          validSegments,
          mergedMiniIntervals
        );

      /*
      Also protect against
      historical duplicate Main
      Task sessions.
      */
      const afterMainOverlap =
        subtractIntervals(
          afterMini,
          claimedMainIntervals
        );

      const beforeMainDedupSeconds =
        getIntervalsSeconds(
          afterMini
        );

      const countedSeconds =
        getIntervalsSeconds(
          afterMainOverlap
        );

      if (
        countedSeconds <
        beforeMainDedupSeconds
      ) {
        warnings.push({
          type:
            "overlapping_main_sessions",

          session_id:
            candidate.session
              .session_id ??
            null,

          excluded_seconds:
            beforeMainDedupSeconds -
            countedSeconds,
        });
      }

      const decorated =
        decorateSegments(
          afterMainOverlap,
          {
            type: "main",
            source:
              candidate.session,
          }
        );

      mainEntries.push({
        ...candidate.session,

        counted_seconds:
          countedSeconds,

        counted_segments:
          decorated,
      });

      claimedMainIntervals.push(
        ...afterMainOverlap.map(
          (segment) => ({
            startMs:
              segment.startMs,

            endMs:
              segment.endMs,
          })
        )
      );
    }

    /*
    Return Main sessions
    chronologically.
    */
    mainEntries.sort(
      (a, b) => {
        const aStart =
          parseLocalDateTime(
            a.started_at_local ||
              a.started_at
          ) || 0;

        const bStart =
          parseLocalDateTime(
            b.started_at_local ||
              b.started_at
          ) || 0;

        return (
          aStart -
          bStart
        );
      }
    );

    const allSegments = [
      ...mainEntries.flatMap(
        (entry) =>
          entry.counted_segments ||
          []
      ),

      ...miniEntries.flatMap(
        (entry) =>
          entry.counted_segments ||
          []
      ),
    ];

    /*
    ======================================================
    DAILY TOTALS
    ======================================================
    */

    const dailyMap =
      new Map();

    for (
      const segment of
      allSegments
    ) {
      const date =
        segment.date ||
        msToDateString(
          segment.startMs
        );

      if (
        !dailyMap.has(
          date
        )
      ) {
        dailyMap.set(
          date,
          {
            date,

            main_seconds: 0,

            mini_task_seconds: 0,

            total_seconds: 0,
          }
        );
      }

      const row =
        dailyMap.get(date);

      const seconds =
        Math.max(
          0,
          Math.floor(
            (
              segment.endMs -
              segment.startMs
            ) /
              1000
          )
        );

      if (
        segment.type ===
        "mini"
      ) {
        row.mini_task_seconds +=
          seconds;
      } else {
        row.main_seconds +=
          seconds;
      }

      row.total_seconds +=
        seconds;
    }

    /*
    ======================================================
    DIVISION TOTALS
    ======================================================
    */

    const divisionMap =
      new Map();

    for (
      const segment of
      allSegments
    ) {
      const divisionId =
        segment.division_id ??
        null;

      const divisionName =
        segment.division ||
        "Unassigned";

      const key =
        divisionId !== null
          ? `id:${divisionId}`
          : `name:${String(
              divisionName
            ).toLowerCase()}`;

      if (
        !divisionMap.has(
          key
        )
      ) {
        divisionMap.set(
          key,
          {
            division_id:
              divisionId,

            division:
              divisionName,

            main_seconds: 0,

            mini_task_seconds:
              0,

            total_seconds: 0,
          }
        );
      }

      const row =
        divisionMap.get(
          key
        );

      const seconds =
        Math.max(
          0,
          Math.floor(
            (
              segment.endMs -
              segment.startMs
            ) /
              1000
          )
        );

      if (
        segment.type ===
        "mini"
      ) {
        row.mini_task_seconds +=
          seconds;
      } else {
        row.main_seconds +=
          seconds;
      }

      row.total_seconds +=
        seconds;
    }

    const mainSeconds =
      mainEntries.reduce(
        (
          sum,
          entry
        ) =>
          sum +
          Number(
            entry.counted_seconds ||
              0
          ),
        0
      );

    const miniTaskSeconds =
      miniEntries.reduce(
        (
          sum,
          entry
        ) =>
          sum +
          Number(
            entry.counted_seconds ||
              0
          ),
        0
      );

    return {
      work_rules: {
        work_start_time:
          WORK_START_TIME,

        work_end_time:
          WORK_END_TIME,

        lunch_start_time:
          LUNCH_START_TIME,

        lunch_end_time:
          LUNCH_END_TIME,

        high_tea_start_time:
          HIGH_TEA_START_TIME,

        high_tea_end_time:
          HIGH_TEA_END_TIME,

        working_days:
          "Monday-Saturday",

        max_work_seconds_per_normal_day:
          MAX_WORK_SECONDS_PER_NORMAL_DAY,
      },

      main_task_seconds:
        mainSeconds,

      mini_task_seconds:
        miniTaskSeconds,

      total_seconds:
        mainSeconds +
        miniTaskSeconds,

      main_sessions:
        mainEntries,

      mini_tasks:
        miniEntries,

      daily:
        Array.from(
          dailyMap.values()
        ).sort(
          (a, b) =>
            a.date.localeCompare(
              b.date
            )
        ),

      divisions:
        Array.from(
          divisionMap.values()
        ).sort(
          (a, b) =>
            String(
              a.division
            ).localeCompare(
              String(
                b.division
              )
            )
        ),

      warnings,
    };
  };

const filterTimelineByMonth =
  (
    timeline,
    monthValue
  ) => {
    const month =
      String(
        monthValue || ""
      ).trim();

    if (
      !/^\d{4}-\d{2}$/.test(
        month
      )
    ) {
      return timeline;
    }

    const daily =
      (
        timeline.daily ||
        []
      ).filter(
        (row) =>
          String(
            row.date
          ).startsWith(
            `${month}-`
          )
      );

    return {
      ...timeline,

      daily,

      month,

      total_seconds:
        daily.reduce(
          (
            sum,
            row
          ) =>
            sum +
            Number(
              row.total_seconds ||
                0
            ),
          0
        ),

      main_task_seconds:
        daily.reduce(
          (
            sum,
            row
          ) =>
            sum +
            Number(
              row.main_seconds ||
                0
            ),
          0
        ),

      mini_task_seconds:
        daily.reduce(
          (
            sum,
            row
          ) =>
            sum +
            Number(
              row.mini_task_seconds ||
                0
            ),
          0
        ),
    };
  };

const formatSeconds = (
  seconds
) => {
  const total =
    Math.max(
      0,
      Math.floor(
        Number(
          seconds || 0
        )
      )
    );

  const hours =
    Math.floor(
      total / 3600
    );

  const minutes =
    Math.floor(
      (total % 3600) /
        60
    );

  const secs =
    total % 60;

  if (
    hours > 0
  ) {
    return `${hours}h ${minutes}m`;
  }

  if (
    minutes > 0
  ) {
    return `${minutes}m ${secs}s`;
  }

  return `${secs}s`;
};

module.exports = {
  WORK_START_TIME,
  WORK_END_TIME,

  LUNCH_START_TIME,
  LUNCH_END_TIME,

  HIGH_TEA_START_TIME,
  HIGH_TEA_END_TIME,

  WORK_WINDOWS,

  MAX_WORK_SECONDS_PER_NORMAL_DAY,

  FIXED_COMPANY_HOLIDAY_MONTH_DAYS,

  normalizeDateString,
  normalizeTimeString,

  parseLocalDateTime,
  combineDateAndTime,

  addDays,
  getDayOfWeek,

  isFixedCompanyHoliday,
  isWorkingDate,

  getWorkingWindowsForDate,
  clipIntervalToWorkingWindows,

  mergeIntervals,
  subtractIntervals,
  getIntervalsSeconds,

  getIndiaNowLocalString,

  clipSegmentsToReportRange,

  buildMiniTaskDateTimes,
  buildMainSessionDateTimes,

  calculateEmployeeWorkTimeline,

  filterTimelineByMonth,

  formatSeconds,

  msToDateString,
  msToDateTimeString,
};