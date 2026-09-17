import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Clock,
  Edit3,
  History,
  Plus,
  RefreshCw,
  Timer,
  X,
} from "lucide-react";
import api from "../../api/axios";

/* =========================================================
   CONSTANTS
========================================================= */

const DIVISIONS = [
  "POS",
  "NutraCare",
  "ADV",
  "Cans",
  "PET",
  "Crunzo",
  "VBSW",
  "VNL",
];

const getToday = () => {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const createEmptyForm = () => ({
  mini_task_title: "",
  mini_task_description: "",
  division: "",
  start_date: getToday(),
  end_date: getToday(),
  start_time: "",
  end_time: "",
  edit_remark: "",
});

/* =========================================================
   COMPONENT
========================================================= */

const EmployeeMiniTasks = () => {
  const [miniTasks, setMiniTasks] = useState([]);

  const [form, setForm] = useState(
    createEmptyForm()
  );

  const [showModal, setShowModal] =
    useState(false);

  const [editingTask, setEditingTask] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [modalError, setModalError] =
    useState("");

  /* =========================================================
     EDIT HISTORY
  ========================================================= */

  const [showHistoryModal, setShowHistoryModal] =
    useState(false);

  const [historyTask, setHistoryTask] =
    useState(null);

  const [editHistory, setEditHistory] =
    useState([]);

  const [historyLoading, setHistoryLoading] =
    useState(false);

  const [historyError, setHistoryError] =
    useState("");

  /* =========================================================
     FETCH MINI TASKS
  ========================================================= */

  const fetchMiniTasks = async () => {
    try {
      setLoading(true);
      setMessage("");

      const response = await api.get(
        "/employee-mini-tasks/my"
      );

      setMiniTasks(
        Array.isArray(
          response.data?.mini_tasks
        )
          ? response.data.mini_tasks
          : []
      );
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to load mini tasks."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMiniTasks();
  }, []);

  /* =========================================================
     FORMAT HELPERS
  ========================================================= */

  const formatDuration = (minutes) => {
    const value = Number(minutes || 0);

    const days = Math.floor(
      value / (24 * 60)
    );

    const remainingAfterDays =
      value % (24 * 60);

    const hours = Math.floor(
      remainingAfterDays / 60
    );

    const mins =
      remainingAfterDays % 60;

    const parts = [];

    if (days > 0) {
      parts.push(
        `${days} ${days === 1 ? "day" : "days"}`
      );
    }

    if (hours > 0) {
      parts.push(
        `${hours} ${hours === 1 ? "hr" : "hrs"}`
      );
    }

    if (mins > 0 || parts.length === 0) {
      parts.push(`${mins} min`);
    }

    return parts.join(" ");
  };

  const formatDate = (value) => {
    if (!value) return "-";

    const [year, month, day] =
      String(value)
        .slice(0, 10)
        .split("-");

    return `${day}-${month}-${year}`;
  };

  const formatTime = (value) => {
    if (!value) return "-";

    const [hours, minutes] =
      String(value).split(":");

    const hour = Number(hours);

    const suffix =
      hour >= 12 ? "PM" : "AM";

    const displayHour =
      hour % 12 || 12;

    return `${displayHour}:${minutes} ${suffix}`;
  };

  const formatDateTime = (value) => {
    if (!value) return "-";

    const date = new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return String(value);
    }

    return date.toLocaleString();
  };

  /* =========================================================
     DURATION
  ========================================================= */

  const calculateMinutes = useMemo(() => {
    if (
      !form.start_date ||
      !form.end_date ||
      !form.start_time ||
      !form.end_time
    ) {
      return 0;
    }

    const start = new Date(
      `${form.start_date}T${form.start_time}:00`
    );

    const end = new Date(
      `${form.end_date}T${form.end_time}:00`
    );

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      return 0;
    }

    const difference =
      end.getTime() -
      start.getTime();

    if (difference <= 0) {
      return 0;
    }

    return Math.floor(
      difference / 60000
    );
  }, [
    form.start_date,
    form.end_date,
    form.start_time,
    form.end_time,
  ]);

  /* =========================================================
     FORM
  ========================================================= */

  const updateForm = (
    field,
    value
  ) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));

    setModalError("");
  };

  /* =========================================================
     OPEN ADD
  ========================================================= */

  const openAddModal = () => {
    setEditingTask(null);

    setForm(
      createEmptyForm()
    );

    setModalError("");
    setShowModal(true);
  };

  /* =========================================================
     OPEN EDIT
  ========================================================= */

  const openEditModal = (task) => {
    setEditingTask(task);

    setForm({
      mini_task_title:
        task.mini_task_title || "",

      mini_task_description:
        task.mini_task_description || "",

      division:
        task.division || "",

      start_date:
        task.start_date ||
        task.task_date ||
        getToday(),

      end_date:
        task.end_date ||
        task.task_date ||
        getToday(),

      start_time:
        String(
          task.start_time || ""
        ).slice(0, 5),

      end_time:
        String(
          task.end_time || ""
        ).slice(0, 5),

      edit_remark: "",
    });

    setModalError("");
    setShowModal(true);
  };

  /* =========================================================
     CLOSE FORM
  ========================================================= */

  const closeModal = () => {
    if (saving) return;

    setShowModal(false);
    setEditingTask(null);
    setModalError("");

    setForm(
      createEmptyForm()
    );
  };

  /* =========================================================
     SUBMIT ADD / EDIT
  ========================================================= */

  const submitMiniTask = async (
    event
  ) => {
    event.preventDefault();

    if (
      !form.mini_task_title.trim()
    ) {
      setModalError(
        "Mini task title is required."
      );
      return;
    }

    if (!form.division) {
      setModalError(
        "Division is required."
      );
      return;
    }

    if (!form.start_date) {
      setModalError(
        "Start date is required."
      );
      return;
    }

    if (!form.end_date) {
      setModalError(
        "End date is required."
      );
      return;
    }

    if (
      !form.start_time ||
      !form.end_time
    ) {
      setModalError(
        "Start time and end time are required."
      );
      return;
    }

    if (calculateMinutes <= 0) {
      setModalError(
        "End date and time must be after start date and time."
      );
      return;
    }

    if (
      editingTask &&
      !form.edit_remark.trim()
    ) {
      setModalError(
        "Edit remark is required."
      );
      return;
    }

    try {
      setSaving(true);
      setModalError("");

      const payload = {
        mini_task_title:
          form.mini_task_title.trim(),

        mini_task_description:
          form.mini_task_description.trim(),

        division:
          form.division,

        start_date:
          form.start_date,

        end_date:
          form.end_date,

        start_time:
          form.start_time,

        end_time:
          form.end_time,
      };

      if (editingTask) {
        payload.edit_remark =
          form.edit_remark.trim();

        await api.put(
          `/employee-mini-tasks/${editingTask.mini_task_id}`,
          payload
        );

        setMessage(
          "Mini task updated successfully."
        );
      } else {
        await api.post(
          "/employee-mini-tasks",
          payload
        );

        setMessage(
          "Mini task added successfully."
        );
      }

      setShowModal(false);
      setEditingTask(null);

      setForm(
        createEmptyForm()
      );

      await fetchMiniTasks();
    } catch (error) {
      setModalError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          (
            editingTask
              ? "Failed to update mini task."
              : "Failed to add mini task."
          )
      );
    } finally {
      setSaving(false);
    }
  };

  /* =========================================================
     EDIT HISTORY
  ========================================================= */

  const openHistoryModal = async (
    task
  ) => {
    setHistoryTask(task);
    setEditHistory([]);
    setHistoryError("");
    setShowHistoryModal(true);

    try {
      setHistoryLoading(true);

      const response =
        await api.get(
          `/employee-mini-tasks/${task.mini_task_id}/edit-history`
        );

      setEditHistory(
        Array.isArray(
          response.data?.edit_history
        )
          ? response.data.edit_history
          : []
      );
    } catch (error) {
      setHistoryError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to load edit history."
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistoryModal = () => {
    if (historyLoading) return;

    setShowHistoryModal(false);
    setHistoryTask(null);
    setEditHistory([]);
    setHistoryError("");
  };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <>
      <section style={styles.card}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>
              <Timer
                size={22}
                color="#ff5733"
              />

              Mini Tasks
            </h2>

            <p style={styles.subtitle}>
              Meetings, calls, discussions and other work
              outside project tasks.
            </p>
          </div>

          <div style={styles.headerActions}>
            <button
              type="button"
              style={styles.refreshBtn}
              onClick={fetchMiniTasks}
              disabled={loading}
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>

            <button
              type="button"
              style={styles.addBtn}
              onClick={openAddModal}
            >
              <Plus size={17} />
              Add Mini Task
            </button>
          </div>
        </div>

        {message && (
          <div style={styles.message}>
            {message}
          </div>
        )}

        {loading ? (
          <div style={styles.empty}>
            Loading mini tasks...
          </div>
        ) : miniTasks.length === 0 ? (
          <div style={styles.empty}>
            No mini tasks added yet.
          </div>
        ) : (
          <div style={styles.list}>
            {miniTasks
              .slice(0, 6)
              .map((task) => {
                const startDate =
                  task.start_date ||
                  task.task_date;

                const endDate =
                  task.end_date ||
                  task.task_date;

                const sameDate =
                  startDate === endDate;

                return (
                  <div
                    style={styles.taskRow}
                    key={task.mini_task_id}
                  >
                    <div style={styles.taskMain}>
                      <div
                        style={
                          styles.taskTitleLine
                        }
                      >
                        <strong
                          style={
                            styles.taskTitle
                          }
                        >
                          {
                            task.mini_task_title
                          }
                        </strong>

                        {task.division && (
                          <span
                            style={
                              styles.divisionBadge
                            }
                          >
                            {task.division}
                          </span>
                        )}
                      </div>

                      <span
                        style={
                          styles.taskDescription
                        }
                      >
                        {task.mini_task_description ||
                          "-"}
                      </span>
                    </div>

                    <div style={styles.metaItem}>
                      <CalendarDays size={15} />

                      {sameDate
                        ? formatDate(
                            startDate
                          )
                        : `${formatDate(
                            startDate
                          )} - ${formatDate(
                            endDate
                          )}`}
                    </div>

                    <div style={styles.metaItem}>
                      <Clock size={15} />

                      {formatTime(
                        task.start_time
                      )}{" "}
                      -{" "}
                      {formatTime(
                        task.end_time
                      )}
                    </div>

                    <div style={styles.duration}>
                      <Timer size={15} />

                      {formatDuration(
                        task.total_minutes
                      )}
                    </div>

                    <span
                      style={{
                        ...styles.statusBadge,
                        ...(task.status ===
                        "reviewed"
                          ? styles.reviewedBadge
                          : styles.loggedBadge),
                      }}
                    >
                      {task.status ===
                      "reviewed"
                        ? "Reviewed"
                        : "Logged"}
                    </span>

                    <div
                      style={
                        styles.rowActions
                      }
                    >
                      <button
                        type="button"
                        style={
                          styles.iconActionBtn
                        }
                        onClick={() =>
                          openEditModal(
                            task
                          )
                        }
                        title="Edit Mini Task"
                      >
                        <Edit3 size={15} />
                      </button>

                      <button
                        type="button"
                        style={
                          styles.iconActionBtn
                        }
                        onClick={() =>
                          openHistoryModal(
                            task
                          )
                        }
                        title="Edit History"
                      >
                        <History size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {/* =====================================================
          ADD / EDIT MODAL
      ===================================================== */}

      {showModal && (
        <div
          style={styles.modalOverlay}
          onMouseDown={closeModal}
        >
          <div
            style={styles.modal}
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <button
              type="button"
              style={styles.closeBtn}
              onClick={closeModal}
            >
              <X size={20} />
            </button>

            <h2 style={styles.modalTitle}>
              {editingTask
                ? "Edit Mini Task"
                : "Add Mini Task"}
            </h2>

            <p style={styles.modalSubtitle}>
              {editingTask
                ? "Update this mini task and provide a reason for the change."
                : "Schedule work that happens outside your project tasks."}
            </p>

            {modalError && (
              <div style={styles.modalError}>
                {modalError}
              </div>
            )}

            <form
              onSubmit={submitMiniTask}
            >
              <label style={styles.field}>
                <span>Title</span>

                <input
                  style={styles.input}
                  value={
                    form.mini_task_title
                  }
                  onChange={(event) =>
                    updateForm(
                      "mini_task_title",
                      event.target.value
                    )
                  }
                  placeholder="Example: Sales meeting"
                />
              </label>

              <label style={styles.field}>
                <span>Description</span>

                <textarea
                  style={styles.textarea}
                  value={
                    form.mini_task_description
                  }
                  onChange={(event) =>
                    updateForm(
                      "mini_task_description",
                      event.target.value
                    )
                  }
                  placeholder="What will you be working on?"
                />
              </label>

              <label style={styles.field}>
                <span>Division</span>

                <select
                  style={styles.input}
                  value={form.division}
                  onChange={(event) =>
                    updateForm(
                      "division",
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    Select Division
                  </option>

                  {DIVISIONS.map(
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

              <div style={styles.formGrid}>
                <label style={styles.field}>
                  <span>Start Date</span>

                  <input
                    type="date"
                    style={styles.input}
                    value={
                      form.start_date
                    }
                    onChange={(event) =>
                      updateForm(
                        "start_date",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label style={styles.field}>
                  <span>End Date</span>

                  <input
                    type="date"
                    style={styles.input}
                    value={
                      form.end_date
                    }
                    onChange={(event) =>
                      updateForm(
                        "end_date",
                        event.target.value
                      )
                    }
                  />
                </label>
              </div>

              <div style={styles.formGrid}>
                <label style={styles.field}>
                  <span>Start Time</span>

                  <input
                    type="time"
                    style={styles.input}
                    value={
                      form.start_time
                    }
                    onChange={(event) =>
                      updateForm(
                        "start_time",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label style={styles.field}>
                  <span>End Time</span>

                  <input
                    type="time"
                    style={styles.input}
                    value={
                      form.end_time
                    }
                    onChange={(event) =>
                      updateForm(
                        "end_time",
                        event.target.value
                      )
                    }
                  />
                </label>
              </div>

              {editingTask && (
                <label style={styles.field}>
                  <span>
                    Edit Remark *
                  </span>

                  <textarea
                    style={
                      styles.remarkTextarea
                    }
                    value={
                      form.edit_remark
                    }
                    onChange={(event) =>
                      updateForm(
                        "edit_remark",
                        event.target.value
                      )
                    }
                    placeholder="Why are you changing this mini task?"
                  />
                </label>
              )}

              <div
                style={
                  styles.durationPreview
                }
              >
                <span>
                  Scheduled Duration
                </span>

                <strong>
                  {calculateMinutes > 0
                    ? formatDuration(
                        calculateMinutes
                      )
                    : "0 min"}
                </strong>
              </div>

              <div
                style={
                  styles.modalActions
                }
              >
                <button
                  type="button"
                  style={
                    styles.cancelBtn
                  }
                  onClick={closeModal}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  style={
                    styles.submitBtn
                  }
                  disabled={saving}
                >
                  {editingTask ? (
                    <Edit3 size={17} />
                  ) : (
                    <Plus size={17} />
                  )}

                  {saving
                    ? editingTask
                      ? "Saving..."
                      : "Adding..."
                    : editingTask
                      ? "Save Changes"
                      : "Add Mini Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================
          HISTORY MODAL
      ===================================================== */}

      {showHistoryModal && (
        <div
          style={styles.modalOverlay}
          onMouseDown={
            closeHistoryModal
          }
        >
          <div
            style={styles.historyModal}
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <button
              type="button"
              style={styles.closeBtn}
              onClick={
                closeHistoryModal
              }
            >
              <X size={20} />
            </button>

            <h2 style={styles.modalTitle}>
              Edit History
            </h2>

            <p
              style={
                styles.modalSubtitle
              }
            >
              {historyTask?.mini_task_title ||
                "Mini Task"}
            </p>

            {historyError && (
              <div
                style={
                  styles.modalError
                }
              >
                {historyError}
              </div>
            )}

            {historyLoading ? (
              <div style={styles.empty}>
                Loading edit history...
              </div>
            ) : editHistory.length ===
              0 ? (
              <div style={styles.empty}>
                No edits have been made to
                this mini task.
              </div>
            ) : (
              <div
                style={
                  styles.historyList
                }
              >
                {editHistory.map(
                  (history) => (
                    <div
                      key={
                        history.edit_id
                      }
                      style={
                        styles.historyItem
                      }
                    >
                      <div
                        style={
                          styles.historyHeader
                        }
                      >
                        <strong>
                          {
                            history.edit_remark
                          }
                        </strong>

                        <span>
                          {formatDateTime(
                            history.edited_at
                          )}
                        </span>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

/* =========================================================
   STYLES
========================================================= */

const styles = {
  card: {
    width: "100%",
    background: "#ffffff",
    border:
      "1px solid #e5e7eb",
    borderRadius: "20px",
    padding: "18px 20px",
    boxSizing: "border-box",
    boxShadow:
      "0 8px 20px rgba(15,23,42,0.05)",
  },

  header: {
    display: "flex",
    alignItems: "center",
    justifyContent:
      "space-between",
    gap: "16px",
    marginBottom: "14px",
  },

  title: {
    margin: 0,
    color: "#111827",
    fontSize: "22px",
    fontWeight: 900,
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },

  subtitle: {
    margin: "5px 0 0",
    color: "#64748b",
    fontSize: "12px",
  },

  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },

  refreshBtn: {
    width: "40px",
    height: "40px",
    border:
      "1px solid #e5e7eb",
    background: "#ffffff",
    borderRadius: "12px",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },

  addBtn: {
    height: "40px",
    border: 0,
    background: "#ff5733",
    color: "#ffffff",
    borderRadius: "12px",
    padding: "0 15px",
    fontWeight: 900,
    display: "flex",
    alignItems: "center",
    gap: "7px",
    cursor: "pointer",
  },

  message: {
    background: "#f0fdf4",
    border:
      "1px solid #bbf7d0",
    color: "#166534",
    borderRadius: "12px",
    padding: "10px 12px",
    marginBottom: "12px",
    fontSize: "12px",
    fontWeight: 800,
  },

  list: {
    maxHeight: "250px",
    overflowY: "auto",
    overflowX: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },

  taskRow: {
    display: "grid",
    gridTemplateColumns:
      "minmax(210px, 1.7fr) minmax(150px, 1fr) 180px 110px 90px 82px",
    alignItems: "center",
    gap: "12px",
    padding: "11px 13px",
    border:
      "1px solid #e5e7eb",
    borderRadius: "13px",
    background: "#f8fafc",
    minWidth: "930px",
  },

  taskMain: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },

  taskTitleLine: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    minWidth: 0,
  },

  taskTitle: {
    color: "#111827",
    fontSize: "13px",
    fontWeight: 900,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  taskDescription: {
    color: "#64748b",
    fontSize: "11px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  divisionBadge: {
    flexShrink: 0,
    borderRadius: "999px",
    background: "#fff7f4",
    border:
      "1px solid #ffd4c8",
    color: "#c2410c",
    padding: "3px 7px",
    fontSize: "9px",
    fontWeight: 900,
  },

  metaItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: "#475569",
    fontSize: "11px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  duration: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: "#111827",
    fontSize: "11px",
    fontWeight: 900,
    whiteSpace: "nowrap",
  },

  statusBadge: {
    borderRadius: "999px",
    padding: "6px 9px",
    textAlign: "center",
    fontSize: "10px",
    fontWeight: 900,
  },

  loggedBadge: {
    background: "#fef3c7",
    color: "#92400e",
  },

  reviewedBadge: {
    background: "#dcfce7",
    color: "#166534",
  },

  rowActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "5px",
  },

  iconActionBtn: {
    width: "34px",
    height: "34px",
    border:
      "1px solid #e5e7eb",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#475569",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },

  empty: {
    border:
      "1px dashed #d1d5db",
    borderRadius: "13px",
    padding: "16px",
    textAlign: "center",
    color: "#94a3b8",
    fontSize: "12px",
    fontWeight: 800,
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 10000,
    background:
      "rgba(15,23,42,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  },

  modal: {
    width: "min(680px, 95vw)",
    maxHeight: "90vh",
    overflowY: "auto",
    background: "#ffffff",
    borderRadius: "22px",
    padding: "26px",
    position: "relative",
    boxSizing: "border-box",
    boxShadow:
      "0 25px 80px rgba(15,23,42,0.3)",
  },

  historyModal: {
    width: "min(600px, 95vw)",
    maxHeight: "80vh",
    overflowY: "auto",
    background: "#ffffff",
    borderRadius: "22px",
    padding: "26px",
    position: "relative",
    boxSizing: "border-box",
    boxShadow:
      "0 25px 80px rgba(15,23,42,0.3)",
  },

  closeBtn: {
    position: "absolute",
    top: "18px",
    right: "18px",
    width: "40px",
    height: "40px",
    border: 0,
    borderRadius: "12px",
    background: "#111827",
    color: "#ffffff",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },

  modalTitle: {
    margin:
      "0 50px 5px 0",
    fontSize: "25px",
    fontWeight: 900,
    color: "#111827",
  },

  modalSubtitle: {
    margin: "0 0 20px",
    color: "#64748b",
    fontSize: "13px",
  },

  modalError: {
    background: "#fff1f2",
    border:
      "1px solid #fecdd3",
    color: "#b91c1c",
    borderRadius: "12px",
    padding: "11px",
    marginBottom: "14px",
    fontWeight: 800,
  },

  field: {
    display: "grid",
    gap: "7px",
    marginBottom: "14px",
    color: "#111827",
    fontSize: "12px",
    fontWeight: 900,
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns:
      "1fr 1fr",
    gap: "10px",
  },

  input: {
    width: "100%",
    height: "44px",
    boxSizing: "border-box",
    border:
      "1px solid #d1d5db",
    borderRadius: "11px",
    padding: "0 11px",
    fontFamily: "inherit",
    background: "#ffffff",
  },

  textarea: {
    minHeight: "80px",
    border:
      "1px solid #d1d5db",
    borderRadius: "11px",
    padding: "11px",
    fontFamily: "inherit",
    resize: "vertical",
  },

  remarkTextarea: {
    minHeight: "70px",
    border:
      "1px solid #fdba74",
    borderRadius: "11px",
    padding: "11px",
    fontFamily: "inherit",
    resize: "vertical",
    background: "#fffaf7",
  },

  durationPreview: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "center",
    background: "#fff7f4",
    border:
      "1px solid #ffd4c8",
    borderRadius: "12px",
    padding: "12px",
    marginBottom: "18px",
    fontSize: "13px",
  },

  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
  },

  cancelBtn: {
    height: "44px",
    minWidth: "100px",
    border:
      "1px solid #d1d5db",
    borderRadius: "12px",
    background: "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
  },

  submitBtn: {
    height: "44px",
    border: 0,
    borderRadius: "12px",
    background: "#ff5733",
    color: "#ffffff",
    padding: "0 17px",
    fontWeight: 900,
    display: "flex",
    alignItems: "center",
    gap: "7px",
    cursor: "pointer",
  },

  historyList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },

  historyItem: {
    border:
      "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "12px",
    background: "#f8fafc",
  },

  historyHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "flex-start",
    gap: "12px",
    color: "#111827",
    fontSize: "12px",
  },
};

export default EmployeeMiniTasks;