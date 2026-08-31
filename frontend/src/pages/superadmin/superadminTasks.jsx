import { useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Clock3,
  PauseCircle,
  RefreshCw,
  Search,
  Users,
  X,
  XCircle,
} from "lucide-react";

import api from "../../api/axios";

import "./superadminTasks.css";

/* =========================================================
   KANBAN COLUMNS
========================================================= */

const STATUS_COLUMNS = [
  {
    key: "not_started",
    label: "To Do",
    icon: CircleDot,
  },
  {
    key: "in_progress",
    label: "In Progress",
    icon: Clock3,
  },
  {
    key: "under_review",
    label: "Under Review",
    icon: Search,
  },
  {
    key: "completed",
    label: "Completed",
    icon: CheckCircle2,
  },
  {
    key: "rejected",
    label: "Rejected",
    icon: XCircle,
  },
  {
    key: "blocked",
    label: "Blocked",
    icon: PauseCircle,
  },
];

/* =========================================================
   STATUS NORMALIZATION
========================================================= */

const normalizeStatus = (status) => {
  const value = String(status || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  if (
    [
      "todo",
      "to_do",
      "pending",
      "not_started",
      "not-started",
    ].includes(value)
  ) {
    return "not_started";
  }

  if (
    [
      "ongoing",
      "progress",
      "in_progress",
    ].includes(value)
  ) {
    return "in_progress";
  }

  if (
    [
      "review",
      "under_review",
      "pending_review",
    ].includes(value)
  ) {
    return "under_review";
  }

  if (
    [
      "done",
      "complete",
      "completed",
    ].includes(value)
  ) {
    return "completed";
  }

  if (
    [
      "on_hold",
      "hold",
      "blocked",
    ].includes(value)
  ) {
    return "blocked";
  }

  if (
    [
      "reject",
      "rejected",
    ].includes(value)
  ) {
    return "rejected";
  }

  return value || "not_started";
};

const statusLabel = (status) => {
  const normalized =
    normalizeStatus(status);

  return (
    STATUS_COLUMNS.find(
      (column) =>
        column.key === normalized
    )?.label ||
    String(status || "To Do")
  );
};

/* =========================================================
   DATE
========================================================= */

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value).slice(
      0,
      10
    );
  }

  return date.toLocaleDateString(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
};

/* =========================================================
   PROGRESS
========================================================= */

const getSafeProgress = (
  value
) => {
  const progress =
    Number(value || 0);

  if (
    Number.isNaN(progress)
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      progress
    )
  );
};

/* =========================================================
   ASSIGNEES
========================================================= */

const getTaskAssignees = (
  task
) => {
  if (
    Array.isArray(
      task.assignees
    ) &&
    task.assignees.length
  ) {
    return task.assignees;
  }

  const ids =
    String(
      task.assigned_user_ids ||
        task.assigned_to_user_id ||
        ""
    )
      .split(",")
      .map((value) =>
        value.trim()
      )
      .filter(Boolean);

  const names =
    String(
      task.assigned_names ||
        task.assignee_name ||
        ""
    )
      .split(",")
      .map((value) =>
        value.trim()
      )
      .filter(Boolean);

  const emails =
    String(
      task.assigned_emails ||
        task.assignee_email ||
        ""
    )
      .split(",")
      .map((value) =>
        value.trim()
      )
      .filter(Boolean);

  return names.map(
    (name, index) => ({
      user_id:
        ids[index] ||
        `${name}-${index}`,

      full_name: name,

      email:
        emails[index] || "",
    })
  );
};

const getAssignedNames = (
  task
) => {
  if (
    task.assigned_names
  ) {
    return task.assigned_names;
  }

  if (
    task.assignee_name
  ) {
    return task.assignee_name;
  }

  const assignees =
    getTaskAssignees(task);

  return (
    assignees
      .map(
        (user) =>
          user.full_name
      )
      .filter(Boolean)
      .join(", ") || "-"
  );
};

/* =========================================================
   OVERDUE
========================================================= */

