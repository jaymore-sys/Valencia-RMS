import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  X,
  CalendarDays,
  Plus,
  Users,
} from "lucide-react";

import "../../layouts/adminCalendar.css";
import "./administratorCalendar.css";

const API =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";

const getAuthHeaders = () => ({
  Authorization:
    "Bearer " +
    (sessionStorage.getItem("token") ||
      localStorage.getItem("token") ||
      ""),
  "Content-Type": "application/json",
});

/* =========================================================
   DATE HELPERS
========================================================= */

const localDateString = (date) => {
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");
  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const normalizeDate = (value) => {
  if (!value) return "";

  if (typeof value === "string") {
    return value.substring(0, 10);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return localDateString(date);
};

const displayDate = (value) => {
  if (!value) return "";

  const date = new Date(
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

  if (!normalized) return "";

  const date = new Date(
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
  ] = String(value).split(":");

  const hour = Number(hourString);
  const minute = Number(
    minuteString || 0
  );

  if (Number.isNaN(hour)) {
    return value;
  }

  const date = new Date();

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

const AdministratorCalendar = () => {
  const now = new Date();

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

  const [
    events,
    setEvents,
  ] = useState({
    projects: [],
    tasks: [],
    subtasks: [],
    meetings: [],
    mini_tasks: [],
  });

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    selectedDate,
    setSelectedDate,
  ] = useState("");

  const [
    activeFilter,
    setActiveFilter,
  ] = useState("all");

  const [
    showMeetingModal,
    setShowMeetingModal,
  ] = useState(false);

  const [
    meetingEmployees,
    setMeetingEmployees,
  ] = useState([]);

  const [
    meetingEmployeesLoading,
    setMeetingEmployeesLoading,
  ] = useState(false);

  const [
    employeeSearch,
    setEmployeeSearch,
  ] = useState("");

  const [
    meetingSubmitting,
    setMeetingSubmitting,
  ] = useState(false);

  const [
    meetingError,
    setMeetingError,
  ] = useState("");

  const [
    meetingForm,
    setMeetingForm,
  ] = useState({
    title: "",
    description: "",
    meeting_date: "",
    start_time: "",
    end_time: "",
    employee_ids: [],
  });

  /* =========================================================
     API
  ========================================================= */

  const loadCalendar = async () => {
    try {
      setLoading(true);

      const response =
        await fetch(
          `${API}/calendar/administrator`,
          {
            headers:
              getAuthHeaders(),
          }
        );

      const data =
        await response.json();

      

      if (data.success) {
        setEvents({
          projects:
            data.projects || [],
          tasks:
            data.tasks || [],
          subtasks:
            data.subtasks || [],
          meetings:
            data.meetings || [],
          mini_tasks:
            data.mini_tasks || [],
        });
      }
    } catch (error) {
      console.error(
        "Calendar loading error:",
        error
      );
    } finally {
      setLoading(false);
    }
  };

  const loadMeetingEmployees =
    async () => {
      try {
        setMeetingEmployeesLoading(
          true
        );

        setMeetingError("");

        const response =
          await fetch(
            `${API}/calendar/employees`,
            {
              headers:
                getAuthHeaders(),
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.message ||
              "Failed to load employees."
          );
        }

        setMeetingEmployees(
          Array.isArray(
            data.employees
          )
            ? data.employees
            : []
        );
      } catch (error) {
        console.error(
          "Meeting employee loading error:",
          error
        );

        setMeetingError(
          error.message ||
            "Failed to load employees."
        );
      } finally {
        setMeetingEmployeesLoading(
          false
        );
      }
    };

  const openMeetingModal =
    async () => {
      setMeetingError("");
      setEmployeeSearch("");

      setMeetingForm({
        title: "",
        description: "",
        meeting_date:
          selectedDate ||
          todayString,
        start_time: "",
        end_time: "",
        employee_ids: [],
      });

      setShowMeetingModal(true);

      await loadMeetingEmployees();
    };

  const closeMeetingModal =
    () => {
      if (meetingSubmitting) {
        return;
      }

      setShowMeetingModal(false);
      setMeetingError("");
    };

  const toggleMeetingEmployee =
    (userId) => {
      const id =
        Number(userId);

      setMeetingForm(
        (previous) => {
          const selected =
            previous.employee_ids.includes(
              id
            );

          return {
            ...previous,

            employee_ids:
              selected
                ? previous.employee_ids.filter(
                    (item) =>
                      item !== id
                  )
                : [
                    ...previous.employee_ids,
                    id,
                  ],
          };
        }
      );
    };

  const handleScheduleMeeting =
    async () => {
      try {
        setMeetingError("");

        if (
          !meetingForm.title.trim()
        ) {
          setMeetingError(
            "Please enter the meeting title."
          );
          return;
        }

        if (
          !meetingForm.meeting_date
        ) {
          setMeetingError(
            "Please select the meeting date."
          );
          return;
        }

        if (
          !meetingForm.start_time ||
          !meetingForm.end_time
        ) {
          setMeetingError(
            "Please select start and end time."
          );
          return;
        }

        if (
          meetingForm.end_time <=
          meetingForm.start_time
        ) {
          setMeetingError(
            "End time must be after start time."
          );
          return;
        }

        if (
          meetingForm
            .employee_ids
            .length === 0
        ) {
          setMeetingError(
            "Please select at least one participant."
          );
          return;
        }

        setMeetingSubmitting(
          true
        );

        const response =
          await fetch(
            `${API}/calendar/meetings`,
            {
              method: "POST",

              headers:
                getAuthHeaders(),

              body:
                JSON.stringify({
                  title:
                    meetingForm.title.trim(),

                  description:
                    meetingForm.description.trim(),

                  meeting_date:
                    meetingForm.meeting_date,

                  start_time:
                    meetingForm.start_time,

                  end_time:
                    meetingForm.end_time,

                  employee_ids:
                    meetingForm.employee_ids,
                }),
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.message ||
              "Failed to schedule meeting."
          );
        }

        setShowMeetingModal(
          false
        );

        setActiveFilter(
          "meeting"
        );

        setSelectedDate(
          meetingForm.meeting_date
        );

        await loadCalendar();
      } catch (error) {
        console.error(
          "Schedule meeting error:",
          error
        );

        setMeetingError(
          error.message ||
            "Failed to schedule meeting."
        );
      } finally {
        setMeetingSubmitting(
          false
        );
      }
    };

  useEffect(() => {
    loadCalendar();
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

      const offset =
        (firstDay.getDay() + 6) %
        7;

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
          new Date(gridStart);

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
    }, [
      year,
      month,
    ]);

  /* =========================================================
     TITLES
  ========================================================= */

  const projectTitle =
    (item) =>
      item.title ||
      item.project_name ||
      item.name ||
      "Project";

  const taskTitle =
    (item) =>
      item.title ||
      item.task_name ||
      item.name ||
      "Task";

  const meetingTitle =
    (item) =>
      item.title ||
      item.meeting_title ||
      "Meeting";

  const miniTaskTitle =
    (item) =>
      item.title ||
      item.task_name ||
      item.mini_task_name ||
      "Mini Task";

  /* =========================================================
     CONTINUOUS CALENDAR BARS
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

  const eventsForWeek =
    (week) => {
      const weekStart =
        week[0].dateString;

      const weekEnd =
        week[6].dateString;

      const result = [];

      /* ---------------- PROJECTS ---------------- */

      events.projects.forEach(
        (item) => {
          const start =
            normalizeDate(
              item.start_date
            );

          const end =
            normalizeDate(
              item.end_date
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

      /* ---------------- TASKS ---------------- */

      events.tasks.forEach(
        (item) => {
          const start =
            normalizeDate(
              item.start_date
            );

          const end =
            normalizeDate(
              item.end_date
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

      /* ---------------- SUBTASKS ---------------- */

      events.subtasks.forEach(
        (item) => {
          const start =
            normalizeDate(
              item.start_date
            );

          const end =
            normalizeDate(
              item.end_date
            );

          if (
            start &&
            end &&
            start <= weekEnd &&
            end >= weekStart
          ) {
            result.push({
              type: "subtask",

              title:
                item.title ||
                item.task_title ||
                "Subtask",

              start,
              end,
              source: item,
            });
          }
        }
      );

      /* ---------------- MEETINGS ---------------- */

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

      /* ---------------- MINI TASKS ---------------- */

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
        activeFilter !==
        "all"
      ) {
        return result.filter(
          (item) =>
            item.type ===
            activeFilter
        );
      }

      return result;
    };

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
     EVENTS FOR RIGHT SIDE PANEL
  ========================================================= */

  const detailEventsForDate =
    (dateString) => {
      if (!dateString) {
        return [];
      }

      const result = [];

      events.projects.forEach(
        (item) => {
          const start =
            normalizeDate(
              item.start_date
            );

          const end =
            normalizeDate(
              item.end_date
            );

          if (
            start &&
            end &&
            dateString >= start &&
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

      events.tasks.forEach(
        (item) => {
          const start =
            normalizeDate(
              item.start_date
            );

          const end =
            normalizeDate(
              item.end_date
            );

          if (
            start &&
            end &&
            dateString >= start &&
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

      events.subtasks.forEach(
        (item) => {
          const start =
            normalizeDate(
              item.start_date
            );

          const end =
            normalizeDate(
              item.end_date
            );

          if (
            start &&
            end &&
            dateString >= start &&
            dateString <= end
          ) {
            result.push({
              type: "subtask",

              title:
                item.title ||
                item.task_title ||
                "Subtask",

              source: item,
            });
          }
        }
      );

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

  const selectedSubtasks =
    selectedEvents.filter(
      (item) =>
        item.type ===
        "subtask"
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

  const handleDateClick =
    (calendarDate) => {
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
     NAVIGATION
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

  const nextMonth =
    () => {
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
     DETAILS
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
      <section className="admin-cal-detail-section">
        <h4
          className={`admin-cal-detail-heading admin-cal-${type}-text`}
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

            if (
              type ===
                "project" ||
              type === "task" ||
              type ===
                "subtask"
            ) {
              meta =
                `${shortDate(
                  item.start_date
                )} – ${shortDate(
                  item.end_date
                )}`;
            }

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

            if (
              type === "mini"
            ) {
              meta =
                displayTime(
                  item.task_time ||
                    item.time
                );
            }

            return (
              <div
                className="admin-cal-detail-item"
                key={
                  item.id ||
                  item.task_id ||
                  item.project_id ||
                  item.meeting_id ||
                  `${type}-${index}`
                }
              >
                <span
                  className={`admin-cal-detail-dot admin-cal-${type}-dot`}
                />

                <div className="admin-cal-detail-info">
                  {meta && (
                    <span className="admin-cal-detail-meta">
                      {meta}
                    </span>
                  )}

                  <strong>
                    {event.title}
                  </strong>

                  {type ===
                    "meeting" &&
                    item.description && (
                      <p>
                        {
                          item.description
                        }
                      </p>
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
     MEETING EMPLOYEE SEARCH / SELECT ALL

     MUST STAY INSIDE COMPONENT
  ========================================================= */

  const filteredMeetingEmployees =
    meetingEmployees.filter(
      (employee) => {
        const search =
          employeeSearch
            .trim()
            .toLowerCase();

        if (!search) {
          return true;
        }

        return (
          String(
            employee.full_name ||
              ""
          )
            .toLowerCase()
            .includes(search) ||

          String(
            employee.designation ||
              ""
          )
            .toLowerCase()
            .includes(search) ||

          String(
            employee.department_name ||
              ""
          )
            .toLowerCase()
            .includes(search) ||

          String(
            employee.role_name ||
              ""
          )
            .toLowerCase()
            .includes(search)
        );
      }
    );

  const toggleSelectAllMeetingEmployees =
    () => {
      const filteredIds =
        filteredMeetingEmployees.map(
          (employee) =>
            Number(
              employee.user_id
            )
        );

      const allSelected =
        filteredIds.length >
          0 &&
        filteredIds.every(
          (id) =>
            meetingForm.employee_ids.includes(
              id
            )
        );

      setMeetingForm(
        (previous) => ({
          ...previous,

          employee_ids:
            allSelected
              ? previous.employee_ids.filter(
                  (id) =>
                    !filteredIds.includes(
                      id
                    )
                )
              : [
                  ...new Set([
                    ...previous.employee_ids,
                    ...filteredIds,
                  ]),
                ],
        })
      );
    };

  /* =========================================================
     JSX
  ========================================================= */

  return (
    <div className="admin-main-calendar">
      <div
        className="admin-cal-page"
        style={{
          width: "100%",
          maxWidth: "none",
          margin: "0",
          padding: "0",
          boxSizing:
            "border-box",
          height: "100%",
          display: "flex",
          flexDirection:
            "column",
          overflow:
            "hidden",
        }}
      >
        {/* ==================== TITLE ==================== */}

        <div className="admin-cal-title-row">
          <div>
            <h1>
              Calendar
            </h1>

            <p className="administrator-calendar-subtitle">
              Your assigned
              projects, tasks,
              subtasks, meetings
              and mini tasks.
            </p>
          </div>

          <button
            type="button"
            className="administrator-schedule-meeting-btn"
            onClick={
              openMeetingModal
            }
          >
            <Plus size={18} />
            Schedule Meeting
          </button>
        </div>

        {/* ==================== CARD ==================== */}

        <div className="admin-cal-card">
          <div className="admin-cal-toolbar">
            <div className="admin-cal-filter-row">
              <button
                type="button"
                className={
                  activeFilter ===
                  "all"
                    ? "admin-cal-filter active all"
                    : "admin-cal-filter"
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
                    ? "admin-cal-filter active project"
                    : "admin-cal-filter"
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
                    ? "admin-cal-filter active task"
                    : "admin-cal-filter"
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
                  "subtask"
                    ? "admin-cal-filter active task"
                    : "admin-cal-filter"
                }
                onClick={() =>
                  setActiveFilter(
                    "subtask"
                  )
                }
              >
                Subtasks
              </button>

              <button
                type="button"
                className={
                  activeFilter ===
                  "meeting"
                    ? "admin-cal-filter active meeting"
                    : "admin-cal-filter"
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
                    ? "admin-cal-filter active project"
                    : "admin-cal-filter"
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

            <div className="admin-cal-navigation">
              <button
                type="button"
                className="admin-cal-nav-arrow"
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
                className="admin-cal-nav-arrow"
                onClick={
                  nextMonth
                }
              >
                <ChevronRight
                  size={16}
                />
              </button>

              <span className="admin-cal-month-name">
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
          </div>

          {/* =============== CALENDAR LAYOUT =============== */}

          <div
            className={
              selectedDate
                ? "admin-cal-body admin-cal-body-details"
                : "admin-cal-body"
            }
          >
            <div className="admin-cal-main">
              <div className="admin-cal-week">
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

              <div className="admin-cal-grid">
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
                        className="admin-cal-week-row"
                        key={
                          weekIndex
                        }
                      >
                        <div className="admin-cal-days-row">
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
                                    "admin-cal-day",
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
                                  <span className="admin-cal-day-number">
                                    {
                                      calendarDate.number
                                    }
                                  </span>
                                </button>
                              );
                            }
                          )}
                        </div>

                        <div className="admin-cal-event-layer">
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

                              return (
                                <div
                                  key={`${event.type}-${eventIndex}-${weekIndex}`}
                                  className={`admin-cal-event-bar admin-cal-event-bar-${event.type}`}
                                  style={{
                                    gridColumn:
                                      `${segment.startIndex + 1} / span ${segment.span}`,

                                    gridRow:
                                      `${eventIndex + 1}`,
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
                                    event.title
                                  }
                                >
                                  <span className="admin-cal-event-bar-dot" />

                                  <span className="admin-cal-event-bar-title">
                                    {segment.continuesBefore
                                      ? ""
                                      : event.title}
                                  </span>

                                  {event.type ===
                                    "meeting" &&
                                    event
                                      .source
                                      ?.start_time && (
                                      <span className="admin-cal-event-bar-time">
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

              <div className="admin-cal-legend">
                <div>
                  <span className="admin-cal-legend-dot project" />
                  Project
                </div>

                <div>
                  <span className="admin-cal-legend-dot task" />
                  Task
                </div>

                <div>
                  <span className="admin-cal-legend-dot meeting" />
                  Meeting
                </div>

                <div>
                  <span className="admin-cal-legend-dot mini" />
                  Mini Task
                </div>

                <div>
                  <span className="admin-cal-legend-dot subtask" />
                  Subtask
                </div>
              </div>

              {loading && (
                <div className="admin-cal-loading">
                  Loading...
                </div>
              )}
            </div>

            {/* ================ RIGHT PANEL ================ */}

            {selectedDate && (
              <aside className="admin-cal-details">
                <div className="admin-cal-details-header">
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

                <div className="admin-cal-details-scroll">
                  {selectedEvents.length ===
                  0 ? (
                    <div className="admin-cal-empty-details">
                      <CalendarDays
                        size={
                          30
                        }
                      />

                      <strong>
                        Nothing
                        scheduled
                      </strong>

                      <p>
                        No
                        projects,
                        tasks,
                        meetings
                        or mini
                        tasks for
                        this date.
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
                        "SUBTASKS",
                        "subtask",
                        selectedSubtasks
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
            SCHEDULE MEETING MODAL
        ===================================================== */}

        {showMeetingModal && (
          <div
            className="administrator-meeting-modal-overlay"
            onClick={
              closeMeetingModal
            }
          >
            <div
              className="administrator-meeting-modal"
              onClick={(
                event
              ) =>
                event.stopPropagation()
              }
            >
              <div className="administrator-meeting-modal-header">
                <div>
                  <h2>
                    Schedule
                    Meeting
                  </h2>
                </div>

                <button
                  type="button"
                  className="administrator-meeting-close"
                  onClick={
                    closeMeetingModal
                  }
                >
                  <X
                    size={18}
                  />
                </button>
              </div>

              {meetingError && (
                <div className="administrator-meeting-error">
                  {
                    meetingError
                  }
                </div>
              )}

              <div className="administrator-meeting-form">
                <label>
                  <span>
                    Meeting
                    Title
                  </span>

                  <input
                    type="text"
                    value={
                      meetingForm.title
                    }
                    placeholder="Enter meeting title"
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
                </label>

                <label>
                  <span>
                    Description
                    / Notes
                  </span>

                  <textarea
                    value={
                      meetingForm.description
                    }
                    placeholder="Meeting notes or agenda..."
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
                </label>

                <div className="administrator-meeting-date-grid">
                  <label>
                    <span>
                      Date
                    </span>

                    <input
                      type="date"
                      value={
                        meetingForm.meeting_date
                      }
                      onChange={(
                        event
                      ) =>
                        setMeetingForm(
                          (
                            previous
                          ) => ({
                            ...previous,

                            meeting_date:
                              event
                                .target
                                .value,
                          })
                        )
                      }
                    />
                  </label>

                  <label>
                    <span>
                      Start
                      Time
                    </span>

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
                  </label>

                  <label>
                    <span>
                      End Time
                    </span>

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
                  </label>
                </div>

                <div className="administrator-meeting-participants">
                  <div className="administrator-meeting-select-row">
                    <label className="administrator-meeting-select-label">
                      Select
                      Employees
                      <span>
                        *
                      </span>
                    </label>

                    <div className="administrator-meeting-search-wrap">
                      <input
                        type="text"
                        value={
                          employeeSearch
                        }
                        onChange={(
                          event
                        ) =>
                          setEmployeeSearch(
                            event
                              .target
                              .value
                          )
                        }
                        placeholder="Search employees or admins..."
                      />
                    </div>

                    <button
                      type="button"
                      className="administrator-meeting-select-all"
                      onClick={
                        toggleSelectAllMeetingEmployees
                      }
                    >
                      Select All
                    </button>
                  </div>

                  {meetingEmployeesLoading ? (
                    <div className="administrator-meeting-loading">
                      Loading
                      employees...
                    </div>
                  ) : (
                    <div className="administrator-meeting-employee-list">
                      {filteredMeetingEmployees.map(
                        (
                          employee
                        ) => {
                          const employeeId =
                            Number(
                              employee.user_id
                            );

                          const checked =
                            meetingForm.employee_ids.includes(
                              employeeId
                            );

                          return (
                            <label
                              key={
                                employee.user_id
                              }
                              className={
                                checked
                                  ? "administrator-meeting-employee selected"
                                  : "administrator-meeting-employee"
                              }
                            >
                              <input
                                type="checkbox"
                                checked={
                                  checked
                                }
                                onChange={() =>
                                  toggleMeetingEmployee(
                                    employeeId
                                  )
                                }
                              />

                              <div>
                                <strong>
                                  {
                                    employee.full_name
                                  }
                                </strong>

                                <span>
                                  {employee.designation ||
                                    employee.role_name ||
                                    "Employee"}

                                  {employee.department_name
                                    ? ` · ${employee.department_name}`
                                    : ""}
                                </span>
                              </div>
                            </label>
                          );
                        }
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="administrator-meeting-actions">
                <button
                  type="button"
                  className="administrator-meeting-cancel"
                  onClick={
                    closeMeetingModal
                  }
                  disabled={
                    meetingSubmitting
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="administrator-meeting-submit"
                  onClick={
                    handleScheduleMeeting
                  }
                  disabled={
                    meetingSubmitting
                  }
                >
                  <CalendarDays
                    size={18}
                  />

                  {meetingSubmitting
                    ? "Scheduling..."
                    : "Schedule Meeting"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdministratorCalendar;