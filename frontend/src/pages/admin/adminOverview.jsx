import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  PauseCircle,
  RefreshCw,
  Users,
  XCircle,
} from "lucide-react";
import api from "../../api/axios";

const statusLabels = {
  todo: "To Do",
  not_started: "To Do",
  in_progress: "In Progress",
  ongoing: "In Progress",
  under_review: "Under Review",
  done: "Done",
  completed: "Completed",
  rejected: "Rejected",
  blocked: "Blocked",
  on_hold: "On Hold",
  cancelled: "Cancelled",
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
  return String(value).slice(0, 10);
};

const styles = {
  page: {
    paddingBottom: "40px",
  },

topActions: {
  width: "100%",
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  marginBottom: "16px",
},

refreshBtn: {
  border: "0",
  borderRadius: "12px",
  background: "#ff5733",
  color: "#ffffff",
  padding: "10px 16px",
  display: "flex",
  alignItems: "center",
  gap: "7px",
  fontSize: "15px",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 10px 24px rgba(255, 87, 51, 0.18)",
},

  success: {
    background: "#f0fdf4",
    color: "#15803d",
    border: "1px solid #bbf7d0",
    borderRadius: "14px",
    padding: "13px 16px",
    marginBottom: "20px",
    fontWeight: 800,
  },

 statsGrid: {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(190px, 1fr))",
  gap: "18px",
  marginBottom: "22px",
},
statCard: {
  background: "#ffffff",
  border: "1px solid #eeeeee",
  borderRadius: "20px",
  padding: "20px 22px",
  boxShadow: "0 8px 22px rgba(0,0,0,0.04)",
  cursor: "pointer",
  textAlign: "left",
  minHeight: "122px",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "center",
},

statIcon: {
  color: "#ff5733",
  marginBottom: "10px",
},

