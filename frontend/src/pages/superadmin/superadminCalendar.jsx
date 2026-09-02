import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  X,
  CalendarDays,
} from "lucide-react";

import api from "../../api/axios";

/*
  Reuse the existing working
  Admin Calendar CSS.
*/
import "./superadminCalendar.css";

/* =========================================================
   DATE HELPERS
========================================================= */

const localDateString = (date) => {
  if (!date) return "";

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const normalizeDate = (value) => {
  if (!value) return "";

  if (
    typeof value === "string"
  ) {
    return value.substring(
      0,
      10
    );
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return localDateString(
    date
  );
};

const displayDate = (value) => {
  if (!value) return "";

  const date =
    new Date(
      `${value}T00:00:00`
    );

  return date.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  );
};

const shortDate = (value) => {
  const normalized =
    normalizeDate(value);

  if (!normalized) {
    return "";
  }

  const date =
    new Date(
      `${normalized}T00:00:00`
    );

  return date.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
    }
  );
};

const displayTime = (value) => {
  if (!value) return "";

  const [
    hourString,
    minuteString,
  ] =
    String(value).split(":");

  const hour =
    Number(hourString);

  const minute =
    Number(
      minuteString || 0
    );

  if (
    Number.isNaN(hour)
  ) {
    return value;
  }

  const date =
    new Date();

  date.setHours(
    hour,
    minute,
    0,
    0
  );

  return date.toLocaleTimeString(
    "en-US",
    {
      hour: "numeric",
      minute: "2-digit",
    }
  );
};

/* =========================================================
   COMPONENT
========================================================= */

