import { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  Download,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import EmployeeTasks from "../employee/employeeTasks";
import api from "../../api/axios";
import "./administratorTasks.css";

const ALL_TASK_COLUMNS = [
  {
    key: "todo",
    title: "To Do",
    subtitle: "Tasks that have not started",
  },
  {
    key: "in_progress",
    title: "In Progress",
    subtitle: "Tasks currently being worked on",
  },
  {
    key: "under_review",
    title: "Under Review",
    subtitle: "Tasks waiting for review",
  },
  {
    key: "completed",
    title: "Done",
    subtitle: "Tasks that are finished",
  },
  {
    key: "blocked",
    title: "Blocked / On Hold",
    subtitle: "Tasks that cannot continue",
  },
  {
    key: "rejected",
    title: "Rejected",
    subtitle: "Tasks rejected during review",
  },
];

const normalizeStatus = (status) => {
  const value = String(status || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  if (["completed", "complete", "done"].includes(value)) {
    return "completed";
  }

  if (["in_progress", "ongoing", "progress"].includes(value)) {
    return "in_progress";
  }

  if (["under_review", "review", "pending_review"].includes(value)) {
    return "under_review";
  }

  if (["blocked", "on_hold", "hold"].includes(value)) {
    return "blocked";
  }

  if (["rejected", "reject"].includes(value)) {
    return "rejected";
  }

  return "todo";
};

const getStatusLabel = (status) => {
  const normalized = normalizeStatus(status);

  if (normalized === "in_progress") return "In Progress";
  if (normalized === "under_review") return "Under Review";
  if (normalized === "completed") return "Done";
  if (normalized === "blocked") return "Blocked / On Hold";
  if (normalized === "rejected") return "Rejected";

  return "To Do";
};

const formatDate = (date) => {
  if (!date) return "-";

  const value = String(date).slice(0, 10);
  const parts = value.split("-");

  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "-";
  }

  return parsedDate.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const getAssignedNames = (task) => {
  return (
    task.assigned_names ||
    task.assigned_to_name ||
    task.employee_name ||
    task.assignee_name ||
    "-"
  );
};

const getAssignedEmails = (task) => {
  return (
    task.assigned_emails ||
    task.assigned_to_email ||
    task.employee_email ||
    task.assignee_email ||
    "-"
  );
};

const AdministratorTasks = () => {
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState("my");
  const [allTasks, setAllTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");

  const fetchAllTasks = async () => {
    try {
      setLoading(true);
      setMessage("");

      const response = await api.get("/administrator/tasks/all");

      setAllTasks(
        response.data?.tasks ||
          response.data?.main_tasks ||
          response.data?.data?.tasks ||
          []
      );
    } catch (error) {
      setMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to load all tasks."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "all") {
      fetchAllTasks();
    }
  }, [activeTab]);

  const filteredAllTasks = useMemo(() => {
    const value = search.toLowerCase().trim();

    if (!value) return allTasks;

    return allTasks.filter((task) => {
      return (
        String(task.task_title || "").toLowerCase().includes(value) ||
        String(task.task_description || "").toLowerCase().includes(value) ||
        String(task.project_title || "").toLowerCase().includes(value) ||
        String(task.status || "").toLowerCase().includes(value) ||
        String(task.priority || "").toLowerCase().includes(value) ||
        String(getAssignedNames(task)).toLowerCase().includes(value) ||
        String(getAssignedEmails(task)).toLowerCase().includes(value) ||
        String(task.created_by_name || "").toLowerCase().includes(value) ||
        String(task.created_by_email || "").toLowerCase().includes(value)
      );
    });
  }, [allTasks, search]);

  const groupedAllTasks = useMemo(() => {
    const grouped = {
      todo: [],
      in_progress: [],
      under_review: [],
      completed: [],
      blocked: [],
      rejected: [],
    };

    filteredAllTasks.forEach((task) => {
      grouped[normalizeStatus(task.status)].push(task);
    });

    return grouped;
  }, [filteredAllTasks]);

  const exportTasks = async () => {
    try {
      setMessage("");

      const response = await api.get("/administrator/tasks/export", {
        responseType: "blob",
      });

      const blob = new Blob([response.data], {
        type: "text/csv;charset=utf-8;",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.setAttribute("download", "valencia-rms-tasks.csv");

      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to export tasks."
      );
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const importTasks = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setImporting(true);
      setMessage("");

      const response = await api.post(
        "/administrator/tasks/import",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      setMessage(
        `${response.data.message || "Import completed."} Imported Tasks: ${
          response.data.inserted_tasks || 0
        }, Skipped Rows: ${response.data.skipped_rows || 0}, Missing Projects: ${
          response.data.missing_projects || 0
        }, Missing Assigned Users: ${
          response.data.missing_assigned_users || 0
        }`
      );

      await fetchAllTasks();
    } catch (error) {
      setMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to import tasks."
      );
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  const renderAllTaskCard = (task) => {
    return (
      <article
        className="administrator-task-card"
        key={task.task_id}
        onClick={() => setSelectedTask(task)}
      >
        <div className="administrator-task-card-header">
          <div className="administrator-task-card-icon">
            <ClipboardList size={17} />
          </div>

          <h3>{task.task_title || "Untitled Task"}</h3>
        </div>

        <div className="administrator-task-card-field">
          <span>Project</span>
          <strong>{task.project_title || "-"}</strong>
        </div>

        <div className="administrator-task-card-field">
          <span>Assigned</span>
          <strong>{getAssignedNames(task)}</strong>
        </div>

        <div className="administrator-task-card-meta">
          <span>{getStatusLabel(task.status)}</span>
          <span>{task.priority || "-"}</span>
        </div>
      </article>
    );
  };

  return (
    <div className="administrator-tasks-page">
      <div className="administrator-tasks-header">
        <div>
          <h1>Tasks</h1>
          <p>
            Work on your own assigned tasks and view all company tasks.
          </p>
        </div>

        {activeTab === "all" && (
          <div className="administrator-tasks-actions">
            <button
              type="button"
              className="administrator-task-import-btn"
              onClick={handleImportClick}
              disabled={importing}
            >
              <Upload size={15} />
              {importing ? "Importing..." : "Import CSV"}
            </button>

            <button
              type="button"
              className="administrator-task-action-btn"
              onClick={exportTasks}
            >
              <Download size={15} />
              Export CSV
            </button>

            <button
              type="button"
              className="administrator-task-action-btn"
              onClick={fetchAllTasks}
              disabled={loading}
            >
              <RefreshCw size={15} />
              {loading ? "Refreshing..." : "Refresh"}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              hidden
              onChange={importTasks}
            />
          </div>
        )}
      </div>

      <div className="administrator-task-tabs">
        <button
          type="button"
          className={activeTab === "my" ? "active" : ""}
          onClick={() => setActiveTab("my")}
        >
          My Tasks
        </button>

        <button
          type="button"
          className={activeTab === "all" ? "active" : ""}
          onClick={() => setActiveTab("all")}
        >
          All Tasks
        </button>
      </div>

      {message && (
        <div className="administrator-tasks-message">{message}</div>
      )}

      {activeTab === "my" ? (
        <div className="administrator-my-tasks-employee-wrapper">
          <EmployeeTasks />
        </div>
      ) : (
        <>
          <div className="administrator-tasks-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tasks, projects, employees or status..."
            />
          </div>

          {loading ? (
            <div className="administrator-tasks-loader">
              Loading all tasks...
            </div>
          ) : (
            <div className="administrator-tasks-kanban administrator-all-tasks-kanban">
              {ALL_TASK_COLUMNS.map((column) => (
                <section
                  className="administrator-task-column"
                  key={column.key}
                >
                  <div className="administrator-task-column-header">
                    <div>
                      <h2>{column.title}</h2>
                      <p>{column.subtitle}</p>
                    </div>
                    <span>{groupedAllTasks[column.key]?.length || 0}</span>
                  </div>

                  <div className="administrator-task-column-body">
                    {groupedAllTasks[column.key]?.length > 0 ? (
                      groupedAllTasks[column.key].map(renderAllTaskCard)
                    ) : (
                      <div className="administrator-task-empty">
                        No tasks here.
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}

          <div className="administrator-task-csv-help">
            <h3>CSV Import Format</h3>
            <p>
              Use these columns: <strong>task_title, project_title,
              assigned_employee_email, created_by_email, status, start_date,
              due_date</strong>
            </p>
          </div>
        </>
      )}

      {activeTab === "all" && selectedTask && (
        <div
          className="administrator-task-modal-overlay"
          onClick={() => setSelectedTask(null)}
        >
          <div
            className="administrator-task-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="administrator-task-modal-header">
              <div>
                <h2>{selectedTask.task_title || "Untitled Task"}</h2>
                <p>
                  {selectedTask.task_description ||
                    "No task description added."}
                </p>
              </div>

              <button type="button" onClick={() => setSelectedTask(null)}>
                <X size={19} />
              </button>
            </div>

            <div className="administrator-task-modal-grid">
              <div>
                <span>Project</span>
                <strong>{selectedTask.project_title || "-"}</strong>
              </div>

              <div>
                <span>Status</span>
                <strong>{getStatusLabel(selectedTask.status)}</strong>
              </div>

              <div>
                <span>Priority</span>
                <strong>{selectedTask.priority || "-"}</strong>
              </div>

              <div>
                <span>Progress</span>
                <strong>{selectedTask.progress || 0}%</strong>
              </div>

              <div>
                <span>Assigned Employee</span>
                <strong>{getAssignedNames(selectedTask)}</strong>
              </div>

              <div>
                <span>Assigned Email</span>
                <strong>{getAssignedEmails(selectedTask)}</strong>
              </div>

              <div>
                <span>Created By</span>
                <strong>{selectedTask.created_by_name || "-"}</strong>
              </div>

              <div>
                <span>Start Date</span>
                <strong>{formatDate(selectedTask.start_date)}</strong>
              </div>

              <div>
                <span>Due Date</span>
                <strong>{formatDate(selectedTask.due_date)}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdministratorTasks;
