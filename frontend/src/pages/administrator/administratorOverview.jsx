import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FolderKanban,
  RefreshCw,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import api from "../../api/axios";
import "./administratorOverview.css";

const statusLabels = {
  not_started: "To Do",
  ongoing: "In Progress",
  in_progress: "In Progress",
  under_review: "Under Review",
  completed: "Done",
  done: "Done",
  on_hold: "On Hold",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

const attendanceLabels = {
  present: "Present",
  absent: "Absent",
  half_day: "Half Day",
  leave: "Leave",
  holiday: "Holiday",
  not_marked: "Not Marked",
};

const attendanceSymbols = {
  present: "✓",
  absent: "×",
  half_day: "½",
  leave: "L",
  holiday: "H",
  not_marked: "—",
};

const chartColors = [
  "#ff5733",
  "#ff8a65",
  "#ffb199",
  "#ffd6cc",
  "#ffad8f",
  "#f97316",
];

const normalizeStatus = (status, progress = 0) => {
  const value = String(status || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  if (
    Number(progress || 0) >= 100 ||
    ["completed", "done", "complete"].includes(value)
  ) {
    return "completed";
  }

  if (["ongoing", "in_progress", "progress"].includes(value)) {
    return "ongoing";
  }

  if (["under_review", "review"].includes(value)) {
    return "under_review";
  }

  if (["rejected", "reject"].includes(value)) {
    return "rejected";
  }

  if (["on_hold", "hold"].includes(value)) {
    return "on_hold";
  }

  if (["todo", "to_do", "pending", "not_started", ""].includes(value)) {
    return "not_started";
  }

  return value || "not_started";
};

const numberValue = (...values) => {
  for (const value of values) {
    const number = Number(value);

    if (!Number.isNaN(number) && number >= 0) {
      return number;
    }
  }

  return 0;
};

const formatDate = (value) => {
  if (!value) return "-";

  const text = String(value);

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const [year, month, day] = text.slice(0, 10).split("-");
    return `${day}-${month}-${year}`;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return text;

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatTime = (value) => {
  if (!value) return "";

  const text = String(value).slice(0, 5);
  const [hours, minutes] = text.split(":").map(Number);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return text;
  }

  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;

  return `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
};

const getProjectSubtasks = (project) => {
  return (
    project?.subtasks ||
    project?.sub_tasks ||
    project?.tasks ||
    project?.project_tasks ||
    []
  );
};

const getProjectSubtaskStats = (project) => {
  if (!project) {
    return {
      total: 0,
      completed: 0,
    };
  }

  const subtasks = getProjectSubtasks(project);

  if (Array.isArray(subtasks) && subtasks.length > 0) {
    const completed = subtasks.filter((subtask) => {
      return (
        Boolean(subtask.is_checked) ||
        Boolean(subtask.checked) ||
        Boolean(subtask.is_completed) ||
        normalizeStatus(subtask.status, subtask.progress) === "completed"
      );
    }).length;

    return {
      total: subtasks.length,
      completed,
    };
  }

  return {
    total: numberValue(
      project.total_subtasks,
      project.totalSubtasks,
      project.total_tasks,
      project.totalTasks,
      project.subtask_count,
      project.subtaskCount
    ),
    completed: numberValue(
      project.completed_subtasks,
      project.completedSubtasks,
      project.completed_tasks,
      project.completedTasks,
      project.done_subtasks,
      project.checked_subtasks
    ),
  };
};

const getProjectStatus = (project) => {
  if (!project) return "not_started";

  return normalizeStatus(
    project.status ||
      project.project_status ||
      project.computed_status ||
      project.display_status,
    project.progress
  );
};

const getProjectProgress = (project) => {
  if (!project) return 0;

  const stats = getProjectSubtaskStats(project);

  if (stats.total > 0) {
    return Math.round((stats.completed / stats.total) * 100);
  }

  return Math.min(
    numberValue(
      project.computed_progress,
      project.progress,
      project.overall_progress,
      project.employee_progress,
      project.assignment_progress,
      project.progress_percentage,
      project.completion_percentage,
      project.percentage
    ),
    100
  );
};

const extractProjects = (payload) => {
  if (!payload) return [];

  const data = payload.data || payload;

  if (Array.isArray(data)) return data;

  const possibleArrays = [
    data.projects,
    data.my_projects,
    data.myProjects,
    data.assigned_projects,
    data.assignedProjects,
    data.rows,
    data.result,
  ];

  for (const item of possibleArrays) {
    if (Array.isArray(item)) return item;
  }

  return [];
};

const dedupeProjects = (projects) => {
  const map = new Map();

  projects.filter(Boolean).forEach((project) => {
    const key =
      project.project_id ||
      project.id ||
      `${project.project_title || project.title}-${project.created_at || ""}`;

    if (!map.has(key)) {
      map.set(key, project);
      return;
    }

    const existing = map.get(key);

    map.set(key, {
      ...existing,
      ...project,
      subtasks:
        project.subtasks?.length > 0
          ? project.subtasks
          : existing.subtasks || [],
    });
  });

  return Array.from(map.values());
};

const getAttendanceStyle = (status) => {
  const normalizedStatus = String(status || "not_marked")
    .toLowerCase()
    .replace(/\s+/g, "_");

  const stylesByStatus = {
    present: {
      background: "#d1fae5",
      color: "#059669",
      border: "#a7f3d0",
    },
    absent: {
      background: "#fee2e2",
      color: "#dc2626",
      border: "#fecaca",
    },
    half_day: {
      background: "#fef3c7",
      color: "#d97706",
      border: "#fde68a",
    },
    leave: {
      background: "#e0e7ff",
      color: "#4f46e5",
      border: "#c7d2fe",
    },
    holiday: {
      background: "#f3e8ff",
      color: "#9333ea",
      border: "#e9d5ff",
    },
    not_marked: {
      background: "#f1f5f9",
      color: "#64748b",
      border: "#e2e8f0",
    },
  };

  return stylesByStatus[normalizedStatus] || stylesByStatus.not_marked;
};

const AdministratorOverview = () => {
  const navigate = useNavigate();

  const [administratorOverview, setAdministratorOverview] = useState(null);
  const [employeeOverview, setEmployeeOverview] = useState(null);
  const [myProjects, setMyProjects] = useState([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setMessage("");

      const [
        administratorResponse,
        employeeResponse,
        myProjectsResponse,
        upcomingResponse,
      ] = await Promise.all([
        api.get("/administrator/overview"),
        api.get("/employee-overview"),
        api.get("/employee-projects/projects"),
        api.get("/calendar/upcoming").catch(() => ({
          data: { meetings: [] },
        })),
      ]);

      setAdministratorOverview(administratorResponse.data || {});
      setEmployeeOverview(
        employeeResponse.data?.data ||
          employeeResponse.data ||
          {}
      );
      setMyProjects(extractProjects(myProjectsResponse.data));
      setUpcomingMeetings(
        upcomingResponse.data?.meetings ||
          upcomingResponse.data?.upcoming_meetings ||
          upcomingResponse.data?.data ||
          []
      );
    } catch (error) {
      setMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to load overview."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const profile =
    administratorOverview?.profile || {};

  const adminStats =
    administratorOverview?.stats || {};

  const personalSummary =
    employeeOverview?.summary || {};

  const recentTasks =
    employeeOverview?.recent_tasks ||
    administratorOverview?.recent_tasks ||
    [];

  const activityLog =
    employeeOverview?.activity_log ||
    administratorOverview?.activity_logs ||
    [];

  const weeklyAttendance =
    employeeOverview?.weekly_attendance ||
    administratorOverview?.weekly_attendance ||
    [];

  const assignedProjects = useMemo(() => {
    return dedupeProjects([
      ...myProjects,
      ...(administratorOverview?.assigned_projects || []),
      ...(administratorOverview?.recent_projects || []),
      administratorOverview?.active_project,
    ])
      .filter((project) => {
        const status = getProjectStatus(project);

        return ![
          "completed",
          "rejected",
          "cancelled",
        ].includes(status);
      })
      .sort((a, b) => {
        const order = {
          not_started: 1,
          ongoing: 2,
          under_review: 3,
          on_hold: 4,
        };

        return (
          (order[getProjectStatus(a)] || 99) -
          (order[getProjectStatus(b)] || 99)
        );
      });
  }, [myProjects, administratorOverview]);

  const projectSplitData = useMemo(() => {
    const backendData =
      administratorOverview?.project_split || [];

    if (backendData.length > 0) {
      return backendData
        .map((item) => ({
          name:
            statusLabels[normalizeStatus(item.status)] ||
            String(item.status || "")
              .replaceAll("_", " ")
              .replace(/\b\w/g, (letter) =>
                letter.toUpperCase()
              ),
          value: Number(item.count || item.value || 0),
        }))
        .filter((item) => item.value > 0);
    }

    const counts = {};

    myProjects.forEach((project) => {
      const status = getProjectStatus(project);
      counts[status] = (counts[status] || 0) + 1;
    });

    return Object.entries(counts).map(([status, value]) => ({
      name: statusLabels[status] || status,
      value,
    }));
  }, [administratorOverview, myProjects]);

  const taskOverviewData = [
    {
      name: "Total",
      value: Number(personalSummary.total_tasks || 0),
    },
    {
      name: "In Progress",
      value: Number(personalSummary.in_progress_tasks || 0),
    },
    {
      name: "Completed",
      value: Number(personalSummary.completed_tasks || 0),
    },
  ];

  const statCards = [
    {
      label: "Total Users",
      value: adminStats.total_users || 0,
      icon: Users,
      onClick: () => navigate("/administrator/users"),
    },
    {
      label: "My Projects",
      value: myProjects.length,
      icon: FolderKanban,
      onClick: () => navigate("/administrator/projects"),
    },
    {
      label: "My Tasks",
      value: personalSummary.total_tasks || 0,
      icon: ClipboardList,
      onClick: () =>
        navigate("/administrator/tasks?tab=my"),
    },
    {
      label: "In Progress",
      value: personalSummary.in_progress_tasks || 0,
      icon: Activity,
      onClick: () =>
        navigate(
          "/administrator/tasks?tab=my&status=in_progress"
        ),
    },
    {
      label: "Completed",
      value: personalSummary.completed_tasks || 0,
      icon: CheckCircle2,
      onClick: () =>
        navigate(
          "/administrator/tasks?tab=my&status=completed"
        ),
    },
    {
      label: "Weekly Attendance",
      value: `${personalSummary.attendance_percentage || 0}%`,
      icon: CalendarDays,
      onClick: () => navigate("/administrator/attendance"),
    },
  ];

  if (loading) {
    return (
      <div className="administrator-overview-loader">
        Loading overview...
      </div>
    );
  }

  return (
    <div className="administrator-overview-page">
      <section className="administrator-overview-header">
        <div>
          <h1>Administrator Overview</h1>

          <p>
            Welcome back, {profile.full_name || "Administrator"}.
            Your personal work and Administrator overview are
            synchronized here.
          </p>
        </div>

        <button
          type="button"
          className="administrator-overview-refresh"
          onClick={fetchOverview}
          disabled={loading}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </section>

      {message && (
        <div className="administrator-overview-message">
          {message}
        </div>
      )}

      <section className="administrator-overview-stat-grid">
        {statCards.map((card) => {
          const Icon = card.icon;

          return (
            <button
              type="button"
              key={card.label}
              className="administrator-overview-stat-card"
              onClick={card.onClick}
            >
              <div className="administrator-overview-stat-icon">
                <Icon size={19} />
              </div>

              <div>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </div>
            </button>
          );
        })}
      </section>

      <section className="administrator-overview-main-grid">
        <article className="administrator-overview-panel">
          <div className="administrator-overview-panel-header">
            <div>
              <h2>Active Projects</h2>
              <p>
                Projects currently assigned to you.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate("/administrator/projects")
              }
            >
              View Projects
            </button>
          </div>

          <div className="administrator-overview-project-list">
            {assignedProjects.length > 0 ? (
              assignedProjects.slice(0, 8).map((project) => {
                const progress =
                  getProjectProgress(project);

                return (
                  <button
                    type="button"
                    className="administrator-overview-project-item"
                    key={project.project_id || project.id}
                    onClick={() =>
                      navigate("/administrator/projects")
                    }
                  >
                    <div className="administrator-overview-project-item-top">
                      <div>
                        <h3>
                          {project.project_title ||
                            project.title ||
                            "Untitled Project"}
                        </h3>

                        <p>
                          {statusLabels[
                            getProjectStatus(project)
                          ] || getProjectStatus(project)}
                        </p>
                      </div>

                      <strong>{progress}%</strong>
                    </div>

                    <div className="administrator-overview-progress-track">
                      <div
                        style={{
                          width: `${progress}%`,
                        }}
                      />
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="administrator-overview-empty">
                No active projects assigned to you.
              </div>
            )}
          </div>
        </article>

        <article className="administrator-overview-panel">
          <div className="administrator-overview-panel-header">
            <div>
              <h2>Upcoming Meetings</h2>
              <p>
                Meetings currently assigned to you.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate("/administrator/calendar")
              }
            >
              View Calendar
            </button>
          </div>

          <div className="administrator-overview-meeting-list">
            {upcomingMeetings.length > 0 ? (
              upcomingMeetings.slice(0, 5).map((meeting) => (
                <button
                  type="button"
                  className="administrator-overview-meeting-item"
                  key={meeting.id || meeting.meeting_id}
                  onClick={() =>
                    navigate("/administrator/calendar")
                  }
                >
                  <div className="administrator-overview-meeting-icon">
                    <CalendarDays size={18} />
                  </div>

                  <div>
                    <strong>
                      {meeting.title ||
                        meeting.meeting_title ||
                        "Meeting"}
                    </strong>

                    <span>
                      {formatDate(
                        meeting.meeting_date ||
                          meeting.date
                      )}
                      {meeting.start_time
                        ? ` · ${formatTime(meeting.start_time)}`
                        : ""}
                    </span>

                    <p>
                      {meeting.created_by_name
                        ? `Scheduled by ${meeting.created_by_name}`
                        : meeting.description || ""}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <div className="administrator-overview-empty">
                No upcoming meetings.
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="administrator-overview-analytics-panel">
        <div className="administrator-overview-panel-header">
          <div>
            <h2>Work Analytics</h2>
            <p>
              Personal task progress and project status distribution.
            </p>
          </div>
        </div>

        <div className="administrator-overview-charts-grid">
          <div className="administrator-overview-chart-card">
            <h3>My Task Overview</h3>

            {taskOverviewData.some(
              (item) => item.value > 0
            ) ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={taskOverviewData}
                  margin={{
                    top: 15,
                    right: 10,
                    left: -20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#edf0f4"
                  />

                  <XAxis
                    dataKey="name"
                    tick={{
                      fill: "#667085",
                      fontSize: 11,
                    }}
                    axisLine={{
                      stroke: "#e4e7ec",
                    }}
                    tickLine={false}
                  />

                  <YAxis
                    allowDecimals={false}
                    tick={{
                      fill: "#667085",
                      fontSize: 11,
                    }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <Tooltip />

                  <Bar
                    dataKey="value"
                    fill="#ff5733"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={54}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="administrator-overview-empty">
                No task data available.
              </div>
            )}
          </div>

          <div className="administrator-overview-chart-card">
            <h3>Project Split</h3>

            {projectSplitData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={projectSplitData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="43%"
                    outerRadius={86}
                    innerRadius={40}
                    paddingAngle={2}
                  >
                    {projectSplitData.map((entry, index) => (
                      <Cell
                        key={`${entry.name}-${index}`}
                        fill={
                          chartColors[
                            index % chartColors.length
                          ]
                        }
                      />
                    ))}
                  </Pie>

                  <Tooltip />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="administrator-overview-empty">
                No project data available.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="administrator-overview-panel administrator-overview-week-panel">
        <div className="administrator-overview-panel-header">
          <div>
            <h2>This Week</h2>
            <p>
              Your recent working-day attendance.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              navigate("/administrator/attendance")
            }
          >
            View Attendance
          </button>
        </div>

        <div className="administrator-overview-week-grid">
          {weeklyAttendance.length > 0 ? (
            weeklyAttendance.map((day, index) => {
              const status =
                String(day.status || "not_marked")
                  .toLowerCase()
                  .replace(/\s+/g, "_");

              const style =
                getAttendanceStyle(status);

              return (
                <div
                  className="administrator-overview-day-card"
                  key={
                    day.attendance_date ||
                    day.date ||
                    `${day.day_name}-${index}`
                  }
                >
                  <strong>
                    {day.day_name || "-"}
                  </strong>

                  <span>
                    {formatDate(
                      day.attendance_date ||
                        day.date
                    )}
                  </span>

                  <div
                    style={{
                      background: style.background,
                      color: style.color,
                      borderColor: style.border,
                    }}
                  >
                    {attendanceSymbols[status] || "—"}
                  </div>

                  <p
                    style={{
                      color: style.color,
                    }}
                  >
                    {attendanceLabels[status] ||
                      "Not Marked"}
                  </p>
                </div>
              );
            })
          ) : (
            <div className="administrator-overview-empty">
              No attendance information available.
            </div>
          )}
        </div>
      </section>

      <section className="administrator-overview-bottom-grid">
        <article className="administrator-overview-panel">
          <div className="administrator-overview-panel-header">
            <div>
              <h2>Recent Tasks</h2>
              <p>
                Same personal task source as My Tasks.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate("/administrator/tasks?tab=my")
              }
            >
              View Tasks
            </button>
          </div>

          <div className="administrator-overview-list">
            {recentTasks.length > 0 ? (
              recentTasks.slice(0, 5).map((task) => (
                <button
                  type="button"
                  key={task.task_id || task.id}
                  onClick={() =>
                    navigate("/administrator/tasks?tab=my")
                  }
                >
                  <div>
                    <strong>
                      {task.task_title ||
                        task.title ||
                        "Untitled Task"}
                    </strong>

                    <span>
                      {task.project_title || "No project"}
                    </span>
                  </div>

                  <em>
                    {statusLabels[
                      normalizeStatus(
                        task.status,
                        task.progress
                      )
                    ] ||
                      normalizeStatus(
                        task.status,
                        task.progress
                      )}
                  </em>
                </button>
              ))
            ) : (
              <div className="administrator-overview-empty">
                No recent tasks.
              </div>
            )}
          </div>
        </article>

        <article className="administrator-overview-panel">
          <div className="administrator-overview-panel-header">
            <div>
              <h2>Activity Log</h2>
              <p>
                Recent activity from your assigned work.
              </p>
            </div>
          </div>

          <div className="administrator-overview-list">
            {activityLog.length > 0 ? (
              activityLog.slice(0, 5).map((activity, index) => (
                <div
                  className="administrator-overview-activity-item"
                  key={
                    activity.activity_id ||
                    activity.log_id ||
                    activity.id ||
                    index
                  }
                >
                  <div className="administrator-overview-activity-icon">
                    <Clock3 size={16} />
                  </div>

                  <div>
                    <strong>
                      {activity.title ||
                        String(
                          activity.action_type ||
                            "Activity"
                        ).replaceAll("_", " ")}
                    </strong>

                    <span>
                      {activity.description ||
                        "No description"}
                    </span>

                    <small>
                      {activity.created_at ||
                        activity.created_date ||
                        activity.date ||
                        ""}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <div className="administrator-overview-empty">
                No recent activity.
              </div>
            )}
          </div>
        </article>
      </section>
    </div>
  );
};

export default AdministratorOverview;
