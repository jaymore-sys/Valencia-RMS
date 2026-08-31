import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Clock3,
  FolderKanban,
  PauseCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
  XCircle,
} from "lucide-react";

import api from "../../api/axios";
import "./superadminProjects.css";

/* =========================================================
   PROJECT DIVISIONS
========================================================= */

const PROJECT_DIVISIONS = [
  "POS",
  "NutraCare",
  "ADV",
  "Cans",
  "PET",
  "Crunzo",
  "Healthybites",
];

/* =========================================================
   PROJECT COLUMNS
========================================================= */

const PROJECT_COLUMNS = [
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
    key: "on_hold",
    label: "On Hold",
    icon: PauseCircle,
  },
];

/* =========================================================
   EMPTY FORMS
========================================================= */

const EMPTY_PROJECT_FORM = {
  project_title: "",
  project_description: "",
  department_id: "",
  division: "",
  priority: "medium",
  start_date: "",
  due_date: "",
  assignee_ids: [],
};

const EMPTY_MAIN_TASK_FORM = {
  task_title: "",
  task_description: "",
  priority: "medium",
  start_date: "",
  due_date: "",
  assignee_ids: [],
};

/* =========================================================
   HELPERS
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
      "hold",
      "on_hold",
      "blocked",
    ].includes(value)
  ) {
    return "on_hold";
  }

  if (
    [
      "cancelled",
      "canceled",
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
    PROJECT_COLUMNS.find(
      (column) =>
        column.key === normalized
    )?.label ||
    String(status || "To Do")
  );
};

const taskStatusLabel = (status) => {
  const normalized =
    normalizeStatus(status);

  if (
    normalized === "not_started"
  ) {
    return "To Do";
  }

  if (
    normalized === "in_progress"
  ) {
    return "In Progress";
  }

  if (
    normalized === "under_review"
  ) {
    return "Under Review";
  }

  if (
    normalized === "completed"
  ) {
    return "Completed";
  }

  if (
    normalized === "on_hold"
  ) {
    return "On Hold";
  }

  if (
    normalized === "rejected"
  ) {
    return "Rejected";
  }

  return status || "-";
};

const formatDate = (value) => {
  if (!value) return "-";

  const date = new Date(value);

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

const normalizeDateForInput = (
  value
) => {
  if (!value) return "";

  const stringValue =
    String(value);

  if (
    /^\d{4}-\d{2}-\d{2}/.test(
      stringValue
    )
  ) {
    return stringValue.slice(
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

const getNumber = (...values) => {
  for (const value of values) {
    const number =
      Number(value);

    if (
      !Number.isNaN(number)
    ) {
      return Math.max(
        0,
        Math.min(
          100,
          number
        )
      );
    }
  }

  return 0;
};

const getUserId = (user) => {
  return (
    user?.user_id ||
    user?.id ||
    user?.employee_id ||
    ""
  );
};

const getUserName = (user) => {
  return (
    user?.full_name ||
    user?.name ||
    user?.employee_name ||
    "-"
  );
};

const isProjectOverdue = (
  project
) => {
  if (
    normalizeStatus(
      project.normalized_status ||
        project.status
    ) === "completed"
  ) {
    return false;
  }

  const value =
    project.due_date ||
    project.end_date ||
    project.project_end_date;

  if (!value) {
    return false;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return false;
  }

  date.setHours(
    23,
    59,
    59,
    999
  );

  return (
    date.getTime() <
    Date.now()
  );
};

/* =========================================================
   MAIN PAGE
========================================================= */