const isTaskOverdue = (
  task
) => {
  const normalizedStatus =
    normalizeStatus(
      task.status_group ||
        task.status
    );

  if (
    normalizedStatus ===
    "completed"
  ) {
    return false;
  }

  if (!task.due_date) {
    return false;
  }

  const dueDate =
    new Date(
      task.due_date
    );

  if (
    Number.isNaN(
      dueDate.getTime()
    )
  ) {
    return false;
  }

  dueDate.setHours(
    23,
    59,
    59,
    999
  );

  return (
    dueDate.getTime() <
    Date.now()
  );
};

/* =========================================================
   MAIN COMPONENT
========================================================= */

const SuperadminTasks = () => {
  const [
    tasks,
    setTasks,
  ] = useState([]);

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    department,
    setDepartment,
  ] = useState("all");

  const [
    assignee,
    setAssignee,
  ] = useState("all");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    selectedTask,
    setSelectedTask,
  ] = useState(null);

  /* =========================================================
     FETCH TASKS
  ========================================================= */

  const fetchTasks =
    async () => {
      try {
        setLoading(true);

        setMessage("");

        const response =
          await api.get(
            "/superadmin/tasks"
          );

        const rows =
          response.data
            ?.tasks || [];

        setTasks(rows);
      } catch (error) {
        console.error(
          "Superadmin tasks fetch error:",
          error
        );

        setMessage(
          error.response?.data
            ?.message ||
            error.response?.data
              ?.error ||
            error.response?.data
              ?.sqlMessage ||
            "Failed to load tasks."
        );
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    fetchTasks();
  }, []);

  /* =========================================================
     DEPARTMENT FILTER VALUES
  ========================================================= */

  const departments =
    useMemo(() => {
      return Array.from(
        new Set(
          tasks
            .map(
              (task) =>
                task.department_name
            )
            .filter(Boolean)
        )
      ).sort((a, b) =>
        String(a).localeCompare(
          String(b)
        )
      );
    }, [tasks]);

  /* =========================================================
     ASSIGNEE FILTER VALUES

     Uses actual employee IDs,
     therefore multiple-assignee tasks
     work correctly.
  ========================================================= */

  const assignees =
    useMemo(() => {
      const map =
        new Map();

      tasks.forEach(
        (task) => {
          getTaskAssignees(
            task
          ).forEach(
            (user) => {
              const id =
                String(
                  user.user_id ||
                    ""
                );

              if (
                !id ||
                !user.full_name
              ) {
                return;
              }

              if (
                !map.has(id)
              ) {
                map.set(
                  id,
                  {
                    user_id: id,

                    full_name:
                      user.full_name,
                  }
                );
              }
            }
          );
        }
      );

      return Array.from(
        map.values()
      ).sort((a, b) =>
        String(
          a.full_name
        ).localeCompare(
          String(
            b.full_name
          )
        )
      );
    }, [tasks]);

  /* =========================================================
     FILTER TASKS
  ========================================================= */

  const filteredTasks =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase();

      return tasks.filter(
        (task) => {
          const assignedNames =
            getAssignedNames(
              task
            );

          const searchable =
            [
              task.task_title,
              task.task_description,
              task.project_title,
              assignedNames,
              task.assignee_email,
              task.assigned_emails,
              task.assigned_by_name,
              task.assigned_by_email,
              task.department_name,
              task.project_division,
              task.task_type,
              task.priority,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

          const matchesSearch =
            !term ||
            searchable.includes(
              term
            );

          const matchesDepartment =
            department ===
              "all" ||
            task.department_name ===
              department;

          let matchesAssignee =
            true;

          if (
            assignee !== "all"
          ) {
            const taskAssigneeIds =
              getTaskAssignees(
                task
              ).map((user) =>
                String(
                  user.user_id
                )
              );

            matchesAssignee =
              taskAssigneeIds.includes(
                String(
                  assignee
                )
              );
          }

          return (
            matchesSearch &&
            matchesDepartment &&
            matchesAssignee
          );
        }
      );
    }, [
      tasks,
      search,
      department,
      assignee,
    ]);

  /* =========================================================
     GROUP TASKS
  ========================================================= */

  const groupedTasks =
    useMemo(() => {
      return STATUS_COLUMNS.reduce(
        (
          result,
          column
        ) => {
          result[column.key] =
            filteredTasks.filter(
              (task) =>
                normalizeStatus(
                  task.status_group ||
                    task.status
                ) ===
                column.key
            );

          return result;
        },
        {}
      );
    }, [filteredTasks]);

  /* =========================================================
     PAGE
  ========================================================= */

  return (
    <div className="sa-tasks-page">
      {/* HEADER */}

      <header className="sa-tasks-header">
        <div>
          <h1>
            All Tasks
          </h1>

          <p>
            View every Main Task
            across projects,
            departments and employees.
            Click a task to view its
            complete details and
            subtasks.
          </p>
        </div>

        <button
          type="button"
          className="sa-tasks-refresh-btn"
          onClick={
            fetchTasks
          }
        >
          <RefreshCw
            size={18}
          />

          Refresh
        </button>
      </header>

      {/* ERROR */}

      {message && (
        <div className="sa-tasks-message">
          {message}
        </div>
      )}

      {/* FILTER BAR */}

      <section className="sa-tasks-toolbar">
        <label className="sa-tasks-search">
          <Search
            size={18}
          />

          <input
            type="search"
            value={search}
            onChange={(
              event
            ) =>
              setSearch(
                event.target
                  .value
              )
            }
            placeholder="Search task, project, employee, assigned by..."
          />
        </label>

        <select
          value={department}
          onChange={(
            event
          ) =>
            setDepartment(
              event.target
                .value
            )
          }
        >
          <option value="all">
            All Departments
          </option>

          {departments.map(
            (item) => (
              <option
                key={item}
                value={item}
              >
                {item}
              </option>
            )
          )}
        </select>

        <select
          value={assignee}
          onChange={(
            event
          ) =>
            setAssignee(
              event.target
                .value
            )
          }
        >
          <option value="all">
            All Assignees
          </option>

          {assignees.map(
            (user) => (
              <option
                key={
                  user.user_id
                }
                value={
                  user.user_id
                }
              >
                {
                  user.full_name
                }
              </option>
            )
          )}
        </select>
      </section>

      {/* KANBAN */}

      {loading ? (
        <div className="sa-tasks-empty">
          Loading tasks...
        </div>
      ) : (
        <section
          className="sa-tasks-board"
          aria-label="Superadmin Task Kanban Board"
        >
          {STATUS_COLUMNS.map(
            (column) => {
              const ColumnIcon =
                column.icon;

              const columnTasks =
                groupedTasks[
                  column.key
                ] || [];

              return (
                <article
                  key={
                    column.key
                  }
                  className={`sa-tasks-column sa-tasks-column-${column.key}`}
                >
                  {/* COLUMN HEADER */}

                  <div className="sa-tasks-column-header">
                    <div>
                      <span className="sa-tasks-column-icon">
                        <ColumnIcon
                          size={
                            18
                          }
                        />
                      </span>

                      <h2>
                        {
                          column.label
                        }
                      </h2>
                    </div>

                    <span className="sa-tasks-column-count">
                      {
                        columnTasks.length
                      }
                    </span>
                  </div>

                  {/* TASKS */}

                  <div className="sa-tasks-column-list">
                    {columnTasks.map(
                      (task) => (
                        <TaskCard
                          key={
                            task.task_id
                          }
                          task={
                            task
                          }
                          onClick={() =>
                            setSelectedTask(
                              task
                            )
                          }
                        />
                      )
                    )}

                    {!columnTasks.length && (
                      <div className="sa-tasks-column-empty">
                        No{" "}
                        {column.label.toLowerCase()}{" "}
                        tasks.
                      </div>
                    )}
                  </div>
                </article>
              );
            }
          )}
        </section>
      )}

      {/* TASK DETAILS */}

      {selectedTask && (
        <TaskDetailsModal
          task={
            selectedTask
          }
          onClose={() =>
            setSelectedTask(
              null
            )
          }
        />
      )}
    </div>
  );
};

