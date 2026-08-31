import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  FolderKanban,
  PauseCircle,
  Plus,
  RefreshCw,
  Search,
  UserPlus,
  Users,
  X,
  XCircle,
} from "lucide-react";

import api from "../../api/axios";
import "./superadminProjects.css";

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

/* =========================================================
   STATUS HELPERS
========================================================= */

const normalizeStatus = (status) => {
  const value = String(status || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  if (
    value === "todo" ||
    value === "to_do" ||
    value === "pending" ||
    value === "not_started"
  ) {
    return "not_started";
  }

  if (
    value === "progress" ||
    value === "ongoing" ||
    value === "in_progress"
  ) {
    return "in_progress";
  }

  if (
    value === "review" ||
    value === "under_review"
  ) {
    return "under_review";
  }

  if (
    value === "done" ||
    value === "complete" ||
    value === "completed"
  ) {
    return "completed";
  }

  if (value === "hold" || value === "on_hold") {
    return "on_hold";
  }

  if (
    value === "cancelled" ||
    value === "canceled" ||
    value === "rejected"
  ) {
    return "rejected";
  }

  return value || "not_started";
};

const statusLabel = (status) => {
  const normalized = normalizeStatus(status);

  return (
    PROJECT_COLUMNS.find(
      (column) => column.key === normalized
    )?.label || String(status || "To Do")
  );
};

/* =========================================================
   DATE
========================================================= */

const formatDate = (value) => {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

/* =========================================================
   NUMBER
========================================================= */

const getNumber = (...values) => {
  for (const value of values) {
    const number = Number(value);

    if (!Number.isNaN(number)) {
      return Math.max(
        0,
        Math.min(100, number)
      );
    }
  }

  return 0;
};

/* =========================================================
   ASSIGNED IDS
========================================================= */

const parseAssignedIds = (project) => {
  const raw =
    project?.assigned_user_ids ||
    project?.assignee_ids ||
    project?.assigned_ids ||
    "";

  if (Array.isArray(raw)) {
    return [
      ...new Set(
        raw
          .map((value) =>
            String(
              value?.user_id ??
                value?.employee_id ??
                value
            )
          )
          .filter(Boolean)
      ),
    ];
  }

  return [
    ...new Set(
      String(raw || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ];
};

/* =========================================================
   OVERDUE
========================================================= */

const isProjectOverdue = (project) => {
  if (
    normalizeStatus(project.normalized_status) ===
    "completed"
  ) {
    return false;
  }

  const value =
    project.due_date ||
    project.end_date ||
    project.project_end_date;

  if (!value) return false;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  date.setHours(23, 59, 59, 999);

  return date.getTime() < Date.now();
};

/* =========================================================
   STATUS RESOLUTION
========================================================= */

const resolveProjectStatus = (project) => {
  const directStatus =
    project.status ||
    project.project_status ||
    project.status_group ||
    project.normalized_status;

  return normalizeStatus(directStatus);
};

/* =========================================================
   MAIN COMPONENT
========================================================= */

const SuperadminProjects = () => {
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);

  const [search, setSearch] = useState("");
  const [department, setDepartment] =
    useState("all");
  const [creator, setCreator] =
    useState("all");

  const [loading, setLoading] =
    useState(true);

  const [message, setMessage] =
    useState("");

  const [messageType, setMessageType] =
    useState("error");

  const [
    selectedProject,
    setSelectedProject,
  ] = useState(null);

  /* CREATE / ASSIGN PROJECT */

  const [
    showAssignModal,
    setShowAssignModal,
  ] = useState(false);

  const [
    newProject,
    setNewProject,
  ] = useState(EMPTY_PROJECT_FORM);

  const [
    assignSearch,
    setAssignSearch,
  ] = useState("");

  const [
    actionLoading,
    setActionLoading,
  ] = useState(false);

  /* MANAGE EXISTING ASSIGNEES */

  const [
    showAssigneeManager,
    setShowAssigneeManager,
  ] = useState(false);

  const [
    editAssigneeIds,
    setEditAssigneeIds,
  ] = useState([]);

  const [
    editAssigneeSearch,
    setEditAssigneeSearch,
  ] = useState("");

  /* =========================================================
     FETCH PROJECTS
  ========================================================= */

  const fetchProjects = async ({
    clearMessage = true,
  } = {}) => {
    try {
      if (clearMessage) {
        setMessage("");
      }

      const response = await api.get(
        "/superadmin/projects"
      );

      const result =
        response.data?.projects || [];

      setProjects(result);

      return result;
    } catch (error) {
      setMessageType("error");

      setMessage(
        error.response?.data?.sqlMessage ||
          error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to load projects."
      );

      return [];
    }
  };

  /* =========================================================
     FETCH USERS
  ========================================================= */

  const fetchUsers = async () => {
    try {
      const response = await api.get(
        "/superadmin/users"
      );

      setUsers(
        response.data?.users || []
      );
    } catch (error) {
      setMessageType("error");

      setMessage(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to load assignable users."
      );
    }
  };

  /* =========================================================
     FETCH ALL
  ========================================================= */

  const fetchAll = async () => {
    try {
      setLoading(true);
      setMessage("");

      await Promise.all([
        fetchProjects({
          clearMessage: false,
        }),
        fetchUsers(),
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

  const preparedProjects = useMemo(() => {
    return projects.map((project) => ({
      ...project,

      normalized_status:
        resolveProjectStatus(project),

      progress: getNumber(
        project.overall_progress,
        project.progress,
        project.computed_progress
      ),
    }));
  }, [projects]);

  /* =========================================================
     ASSIGNABLE USERS

     All active:
     - employee
     - admin
     - administrator

     Superadmin is intentionally excluded.
  ========================================================= */

  const assignableUsers = useMemo(() => {
    return users
      .filter((user) => {
        const role = String(
          user.role_name || ""
        ).toLowerCase();

        const status = String(
          user.status || "active"
        ).toLowerCase();

        return (
          status === "active" &&
          [
            "employee",
            "admin",
            "administrator",
          ].includes(role)
        );
      })
      .sort((a, b) =>
        String(a.full_name || "").localeCompare(
          String(b.full_name || "")
        )
      );
  }, [users]);

  /* =========================================================
     AVAILABLE DEPARTMENTS FOR NEW PROJECT
  ========================================================= */

  const departmentOptions = useMemo(() => {
    const map = new Map();

    assignableUsers.forEach((user) => {
      if (
        !user.department_id ||
        !user.department_name
      ) {
        return;
      }

      const id = String(
        user.department_id
      );

      if (!map.has(id)) {
        map.set(id, {
          department_id:
            user.department_id,

          department_name:
            user.department_name,
        });
      }
    });

    return Array.from(
      map.values()
    ).sort((a, b) =>
      String(
        a.department_name
      ).localeCompare(
        String(
          b.department_name
        )
      )
    );
  }, [assignableUsers]);

  /* =========================================================
     FILTER DROPDOWNS
  ========================================================= */

  const departments = useMemo(() => {
    return Array.from(
      new Set(
        preparedProjects
          .map(
            (project) =>
              project.department_name
          )
          .filter(Boolean)
      )
    ).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [preparedProjects]);

  const creators = useMemo(() => {
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
     PROJECT FILTER
  ========================================================= */

  const filteredProjects = useMemo(() => {
    const term =
      search.toLowerCase().trim();

    return preparedProjects.filter(
      (project) => {
        const matchesSearch =
          !term ||
          String(
            project.project_title || ""
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
            project.description || ""
          )
            .toLowerCase()
            .includes(term) ||
          String(
            project.department_name || ""
          )
            .toLowerCase()
            .includes(term) ||
          String(
            project.created_by_name || ""
          )
            .toLowerCase()
            .includes(term) ||
          String(
            project.assigned_names || ""
          )
            .toLowerCase()
            .includes(term) ||
          String(
            project.division || ""
          )
            .toLowerCase()
            .includes(term);

        const matchesDepartment =
          department === "all" ||
          project.department_name ===
            department;

        const matchesCreator =
          creator === "all" ||
          project.created_by_name === creator;

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
    department,
    creator,
  ]);

  /* =========================================================
     GROUP PROJECTS
  ========================================================= */

  const groupedProjects = useMemo(() => {
    return PROJECT_COLUMNS.reduce(
      (result, column) => {
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
     CREATE MODAL USER SEARCH
  ========================================================= */

  const filteredAssignUsers =
    useMemo(() => {
      const term =
        assignSearch
          .trim()
          .toLowerCase();

      if (!term) {
        return assignableUsers;
      }

      return assignableUsers.filter(
        (user) => {
          const searchable = [
            user.full_name,
            user.email,
            user.employee_code,
            user.department_name,
            user.designation,
            user.role_name,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return searchable.includes(
            term
          );
        }
      );
    }, [
      assignableUsers,
      assignSearch,
    ]);

  /* =========================================================
     EXISTING ASSIGNEE SEARCH
  ========================================================= */

  const filteredEditUsers =
    useMemo(() => {
      const term =
        editAssigneeSearch
          .trim()
          .toLowerCase();

      if (!term) {
        return assignableUsers;
      }

      return assignableUsers.filter(
        (user) => {
          const searchable = [
            user.full_name,
            user.email,
            user.employee_code,
            user.department_name,
            user.designation,
            user.role_name,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return searchable.includes(
            term
          );
        }
      );
    }, [
      assignableUsers,
      editAssigneeSearch,
    ]);

  /* =========================================================
     TOGGLE NEW ASSIGNEE
  ========================================================= */

  const toggleNewProjectAssignee = (
    userId
  ) => {
    const value = String(userId);

    setNewProject((previous) => {
      const selected = new Set(
        previous.assignee_ids.map(String)
      );

      if (selected.has(value)) {
        selected.delete(value);
      } else {
        selected.add(value);
      }

      return {
        ...previous,

        assignee_ids:
          Array.from(selected),
      };
    });
  };

  /* =========================================================
     TOGGLE EXISTING ASSIGNEE
  ========================================================= */

  const toggleEditAssignee = (
    userId
  ) => {
    const value = String(userId);

    setEditAssigneeIds(
      (previous) => {
        const selected = new Set(
          previous.map(String)
        );

        if (selected.has(value)) {
          selected.delete(value);
        } else {
          selected.add(value);
        }

        return Array.from(selected);
      }
    );
  };

  /* =========================================================
     OPEN ASSIGN PROJECT MODAL
  ========================================================= */

  const openAssignProjectModal = () => {
    setNewProject({
      ...EMPTY_PROJECT_FORM,
      assignee_ids: [],
    });

    setAssignSearch("");
    setShowAssignModal(true);
  };

  /* =========================================================
     CLOSE ASSIGN PROJECT MODAL
  ========================================================= */

  const closeAssignProjectModal = () => {
    if (actionLoading) {
      return;
    }

    setShowAssignModal(false);

    setNewProject({
      ...EMPTY_PROJECT_FORM,
      assignee_ids: [],
    });

    setAssignSearch("");
  };

  /* =========================================================
     CREATE + ASSIGN NEW PROJECT
  ========================================================= */

  const createProject = async () => {
    setMessage("");

    if (
      !newProject.project_title.trim()
    ) {
      setMessageType("error");
      setMessage(
        "Project title is required."
      );
      return;
    }

    if (!newProject.department_id) {
      setMessageType("error");
      setMessage(
        "Please select a project department."
      );
      return;
    }

    if (
      !newProject.start_date ||
      !newProject.due_date
    ) {
      setMessageType("error");
      setMessage(
        "Start date and due date are required."
      );
      return;
    }

    if (
      newProject.due_date <
      newProject.start_date
    ) {
      setMessageType("error");
      setMessage(
        "Due date cannot be before the start date."
      );
      return;
    }

    if (
      !newProject.assignee_ids.length
    ) {
      setMessageType("error");
      setMessage(
        "Select at least one person for the project."
      );
      return;
    }

    try {
      setActionLoading(true);

      const response = await api.post(
        "/superadmin/projects/assign",
        {
          project_title:
            newProject.project_title.trim(),

          project_description:
            newProject.project_description.trim(),

          department_id: Number(
            newProject.department_id
          ),

          division:
            newProject.division.trim() ||
            null,

          priority:
            newProject.priority,

          start_date:
            newProject.start_date,

          due_date:
            newProject.due_date,

          assignee_ids:
            newProject.assignee_ids.map(
              Number
            ),
        }
      );

      setMessageType("success");

      setMessage(
        response.data?.message ||
          "Project assigned successfully."
      );

      setShowAssignModal(false);

      setNewProject({
        ...EMPTY_PROJECT_FORM,
        assignee_ids: [],
      });

      setAssignSearch("");

      await fetchProjects({
        clearMessage: false,
      });
    } catch (error) {
      setMessageType("error");

      setMessage(
        error.response?.data?.message ||
          error.response?.data?.error ||
          error.response?.data
            ?.sqlMessage ||
          "Failed to assign project."
      );
    } finally {
      setActionLoading(false);
    }
  };

  /* =========================================================
     OPEN EXISTING ASSIGNEE MANAGER
  ========================================================= */

  const openAssigneeManager = () => {
    if (!selectedProject) {
      return;
    }

    setEditAssigneeIds(
      parseAssignedIds(
        selectedProject
      )
    );

    setEditAssigneeSearch("");

    setShowAssigneeManager(true);
  };

  /* =========================================================
     SAVE EXISTING PROJECT ASSIGNEES
  ========================================================= */

  const saveProjectAssignees =
    async () => {
      if (
        !selectedProject?.project_id
      ) {
        return;
      }

      if (
        !editAssigneeIds.length
      ) {
        setMessageType("error");

        setMessage(
          "A project must have at least one assigned person."
        );

        return;
      }

      try {
        setActionLoading(true);

        const response = await api.put(
          `/superadmin/projects/${selectedProject.project_id}/assignees`,
          {
            assignee_ids:
              editAssigneeIds.map(
                Number
              ),
          }
        );

        setMessageType("success");

        setMessage(
          response.data?.message ||
            "Project assignees updated successfully."
        );

        setShowAssigneeManager(
          false
        );

        const refreshedProjects =
          await fetchProjects({
            clearMessage: false,
          });

        const refreshedProject =
          refreshedProjects.find(
            (project) =>
              String(
                project.project_id
              ) ===
              String(
                selectedProject.project_id
              )
          );

        if (refreshedProject) {
          setSelectedProject({
            ...refreshedProject,

            normalized_status:
              resolveProjectStatus(
                refreshedProject
              ),

            progress: getNumber(
              refreshedProject.overall_progress,
              refreshedProject.progress,
              refreshedProject.computed_progress
            ),
          });
        }
      } catch (error) {
        setMessageType("error");

        setMessage(
          error.response?.data?.message ||
            error.response?.data?.error ||
            error.response?.data
              ?.sqlMessage ||
            "Failed to update project assignees."
        );
      } finally {
        setActionLoading(false);
      }
    };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="sa-projects-page">
      {/* HEADER */}

      <header className="sa-projects-header">
        <div>
          <h1>All Projects</h1>

          <p>
            View projects across every
            department and assign new
            projects to anyone in the
            organization.
          </p>
        </div>

        <div className="sa-projects-header-actions">
          <button
            type="button"
            className="sa-projects-assign-btn"
            onClick={
              openAssignProjectModal
            }
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
            messageType === "success"
              ? "success"
              : "error"
          }`}
        >
          {message}
        </div>
      )}

      {/* FILTER TOOLBAR */}

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
            placeholder="Search project, creator, assignee, department..."
          />
        </label>

        <select
          value={department}
          onChange={(event) =>
            setDepartment(
              event.target.value
            )
          }
          aria-label="Filter projects by department"
        >
          <option value="all">
            All Departments
          </option>

          {departments.map((item) => (
            <option
              key={item}
              value={item}
            >
              {item}
            </option>
          ))}
        </select>

        <select
          value={creator}
          onChange={(event) =>
            setCreator(
              event.target.value
            )
          }
          aria-label="Filter projects by creator"
        >
          <option value="all">
            All Creators
          </option>

          {creators.map((item) => (
            <option
              key={item}
              value={item}
            >
              {item}
            </option>
          ))}
        </select>
      </section>

      {/* KANBAN */}

      {loading ? (
        <div className="sa-projects-empty">
          Loading projects...
        </div>
      ) : (
        <section
          className="sa-projects-board"
          aria-label="Project Kanban Board"
        >
          {PROJECT_COLUMNS.map(
            (column) => {
              const ColumnIcon =
                column.icon;

              const columnProjects =
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
                      {
                        columnProjects.length
                      }
                    </span>
                  </div>

                  <div className="sa-projects-column-list">
                    {columnProjects.map(
                      (project) => (
                        <ProjectCard
                          key={
                            project.project_id
                          }
                          project={
                            project
                          }
                          onClick={() =>
                            setSelectedProject(
                              project
                            )
                          }
                        />
                      )
                    )}

                    {!columnProjects.length && (
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

      {/* PROJECT DETAILS */}

      {selectedProject && (
        <ProjectDetailsModal
          project={selectedProject}
          onClose={() =>
            setSelectedProject(null)
          }
          onManageAssignees={
            openAssigneeManager
          }
        />
      )}

      {/* ASSIGN NEW PROJECT */}

      {showAssignModal && (
        <AssignProjectModal
          project={newProject}
          setProject={setNewProject}
          users={filteredAssignUsers}
          assignSearch={assignSearch}
          setAssignSearch={
            setAssignSearch
          }
          departmentOptions={
            departmentOptions
          }
          onToggleAssignee={
            toggleNewProjectAssignee
          }
          onClose={
            closeAssignProjectModal
          }
          onSave={createProject}
          loading={actionLoading}
        />
      )}

      {/* MANAGE EXISTING ASSIGNEES */}

      {showAssigneeManager && (
        <ManageAssigneesModal
          project={selectedProject}
          users={filteredEditUsers}
          selectedIds={
            editAssigneeIds
          }
          search={
            editAssigneeSearch
          }
          setSearch={
            setEditAssigneeSearch
          }
          onToggle={
            toggleEditAssignee
          }
          onClose={() => {
            if (!actionLoading) {
              setShowAssigneeManager(
                false
              );
            }
          }}
          onSave={
            saveProjectAssignees
          }
          loading={actionLoading}
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
              size={12}
            />
            Overdue
          </span>
        )}
      </div>

      <div className="sa-project-info-box">
        <span>Department</span>

        <strong>
          {project.department_name ||
            "-"}
        </strong>
      </div>

      <div className="sa-project-info-box">
        <span>Created By</span>

        <strong>
          {project.created_by_name ||
            "-"}
        </strong>
      </div>

      <div className="sa-project-info-box">
        <span>Assigned To</span>

        <strong>
          {project.assigned_names ||
            "-"}
        </strong>
      </div>

      <div className="sa-project-date-grid">
        <div>
          <span>Start Date</span>

          <strong>
            {formatDate(
              project.start_date ||
                project.project_start_date ||
                project.created_at
            )}
          </strong>
        </div>

        <div>
          <span>Due Date</span>

          <strong>
            {formatDate(
              project.due_date ||
                project.end_date ||
                project.project_end_date
            )}
          </strong>
        </div>
      </div>

      <div className="sa-project-progress">
        <div>
          <span>Progress</span>

          <strong>
            {project.progress}%
          </strong>
        </div>

        <progress
          value={project.progress}
          max="100"
        >
          {project.progress}%
        </progress>
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
   PROJECT DETAILS
========================================================= */

const ProjectDetailsModal = ({
  project,
  onClose,
  onManageAssignees,
}) => {
  const overdue =
    isProjectOverdue(project);

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
                project.normalized_status
              )}
            </p>
          </div>

          <div className="sa-project-modal-header-actions">
            <button
              type="button"
              className="sa-project-manage-users-btn"
              onClick={
                onManageAssignees
              }
            >
              <UserPlus size={17} />
              Manage Assignees
            </button>

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

        <div className="sa-project-detail-grid">
          <DetailBox
            label="Status"
            value={statusLabel(
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
              project.division || "-"
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
            label="Assigned To"
            value={
              project.assigned_names
            }
          />

          <DetailBox
            label="Assigned Emails"
            value={
              project.assigned_emails
            }
          />

          <DetailBox
            label="Start Date"
            value={formatDate(
              project.start_date ||
                project.project_start_date ||
                project.created_at
            )}
          />

          <DetailBox
            label="Due Date"
            value={formatDate(
              project.due_date ||
                project.end_date ||
                project.project_end_date
            )}
          />

          <DetailBox
            label="Total Tasks"
            value={
              project.total_tasks || 0
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
            value={project.progress}
            max="100"
          >
            {project.progress}%
          </progress>

          <span>
            Project Progress:{" "}
            {project.progress}%
          </span>
        </div>

        <section className="sa-project-modal-section">
          <h3>
            Description
          </h3>

          <p>
            {project.project_description ||
              project.description ||
              "No description added."}
          </p>
        </section>

        {project.normalized_status ===
          "on_hold" && (
          <div className="sa-project-status-notice hold">
            <PauseCircle
              size={18}
            />

            This project is currently
            on hold.
          </div>
        )}

        {project.normalized_status ===
          "rejected" && (
          <div className="sa-project-status-notice rejected">
            <XCircle size={18} />

            This project has been
            rejected.
          </div>
        )}
      </div>
    </div>
  );
};

/* =========================================================
   ASSIGN NEW PROJECT MODAL
========================================================= */

const AssignProjectModal = ({
  project,
  setProject,
  users,
  assignSearch,
  setAssignSearch,
  departmentOptions,
  onToggleAssignee,
  onClose,
  onSave,
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
              Superadmin can assign a
              project to users from any
              department.
            </p>
          </div>

          <button
            type="button"
            className="sa-project-assignment-close"
            onClick={onClose}
            disabled={loading}
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
              type="text"
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

              {departmentOptions.map(
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

          <label className="sa-project-field">
            <span>
              Division
            </span>

            <input
              type="text"
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
              placeholder="POS, NutraCare, ADV..."
            />
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

                    due_date:
                      previous.due_date &&
                      previous.due_date <
                        event.target
                          .value
                        ? ""
                        : previous.due_date,
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

        <div className="sa-project-assignee-panel">
          <div className="sa-project-assignee-panel-header">
            <div>
              <h3>
                Project Assignees
              </h3>

              <p>
                Selected:{" "}
                {
                  project
                    .assignee_ids
                    .length
                }
              </p>
            </div>

            <label className="sa-project-assignee-search">
              <Search size={17} />

              <input
                value={assignSearch}
                onChange={(event) =>
                  setAssignSearch(
                    event.target
                      .value
                  )
                }
                placeholder="Search people..."
              />
            </label>
          </div>

          <div className="sa-project-assignee-list">
            {users.length ? (
              users.map((user) => {
                const selected =
                  project.assignee_ids
                    .map(String)
                    .includes(
                      String(
                        user.user_id
                      )
                    );

                return (
                  <button
                    type="button"
                    key={
                      user.user_id
                    }
                    className={`sa-project-assignee-card ${
                      selected
                        ? "selected"
                        : ""
                    }`}
                    onClick={() =>
                      onToggleAssignee(
                        user.user_id
                      )
                    }
                  >
                    <span className="sa-project-assignee-checkbox">
                      {selected && (
                        <Check
                          size={15}
                        />
                      )}
                    </span>

                    <div className="sa-project-assignee-copy">
                      <strong>
                        {user.full_name ||
                          "-"}
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
              <div className="sa-project-assignee-empty">
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
            disabled={loading}
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
   MANAGE EXISTING ASSIGNEES
========================================================= */

const ManageAssigneesModal = ({
  project,
  users,
  selectedIds,
  search,
  setSearch,
  onToggle,
  onClose,
  onSave,
  loading,
}) => {
  return (
    <div
      className="sa-project-assignee-manager-backdrop"
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
      <div className="sa-project-assignee-manager-modal">
        <div className="sa-project-assignment-header">
          <div>
            <h2>
              Manage Assignees
            </h2>

            <p>
              {project?.project_title ||
                "Project"}
            </p>
          </div>

          <button
            type="button"
            className="sa-project-assignment-close"
            onClick={onClose}
            disabled={loading}
          >
            <X size={19} />
          </button>
        </div>

        <div className="sa-project-assignee-manager-summary">
          <Users size={18} />

          <span>
            {selectedIds.length}{" "}
            {selectedIds.length === 1
              ? "person"
              : "people"}{" "}
            selected
          </span>
        </div>

        <label className="sa-project-assignee-search sa-project-assignee-manager-search">
          <Search size={17} />

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search all users..."
          />
        </label>

        <div className="sa-project-assignee-list sa-project-assignee-manager-list">
          {users.length ? (
            users.map((user) => {
              const selected =
                selectedIds
                  .map(String)
                  .includes(
                    String(
                      user.user_id
                    )
                  );

              return (
                <button
                  type="button"
                  key={user.user_id}
                  className={`sa-project-assignee-card ${
                    selected
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    onToggle(
                      user.user_id
                    )
                  }
                >
                  <span className="sa-project-assignee-checkbox">
                    {selected && (
                      <Check size={15} />
                    )}
                  </span>

                  <div className="sa-project-assignee-copy">
                    <strong>
                      {user.full_name ||
                        "-"}
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
            <div className="sa-project-assignee-empty">
              No matching users.
            </div>
          )}
        </div>

        <div className="sa-project-assignment-footer">
          <button
            type="button"
            className="sa-project-assignment-cancel"
            onClick={onClose}
            disabled={loading}
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
   DETAIL BOX
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

export default SuperadminProjects;