const SuperadminProjects = () => {
  const [projects, setProjects] =
    useState([]);

  const [users, setUsers] =
    useState([]);

  const [
    departments,
    setDepartments,
  ] = useState([]);

  const [
    divisions,
    setDivisions,
  ] = useState(
    PROJECT_DIVISIONS
  );

  const [search, setSearch] =
    useState("");

  const [
    departmentFilter,
    setDepartmentFilter,
  ] = useState("all");

  const [
    creatorFilter,
    setCreatorFilter,
  ] = useState("all");

  const [loading, setLoading] =
    useState(true);

  const [
    detailsLoading,
    setDetailsLoading,
  ] = useState(false);

  const [
    actionLoading,
    setActionLoading,
  ] = useState(false);

  const [message, setMessage] =
    useState("");

  const [
    messageType,
    setMessageType,
  ] = useState("error");

  const [
    selectedProject,
    setSelectedProject,
  ] = useState(null);

  /* ASSIGN PROJECT */

  const [
    showAssignProjectModal,
    setShowAssignProjectModal,
  ] = useState(false);

  const [
    newProject,
    setNewProject,
  ] = useState({
    ...EMPTY_PROJECT_FORM,
  });

  const [
    projectAssigneeSearch,
    setProjectAssigneeSearch,
  ] = useState("");

  /* MANAGE ASSIGNEES */

  const [
    showManageAssignees,
    setShowManageAssignees,
  ] = useState(false);

  const [
    managedAssigneeIds,
    setManagedAssigneeIds,
  ] = useState([]);

  const [
    manageAssigneeSearch,
    setManageAssigneeSearch,
  ] = useState("");

  /* MAIN TASK */

  const [
    newMainTask,
    setNewMainTask,
  ] = useState({
    ...EMPTY_MAIN_TASK_FORM,
  });

  /* =========================================================
     FETCH PROJECTS
  ========================================================= */

  const fetchProjects =
    async ({
      clearMessage = true,
    } = {}) => {
      try {
        if (clearMessage) {
          setMessage("");
        }

        const response =
          await api.get(
            "/superadmin/projects"
          );

        const rows =
          response.data
            ?.projects || [];

        setProjects(rows);

        return rows;
      } catch (error) {
        setMessageType(
          "error"
        );

        setMessage(
          error.response?.data
            ?.sqlMessage ||
            error.response?.data
              ?.message ||
            error.response?.data
              ?.error ||
            "Failed to load projects."
        );

        return [];
      }
    };

  /* =========================================================
     FETCH PROJECT OPTIONS

     Departments
     Divisions
     All assignable users
  ========================================================= */

  const fetchProjectOptions =
    async () => {
      try {
        const response =
          await api.get(
            "/superadmin/project-options"
          );

        setDepartments(
          response.data
            ?.departments || []
        );

        setUsers(
          response.data?.users ||
            []
        );

        setDivisions(
          response.data
            ?.divisions?.length
            ? response.data
                .divisions
            : PROJECT_DIVISIONS
        );
      } catch (error) {
        setMessageType(
          "error"
        );

        setMessage(
          error.response?.data
            ?.message ||
            error.response?.data
              ?.error ||
            "Failed to load project departments and employees."
        );
      }
    };

  /* =========================================================
     FETCH ALL
  ========================================================= */

  const fetchAll =
    async () => {
      try {
        setLoading(true);
        setMessage("");

        await Promise.all([
          fetchProjects({
            clearMessage: false,
          }),
          fetchProjectOptions(),
        ]);
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    fetchAll();
  }, []);

  /* =========================================================
     PREPARED PROJECTS
  ========================================================= */

  const preparedProjects =
    useMemo(() => {
      return projects.map(
        (project) => ({
          ...project,

          normalized_status:
            normalizeStatus(
              project.status ||
                project.project_status ||
                project.status_group ||
                project.normalized_status
            ),

          progress:
            getNumber(
              project.overall_progress,
              project.progress,
              project.computed_progress
            ),
        })
      );
    }, [projects]);

  /* =========================================================
     CREATORS
  ========================================================= */

  const creators =
    useMemo(() => {
      return Array.from(
        new Set(
          preparedProjects
            .map(
              (project) =>
                project.created_by_name
            )
            .filter(Boolean)
        )
      ).sort((a, b) =>
        a.localeCompare(b)
      );
    }, [preparedProjects]);

  /* =========================================================
     FILTER PROJECTS
  ========================================================= */

  const filteredProjects =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase();

      return preparedProjects.filter(
        (project) => {
          const matchesSearch =
            !term ||
            String(
              project.project_title ||
                ""
            )
              .toLowerCase()
              .includes(term) ||
            String(
              project.project_description ||
                ""
            )
              .toLowerCase()
              .includes(term) ||
            String(
              project.department_name ||
                ""
            )
              .toLowerCase()
              .includes(term) ||
            String(
              project.created_by_name ||
                ""
            )
              .toLowerCase()
              .includes(term) ||
            String(
              project.assigned_names ||
                ""
            )
              .toLowerCase()
              .includes(term) ||
            String(
              project.division ||
                ""
            )
              .toLowerCase()
              .includes(term);

          const matchesDepartment =
            departmentFilter ===
              "all" ||
            project.department_name ===
              departmentFilter;

          const matchesCreator =
            creatorFilter ===
              "all" ||
            project.created_by_name ===
              creatorFilter;

          return (
            matchesSearch &&
            matchesDepartment &&
            matchesCreator
          );
        }
      );
    }, [
      preparedProjects,
      search,
      departmentFilter,
      creatorFilter,
    ]);

  /* =========================================================
     GROUP KANBAN
  ========================================================= */

  const groupedProjects =
    useMemo(() => {
      return PROJECT_COLUMNS.reduce(
        (
          result,
          column
        ) => {
          result[column.key] =
            filteredProjects.filter(
              (project) =>
                project.normalized_status ===
                column.key
            );

          return result;
        },
        {}
      );
    }, [filteredProjects]);

  /* =========================================================
     USER SEARCH - NEW PROJECT
  ========================================================= */

  const filteredProjectUsers =
    useMemo(() => {
      const term =
        projectAssigneeSearch
          .trim()
          .toLowerCase();

      if (!term) {
        return users;
      }

      return users.filter(
        (user) =>
          [
            user.full_name,
            user.email,
            user.employee_code,
            user.department_name,
            user.designation,
            user.role_name,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(term)
      );
    }, [
      users,
      projectAssigneeSearch,
    ]);

  /* =========================================================
     USER SEARCH - MANAGE
  ========================================================= */

  const filteredManagedUsers =
    useMemo(() => {
      const term =
        manageAssigneeSearch
          .trim()
          .toLowerCase();

      if (!term) {
        return users;
      }

      return users.filter(
        (user) =>
          [
            user.full_name,
            user.email,
            user.employee_code,
            user.department_name,
            user.designation,
            user.role_name,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(term)
      );
    }, [
      users,
      manageAssigneeSearch,
    ]);

  /* =========================================================
     TOGGLE NEW PROJECT ASSIGNEE
  ========================================================= */

  const toggleProjectAssignee =
    (userId) => {
      const value =
        String(userId);

      setNewProject(
        (previous) => {
          const selected =
            new Set(
              previous.assignee_ids.map(
                String
              )
            );

          if (
            selected.has(value)
          ) {
            selected.delete(value);
          } else {
            selected.add(value);
          }

          return {
            ...previous,

            assignee_ids:
              Array.from(
                selected
              ),
          };
        }
      );
    };

  /* =========================================================
     CREATE PROJECT
  ========================================================= */

  const createProject =
    async () => {
      if (
        !newProject.project_title.trim()
      ) {
        setMessageType(
          "error"
        );

        setMessage(
          "Project title is required."
        );

        return;
      }

      if (
        !newProject.department_id
      ) {
        setMessageType(
          "error"
        );

        setMessage(
          "Please select a department."
        );

        return;
      }

      if (
        !newProject.division
      ) {
        setMessageType(
          "error"
        );

        setMessage(
          "Please select a division."
        );

        return;
      }

      if (
        !newProject.start_date ||
        !newProject.due_date
      ) {
        setMessageType(
          "error"
        );

        setMessage(
          "Start date and due date are required."
        );

        return;
      }

      if (
        newProject.due_date <
        newProject.start_date
      ) {
        setMessageType(
          "error"
        );

        setMessage(
          "Due date cannot be before start date."
        );

        return;
      }

      if (
        !newProject
          .assignee_ids.length
      ) {
        setMessageType(
          "error"
        );

        setMessage(
          "Select at least one project assignee."
        );

        return;
      }

      try {
        setActionLoading(
          true
        );

        const response =
          await api.post(
            "/superadmin/projects/assign",
            {
              ...newProject,

              department_id:
                Number(
                  newProject.department_id
                ),

              assignee_ids:
                newProject.assignee_ids.map(
                  Number
                ),
            }
          );

        setMessageType(
          "success"
        );

        setMessage(
          response.data
            ?.message ||
            "Project created successfully."
        );

        setShowAssignProjectModal(
          false
        );

        setNewProject({
          ...EMPTY_PROJECT_FORM,
        });

        setProjectAssigneeSearch(
          ""
        );

        await fetchProjects({
          clearMessage: false,
        });
      } catch (error) {
        setMessageType(
          "error"
        );

        setMessage(
          error.response?.data
            ?.message ||
            error.response?.data
              ?.error ||
            error.response?.data
              ?.sqlMessage ||
            "Failed to create project."
        );
      } finally {
        setActionLoading(
          false
        );
      }
    };

  /* =========================================================
     OPEN COMPLETE PROJECT DETAILS
  ========================================================= */

  const openProjectDetails =
    async (project) => {
      try {
        setDetailsLoading(
          true
        );

        setMessage("");

        const [
          tasksResponse,
          contextResponse,
        ] = await Promise.all([
          api.get(
            "/superadmin/tasks"
          ),

          api.get(
            `/superadmin/projects/${project.project_id}/context`
          ),
        ]);

        const allTasks =
          tasksResponse.data
            ?.tasks || [];

        const projectTasks =
          allTasks.filter(
            (task) =>
              String(
                task.project_id
              ) ===
              String(
                project.project_id
              )
          );

        const context =
          contextResponse.data ||
          {};

        const completeProject =
          {
            ...project,

            project_tasks:
              projectTasks,

            assignees:
              context.assignees ||
              [],

            can_delete:
              Boolean(
                context.can_delete
              ),
          };

        setSelectedProject(
          completeProject
        );

        setNewMainTask({
          ...EMPTY_MAIN_TASK_FORM,

          start_date:
            normalizeDateForInput(
              project.start_date
            ),

          due_date:
            normalizeDateForInput(
              project.due_date
            ),
        });
      } catch (error) {
        setMessageType(
          "error"
        );

        setMessage(
          error.response?.data
            ?.message ||
            error.response?.data
              ?.error ||
            "Failed to load complete project details."
        );
      } finally {
        setDetailsLoading(
          false
        );
      }
    };

  /* =========================================================
     REFRESH OPEN PROJECT DETAILS
  ========================================================= */

  const refreshSelectedProject =
    async () => {
      if (
        !selectedProject
          ?.project_id
      ) {
        return;
      }

      const refreshed =
        await fetchProjects({
          clearMessage: false,
        });

      const project =
        refreshed.find(
          (item) =>
            String(
              item.project_id
            ) ===
            String(
              selectedProject.project_id
            )
        );

      if (project) {
        await openProjectDetails(
          project
        );
      }
    };

  /* =========================================================
     MANAGE ASSIGNEES
  ========================================================= */

  const openManageAssignees =
    () => {
      const ids =
        (
          selectedProject
            ?.assignees || []
        )
          .map(
            (user) =>
              String(
                getUserId(user)
              )
          )
          .filter(Boolean);

      setManagedAssigneeIds(
        ids
      );

      setManageAssigneeSearch(
        ""
      );

      setShowManageAssignees(
        true
      );
    };

  const toggleManagedAssignee =
    (userId) => {
      const value =
        String(userId);

      setManagedAssigneeIds(
        (previous) => {
          const selected =
            new Set(
              previous.map(
                String
              )
            );

          if (
            selected.has(value)
          ) {
            selected.delete(value);
          } else {
            selected.add(value);
          }

          return Array.from(
            selected
          );
        }
      );
    };

  const saveManagedAssignees =
    async () => {
      if (
        !managedAssigneeIds.length
      ) {
        setMessageType(
          "error"
        );

        setMessage(
          "Project must have at least one assignee."
        );

        return;
      }

      try {
        setActionLoading(
          true
        );

        const response =
          await api.put(
            `/superadmin/projects/${selectedProject.project_id}/assignees`,
            {
              assignee_ids:
                managedAssigneeIds.map(
                  Number
                ),
            }
          );

        setMessageType(
          "success"
        );

        setMessage(
          response.data
            ?.message ||
            "Project assignees updated."
        );

        setShowManageAssignees(
          false
        );

        await refreshSelectedProject();
      } catch (error) {
        setMessageType(
          "error"
        );

        setMessage(
          error.response?.data
            ?.message ||
            error.response?.data
              ?.error ||
            "Failed to update project assignees."
        );
      } finally {
        setActionLoading(
          false
        );
      }
    };

  /* =========================================================
     MAIN TASK ASSIGNEE
  ========================================================= */

  const toggleMainTaskAssignee =
    (userId) => {
      const value =
        String(userId);

      setNewMainTask(
        (previous) => {
          const selected =
            new Set(
              previous.assignee_ids.map(
                String
              )
            );

          if (
            selected.has(value)
          ) {
            selected.delete(value);
          } else {
            selected.add(value);
          }

          return {
            ...previous,

            assignee_ids:
              Array.from(
                selected
              ),
          };
        }
      );
    };

  /* =========================================================
     ADD MAIN TASK
  ========================================================= */

  const addMainTask =
    async () => {
      if (
        !selectedProject
          ?.project_id
      ) {
        return;
      }

      if (
        !newMainTask.task_title.trim()
      ) {
        setMessageType(
          "error"
        );

        setMessage(
          "Main Task title is required."
        );

        return;
      }

      if (
        !newMainTask
          .assignee_ids.length
      ) {
        setMessageType(
          "error"
        );

        setMessage(
          "Select at least one Main Task assignee."
        );

        return;
      }

      if (
        !newMainTask.start_date ||
        !newMainTask.due_date
      ) {
        setMessageType(
          "error"
        );

        setMessage(
          "Main Task start date and due date are required."
        );

        return;
      }

      if (
        newMainTask.due_date <
        newMainTask.start_date
      ) {
        setMessageType(
          "error"
        );

        setMessage(
          "Main Task due date cannot be before the start date."
        );

        return;
      }

      try {
        setActionLoading(
          true
        );

        const response =
          await api.post(
            `/superadmin/projects/${selectedProject.project_id}/tasks`,
            {
              project_id:
                selectedProject.project_id,

              task_title:
                newMainTask.task_title.trim(),

              task_description:
                newMainTask.task_description.trim(),

              priority:
                newMainTask.priority,

              start_date:
                newMainTask.start_date,

              due_date:
                newMainTask.due_date,

              assignee_ids:
                newMainTask.assignee_ids.map(
                  Number
                ),
            }
          );

        setMessageType(
          "success"
        );

        setMessage(
          response.data
            ?.message ||
            "Main Task assigned successfully."
        );

        setNewMainTask({
          ...EMPTY_MAIN_TASK_FORM,

          start_date:
            normalizeDateForInput(
              selectedProject.start_date
            ),

          due_date:
            normalizeDateForInput(
              selectedProject.due_date
            ),
        });

        await refreshSelectedProject();
      } catch (error) {
        setMessageType(
          "error"
        );

        setMessage(
          error.response?.data
            ?.message ||
            error.response?.data
              ?.error ||
            "Failed to assign Main Task."
        );
      } finally {
        setActionLoading(
          false
        );
      }
    };

  /* =========================================================
     DELETE OWN PROJECT
  ========================================================= */

  const deleteProject =
    async () => {
      if (
        !selectedProject
          ?.project_id
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          `Delete "${selectedProject.project_title}"?\n\nThis will delete the project and its project data. This cannot be undone.`
        );

      if (!confirmed) {
        return;
      }

      try {
        setActionLoading(
          true
        );

        const response =
          await api.delete(
            `/superadmin/projects/${selectedProject.project_id}`
          );

        setMessageType(
          "success"
        );

        setMessage(
          response.data
            ?.message ||
            "Project deleted successfully."
        );

        setSelectedProject(
          null
        );

        await fetchProjects({
          clearMessage: false,
        });
      } catch (error) {
        setMessageType(
          "error"
        );

        setMessage(
          error.response?.data
            ?.message ||
            error.response?.data
              ?.error ||
            "Failed to delete project."
        );
      } finally {
        setActionLoading(
          false
        );
      }
    };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="sa-projects-page">
      {/* HEADER */}

      <header className="sa-projects-header">
        <div>
          <h1>
            All Projects
          </h1>

          <p>
            View every project,
            complete project details,
            tasks, subtasks and
            assignees. Superadmin can
            also create projects and
            assign Main Tasks.
          </p>
        </div>

        <div className="sa-projects-header-actions">
          <button
            type="button"
            className="sa-projects-assign-btn"
            onClick={() => {
              setNewProject({
                ...EMPTY_PROJECT_FORM,
              });

              setProjectAssigneeSearch(
                ""
              );

              setShowAssignProjectModal(
                true
              );
            }}
          >
            <Plus size={18} />
            Assign Project
          </button>

          <button
            type="button"
            className="sa-projects-refresh"
            onClick={fetchAll}
          >
            <RefreshCw size={18} />
            Refresh
          </button>
        </div>
      </header>

      {/* MESSAGE */}

      {message && (
        <div
          className={`sa-projects-message ${
            messageType ===
            "success"
              ? "success"
              : "error"
          }`}
        >
          {message}
        </div>
      )}

      {/* FILTERS */}

      <section className="sa-projects-toolbar">
        <label className="sa-projects-search">
          <Search size={18} />

          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search project, creator, assignee, department, division..."
          />
        </label>

        <select
          value={
            departmentFilter
          }
          onChange={(event) =>
            setDepartmentFilter(
              event.target.value
            )
          }
        >
          <option value="all">
            All Departments
          </option>

          {departments.map(
            (item) => (
              <option
                key={
                  item.department_id
                }
                value={
                  item.department_name
                }
              >
                {
                  item.department_name
                }
              </option>
            )
          )}
        </select>

        <select
          value={creatorFilter}
          onChange={(event) =>
            setCreatorFilter(
              event.target.value
            )
          }
        >
          <option value="all">
            All Creators
          </option>

          {creators.map(
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
      </section>

      {/* KANBAN */}

      {loading ? (
        <div className="sa-projects-empty">
          Loading projects...
        </div>
      ) : (
        <section className="sa-projects-board">
          {PROJECT_COLUMNS.map(
            (column) => {
              const ColumnIcon =
                column.icon;

              const rows =
                groupedProjects[
                  column.key
                ] || [];

              return (
                <article
                  key={column.key}
                  className={`sa-projects-column sa-projects-column-${column.key}`}
                >
                  <div className="sa-projects-column-header">
                    <div>
                      <span className="sa-projects-column-icon">
                        <ColumnIcon
                          size={18}
                        />
                      </span>

                      <h2>
                        {column.label}
                      </h2>
                    </div>

                    <span className="sa-projects-column-count">
                      {rows.length}
                    </span>
                  </div>

                  <div className="sa-projects-column-list">
                    {rows.map(
                      (project) => (
                        <ProjectCard
                          key={
                            project.project_id
                          }
                          project={
                            project
                          }
                          onClick={() =>
                            openProjectDetails(
                              project
                            )
                          }
                        />
                      )
                    )}

                    {!rows.length && (
                      <div className="sa-projects-column-empty">
                        No{" "}
                        {column.label.toLowerCase()}{" "}
                        projects.
                      </div>
                    )}
                  </div>
                </article>
              );
            }
          )}
        </section>
      )}

      {/* DETAILS LOADING */}

      {detailsLoading && (
        <div className="sa-project-modal-backdrop">
          <div className="sa-project-loading-box">
            Loading complete project
            details...
          </div>
        </div>
      )}

      {/* PROJECT DETAILS */}

      {selectedProject &&
        !detailsLoading && (
          <ProjectDetailsModal
            project={
              selectedProject
            }
            newMainTask={
              newMainTask
            }
            setNewMainTask={
              setNewMainTask
            }
            onToggleMainTaskAssignee={
              toggleMainTaskAssignee
            }
            onAddMainTask={
              addMainTask
            }
            onManageAssignees={
              openManageAssignees
            }
            onDelete={
              deleteProject
            }
            onClose={() =>
              setSelectedProject(
                null
              )
            }
            loading={
              actionLoading
            }
          />
        )}

      {/* NEW PROJECT */}

      {showAssignProjectModal && (
        <AssignProjectModal
          project={newProject}
          setProject={
            setNewProject
          }
          departments={
            departments
          }
          divisions={divisions}
          users={
            filteredProjectUsers
          }
          search={
            projectAssigneeSearch
          }
          setSearch={
            setProjectAssigneeSearch
          }
          onToggleAssignee={
            toggleProjectAssignee
          }
          onSave={
            createProject
          }
          onClose={() => {
            if (
              !actionLoading
            ) {
              setShowAssignProjectModal(
                false
              );
            }
          }}
          loading={
            actionLoading
          }
        />
      )}

      {/* MANAGE PROJECT ASSIGNEES */}

      {showManageAssignees && (
        <ManageAssigneesModal
          users={
            filteredManagedUsers
          }
          selectedIds={
            managedAssigneeIds
          }
          search={
            manageAssigneeSearch
          }
          setSearch={
            setManageAssigneeSearch
          }
          onToggle={
            toggleManagedAssignee
          }
          onSave={
            saveManagedAssignees
          }
          onClose={() => {
            if (
              !actionLoading
            ) {
              setShowManageAssignees(
                false
              );
            }
          }}
          loading={
            actionLoading
          }
        />
      )}
    </div>
  );
};

/* =========================================================
   PROJECT CARD
========================================================= */

const ProjectCard = ({
  project,
  onClick,
}) => {
  const overdue =
    isProjectOverdue(project);

  return (
    <button
      type="button"
      className="sa-project-card"
      onClick={onClick}
    >
      <div className="sa-project-card-title">
        <span className="sa-project-card-icon">
          <FolderKanban
            size={18}
          />
        </span>

        <h3>
          {project.project_title ||
            "Untitled Project"}
        </h3>

        {overdue && (
          <span className="sa-project-overdue">
            <AlertTriangle
              size={11}
            />
            Overdue
          </span>
        )}
      </div>

      <div className="sa-project-info-box">
        <span>
          Department
        </span>

        <strong>
          {project.department_name ||
            "-"}
        </strong>
      </div>

      <div className="sa-project-info-box">
        <span>
          Division
        </span>

        <strong>
          {project.division || "-"}
        </strong>
      </div>

      <div className="sa-project-info-box">
        <span>
          Created By
        </span>

        <strong>
          {project.created_by_name ||
            "-"}
        </strong>
      </div>

      <div className="sa-project-info-box">
        <span>
          Assigned To
        </span>

        <strong>
          {project.assigned_names ||
            "-"}
        </strong>
      </div>

      <div className="sa-project-date-grid">
        <div>
          <span>
            Start Date
          </span>

          <strong>
            {formatDate(
              project.start_date
            )}
          </strong>
        </div>

        <div>
          <span>
            Due Date
          </span>

          <strong>
            {formatDate(
              project.due_date
            )}
          </strong>
        </div>
      </div>

      <div className="sa-project-progress">
        <div>
          <span>
            Progress
          </span>

          <strong>
            {project.progress}%
          </strong>
        </div>

        <progress
          value={project.progress}
          max="100"
        />
      </div>

      <div className="sa-project-card-footer">
        <span>
          Tasks{" "}
          {project.completed_tasks ||
            0}
          /
          {project.total_tasks || 0}
        </span>

        <span>
          View details
        </span>
      </div>
    </button>
  );
};

/* =========================================================
   PROJECT DETAILS MODAL
========================================================= */

const ProjectDetailsModal = ({
  project,
  newMainTask,
  setNewMainTask,
  onToggleMainTaskAssignee,
  onAddMainTask,
  onManageAssignees,
  onDelete,
  onClose,
  loading,
}) => {
  const overdue =
    isProjectOverdue(project);

  const tasks =
    project.project_tasks ||
    [];

  const assignees =
    project.assignees || [];

  return (
    <div
      className="sa-project-modal-backdrop"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div className="sa-project-modal">
        {/* HEADER */}

        <div className="sa-project-modal-header">
          <div>
            <div className="sa-project-modal-title-row">
              <h2>
                {project.project_title ||
                  "Project Details"}
              </h2>

              {overdue && (
                <span className="sa-project-overdue">
                  <AlertTriangle
                    size={12}
                  />
                  Overdue
                </span>
              )}
            </div>

            <p>
              {statusLabel(
                project.normalized_status ||
                  project.status
              )}
            </p>
          </div>

          <div className="sa-project-modal-actions">
            <button
              type="button"
              className="sa-project-manage-btn"
              onClick={
                onManageAssignees
              }
            >
              <Users size={17} />
              Manage Assignees
            </button>

            {project.can_delete && (
              <button
                type="button"
                className="sa-project-delete-btn"
                onClick={onDelete}
                disabled={loading}
              >
                <Trash2 size={17} />
                Delete
              </button>
            )}

            <button
              type="button"
              className="sa-project-modal-close"
              onClick={onClose}
            >
              <X size={18} />
              Close
            </button>
          </div>
        </div>

        {/* PROJECT DETAILS */}

        <div className="sa-project-detail-grid">
          <DetailBox
            label="Status"
            value={statusLabel(
              project.status ||
                project.normalized_status
            )}
          />

          <DetailBox
            label="Progress"
            value={`${project.progress}%`}
          />

          <DetailBox
            label="Department"
            value={
              project.department_name
            }
          />

          <DetailBox
            label="Division"
            value={
              project.division
            }
          />

          <DetailBox
            label="Priority"
            value={
              project.priority
            }
          />

          <DetailBox
            label="Created By"
            value={
              project.created_by_name
            }
          />

          <DetailBox
            label="Creator Email"
            value={
              project.created_by_email
            }
          />

          <DetailBox
            label="Start Date"
            value={formatDate(
              project.start_date
            )}
          />

          <DetailBox
            label="Due Date"
            value={formatDate(
              project.due_date
            )}
          />

          <DetailBox
            label="Total Tasks"
            value={
              project.total_tasks ||
              tasks.length
            }
          />

          <DetailBox
            label="Completed Tasks"
            value={
              project.completed_tasks ||
              0
            }
          />
        </div>

        <div className="sa-project-modal-progress">
          <progress
            value={
              project.progress
            }
            max="100"
          />

          <span>
            Project Progress:{" "}
            {project.progress}%
          </span>
        </div>

        {/* DESCRIPTION */}

        <section className="sa-project-modal-section">
          <h3>
            Project Description
          </h3>

          <p>
            {project.project_description ||
              project.description ||
              "No description added."}
          </p>
        </section>

        {/* ASSIGNEES */}

        <section className="sa-project-modal-section">
          <h3 className="sa-project-section-heading">
            <Users size={20} />
            Project Assignees
          </h3>

          {assignees.length ? (
            <div className="sa-project-detail-assignees">
              {assignees.map(
                (user) => (
                  <div
                    key={getUserId(
                      user
                    )}
                    className="sa-project-detail-assignee"
                  >
                    <div className="sa-project-detail-assignee-icon">
                      <Users
                        size={17}
                      />
                    </div>

                    <div>
                      <strong>
                        {getUserName(
                          user
                        )}
                      </strong>

                      <span>
                        {user.email ||
                          "-"}
                      </span>

                      <small>
                        {user.department_name ||
                          "No Department"}{" "}
                        ·{" "}
                        {user.designation ||
                          user.role_name ||
                          "-"}
                      </small>
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="sa-projects-empty">
              No project assignees.
            </div>
          )}
        </section>

        {/* ADD MAIN TASK */}

        <section className="sa-project-modal-section">
          <h3 className="sa-project-section-heading">
            <Plus size={20} />
            Assign Main Task
          </h3>

          <p className="sa-project-section-help">
            Main Tasks can only be
            assigned to people already
            assigned to this project.
          </p>

          <div className="sa-main-task-form-grid">
            <label className="sa-project-field sa-main-task-title">
              <span>
                Main Task Title
              </span>

              <input
                type="text"
                value={
                  newMainTask.task_title
                }
                onChange={(event) =>
                  setNewMainTask(
                    (previous) => ({
                      ...previous,

                      task_title:
                        event.target
                          .value,
                    })
                  )
                }
                placeholder="Enter Main Task title"
              />
            </label>

            <label className="sa-project-field">
              <span>
                Priority
              </span>

              <select
                value={
                  newMainTask.priority
                }
                onChange={(event) =>
                  setNewMainTask(
                    (previous) => ({
                      ...previous,

                      priority:
                        event.target
                          .value,
                    })
                  )
                }
              >
                <option value="low">
                  Low
                </option>

                <option value="medium">
                  Medium
                </option>

                <option value="high">
                  High
                </option>
              </select>
            </label>

            <label className="sa-project-field">
              <span>
                Start Date
              </span>

              <input
                type="date"
                min={normalizeDateForInput(
                  project.start_date
                )}
                max={normalizeDateForInput(
                  project.due_date
                )}
                value={
                  newMainTask.start_date
                }
                onChange={(event) =>
                  setNewMainTask(
                    (previous) => ({
                      ...previous,

                      start_date:
                        event.target
                          .value,
                    })
                  )
                }
              />
            </label>

            <label className="sa-project-field">
              <span>
                Due Date
              </span>

              <input
                type="date"
                min={
                  newMainTask.start_date ||
                  normalizeDateForInput(
                    project.start_date
                  )
                }
                max={normalizeDateForInput(
                  project.due_date
                )}
                value={
                  newMainTask.due_date
                }
                onChange={(event) =>
                  setNewMainTask(
                    (previous) => ({
                      ...previous,

                      due_date:
                        event.target
                          .value,
                    })
                  )
                }
              />
            </label>

            <label className="sa-project-field sa-project-field-full">
              <span>
                Main Task Description
              </span>

              <textarea
                value={
                  newMainTask.task_description
                }
                onChange={(event) =>
                  setNewMainTask(
                    (previous) => ({
                      ...previous,

                      task_description:
                        event.target
                          .value,
                    })
                  )
                }
                placeholder="Enter Main Task details..."
              />
            </label>
          </div>

          <div className="sa-main-task-assignee-title">
            Select Task Assignees
          </div>

          <div className="sa-main-task-assignees">
            {assignees.map(
              (user) => {
                const id =
                  String(
                    getUserId(
                      user
                    )
                  );

                const selected =
                  newMainTask.assignee_ids
                    .map(String)
                    .includes(id);

                return (
                  <button
                    type="button"
                    key={id}
                    className={`sa-main-task-assignee ${
                      selected
                        ? "selected"
                        : ""
                    }`}
                    onClick={() =>
                      onToggleMainTaskAssignee(
                        id
                      )
                    }
                  >
                    <span className="sa-project-checkbox">
                      {selected && (
                        <Check
                          size={14}
                        />
                      )}
                    </span>

                    <div>
                      <strong>
                        {getUserName(
                          user
                        )}
                      </strong>

                      <small>
                        {user.department_name ||
                          "-"}
                      </small>
                    </div>
                  </button>
                );
              }
            )}
          </div>

          <button
            type="button"
            className="sa-main-task-add-btn"
            onClick={
              onAddMainTask
            }
            disabled={loading}
          >
            <Plus size={18} />

            {loading
              ? "Assigning..."
              : "Assign Main Task"}
          </button>
        </section>

        {/* TASKS + SUBTASKS */}

        <section className="sa-project-modal-section">
          <h3 className="sa-project-section-heading">
            <ClipboardList
              size={20}
            />
            Project Tasks
          </h3>

          {tasks.length ? (
            <div className="sa-project-task-list">
              {tasks.map(
                (task) => (
                  <ProjectTaskCard
                    key={
                      task.task_id
                    }
                    task={task}
                  />
                )
              )}
            </div>
          ) : (
            <div className="sa-projects-empty">
              No tasks added to this
              project.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

/* =========================================================
   PROJECT TASK + SUBTASKS
========================================================= */

const ProjectTaskCard = ({
  task,
}) => {
  const subtasks =
    task.subtasks || [];

  const progress =
    getNumber(task.progress);

  return (
    <article className="sa-project-task-detail-card">
      <div className="sa-project-task-detail-top">
        <div>
          <h4>
            {task.task_title ||
              "Untitled Task"}
          </h4>

          <p>
            {task.task_description ||
              "No description."}
          </p>
        </div>

        <span className="sa-project-task-status">
          {taskStatusLabel(
            task.status_group ||
              task.status
          )}
        </span>
      </div>

      <div className="sa-project-task-meta-grid">
        <TaskMetaBox
          label="Assignee"
          value={
            task.assignee_name
          }
        />

        <TaskMetaBox
          label="Assigned By"
          value={
            task.assigned_by_name
          }
        />

        <TaskMetaBox
          label="Start Date"
          value={formatDate(
            task.start_date
          )}
        />

        <TaskMetaBox
          label="Due Date"
          value={formatDate(
            task.due_date
          )}
        />

        <TaskMetaBox
          label="Progress"
          value={`${progress}%`}
        />

        <TaskMetaBox
          label="Subtasks"
          value={`${
            task.completed_subtasks ||
            0
          }/${
            task.total_subtasks ||
            subtasks.length ||
            0
          }`}
        />
      </div>

      <progress
        className="sa-project-task-progress"
        value={progress}
        max="100"
      />

      <div className="sa-project-subtask-heading">
        Subtasks
      </div>

      {subtasks.length ? (
        <div className="sa-project-subtask-list">
          {subtasks.map(
            (subtask) => (
              <div
                key={
                  subtask.task_id
                }
                className="sa-project-subtask-row"
              >
                <div>
                  <strong>
                    {subtask.task_title ||
                      "-"}
                  </strong>

                  <span>
                    {formatDate(
                      subtask.start_date
                    )}{" "}
                    →{" "}
                    {formatDate(
                      subtask.due_date
                    )}
                  </span>
                </div>

                <span
                  className={`sa-project-subtask-status ${
                    subtask.is_checked
                      ? "done"
                      : ""
                  }`}
                >
                  {subtask.is_checked
                    ? "Completed"
                    : "Pending"}
                </span>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="sa-project-no-subtasks">
          No subtasks.
        </div>
      )}
    </article>
  );
};

/* =========================================================
   ASSIGN PROJECT MODAL
========================================================= */

const AssignProjectModal = ({
  project,
  setProject,
  departments,
  divisions,
  users,
  search,
  setSearch,
  onToggleAssignee,
  onSave,
  onClose,
  loading,
}) => {
  return (
    <div
      className="sa-project-assignment-backdrop"
      onMouseDown={(event) => {
        if (
          event.target ===
            event.currentTarget &&
          !loading
        ) {
          onClose();
        }
      }}
    >
      <div className="sa-project-assignment-modal">
        <div className="sa-project-assignment-header">
          <div>
            <h2>
              Assign New Project
            </h2>

            <p>
              Create the project and
              assign it to users from
              any department.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="sa-project-assignment-close"
          >
            <X size={19} />
          </button>
        </div>

        <div className="sa-project-assignment-form-grid">
          <label className="sa-project-field sa-project-field-wide">
            <span>
              Project Title
            </span>

            <input
              value={
                project.project_title
              }
              onChange={(event) =>
                setProject(
                  (previous) => ({
                    ...previous,

                    project_title:
                      event.target
                        .value,
                  })
                )
              }
              placeholder="Enter project title"
            />
          </label>

          {/* DEPARTMENT */}

          <label className="sa-project-field">
            <span>
              Department
            </span>

            <select
              value={
                project.department_id
              }
              onChange={(event) =>
                setProject(
                  (previous) => ({
                    ...previous,

                    department_id:
                      event.target
                        .value,
                  })
                )
              }
            >
              <option value="">
                Select Department
              </option>

              {departments.map(
                (item) => (
                  <option
                    key={
                      item.department_id
                    }
                    value={
                      item.department_id
                    }
                  >
                    {
                      item.department_name
                    }
                  </option>
                )
              )}
            </select>
          </label>

          {/* DIVISION */}

          <label className="sa-project-field">
            <span>
              Division
            </span>

            <select
              value={
                project.division
              }
              onChange={(event) =>
                setProject(
                  (previous) => ({
                    ...previous,

                    division:
                      event.target
                        .value,
                  })
                )
              }
            >
              <option value="">
                Select Division
              </option>

              {divisions.map(
                (division) => (
                  <option
                    key={division}
                    value={division}
                  >
                    {division}
                  </option>
                )
              )}
            </select>
          </label>

          <label className="sa-project-field">
            <span>
              Priority
            </span>

            <select
              value={
                project.priority
              }
              onChange={(event) =>
                setProject(
                  (previous) => ({
                    ...previous,

                    priority:
                      event.target
                        .value,
                  })
                )
              }
            >
              <option value="low">
                Low
              </option>

              <option value="medium">
                Medium
              </option>

              <option value="high">
                High
              </option>
            </select>
          </label>

          <label className="sa-project-field">
            <span>
              Start Date
            </span>

            <input
              type="date"
              value={
                project.start_date
              }
              onChange={(event) =>
                setProject(
                  (previous) => ({
                    ...previous,

                    start_date:
                      event.target
                        .value,
                  })
                )
              }
            />
          </label>

          <label className="sa-project-field">
            <span>
              Due Date
            </span>

            <input
              type="date"
              min={
                project.start_date ||
                undefined
              }
              value={
                project.due_date
              }
              onChange={(event) =>
                setProject(
                  (previous) => ({
                    ...previous,

                    due_date:
                      event.target
                        .value,
                  })
                )
              }
            />
          </label>

          <label className="sa-project-field sa-project-field-full">
            <span>
              Project Description
            </span>

            <textarea
              value={
                project.project_description
              }
              onChange={(event) =>
                setProject(
                  (previous) => ({
                    ...previous,

                    project_description:
                      event.target
                        .value,
                  })
                )
              }
              placeholder="Enter project description..."
            />
          </label>
        </div>

        {/* ASSIGNEES */}

        <div className="sa-project-assignee-panel">
          <div className="sa-project-assignee-panel-header">
            <div>
              <h3>
                Project Assignees
              </h3>

              <p>
                Selected:{" "}
                {
                  project.assignee_ids
                    .length
                }
              </p>
            </div>

            <label className="sa-project-assignee-search">
              <Search size={17} />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target
                      .value
                  )
                }
                placeholder="Search employees..."
              />
            </label>
          </div>

          <div className="sa-project-assignee-list">
            {users.length ? (
              users.map((user) => {
                const userId =
                  String(
                    getUserId(
                      user
                    )
                  );

                const selected =
                  project.assignee_ids
                    .map(String)
                    .includes(
                      userId
                    );

                return (
                  <button
                    type="button"
                    key={userId}
                    className={`sa-project-assignee-card ${
                      selected
                        ? "selected"
                        : ""
                    }`}
                    onClick={() =>
                      onToggleAssignee(
                        userId
                      )
                    }
                  >
                    <span className="sa-project-checkbox">
                      {selected && (
                        <Check
                          size={14}
                        />
                      )}
                    </span>

                    <div>
                      <strong>
                        {getUserName(
                          user
                        )}
                      </strong>

                      <span>
                        {user.email ||
                          "-"}
                      </span>

                      <small>
                        {user.department_name ||
                          "No Department"}{" "}
                        ·{" "}
                        {user.role_name ||
                          "-"}
                      </small>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="sa-projects-empty">
                No matching users.
              </div>
            )}
          </div>
        </div>

        <div className="sa-project-assignment-footer">
          <button
            type="button"
            className="sa-project-assignment-cancel"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="button"
            className="sa-project-assignment-save"
            onClick={onSave}
            disabled={loading}
          >
            <UserPlus size={17} />

            {loading
              ? "Assigning..."
              : "Assign Project"}
          </button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   MANAGE ASSIGNEES
========================================================= */

const ManageAssigneesModal = ({
  users,
  selectedIds,
  search,
  setSearch,
  onToggle,
  onSave,
  onClose,
  loading,
}) => {
  return (
    <div className="sa-project-assignee-manager-backdrop">
      <div className="sa-project-assignee-manager-modal">
        <div className="sa-project-assignment-header">
          <div>
            <h2>
              Manage Project
              Assignees
            </h2>

            <p>
              Add or remove project
              assignees.
            </p>
          </div>

          <button
            type="button"
            className="sa-project-assignment-close"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>

        <label className="sa-project-assignee-search sa-project-manager-search">
          <Search size={17} />

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search users..."
          />
        </label>

        <div className="sa-project-manager-list">
          {users.map((user) => {
            const id =
              String(
                getUserId(user)
              );

            const selected =
              selectedIds
                .map(String)
                .includes(id);

            return (
              <button
                type="button"
                key={id}
                className={`sa-project-assignee-card ${
                  selected
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  onToggle(id)
                }
              >
                <span className="sa-project-checkbox">
                  {selected && (
                    <Check
                      size={14}
                    />
                  )}
                </span>

                <div>
                  <strong>
                    {getUserName(
                      user
                    )}
                  </strong>

                  <span>
                    {user.email ||
                      "-"}
                  </span>

                  <small>
                    {user.department_name ||
                      "-"}
                  </small>
                </div>
              </button>
            );
          })}
        </div>

        <div className="sa-project-assignment-footer">
          <button
            type="button"
            className="sa-project-assignment-cancel"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="button"
            className="sa-project-assignment-save"
            onClick={onSave}
            disabled={loading}
          >
            <Check size={17} />

            {loading
              ? "Saving..."
              : "Save Assignees"}
          </button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   DETAIL COMPONENTS
========================================================= */

const DetailBox = ({
  label,
  value,
}) => (
  <div className="sa-project-detail-box">
    <span>{label}</span>

    <strong>
      {value ?? "-"}
    </strong>
  </div>
);

const TaskMetaBox = ({
  label,
  value,
}) => (
  <div className="sa-project-task-meta-box">
    <span>{label}</span>

    <strong>
      {value ?? "-"}
    </strong>
  </div>
);

export default SuperadminProjects;