statLabel: {
  display: "block",
  color: "#667085",
  fontSize: "14px",
  fontWeight: 900,
  marginBottom: "6px",
},
statValue: {
  display: "block",
  color: "#111827",
  fontSize: "31px",
  fontWeight: 900,
},

  gridTwo: {
    display: "grid",
    gridTemplateColumns: "1.25fr 0.75fr",
    gap: "22px",
    marginBottom: "24px",
  },

  card: {
    background: "#ffffff",
    border: "1px solid #eeeeee",
    borderRadius: "24px",
    padding: "26px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.045)",
    marginBottom: "24px",
  },

  sectionTitle: {
    margin: 0,
    color: "#111827",
    fontSize: "25px",
    fontWeight: 900,
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },

  sectionSubtitle: {
    margin: "7px 0 20px",
    color: "#667085",
    fontSize: "14px",
  },

  reviewGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "16px",
  },

  reviewCard: {
    border: "1px solid #ffb4a3",
    background: "#fff7f4",
    borderRadius: "20px",
    padding: "18px",
  },

  reviewTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "14px",
    marginBottom: "12px",
  },

  reviewTitle: {
    margin: 0,
    color: "#111827",
    fontSize: "18px",
    fontWeight: 900,
  },

  reviewDesc: {
    margin: "6px 0 0",
    color: "#667085",
    fontSize: "14px",
    lineHeight: 1.5,
  },

  reviewMetaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "14px",
    margin: "14px 0",
  },

  reviewMetaBox: {
    background: "#ffffff",
    border: "1px solid #ffe2dc",
    borderRadius: "14px",
    padding: "12px",
    minWidth: 0,
    overflow: "hidden",
  },

  reviewActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "14px",
  },

  doneBtn: {
    border: "0",
    borderRadius: "12px",
    background: "#16a34a",
    color: "#ffffff",
    padding: "11px 14px",
    fontWeight: 900,
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    cursor: "pointer",
  },

  rejectBtn: {
    border: "0",
    borderRadius: "12px",
    background: "#dc2626",
    color: "#ffffff",
    padding: "11px 14px",
    fontWeight: 900,
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    cursor: "pointer",
  },

  holdBtn: {
    border: "0",
    borderRadius: "12px",
    background: "#111827",
    color: "#ffffff",
    padding: "11px 14px",
    fontWeight: 900,
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    cursor: "pointer",
  },

  badge: {
    borderRadius: "999px",
    background: "#eef2ff",
    color: "#344054",
    padding: "7px 12px",
    fontSize: "12px",
    fontWeight: 900,
    whiteSpace: "nowrap",
  },

  activityList: {
    display: "grid",
    gap: "14px",
  },

  activityItem: {
    border: "1px solid #edf0f4",
    background: "#f8fafc",
    borderRadius: "18px",
    padding: "18px",
    display: "grid",
    gridTemplateColumns: "18px 1fr",
    gap: "14px",
  },

  dot: {
    width: "12px",
    height: "12px",
    borderRadius: "999px",
    background: "#ff5733",
    marginTop: "6px",
  },

  activityTitle: {
    margin: 0,
    color: "#111827",
    fontSize: "16px",
    fontWeight: 900,
  },

  activityDesc: {
    margin: "7px 0 0",
    color: "#344054",
    fontSize: "14px",
    lineHeight: 1.5,
  },

  activityMeta: {
    margin: "10px 0 0",
    color: "#98a2b3",
    fontSize: "13px",
    fontWeight: 700,
  },

  attendanceCircle: {
    width: "150px",
    height: "150px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #ff5733, #ff8a65)",
    color: "#ffffff",
    display: "grid",
    placeItems: "center",
    margin: "4px auto 18px",
    boxShadow: "0 16px 30px rgba(255,87,51,0.25)",
  },

  attendanceNumber: {
    fontSize: "38px",
    fontWeight: 900,
  },

  miniGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "12px",
  },

  miniCard: {
    border: "1px solid #edf0f4",
    borderRadius: "16px",
    background: "#f8fafc",
    padding: "14px",
  },

  miniValue: {
    display: "block",
    color: "#111827",
    fontSize: "23px",
    fontWeight: 900,
    marginBottom: "4px",
  },

  miniLabel: {
    color: "#667085",
    fontSize: "13px",
    fontWeight: 800,
  },

  empty: {
    border: "1px dashed #d0d5dd",
    borderRadius: "18px",
    padding: "24px",
    textAlign: "center",
    color: "#667085",
    fontWeight: 800,
  },
};