/* =========================================================
   TASK CARD
========================================================= */

const TaskCard = ({
  task,
  onClick,
}) => {
  const progress =
    getSafeProgress(
      task.progress
    );

  const overdue =
    isTaskOverdue(task);

  const assignedNames =
    getAssignedNames(task);

  return (
    <button
      type="button"
      className="sa-task-kanban-card"
      onClick={onClick}
    >
      {/* TITLE */}

      <div className="sa-task-card-title-row">
        <span className="sa-task-card-title-icon">
          <ClipboardList
            size={18}
          />
        </span>

        <h3>
          {task.task_title ||
            "Untitled Task"}
        </h3>

        {overdue && (
          <span className="sa-task-overdue-badge">
            <AlertTriangle
              size={12}
            />

            Overdue
          </span>
        )}
      </div>

      {/* PROJECT */}

      <div className="sa-task-card-info-box">
        <span>
          Project
        </span>

        <strong>
          {task.project_title ||
            "No Project"}
        </strong>
      </div>

      {/* DEPARTMENT */}

      <div className="sa-task-card-info-box">
        <span>
          Department
        </span>

        <strong>
          {task.department_name ||
            "-"}
        </strong>
      </div>

      {/* ASSIGNEES */}

      <div className="sa-task-card-info-box">
        <span>
          Assigned Employee
          {getTaskAssignees(
            task
          ).length > 1
            ? "s"
            : ""}
        </span>

        <strong>
          {assignedNames}
        </strong>
      </div>

      {/* DATES */}

      <div className="sa-task-card-date-grid">
        <div>
          <span>
            Start Date
          </span>

          <strong>
            {formatDate(
              task.start_date
            )}
          </strong>
        </div>

        <div>
          <span>
            Due Date
          </span>

          <strong>
            {formatDate(
              task.due_date
            )}
          </strong>
        </div>
      </div>

      {/* PROGRESS */}

      <div className="sa-task-card-progress">
        <div>
          <span>
            Progress
          </span>

          <strong>
            {progress}%
          </strong>
        </div>

        <progress
          value={progress}
          max="100"
        />
      </div>

      <div className="sa-task-card-bottom-row">
        <span>
          Subtasks{" "}
          {task.completed_subtasks ||
            0}
          /
          {task.total_subtasks ||
            0}
        </span>

        <span>
          View Details
        </span>
      </div>
    </button>
  );
};

