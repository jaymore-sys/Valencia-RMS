import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarCheck,
  ClipboardList,
  FolderKanban,
  RefreshCw,
} from "lucide-react";
import api from "../../api/axios";
import "../../layouts/Employeelayout.css";

const getArray = (...values) => {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }

  return [];
};

const getNumber = (...values) => {
  for (const value of values) {
    const number = Number(value);

    if (!Number.isNaN(number) && value !== undefined && value !== null) {
      return number;
    }
  }

  return 0;
};

const formatDate = (value) => {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
};

const statusLabel = (status) => {
  const value = String(status || "").toLowerCase();

  if (value === "not_started") return "To Do";
  if (value === "todo") return "To Do";
  if (value === "to_do") return "To Do";
  if (value === "in_progress") return "In Progress";
  if (value === "ongoing") return "In Progress";
  if (value === "under_review") return "Under Review";
  if (value === "done") return "Done";
  if (value === "completed") return "Done";
  if (value === "rejected") return "Rejected";
  if (value === "on_hold") return "On Hold";

  return status || "-";
};

const getProgress = (item) => {
  return Math.max(
    0,
    Math.min(
      100,
      getNumber(
        item?.progress,
        item?.task_progress,
        item?.overall_progress,
        item?.employee_progress,
        item?.completion_percentage
      )
    )
  );
};

const getTaskTitle = (task) => {
  return (
    task?.task_title ||
    task?.title ||
    task?.task_name ||
    task?.main_task_title ||
    "Task"
  );
};

const getProjectTitle = (item) => {
  return (
    item?.project_title ||
    item?.project_name ||
    item?.title ||
    item?.name ||
    "Project"
  );
};