const SuperadminCalendar = () => {
  const now =
    new Date();

  const todayString =
    localDateString(now);

  const [
    currentDate,
    setCurrentDate,
  ] = useState(
    new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    )
  );

  /* =======================================================
     ALL ORGANIZATION CALENDAR EVENTS
  ======================================================= */

  const [
    events,
    setEvents,
  ] = useState({
    projects: [],
    tasks: [],
    meetings: [],
    mini_tasks: [],
  });

  /* =======================================================
     ALL ORGANIZATION USERS
  ======================================================= */

  const [
    employees,
    setEmployees,
  ] = useState([]);

  const [
    selectedDate,
    setSelectedDate,
  ] = useState("");

  const [
    activeFilter,
    setActiveFilter,
  ] = useState("all");

  const [
    showMeeting,
    setShowMeeting,
  ] = useState(false);

  const [
    selectedEmployees,
    setSelectedEmployees,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    employeesLoading,
    setEmployeesLoading,
  ] = useState(false);

  const [
    savingMeeting,
    setSavingMeeting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  /* =======================================================
     MEETING FORM
  ======================================================= */

  const [
    meetingForm,
    setMeetingForm,
  ] = useState({
    title: "",
    description: "",
    date: "",
    start_time: "",
    end_time: "",
  });

  const [
    editingMeeting,
    setEditingMeeting,
  ] = useState(null);

  const [
    cancellingMeeting,
    setCancellingMeeting,
  ] = useState(null);

  const [
    showCancelConfirm,
    setShowCancelConfirm,
  ] = useState(false);

  /* =========================================================
     LOAD SUPER ADMIN CALENDAR

     Returns:
     - ALL Projects
     - ALL Main Tasks
     - ALL Meetings
     - ALL standalone Mini Tasks
  ========================================================= */

  const loadCalendar =
    async () => {
      try {
        setLoading(true);

        setError("");

        const response =
          await api.get(
            "/superadmin/calendar"
          );

        setEvents({
          projects:
            response.data
              ?.projects || [],

          tasks:
            response.data
              ?.tasks || [],

          meetings:
            response.data
              ?.meetings || [],

          mini_tasks:
            response.data
              ?.mini_tasks || [],
        });
      } catch (error) {
        console.error(
          "Super Admin Calendar loading error:",
          error
        );

        setError(
          error?.response?.data
            ?.sqlMessage ||
            error?.response?.data
              ?.error ||
            error?.response?.data
              ?.message ||
            "Failed to load organization calendar."
        );
      } finally {
        setLoading(false);
      }
    };

  /* =========================================================
     LOAD ALL USERS

     Super Admin sees users from
     every department.
  ========================================================= */

  const loadEmployees =
    async () => {
      try {
        setEmployeesLoading(
          true
        );

        const response =
          await api.get(
            "/superadmin/calendar/employees"
          );

        setEmployees(
          response.data
            ?.employees || []
        );
      } catch (error) {
        console.error(
          "Super Admin Calendar employee loading error:",
          error
        );
      } finally {
        setEmployeesLoading(
          false
        );
      }
    };

  useEffect(() => {
    loadCalendar();

    loadEmployees();
  }, []);

  /* =========================================================
     CALENDAR GRID
  ========================================================= */

  const year =
    currentDate.getFullYear();

  const month =
    currentDate.getMonth();

  const calendarDays =
    useMemo(() => {
      const firstDay =
        new Date(
          year,
          month,
          1
        );

      /*
        Monday = first column.
      */

      const offset =
        (
          firstDay.getDay() +
          6
        ) % 7;

      const gridStart =
        new Date(
          year,
          month,
          1 - offset
        );

      const result = [];

      for (
        let index = 0;
        index < 42;
        index++
      ) {
        const date =
          new Date(
            gridStart
          );

        date.setDate(
          gridStart.getDate() +
            index
        );

        result.push({
          date,

          dateString:
            localDateString(
              date
            ),

          number:
            date.getDate(),

          currentMonth:
            date.getMonth() ===
              month &&
            date.getFullYear() ===
              year,
        });
      }

      return result;
    }, [year, month]);

  /* =========================================================
     TITLE HELPERS
  ========================================================= */

  const projectTitle = (
    item
  ) =>
    item.title ||
    item.project_title ||
    item.project_name ||
    item.name ||
    "Project";

  const taskTitle = (
    item
  ) =>
    item.title ||
    item.task_title ||
    item.task_name ||
    item.name ||
    "Task";

  const meetingTitle = (
    item
  ) =>
    item.title ||
    item.meeting_title ||
    "Meeting";

  const miniTaskTitle = (
    item
  ) =>
    item.title ||
    item.mini_task_title ||
    item.task_name ||
    item.mini_task_name ||
    "Mini Task";

  /* =========================================================
     CALENDAR WEEKS
  ========================================================= */

  const calendarWeeks =
    useMemo(() => {
      const weeks = [];

      for (
        let index = 0;
        index <
        calendarDays.length;
        index += 7
      ) {
        weeks.push(
          calendarDays.slice(
            index,
            index + 7
          )
        );
      }

      return weeks;
    }, [calendarDays]);

  /* =========================================================
     EVENTS FOR WEEK

     Projects / Tasks:
     continuous bars.

     Meetings / Mini Tasks:
     single date.
  ========================================================= */

  const eventsForWeek = (
    week
  ) => {
    const weekStart =
      week[0].dateString;

    const weekEnd =
      week[6].dateString;

    const result = [];

    /* ================= PROJECTS ================= */

    events.projects.forEach(
      (item) => {
        const start =
          normalizeDate(
            item.start_date
          );

        const end =
          normalizeDate(
            item.end_date ||
              item.due_date
          );

        if (
          start &&
          end &&
          start <= weekEnd &&
          end >= weekStart
        ) {
          result.push({
            type: "project",

            title:
              projectTitle(
                item
              ),

            start,

            end,

            source: item,
          });
        }
      }
    );

    /* ================= TASKS ================= */

    events.tasks.forEach(
      (item) => {
        const start =
          normalizeDate(
            item.start_date
          );

        const end =
          normalizeDate(
            item.end_date ||
              item.due_date
          );

        if (
          start &&
          end &&
          start <= weekEnd &&
          end >= weekStart
        ) {
          result.push({
            type: "task",

            title:
              taskTitle(item),

            start,

            end,

            source: item,
          });
        }
      }
    );

    /* ================= MEETINGS ================= */

    events.meetings.forEach(
      (item) => {
        const date =
          normalizeDate(
            item.meeting_date
          );

        if (
          date &&
          date >= weekStart &&
          date <= weekEnd
        ) {
          result.push({
            type: "meeting",

            title:
              meetingTitle(
                item
              ),

            start: date,

            end: date,

            source: item,
          });
        }
      }
    );

    /* ================= MINI TASKS ================= */

    events.mini_tasks.forEach(
      (item) => {
        const date =
          normalizeDate(
            item.task_date ||
              item.date ||
              item.due_date
          );

        if (
          date &&
          date >= weekStart &&
          date <= weekEnd
        ) {
          result.push({
            type: "mini",

            title:
              miniTaskTitle(
                item
              ),

            start: date,

            end: date,

            source: item,
          });
        }
      }
    );

    if (
      activeFilter !== "all"
    ) {
      return result.filter(
        (item) =>
          item.type ===
          activeFilter
      );
    }

    return result;
  };

  /* =========================================================
     EVENT POSITION WITHIN WEEK
  ========================================================= */

  const getEventSegment = (
    event,
    week
  ) => {
    const weekStart =
      week[0].dateString;

    const weekEnd =
      week[6].dateString;

    const visibleStart =
      event.start <
      weekStart
        ? weekStart
        : event.start;

    const visibleEnd =
      event.end >
      weekEnd
        ? weekEnd
        : event.end;

    const startIndex =
      week.findIndex(
        (day) =>
          day.dateString ===
          visibleStart
      );

    const endIndex =
      week.findIndex(
        (day) =>
          day.dateString ===
          visibleEnd
      );

    if (
      startIndex === -1 ||
      endIndex === -1
    ) {
      return null;
    }

    return {
      ...event,

      startIndex,

      endIndex,

      span:
        endIndex -
        startIndex +
        1,

      continuesBefore:
        event.start <
        weekStart,

      continuesAfter:
        event.end >
        weekEnd,
    };
  };

  /* =========================================================
     EVENTS FOR SELECTED DATE
  ========================================================= */

  const detailEventsForDate = (
    dateString
  ) => {
    if (!dateString) {
      return [];
    }

    const result = [];

    /* ================= PROJECTS ================= */

    events.projects.forEach(
      (item) => {
        const start =
          normalizeDate(
            item.start_date
          );

        const end =
          normalizeDate(
            item.end_date ||
              item.due_date
          );

        if (
          start &&
          end &&
          dateString >=
            start &&
          dateString <= end
        ) {
          result.push({
            type: "project",

            title:
              projectTitle(
                item
              ),

            source: item,
          });
        }
      }
    );

    /* ================= TASKS ================= */

    events.tasks.forEach(
      (item) => {
        const start =
          normalizeDate(
            item.start_date
          );

        const end =
          normalizeDate(
            item.end_date ||
              item.due_date
          );

        if (
          start &&
          end &&
          dateString >=
            start &&
          dateString <= end
        ) {
          result.push({
            type: "task",

            title:
              taskTitle(item),

            source: item,
          });
        }
      }
    );

    /* ================= MEETINGS ================= */

    events.meetings.forEach(
      (item) => {
        if (
          normalizeDate(
            item.meeting_date
          ) === dateString
        ) {
          result.push({
            type: "meeting",

            title:
              meetingTitle(
                item
              ),

            source: item,
          });
        }
      }
    );

    /* ================= MINI TASKS ================= */

    events.mini_tasks.forEach(
      (item) => {
        const miniDate =
          normalizeDate(
            item.task_date ||
              item.date ||
              item.due_date
          );

        if (
          miniDate ===
          dateString
        ) {
          result.push({
            type: "mini",

            title:
              miniTaskTitle(
                item
              ),

            source: item,
          });
        }
      }
    );

    return result;
  };

  const selectedEvents =
    useMemo(
      () =>
        selectedDate
          ? detailEventsForDate(
              selectedDate
            )
          : [],
      [
        selectedDate,
        events,
      ]
    );

  const selectedProjects =
    selectedEvents.filter(
      (item) =>
        item.type ===
        "project"
    );

  const selectedTasks =
    selectedEvents.filter(
      (item) =>
        item.type ===
        "task"
    );

  const selectedMeetings =
    selectedEvents.filter(
      (item) =>
        item.type ===
        "meeting"
    );

  const selectedMiniTasks =
    selectedEvents.filter(
      (item) =>
        item.type ===
        "mini"
    );

  /* =========================================================
     DATE CLICK
  ========================================================= */

  const handleDateClick = (
    calendarDate
  ) => {
    setSelectedDate(
      calendarDate.dateString
    );

    if (
      !calendarDate.currentMonth
    ) {
      setCurrentDate(
        new Date(
          calendarDate.date.getFullYear(),
          calendarDate.date.getMonth(),
          1
        )
      );
    }
  };

  /* =========================================================
     MONTH NAVIGATION
  ========================================================= */

  const previousMonth =
    () => {
      setSelectedDate("");

      setCurrentDate(
        new Date(
          year,
          month - 1,
          1
        )
      );
    };

  const nextMonth = () => {
    setSelectedDate("");

    setCurrentDate(
      new Date(
        year,
        month + 1,
        1
      )
    );
  };

  /* =========================================================
     OPEN CREATE MEETING
  ========================================================= */

  const openMeeting = (
    date = ""
  ) => {
    setEditingMeeting(
      null
    );

    setMeetingForm({
      title: "",

      description: "",

      date:
        date ||
        selectedDate ||
        todayString,

      start_time: "",

      end_time: "",
    });

    setSelectedEmployees(
      []
    );

    setShowMeeting(true);
  };

  /* =========================================================
     CLOSE MEETING
  ========================================================= */

  const closeMeeting = () => {
    if (
      savingMeeting
    ) {
      return;
    }

    setShowMeeting(false);

    setEditingMeeting(
      null
    );

    setSelectedEmployees(
      []
    );
  };

  /* =========================================================
     EMPLOYEE CHECKBOX
  ========================================================= */

  const toggleEmployee = (
    employeeId
  ) => {
    setSelectedEmployees(
      (previous) =>
        previous.includes(
          employeeId
        )
          ? previous.filter(
              (id) =>
                id !==
                employeeId
            )
          : [
              ...previous,
              employeeId,
            ]
    );
  };

  const allSelectableIds =
    employees
      .map((employee) =>
        Number(
          employee.user_id ??
            employee.id
        )
      )
      .filter(
        (id) =>
          !Number.isNaN(id)
      );

  const allSelected =
    allSelectableIds.length >
      0 &&
    allSelectableIds.every(
      (id) =>
        selectedEmployees.includes(
          id
        )
    );

  const toggleAllEmployees =
    () => {
      if (allSelected) {
        setSelectedEmployees(
          []
        );
      } else {
        setSelectedEmployees(
          allSelectableIds
        );
      }
    };

  /* =========================================================
     OPEN EDIT MEETING

     employee_ids comes from
     Super Admin Calendar backend.
  ========================================================= */

  const openEditMeeting = (
    meeting
  ) => {
    if (!meeting) {
      return;
    }

    setEditingMeeting(
      meeting
    );

    setMeetingForm({
      title:
        meeting.title || "",

      description:
        meeting.description ||
        "",

      date:
        normalizeDate(
          meeting.meeting_date
        ),

      start_time:
        String(
          meeting.start_time ||
            ""
        ).slice(0, 5),

      end_time:
        String(
          meeting.end_time ||
            ""
        ).slice(0, 5),
    });

    let participantIds =
      [];

    if (
      Array.isArray(
        meeting.employee_ids
      )
    ) {
      participantIds =
        meeting.employee_ids
          .map(Number)
          .filter(Boolean);
    } else if (
      meeting.employee_ids
    ) {
      participantIds =
        String(
          meeting.employee_ids
        )
          .split(",")
          .map(
            (id) =>
              Number(
                id.trim()
              )
          )
          .filter(Boolean);
    }

    setSelectedEmployees(
      participantIds
    );

    setShowMeeting(true);
  };

  /* =========================================================
     CREATE / UPDATE MEETING

     POST when creating.
     PUT when editing.
  ========================================================= */

  const saveMeeting =
    async () => {
      if (
        !meetingForm.title.trim()
      ) {
        alert(
          "Please enter the meeting title."
        );

        return;
      }

      if (
        !meetingForm.date
      ) {
        alert(
          "Please select the meeting date."
        );

        return;
      }

      if (
        !meetingForm.start_time
      ) {
        alert(
          "Please select start time."
        );

        return;
      }

      if (
        !meetingForm.end_time
      ) {
        alert(
          "Please select end time."
        );

        return;
      }

      if (
        meetingForm.end_time <=
        meetingForm.start_time
      ) {
        alert(
          "End time must be later than start time."
        );

        return;
      }

      if (
        selectedEmployees.length ===
        0
      ) {
        alert(
          "Please select at least one participant."
        );

        return;
      }

      try {
        setSavingMeeting(
          true
        );

        const meetingId =
          editingMeeting?.id ||
          editingMeeting
            ?.meeting_id;

        const payload = {
          title:
            meetingForm.title.trim(),

          description:
            meetingForm.description.trim(),

          meeting_date:
            meetingForm.date,

          start_time:
            meetingForm.start_time,

          end_time:
            meetingForm.end_time,

          employee_ids:
            selectedEmployees,
        };

        let response;

        /* ================= EDIT ================= */

        if (meetingId) {
          response =
            await api.put(
              `/superadmin/calendar/meetings/${meetingId}`,
              payload
            );
        }

        /* ================= CREATE ================= */

        else {
          response =
            await api.post(
              "/superadmin/calendar/meetings",
              payload
            );
        }

        if (
          response.data
            ?.success === false
        ) {
          alert(
            response.data
              ?.message ||
              "Unable to save meeting."
          );

          return;
        }

        setShowMeeting(false);

        setEditingMeeting(
          null
        );

        setSelectedEmployees(
          []
        );

        setMeetingForm({
          title: "",
          description: "",
          date: "",
          start_time: "",
          end_time: "",
        });

        await loadCalendar();
      } catch (error) {
        console.error(
          "Super Admin save meeting error:",
          error
        );

        alert(
          error?.response?.data
            ?.message ||
            error?.response?.data
              ?.error ||
            "Something went wrong while saving the meeting."
        );
      } finally {
        setSavingMeeting(
          false
        );
      }
    };

  /* =========================================================
     CANCEL MEETING CONFIRMATION
  ========================================================= */

  const askCancelMeeting = (
    meeting
  ) => {
    if (!meeting) return;

    setCancellingMeeting(
      meeting
    );

    setShowCancelConfirm(
      true
    );
  };

  const closeCancelConfirm =
    () => {
      setShowCancelConfirm(
        false
      );

      setCancellingMeeting(
        null
      );
    };

  /* =========================================================
     CANCEL MEETING
  ========================================================= */

  const cancelMeeting =
    async () => {
      const meetingId =
        cancellingMeeting?.id ||
        cancellingMeeting
          ?.meeting_id;

      if (!meetingId) {
        return;
      }

      try {
        const response =
          await api.patch(
            `/superadmin/calendar/meetings/${meetingId}/cancel`
          );

        if (
          response.data
            ?.success === false
        ) {
          alert(
            response.data
              ?.message ||
              "Unable to cancel meeting."
          );

          return;
        }

        closeCancelConfirm();

        await loadCalendar();
      } catch (error) {
        console.error(
          "Super Admin cancel meeting error:",
          error
        );

        alert(
          error?.response?.data
            ?.message ||
            error?.response?.data
              ?.error ||
            "Something went wrong while cancelling the meeting."
        );
      }
    };

  /* =========================================================
     RIGHT DETAIL PANEL SECTION
  ========================================================= */

  const renderDetailSection = (
    title,
    type,
    items
  ) => {
    if (!items.length) {
      return null;
    }

    return (
      <section className="superadmin-cal-detail-section">
        <h4
          className={`superadmin-cal-detail-heading superadmin-cal-${type}-text`}
        >
          {title}
        </h4>

        {items.map(
          (
            event,
            index
          ) => {
            const item =
              event.source ||
              {};

            let meta = "";

            /* ================= PROJECT / TASK ================= */

            if (
              type ===
                "project" ||
              type === "task"
            ) {
              meta = `${shortDate(
                item.start_date
              )} – ${shortDate(
                item.end_date ||
                  item.due_date
              )}`;
            }

            /* ================= MEETING ================= */

            if (
              type ===
              "meeting"
            ) {
              const start =
                displayTime(
                  item.start_time
                );

              const end =
                displayTime(
                  item.end_time
                );

              meta =
                start && end
                  ? `${start} – ${end}`
                  : start;
            }

            /* ================= MINI TASK ================= */

            if (
              type ===
              "mini"
            ) {
              const start =
                displayTime(
                  item.start_time ||
                    item.task_time ||
                    item.time
                );

              const end =
                displayTime(
                  item.end_time
                );

              meta =
                start && end
                  ? `${start} – ${end}`
                  : start;
            }

            const status =
              String(
                item.status ||
                  ""
              ).toLowerCase();

            return (
              <div
                className="superadmin-cal-detail-item"
                key={
                  item.id ||
                  item.task_id ||
                  item.project_id ||
                  item.meeting_id ||
                  `${type}-${index}`
                }
              >
                <span
                  className={`superadmin-cal-detail-dot superadmin-cal-${type}-dot`}
                />

                <div className="superadmin-cal-detail-info">
                  {meta && (
                    <span className="superadmin-cal-detail-meta">
                      {meta}
                    </span>
                  )}

                  <strong>
                    {event.title}
                  </strong>

                  {/* PROJECT */}

                  {type ===
                    "project" && (
                    <>
                      {item.department_name && (
                        <p>
                          Department:{" "}
                          {
                            item.department_name
                          }
                        </p>
                      )}

                      {item.division && (
                        <p>
                          Division:{" "}
                          {
                            item.division
                          }
                        </p>
                      )}

                      {item.created_by_name && (
                        <p>
                          Created by:{" "}
                          {
                            item.created_by_name
                          }
                        </p>
                      )}
                    </>
                  )}

                  {/* TASK */}

                  {type ===
                    "task" && (
                    <>
                      {item.project_title && (
                        <p>
                          Project:{" "}
                          {
                            item.project_title
                          }
                        </p>
                      )}

                      {item.department_name && (
                        <p>
                          Department:{" "}
                          {
                            item.department_name
                          }
                        </p>
                      )}

                      {item.employee_name && (
                        <p>
                          Assigned:{" "}
                          {
                            item.employee_name
                          }
                        </p>
                      )}
                    </>
                  )}

                  {/* MINI TASK */}

                  {type ===
                    "mini" && (
                    <>
                      {item.employee_name && (
                        <p>
                          Employee:{" "}
                          {
                            item.employee_name
                          }
                        </p>
                      )}

                      {item.department_name && (
                        <p>
                          Department:{" "}
                          {
                            item.department_name
                          }
                        </p>
                      )}
                    </>
                  )}

                  {/* MEETING */}

                  {type ===
                    "meeting" && (
                    <>
                      {item.description && (
                        <p>
                          {
                            item.description
                          }
                        </p>
                      )}

                      {item.employees && (
                        <p>
                          Participants:{" "}
                          {
                            item.employees
                          }
                        </p>
                      )}

                      {item.created_by_name && (
                        <p>
                          Scheduled by:{" "}
                          {
                            item.created_by_name
                          }
                        </p>
                      )}
                    </>
                  )}

                  {/* MEETING ACTIONS */}

                  {type ===
                    "meeting" &&
                    status !==
                      "cancelled" && (
                      <div className="superadmin-cal-meeting-actions">
                        <button
                          type="button"
                          className="superadmin-cal-edit-meeting"
                          onClick={(
                            clickEvent
                          ) => {
                            clickEvent.stopPropagation();

                            openEditMeeting(
                              item
                            );
                          }}
                        >
                          <Pencil
                            size={
                              13
                            }
                          />

                          Edit
                        </button>

                        <button
                          type="button"
                          className="superadmin-cal-cancel-meeting"
                          onClick={(
                            clickEvent
                          ) => {
                            clickEvent.stopPropagation();

                            askCancelMeeting(
                              item
                            );
                          }}
                        >
                          <Trash2
                            size={
                              13
                            }
                          />

                          Cancel
                        </button>
                      </div>
                    )}

                  {type ===
                    "meeting" &&
                    status ===
                      "cancelled" && (
                      <span className="superadmin-cal-cancelled-label">
                        Cancelled
                      </span>
                    )}
                </div>
              </div>
            );
          }
        )}
      </section>
    );
  };

  /* =========================================================
     JSX
  ========================================================= */

  return (
    <div className="superadmin-cal-page">
      {/* =====================================================
          TITLE
      ===================================================== */}

      <div className="superadmin-cal-title-row">
        <div>
          <h1>
            Calendar
          </h1>
        </div>
      </div>

      {/* =====================================================
          ERROR
      ===================================================== */}

      {error && (
        <div
          style={{
            marginBottom:
              "16px",

            padding:
              "13px 16px",

            borderRadius:
              "14px",

            background:
              "#fff1f2",

            border:
              "1px solid #fecdd3",

            color:
              "#b91c1c",

            fontWeight:
              800,
          }}
        >
          {error}
        </div>
      )}

      {/* =====================================================
          CALENDAR CARD
      ===================================================== */}

      <div className="superadmin-cal-card">
        {/* =================================================
            TOOLBAR
        ================================================= */}

        <div className="superadmin-cal-toolbar">
          {/* FILTERS */}

          <div className="superadmin-cal-filter-row">
            <button
              type="button"
              className={
                activeFilter ===
                "all"
                  ? "superadmin-cal-filter active all"
                  : "superadmin-cal-filter"
              }
              onClick={() =>
                setActiveFilter(
                  "all"
                )
              }
            >
              All
            </button>

            <button
              type="button"
              className={
                activeFilter ===
                "project"
                  ? "superadmin-cal-filter active project"
                  : "superadmin-cal-filter"
              }
              onClick={() =>
                setActiveFilter(
                  "project"
                )
              }
            >
              Projects
            </button>

            <button
              type="button"
              className={
                activeFilter ===
                "task"
                  ? "superadmin-cal-filter active task"
                  : "superadmin-cal-filter"
              }
              onClick={() =>
                setActiveFilter(
                  "task"
                )
              }
            >
              Tasks
            </button>

            <button
              type="button"
              className={
                activeFilter ===
                "meeting"
                  ? "superadmin-cal-filter active meeting"
                  : "superadmin-cal-filter"
              }
              onClick={() =>
                setActiveFilter(
                  "meeting"
                )
              }
            >
              Meetings
            </button>

            <button
              type="button"
              className={
                activeFilter ===
                "mini"
                  ? "superadmin-cal-filter active mini"
                  : "superadmin-cal-filter"
              }
              onClick={() =>
                setActiveFilter(
                  "mini"
                )
              }
            >
              Mini Tasks
            </button>
          </div>

          {/* MONTH NAVIGATION */}

          <div className="superadmin-cal-navigation">
            <button
              type="button"
              className="superadmin-cal-nav-arrow"
              onClick={
                previousMonth
              }
            >
              <ChevronLeft
                size={16}
              />
            </button>

            <button
              type="button"
              className="superadmin-cal-nav-arrow"
              onClick={
                nextMonth
              }
            >
              <ChevronRight
                size={16}
              />
            </button>

            <span className="superadmin-cal-month-name">
              {currentDate.toLocaleString(
                "en-US",
                {
                  month:
                    "long",

                  year:
                    "numeric",
                }
              )}
            </span>
          </div>

          {/* SCHEDULE MEETING */}

          <button
            type="button"
            className="superadmin-cal-schedule-main"
            onClick={() =>
              openMeeting()
            }
          >
            <Plus
              size={17}
            />

            Schedule Meeting
          </button>
        </div>

        {/* =================================================
            CALENDAR BODY
        ================================================= */}

        <div
          className={
            selectedDate
              ? "superadmin-cal-body superadmin-cal-body-details"
              : "superadmin-cal-body"
          }
        >
          {/* ===============================================
              MAIN CALENDAR
          =============================================== */}

          <div className="superadmin-cal-main">
            {/* WEEK NAMES */}

            <div className="superadmin-cal-week">
              {[
                "Mon",
                "Tue",
                "Wed",
                "Thu",
                "Fri",
                "Sat",
                "Sun",
              ].map(
                (day) => (
                  <div
                    key={
                      day
                    }
                  >
                    {day}
                  </div>
                )
              )}
            </div>

            {/* CALENDAR GRID */}

            <div className="superadmin-cal-grid">
              {calendarWeeks.map(
                (
                  week,
                  weekIndex
                ) => {
                  const weekEvents =
                    eventsForWeek(
                      week
                    );

                  return (
                    <div
                      className="superadmin-cal-week-row"
                      key={
                        weekIndex
                      }
                    >
                      {/* DATE CELLS */}

                      <div className="superadmin-cal-days-row">
                        {week.map(
                          (
                            calendarDate
                          ) => {
                            const isToday =
                              calendarDate.dateString ===
                              todayString;

                            const isSelected =
                              calendarDate.dateString ===
                              selectedDate;

                            return (
                              <button
                                type="button"
                                key={
                                  calendarDate.dateString
                                }
                                className={[
                                  "superadmin-cal-day",

                                  !calendarDate.currentMonth
                                    ? "outside"
                                    : "",

                                  isToday
                                    ? "today"
                                    : "",

                                  isSelected
                                    ? "selected"
                                    : "",
                                ]
                                  .filter(
                                    Boolean
                                  )
                                  .join(
                                    " "
                                  )}
                                onClick={() =>
                                  handleDateClick(
                                    calendarDate
                                  )
                                }
                              >
                                <span className="superadmin-cal-day-number">
                                  {
                                    calendarDate.number
                                  }
                                </span>
                              </button>
                            );
                          }
                        )}
                      </div>

                      {/* EVENT BARS */}

                      <div className="superadmin-cal-event-layer">
                        {weekEvents.map(
                          (
                            event,
                            eventIndex
                          ) => {
                            const segment =
                              getEventSegment(
                                event,
                                week
                              );

                            if (
                              !segment
                            ) {
                              return null;
                            }

                            const item =
                              event.source ||
                              {};

                            const creator =
                              item.created_by_name ||
                              item.created_by ||
                              "";

                            return (
                              <div
                                key={`${event.type}-${eventIndex}-${weekIndex}`}
                                className={`superadmin-cal-event-bar superadmin-cal-event-bar-${event.type}`}
                                style={{
                                  gridColumn: `${
                                    segment.startIndex +
                                    1
                                  } / span ${
                                    segment.span
                                  }`,

                                  gridRow: `${Math.min(
                                    eventIndex +
                                      1,
                                    3
                                  )}`,
                                }}
                                onClick={(
                                  clickEvent
                                ) => {
                                  clickEvent.stopPropagation();

                                  setSelectedDate(
                                    segment.start
                                  );
                                }}
                                title={
                                  creator
                                    ? `${event.title} • ${creator}`
                                    : event.title
                                }
                              >
                                <span className="superadmin-cal-event-bar-dot" />

                                <span className="superadmin-cal-event-bar-title">
                                  {segment.continuesBefore
                                    ? ""
                                    : event.title}
                                </span>

                                {!segment.continuesBefore &&
                                  creator &&
                                  segment.span >=
                                    2 && (
                                    <span className="superadmin-cal-event-bar-creator">
                                      {
                                        creator
                                      }
                                    </span>
                                  )}

                                {event.type ===
                                  "meeting" &&
                                  event
                                    .source
                                    ?.start_time && (
                                    <span className="superadmin-cal-event-bar-time">
                                      {displayTime(
                                        event
                                          .source
                                          .start_time
                                      )}
                                    </span>
                                  )}
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  );
                }
              )}
            </div>

            {/* LEGEND */}

            <div className="superadmin-cal-legend">
              <div>
                <span className="superadmin-cal-legend-dot project" />
                Project
              </div>

              <div>
                <span className="superadmin-cal-legend-dot task" />
                Task
              </div>

              <div>
                <span className="superadmin-cal-legend-dot meeting" />
                Meeting
              </div>

              <div>
                <span className="superadmin-cal-legend-dot mini" />
                Mini Task
              </div>
            </div>

            {loading && (
              <div className="superadmin-cal-loading">
                Loading organization
                calendar...
              </div>
            )}
          </div>

          {/* ===============================================
              RIGHT SIDE DETAILS
          =============================================== */}

          {selectedDate && (
            <aside className="superadmin-cal-details">
              <div className="superadmin-cal-details-header">
                <strong>
                  {displayDate(
                    selectedDate
                  )}
                </strong>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedDate(
                      ""
                    )
                  }
                >
                  <X
                    size={17}
                  />
                </button>
              </div>

              <div className="superadmin-cal-details-scroll">
                {selectedEvents.length ===
                0 ? (
                  <div className="superadmin-cal-empty-details">
                    <CalendarDays
                      size={30}
                    />

                    <strong>
                      Nothing
                      scheduled
                    </strong>

                    <p>
                      No projects,
                      tasks, meetings
                      or mini tasks
                      for this date.
                    </p>
                  </div>
                ) : (
                  <>
                    {renderDetailSection(
                      "PROJECTS",
                      "project",
                      selectedProjects
                    )}

                    {renderDetailSection(
                      "TASKS",
                      "task",
                      selectedTasks
                    )}

                    {renderDetailSection(
                      "MEETINGS",
                      "meeting",
                      selectedMeetings
                    )}

                    {renderDetailSection(
                      "MINI TASKS",
                      "mini",
                      selectedMiniTasks
                    )}
                  </>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* =====================================================
          CREATE / EDIT MEETING MODAL
      ===================================================== */}

      {showMeeting && (
        <div
          className="superadmin-cal-modal-overlay"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeMeeting();
            }
          }}
        >
          <div className="superadmin-cal-modal">
            {/* HEADER */}

            <div className="superadmin-cal-modal-header">
              <h2>
                {editingMeeting
                  ? "Update Meeting"
                  : "Schedule Meeting"}
              </h2>

              <button
                type="button"
                onClick={
                  closeMeeting
                }
              >
                <X
                  size={19}
                />
              </button>
            </div>

            {/* CONTENT */}

            <div className="superadmin-cal-modal-content">
              {/* TITLE */}

              <div className="superadmin-cal-form-field">
                <label>
                  Meeting Title
                  <span>*</span>
                </label>

                <input
                  type="text"
                  placeholder="Project Review Meeting"
                  value={
                    meetingForm.title
                  }
                  onChange={(
                    event
                  ) =>
                    setMeetingForm(
                      (
                        previous
                      ) => ({
                        ...previous,

                        title:
                          event
                            .target
                            .value,
                      })
                    )
                  }
                />
              </div>

              {/* DESCRIPTION */}

              <div className="superadmin-cal-form-field">
                <label>
                  Description /
                  Notes
                </label>

                <textarea
                  placeholder="Review and discussion..."
                  value={
                    meetingForm.description
                  }
                  onChange={(
                    event
                  ) =>
                    setMeetingForm(
                      (
                        previous
                      ) => ({
                        ...previous,

                        description:
                          event
                            .target
                            .value,
                      })
                    )
                  }
                />
              </div>

              {/* DATE */}

              <div className="superadmin-cal-form-field superadmin-cal-date-field">
                <label>
                  Date
                  <span>*</span>
                </label>

                <input
                  type="date"
                  value={
                    meetingForm.date
                  }
                  onChange={(
                    event
                  ) =>
                    setMeetingForm(
                      (
                        previous
                      ) => ({
                        ...previous,

                        date:
                          event
                            .target
                            .value,
                      })
                    )
                  }
                />
              </div>

              {/* TIMES */}

              <div className="superadmin-cal-time-row">
                <div className="superadmin-cal-form-field">
                  <label>
                    Start Time
                    <span>*</span>
                  </label>

                  <input
                    type="time"
                    value={
                      meetingForm.start_time
                    }
                    onChange={(
                      event
                    ) =>
                      setMeetingForm(
                        (
                          previous
                        ) => ({
                          ...previous,

                          start_time:
                            event
                              .target
                              .value,
                        })
                      )
                    }
                  />
                </div>

                <div className="superadmin-cal-form-field">
                  <label>
                    End Time
                    <span>*</span>
                  </label>

                  <input
                    type="time"
                    value={
                      meetingForm.end_time
                    }
                    onChange={(
                      event
                    ) =>
                      setMeetingForm(
                        (
                          previous
                        ) => ({
                          ...previous,

                          end_time:
                            event
                              .target
                              .value,
                        })
                      )
                    }
                  />
                </div>
              </div>

              {/* =================================================
                  SELECT USERS FROM ALL DEPARTMENTS
              ================================================= */}

              <div className="superadmin-cal-employee-block">
                <div className="superadmin-cal-employee-heading">
                  <label>
                    Select
                    Participants
                    <span>*</span>
                  </label>

                  <button
                    type="button"
                    onClick={
                      toggleAllEmployees
                    }
                  >
                    {allSelected
                      ? "Clear All"
                      : "Select All"}
                  </button>
                </div>

                <div className="superadmin-cal-employee-list">
                  {employeesLoading ? (
                    <div
                      style={{
                        padding:
                          "15px",

                        color:
                          "#64748b",

                        fontWeight:
                          800,
                      }}
                    >
                      Loading
                      organization
                      users...
                    </div>
                  ) : employees.length ===
                    0 ? (
                    <div
                      style={{
                        padding:
                          "15px",

                        color:
                          "#64748b",

                        fontWeight:
                          800,
                      }}
                    >
                      No users
                      available.
                    </div>
                  ) : (
                    employees.map(
                      (
                        employee
                      ) => {
                        const employeeId =
                          Number(
                            employee.user_id ??
                              employee.id
                          );

                        return (
                          <label
                            className="superadmin-cal-employee-option"
                            key={
                              employeeId
                            }
                          >
                            <input
                              type="checkbox"
                              checked={selectedEmployees.includes(
                                employeeId
                              )}
                              onChange={() =>
                                toggleEmployee(
                                  employeeId
                                )
                              }
                            />

                            <span>
                              {employee.full_name ||
                                employee.name ||
                                employee.email}

                              {employee.department_name
                                ? ` — ${employee.department_name}`
                                : ""}
                            </span>
                          </label>
                        );
                      }
                    )
                  )}
                </div>
              </div>
            </div>

            {/* FOOTER */}

            <div className="superadmin-cal-modal-footer">
              <button
                type="button"
                className="superadmin-cal-modal-cancel"
                onClick={
                  closeMeeting
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="superadmin-cal-modal-save"
                disabled={
                  savingMeeting
                }
                onClick={
                  saveMeeting
                }
              >
                {savingMeeting
                  ? editingMeeting
                    ? "Updating..."
                    : "Scheduling..."
                  : editingMeeting
                  ? "Update Meeting"
                  : "Schedule Meeting"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          CANCEL MEETING CONFIRMATION
      ===================================================== */}

      {showCancelConfirm &&
        cancellingMeeting && (
          <div className="superadmin-cal-confirm-overlay">
            <div className="superadmin-cal-confirm-box">
              <div className="superadmin-cal-confirm-icon">
                <Trash2
                  size={22}
                />
              </div>

              <h3>
                Cancel Meeting?
              </h3>

              <p>
                Are you sure you
                want to cancel{" "}
                <strong>
                  {cancellingMeeting.title ||
                    "this meeting"}
                </strong>
                ?
              </p>

              <p className="superadmin-cal-confirm-note">
                All participants
                will receive a
                cancellation
                email.
              </p>

              <div className="superadmin-cal-confirm-actions">
                <button
                  type="button"
                  className="superadmin-cal-confirm-back"
                  onClick={
                    closeCancelConfirm
                  }
                >
                  Keep Meeting
                </button>

                <button
                  type="button"
                  className="superadmin-cal-confirm-delete"
                  onClick={
                    cancelMeeting
                  }
                >
                  Cancel Meeting
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default SuperadminCalendar;