/* =========================================================
   TASK DETAILS MODAL
========================================================= */

const TaskDetailsModal = ({
  task,
  onClose,
}) => {
  const progress =
    getSafeProgress(
      task.progress
    );

  const overdue =
    isTaskOverdue(task);

  const assignees =
    getTaskAssignees(task);

  return (
    <div
      className="sa-task-modal-backdrop"
      onMouseDown={(
        event
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div className="sa-task-modal">
        {/* HEADER */}

        <div className="sa-task-modal-header">
          <div>
            <div className="sa-task-modal-title-row">
              <h2>
                {task.task_title ||
                  "Task Details"}
              </h2>

              {overdue && (
                <span className="sa-task-overdue-badge">
                  <AlertTriangle
                    size={12}
                  />

                  Overdue
                </span>
              )}
            </div>

            <p>
              {task.project_title ||
                "No Project"}
            </p>
          </div>

          <button
            type="button"
            className="sa-task-modal-close"
            onClick={onClose}
          >
            <X size={18} />

            Close
          </button>
        </div>

        {/* DETAILS */}

        <div className="sa-task-modal-grid">
          <DetailBox
            label="Status"
            value={statusLabel(
              task.status_group ||
                task.status
            )}
          />

          <DetailBox
            label="Progress"
            value={`${progress}%`}
          />

          <DetailBox
            label="Department"
            value={
              task.department_name
            }
          />

          <DetailBox
            label="Division"
            value={
              task.project_division
            }
          />

          <DetailBox
            label="Priority"
            value={
              task.priority
            }
          />

          <DetailBox
            label="Assigned By"
            value={
              task.assigned_by_name
            }
          />

          <DetailBox
            label="Assigned By Email"
            value={
              task.assigned_by_email
            }
          />

          <DetailBox
            label="Start Date"
            value={formatDate(
              task.start_date
            )}
          />

          <DetailBox
            label="Due Date"
            value={formatDate(
              task.due_date
            )}
          />

          <DetailBox
            label="Subtasks"
            value={`${
              task.completed_subtasks ||
              0
            }/${
              task.total_subtasks ||
              0
            }`}
          />
        </div>

        {/* PROGRESS */}

        <div className="sa-task-modal-progress">
          <progress
            value={progress}
            max="100"
          />

          <span>
            Task Progress:{" "}
            {progress}%
          </span>
        </div>

        {/* ASSIGNEES */}

        <section className="sa-task-modal-section">
          <h3 className="sa-task-modal-section-title">
            <Users
              size={19}
            />

            Assigned Employees
          </h3>

          {assignees.length ? (
            <div className="sa-task-assignee-grid">
              {assignees.map(
                (
                  user,
                  index
                ) => (
                  <div
                    className="sa-task-assignee-card"
                    key={
                      user.user_id ||
                      `${user.full_name}-${index}`
                    }
                  >
                    <div className="sa-task-assignee-icon">
                      <Users
                        size={17}
                      />
                    </div>

                    <div>
                      <strong>
                        {user.full_name ||
                          "-"}
                      </strong>

                      <span>
                        {user.email ||
                          "-"}
                      </span>

                      {user.department_name && (
                        <small>
                          {
                            user.department_name
                          }
                        </small>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="sa-task-modal-empty">
              No assignees
              found.
            </div>
          )}
        </section>

        {/* DESCRIPTION */}

        <section className="sa-task-modal-section">
          <h3>
            Description
          </h3>

          <p>
            {task.task_description ||
              "No description added."}
          </p>
        </section>

        {/* SUBTASKS */}

        <section className="sa-task-modal-section">
          <h3>
            Subtasks
          </h3>

          {task.subtasks
            ?.length ? (
            <div className="sa-task-modal-subtasks">
              {task.subtasks.map(
                (subtask) => {
                  const completed =
                    Number(
                      subtask.is_checked ||
                        0
                    ) === 1 ||
                    normalizeStatus(
                      subtask.status
                    ) ===
                      "completed" ||
                    Number(
                      subtask.progress ||
                        0
                    ) >= 100;

                  return (
                    <div
                      className="sa-task-modal-subtask"
                      key={
                        subtask.task_id
                      }
                    >
                      <span
                        className={`sa-task-modal-subtask-dot ${
                          completed
                            ? "done"
                            : ""
                        }`}
                      />

                      <div>
                        <strong>
                          {subtask.task_title ||
                            "-"}
                        </strong>

                        <p>
                          {formatDate(
                            subtask.start_date
                          )}{" "}
                          to{" "}
                          {formatDate(
                            subtask.due_date
                          )}
                        </p>
                      </div>

                      <span
                        className={`sa-task-modal-subtask-status ${
                          completed
                            ? "completed"
                            : ""
                        }`}
                      >
                        {completed
                          ? "Completed"
                          : "Pending"}
                      </span>
                    </div>
                  );
                }
              )}
            </div>
          ) : (
            <div className="sa-task-modal-empty">
              No subtasks found.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

/* =========================================================
   DETAIL BOX
========================================================= */

const DetailBox = ({
  label,
  value,
}) => {
  return (
    <div className="sa-task-detail-box">
      <span>
        {label}
      </span>

      <strong>
        {value || "-"}
      </strong>
    </div>
  );
};

export default SuperadminTasks;