const EmployeeOverview = () => {
  const navigate = useNavigate();

  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setMessage("");

      const endpoints = [
        "/employee-overview",
        "/employee-overview/overview",
        "/employee-overview/me",
      ];

      let response = null;
      let lastError = null;

      for (const endpoint of endpoints) {
        try {
          response = await api.get(endpoint);
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!response) {
        throw lastError || new Error("Failed to load employee overview.");
      }

      setOverview(response.data);
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to load employee overview."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const data = useMemo(() => {
    return overview?.data || overview?.overview || overview || {};
  }, [overview]);

  const stats = data?.stats || data?.summary || {};

  const tasks = getArray(
    data?.recent_tasks,
    data?.tasks,
    data?.assigned_tasks,
    data?.my_tasks
  );

  const projects = getArray(
    data?.projects,
    data?.assigned_projects,
    data?.my_projects,
    data?.recent_projects
  );

  const activities = getArray(
    data?.activity_logs,
    data?.recent_activity,
    data?.activities,
    data?.logs
  );

  const attendance =
    data?.attendance_summary ||
    data?.attendance ||
    data?.my_attendance ||
    data?.weekly_attendance ||
    {};

  const totalProjects = useMemo(() => {
    const directTotal = getNumber(
      stats?.total_projects,
      stats?.my_total_projects,
      data?.total_projects,
      data?.my_total_projects
    );

    if (directTotal > 0) return directTotal;

    const projectKeys = new Set();

    projects.forEach((project) => {
      const key =
        project?.project_id ||
        project?.id ||
        project?.project_title ||
        project?.project_name;

      if (key) projectKeys.add(key);
    });

    tasks.forEach((task) => {
      const key =
        task?.project_id ||
        task?.project_title ||
        task?.project_name;

      if (key) projectKeys.add(key);
    });

    return projectKeys.size;
  }, [stats, data, projects, tasks]);

  const totalTasks = useMemo(() => {
    const directTotal = getNumber(
      stats?.total_tasks,
      stats?.my_total_tasks,
      data?.total_tasks,
      data?.my_total_tasks
    );

    if (directTotal > 0) return directTotal;

    return tasks.length;
  }, [stats, data, tasks]);

  const weeklyAttendance = useMemo(() => {
    return getNumber(
      stats?.weekly_attendance,
      stats?.weekly_attendance_percentage,
      stats?.attendance_percentage,
      data?.weekly_attendance,
      data?.weekly_attendance_percentage,
      attendance?.weekly_attendance,
      attendance?.weekly_attendance_percentage,
      attendance?.attendance_percentage,
      attendance?.present_percentage
    );
  }, [stats, data, attendance]);

  const recentTasks = tasks.slice(0, 6);
  const recentActivities = activities.slice(0, 6);

  if (loading) {
    return (
      <div className="employee-overview-page">
        <div className="employee-overview-card">
          <strong>Loading employee overview...</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="employee-overview-page">
      <div className="employee-overview-top-actions">
        <button
          type="button"
          className="employee-overview-refresh-btn"
          onClick={fetchOverview}
        >
          <RefreshCw size={20} />
          Refresh
        </button>
      </div>

      {message && <div className="employee-overview-error">{message}</div>}

      <section className="employee-overview-stats-grid employee-overview-stats-grid-final">
        <button
          type="button"
          className="employee-overview-stat-card-final"
          onClick={() => navigate("/employee/projects")}
        >
          <strong>{totalProjects}</strong>

          <span>
            <FolderKanban size={22} />
            Total Projects
          </span>
        </button>

        <button
          type="button"
          className="employee-overview-stat-card-final"
          onClick={() => navigate("/employee/tasks")}
        >
          <strong>{totalTasks}</strong>

          <span>
            <ClipboardList size={22} />
            Total Tasks
          </span>
        </button>

        <button
          type="button"
          className="employee-overview-stat-card-final"
          onClick={() => navigate("/employee/attendance")}
        >
          <strong>{Math.round(weeklyAttendance)}%</strong>

          <span>
            <CalendarCheck size={22} />
            Weekly Attendance
          </span>
        </button>
      </section>

      <section className="employee-overview-main-grid">
        <div className="employee-overview-card">
          <div className="employee-overview-card-header">
            <h2>Recent Tasks</h2>
            <p>Your latest assigned tasks</p>
          </div>

          {recentTasks.length > 0 ? (
            <div className="employee-task-list">
              {recentTasks.map((task, index) => (
                <div
                  className="employee-task-row"
                  key={task.task_id || task.id || index}
                >
                  <div>
                    <h4>{getTaskTitle(task)}</h4>
                    <p>{getProjectTitle(task)}</p>
                    <small>
                      {formatDate(task.start_date || task.project_start_date)}{" "}
                      to{" "}
                      {formatDate(
                        task.due_date ||
                          task.end_date ||
                          task.project_end_date
                      )}
                    </small>
                  </div>

                  <div>
                    <span>{statusLabel(task.status_group || task.status)}</span>
                    <p>{getProgress(task)}%</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="employee-empty-state">No recent tasks found.</div>
          )}
        </div>

        <div className="employee-overview-card">
          <div className="employee-overview-card-header">
            <h2>Activity Log</h2>
            <p>Recent activity related to your tasks</p>
          </div>

          {recentActivities.length > 0 ? (
            <div className="employee-activity-list">
              {recentActivities.map((activity, index) => (
                <div
                  className="employee-activity-row"
                  key={activity.log_id || activity.activity_id || index}
                >
                  <div className="employee-activity-dot" />

                  <div>
                    <h4>
                      {activity.action_type ||
                        activity.type ||
                        activity.title ||
                        "Activity"}
                    </h4>

                    <p>
                      {activity.description ||
                        activity.message ||
                        activity.details ||
                        "-"}
                    </p>

                    <span>
                      {activity.created_at ||
                        activity.created_date ||
                        activity.date ||
                        ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="employee-empty-state">No activity yet.</div>
          )}
        </div>
      </section>
    </div>
  );
};

export default EmployeeOverview;