const AdminOverview = () => {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [attendanceSummary, setAttendanceSummary] = useState({});
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [reviewNotifications, setReviewNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewingProjectId, setReviewingProjectId] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setSuccessMessage("");

      const [profileResult, tasksResult, attendanceResult, reviewResult] =
        await Promise.allSettled([
          api.get("/admin-profile/me"),
          api.get("/admin-tasks/department-tasks"),
          api.get("/admin-attendance/department-attendance"),
          api.get("/admin-projects/review-notifications"),
        ]);

      if (profileResult.status === "fulfilled") {
        setProfile(profileResult.value.data?.admin || null);
      }

      if (tasksResult.status === "fulfilled") {
        setTasks(tasksResult.value.data?.tasks || []);
      }

      if (attendanceResult.status === "fulfilled") {
        setAttendanceSummary(attendanceResult.value.data?.summary || {});
        setAttendanceRecords(attendanceResult.value.data?.records || []);
      }

      if (reviewResult.status === "fulfilled") {
        setReviewNotifications(reviewResult.value.data?.notifications || []);
      } else {
        setReviewNotifications([]);
      }
    } catch (error) {
      console.error("Admin overview load error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const user = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  }, []);

  const adminName = profile?.full_name || user?.full_name || "Admin";

  const totalUsers = getNumber(
    attendanceSummary.total_people,
    attendanceSummary.department_users,
    attendanceSummary.total_users
  );

  const totalTasks = tasks.length;

  const totalProjects = useMemo(() => {
    const projectKeys = new Set();

    tasks.forEach((task) => {
      const key = task.project_id || task.project_title;
      if (key) projectKeys.add(key);
    });

    return projectKeys.size;
  }, [tasks]);

  const attendancePercentage = useMemo(() => {
    const totalRecords = getNumber(attendanceSummary.total_records);
    const presentCount = getNumber(attendanceSummary.present_count);

    if (totalRecords === 0) return 0;

    return Math.round((presentCount / totalRecords) * 100);
  }, [attendanceSummary]);

  const activities = useMemo(() => {
    const reviewActivities = reviewNotifications.slice(0, 4).map((project) => ({
      type: "Review Required",
      title: project.project_title || "Project",
      description: `${
        project.assigned_names || "Assignee"
      } submitted this project for review.`,
      meta: `${project.department_name || "-"} · ${formatDate(
        project.end_date
      )}`,
    }));

    const taskActivities = tasks.slice(0, 4).map((task) => ({
      type: "Task",
      title: task.task_title || "Task",
      description: `${task.assigned_name || "Employee"} is working on ${
        task.project_title || "project"
      }. Status: ${
        task.status_label || statusLabels[task.status_group] || "-"
      }`,
      meta: `${task.assigned_email || "-"} · ${formatDate(
        task.project_end_date || task.due_date
      )}`,
    }));

    const attendanceActivities = attendanceRecords.slice(0, 4).map((record) => ({
      type: "Attendance",
      title: record.full_name || "Attendance",
      description: `${record.attendance_status || "-"} attendance marked.`,
      meta: `${record.email || "-"} · ${formatDate(record.attendance_date)}`,
    }));

    return [
      ...reviewActivities,
      ...taskActivities,
      ...attendanceActivities,
    ].slice(0, 8);
  }, [tasks, attendanceRecords, reviewNotifications]);

  const reviewProject = async (projectId, action) => {
    try {
      setReviewingProjectId(projectId);
      setSuccessMessage("");

      const response = await api.put(
        `/admin-projects/projects/${projectId}/review`,
        {
          action,
        }
      );

      setSuccessMessage(
        response.data?.message || "Project reviewed successfully."
      );

      await fetchOverview();
    } catch (error) {
      console.error("Review project error:", error);
    } finally {
      setReviewingProjectId(null);
    }
  };

  if (loading) {
    return (
      <div style={styles.card}>
        <strong>Loading admin overview...</strong>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.topActions}>
        <button type="button" style={styles.refreshBtn} onClick={fetchOverview}>
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>

      {successMessage && <div style={styles.success}>{successMessage}</div>}

      <section style={styles.statsGrid}>
        <button
          type="button"
          style={styles.statCard}
          onClick={() => navigate("/admin/users")}
        >
          <div style={styles.statIcon}>
            <Users size={19} />
          </div>

          <span style={styles.statLabel}>Department Users</span>
          <strong style={styles.statValue}>{totalUsers}</strong>
        </button>

        <button
          type="button"
          style={styles.statCard}
          onClick={() => navigate("/admin/projects")}
        >
          <div style={styles.statIcon}>
            <FolderKanban size={19} />
          </div>

          <span style={styles.statLabel}>Department Projects</span>
          <strong style={styles.statValue}>{totalProjects}</strong>
        </button>

        <button
          type="button"
          style={styles.statCard}
          onClick={() => navigate("/admin/tasks")}
        >
          <div style={styles.statIcon}>
            <ClipboardList size={19} />
          </div>

          <span style={styles.statLabel}>Department Tasks</span>
          <strong style={styles.statValue}>{totalTasks}</strong>
        </button>
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>
          <AlertCircle size={22} color="#ff5733" />
          Projects Waiting For Review
        </h2>

        <p style={styles.sectionSubtitle}>
          When an employee completes all subtasks, the project appears here for
          Done, Reject, or On Hold action.
        </p>

        {reviewNotifications.length > 0 ? (
          <div style={styles.reviewGrid}>
            {reviewNotifications.map((project) => (
              <div style={styles.reviewCard} key={project.project_id}>
                <div style={styles.reviewTop}>
                  <div>
                    <h3 style={styles.reviewTitle}>{project.project_title}</h3>
                    <p style={styles.reviewDesc}>
                      {project.description || project.message || "-"}
                    </p>
                  </div>

                  <span style={styles.badge}>Under Review</span>
                </div>

                <div style={styles.reviewMetaGrid}>
                  <div style={styles.reviewMetaBox}>
                    <span style={styles.miniLabel}>Assigned To</span>
                    <strong>{project.assigned_names || "-"}</strong>
                  </div>

                  <div style={styles.reviewMetaBox}>
                    <span style={styles.miniLabel}>Department</span>
                    <strong>{project.department_name || "-"}</strong>
                  </div>

                  <div style={styles.reviewMetaBox}>
                    <span style={styles.miniLabel}>Start Date</span>
                    <strong>{formatDate(project.start_date)}</strong>
                  </div>

                  <div style={styles.reviewMetaBox}>
                    <span style={styles.miniLabel}>End Date</span>
                    <strong>{formatDate(project.end_date)}</strong>
                  </div>
                </div>

                <p style={styles.activityDesc}>
                  {project.message ||
                    "Project completed by assignee. Kindly review it."}
                </p>

                <div style={styles.reviewActions}>
                  <button
                    type="button"
                    style={styles.doneBtn}
                    disabled={reviewingProjectId === project.project_id}
                    onClick={() => reviewProject(project.project_id, "done")}
                  >
                    <CheckCircle2 size={16} />
                    Done
                  </button>

                  <button
                    type="button"
                    style={styles.rejectBtn}
                    disabled={reviewingProjectId === project.project_id}
                    onClick={() => reviewProject(project.project_id, "reject")}
                  >
                    <XCircle size={16} />
                    Reject
                  </button>

                  <button
                    type="button"
                    style={styles.holdBtn}
                    disabled={reviewingProjectId === project.project_id}
                    onClick={() => reviewProject(project.project_id, "hold")}
                  >
                    <PauseCircle size={16} />
                    Put On Hold
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.empty}>No projects waiting for review.</div>
        )}
      </section>

      <section style={styles.gridTwo}>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>
            <Activity size={22} color="#ff5733" />
            Activity Log
          </h2>

          <p style={styles.sectionSubtitle}>
            Recent task, review, and attendance activity visible to {adminName}.
          </p>

          {activities.length > 0 ? (
            <div style={styles.activityList}>
              {activities.map((item, index) => (
                <div style={styles.activityItem} key={index}>
                  <div style={styles.dot} />

                  <div>
                    <h3 style={styles.activityTitle}>{item.type}</h3>
                    <p style={styles.activityDesc}>
                      <strong>{item.title}</strong> — {item.description}
                    </p>
                    <p style={styles.activityMeta}>{item.meta}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={styles.empty}>No activity found.</div>
          )}
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>
            <CalendarCheck size={22} color="#ff5733" />
            Attendance
          </h2>

          <p style={styles.sectionSubtitle}>
            Department attendance summary for {adminName}.
          </p>

          <div style={styles.attendanceCircle}>
            <span style={styles.attendanceNumber}>{attendancePercentage}%</span>
          </div>

          <div style={styles.miniGrid}>
            <div style={styles.miniCard}>
              <strong style={styles.miniValue}>
                {attendanceSummary.present_count || 0}
              </strong>
              <span style={styles.miniLabel}>Present</span>
            </div>

            <div style={styles.miniCard}>
              <strong style={styles.miniValue}>
                {attendanceSummary.absent_count || 0}
              </strong>
              <span style={styles.miniLabel}>Absent</span>
            </div>

            <div style={styles.miniCard}>
              <strong style={styles.miniValue}>
                {attendanceSummary.late_count || 0}
              </strong>
              <span style={styles.miniLabel}>Late</span>
            </div>

            <div style={styles.miniCard}>
              <strong style={styles.miniValue}>
                {attendanceSummary.total_records || 0}
              </strong>
              <span style={styles.miniLabel}>Total Records</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AdminOverview;