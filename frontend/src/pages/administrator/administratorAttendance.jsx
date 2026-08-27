import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarCheck,
  Download,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";

import api from "../../api/axios";
import LeaveApplicationButton from "../../components/LeaveApplicationButton";
import "./administratorAttendance.css";

const normalizeStatus = (status) => {
  const value = String(status || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  if (value === "present") return "present";
  if (value === "absent") return "absent";
  if (value === "late") return "late";
  if (value === "leave") return "leave";
  if (value === "half_day") return "half_day";
  if (value === "holiday") return "holiday";

  return value || "absent";
};

const formatStatus = (status) => {
  const value = normalizeStatus(status);

  if (value === "present") return "Present";
  if (value === "absent") return "Absent";
  if (value === "late") return "Late";
  if (value === "leave") return "Leave";
  if (value === "half_day") return "Half Day";
  if (value === "holiday") return "Holiday";

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const getStatusStyle = (status) => {
  const value = normalizeStatus(status);

  if (value === "present") {
    return { background: "#dcfce7", color: "#166534" };
  }

  if (value === "absent") {
    return { background: "#fee2e2", color: "#991b1b" };
  }

  if (value === "late") {
    return { background: "#fef3c7", color: "#92400e" };
  }

  if (value === "leave") {
    return { background: "#e0e7ff", color: "#3730a3" };
  }

  if (value === "half_day") {
    return { background: "#fff7ed", color: "#c2410c" };
  }

  if (value === "holiday") {
    return { background: "#f3e8ff", color: "#7e22ce" };
  }

  return { background: "#eef2ff", color: "#334155" };
};

const getDateOnly = (value) => {
  if (!value) return "";

  const text = String(value);

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return text.slice(0, 10);

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getCurrentWeekRange = () => {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;

  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);

  const format = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const dateValue = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${dateValue}`;
  };

  return {
    start: format(monday),
    end: format(saturday),
  };
};

const isCurrentMonth = (value) => {
  const date = getDateOnly(value);

  if (!date) return false;

  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");

  return date.startsWith(`${year}-${month}`);
};

const getWorkingHours = (row) => {
  if (row.working_hours) return row.working_hours;

  const totalMinutes = Number(row.total_minutes || 0);

  if (!totalMinutes) return "-";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;

  return `${minutes}m`;
};

const AdministratorAttendance = () => {
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState("my");

  const [profile, setProfile] = useState({});
  const [personalSummary, setPersonalSummary] = useState({});
  const [personalAttendance, setPersonalAttendance] = useState([]);

  const [overallAttendance, setOverallAttendance] = useState([]);

  const [activeRange, setActiveRange] = useState("week");
  const [personalStatus, setPersonalStatus] = useState("all");
  const [personalSearch, setPersonalSearch] = useState("");

  const [overallSearch, setOverallSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      setMessage("");

      const [personalResponse, overallResponse] = await Promise.all([
        api.get("/employee-attendance/my"),
        api.get("/administrator/attendance"),
      ]);

      const personalData =
        personalResponse.data?.data || personalResponse.data || {};

      setProfile(personalData.profile || {});
      setPersonalSummary(personalData.summary || {});
      setPersonalAttendance(
        Array.isArray(personalData.attendance)
          ? personalData.attendance
          : []
      );

      setOverallAttendance(
        overallResponse.data?.overall_attendance || []
      );
    } catch (error) {
      setMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to load attendance."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, []);

  const filteredPersonalAttendance = useMemo(() => {
    const query = personalSearch.trim().toLowerCase();
    const week = getCurrentWeekRange();

    return personalAttendance.filter((row) => {
      const date = getDateOnly(row.attendance_date || row.date);
      const status = normalizeStatus(row.status || row.attendance_status);

      const matchesRange =
        activeRange === "all" ||
        (activeRange === "month" && isCurrentMonth(date)) ||
        (activeRange === "week" &&
          date >= week.start &&
          date <= week.end);

      const matchesStatus =
        personalStatus === "all" ||
        (personalStatus === "absent_leave" &&
          ["absent", "leave"].includes(status)) ||
        status === personalStatus;

      const searchable = [
        date,
        row.day_name,
        status,
        row.check_in_time,
        row.check_out_time,
        row.working_hours,
        row.remarks,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        matchesRange &&
        matchesStatus &&
        (!query || searchable.includes(query))
      );
    });
  }, [
    personalAttendance,
    activeRange,
    personalStatus,
    personalSearch,
  ]);

  const visiblePersonalSummary = useMemo(() => {
    const rows = filteredPersonalAttendance;

    return {
      total_records: rows.length,
      present: rows.filter(
        (row) => normalizeStatus(row.status) === "present"
      ).length,
      absent: rows.filter(
        (row) => normalizeStatus(row.status) === "absent"
      ).length,
      half_day: rows.filter(
        (row) => normalizeStatus(row.status) === "half_day"
      ).length,
      late: rows.filter(
        (row) => normalizeStatus(row.status) === "late"
      ).length,
      leave: rows.filter(
        (row) => normalizeStatus(row.status) === "leave"
      ).length,
    };
  }, [filteredPersonalAttendance]);

  const personalSummaryToShow =
    activeRange === "all" &&
    !personalSearch &&
    personalStatus === "all"
      ? {
          total_records:
            personalSummary.total_records ||
            personalAttendance.length ||
            0,
          present: personalSummary.present || 0,
          absent: personalSummary.absent || 0,
          half_day: personalSummary.half_day || 0,
          late: personalSummary.late || 0,
          leave: personalSummary.leave || 0,
        }
      : visiblePersonalSummary;

  const filteredOverallAttendance = useMemo(() => {
    const value = overallSearch.trim().toLowerCase();

    if (!value) return overallAttendance;

    return overallAttendance.filter((employee) => {
      return [
        employee.full_name,
        employee.email,
        employee.employee_code,
        employee.department_name,
        employee.designation,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(value);
    });
  }, [overallAttendance, overallSearch]);

  const getEmployeeHalfDays = (employee) => {
    return Number(
      employee.half_day_days ??
        employee.half_days ??
        0
    );
  };

  const getEmployeeTotalDays = (employee) => {
    return Number(
      employee.total_days ??
        employee.total_marked_days ??
        employee.total_company_days ??
        0
    );
  };

  const getEmployeeAttendancePercentage = (employee) => {
    return Number(employee.attendance_percentage || 0);
  };

  const totalEmployees = overallAttendance.length;

  const averageAttendance =
    totalEmployees > 0
      ? Math.round(
          overallAttendance.reduce(
            (sum, employee) =>
              sum + getEmployeeAttendancePercentage(employee),
            0
          ) / totalEmployees
        )
      : 0;

  const employeesWithAttendance = overallAttendance.filter(
    (employee) => getEmployeeTotalDays(employee) > 0
  ).length;

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const importAttendance = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setImporting(true);
      setMessage("");

      const response = await api.post(
        "/administrator/attendance/import",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      const importedRows =
        response.data.importedRows ||
        response.data.imported_rows ||
        response.data.inserted_rows ||
        0;

      const updatedRows =
        response.data.updatedRows ||
        response.data.updated_rows ||
        0;

      const skippedRows =
        response.data.skippedRows ||
        response.data.skipped_rows ||
        0;

      const unmatchedRows =
        response.data.unmatchedRows ||
        response.data.unmatched_rows ||
        response.data.missing_users ||
        0;

      setMessage(
        `${response.data.message || "Import completed."} Imported: ${importedRows}, Updated: ${updatedRows}, Skipped: ${skippedRows}, Unmatched/Missing Users: ${unmatchedRows}`
      );

      await fetchAttendance();
    } catch (error) {
      setMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to import attendance."
      );
    } finally {
      setImporting(false);

      if (event.target) {
        event.target.value = "";
      }
    }
  };

  const exportAttendanceCsv = () => {
    const headers = [
      "employee_code",
      "full_name",
      "email",
      "designation",
      "department_name",
      "attendance_percentage",
      "total_days",
      "present_days",
      "absent_days",
      "half_day_days",
      "leave_days",
      "holiday_days",
      "total_minutes",
    ];

    const rows = filteredOverallAttendance.map((employee) => {
      const normalized = {
        ...employee,
        attendance_percentage:
          getEmployeeAttendancePercentage(employee),
        total_days: getEmployeeTotalDays(employee),
        half_day_days: getEmployeeHalfDays(employee),
      };

      return headers
        .map((header) => {
          const value = normalized[header] ?? "";
          const text = String(value);

          if (
            text.includes(",") ||
            text.includes('"') ||
            text.includes("\n")
          ) {
            return `"${text.replaceAll('"', '""')}"`;
          }

          return text;
        })
        .join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.setAttribute("download", "valencia-rms-attendance.csv");

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="attendance-page">
      <div className="page-title-row">
        <div>
          <h1>Attendance</h1>
          <p>
            View your personal attendance and company-wide attendance.
          </p>
        </div>

        <div className="administrator-attendance-header-actions">
          <button
            type="button"
            className="administrator-attendance-action-btn"
            onClick={fetchAttendance}
            disabled={loading}
          >
            <RefreshCw size={14} />
            <span>{loading ? "Refreshing..." : "Refresh"}</span>
          </button>

          <button
            type="button"
            className="administrator-attendance-action-btn"
            onClick={exportAttendanceCsv}
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            className="administrator-attendance-action-btn"
            onClick={handleImportClick}
            disabled={importing}
          >
            <Upload size={14} />
            <span>
              {importing ? "Importing..." : "Import Attendance"}
            </span>
          </button>

          <div className="administrator-attendance-leave-btn">
            <LeaveApplicationButton />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={importAttendance}
          />
        </div>
      </div>

      {message && (
        <div className="projects-message">
          {message}
        </div>
      )}

      <div style={styles.mainTabs}>
        <button
          type="button"
          style={
            activeTab === "my"
              ? styles.mainTabActive
              : styles.mainTab
          }
          onClick={() => setActiveTab("my")}
        >
          My Attendance
        </button>

        <button
          type="button"
          style={
            activeTab === "overall"
              ? styles.mainTabActive
              : styles.mainTab
          }
          onClick={() => setActiveTab("overall")}
        >
          Overall Attendance
        </button>
      </div>

      {loading ? (
        <div className="page-loader">Loading attendance...</div>
      ) : activeTab === "my" ? (
        <>
          <section style={styles.profileGrid}>
            <div style={styles.profileBox}>
              <span style={styles.profileLabel}>Employee</span>
              <strong style={styles.profileValue}>
                {profile.full_name || "-"}
              </strong>
            </div>

            <div style={styles.profileBox}>
              <span style={styles.profileLabel}>Email</span>
              <strong style={styles.profileValue}>
                {profile.email || "-"}
              </strong>
            </div>

            <div style={styles.profileBox}>
              <span style={styles.profileLabel}>Department</span>
              <strong style={styles.profileValue}>
                {profile.department_name || "-"}
              </strong>
            </div>

            <div style={styles.profileBox}>
              <span style={styles.profileLabel}>Designation</span>
              <strong style={styles.profileValue}>
                {profile.designation || "-"}
              </strong>
            </div>
          </section>

          <div style={styles.rangeTabs}>
            {[
              ["week", "This Week"],
              ["month", "This Month"],
              ["all", "All Records"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                style={{
                  ...styles.rangeButton,
                  ...(activeRange === key
                    ? styles.rangeButtonActive
                    : {}),
                }}
                onClick={() => setActiveRange(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <section style={styles.summaryGrid}>
            <div style={styles.summaryCard}>
              <strong>{personalSummaryToShow.total_records || 0}</strong>
              <span>Total Records</span>
            </div>

            <div style={styles.summaryCard}>
              <strong>{personalSummaryToShow.present || 0}</strong>
              <span>Present</span>
            </div>

            <div style={styles.summaryCard}>
              <strong>{personalSummaryToShow.absent || 0}</strong>
              <span>Absent</span>
            </div>

            <div style={styles.summaryCard}>
              <strong>{personalSummaryToShow.half_day || 0}</strong>
              <span>Half Day</span>
            </div>

            <div style={styles.summaryCard}>
              <strong>{personalSummaryToShow.leave || 0}</strong>
              <span>Leave</span>
            </div>
          </section>

          <div style={styles.personalFilters}>
            <div style={styles.personalSearchBox}>
              <Search size={17} color="#64748b" />

              <input
                style={styles.personalSearchInput}
                value={personalSearch}
                onChange={(event) =>
                  setPersonalSearch(event.target.value)
                }
                placeholder="Search date, status, time, remarks..."
              />
            </div>

            <select
              style={styles.personalSelect}
              value={personalStatus}
              onChange={(event) =>
                setPersonalStatus(event.target.value)
              }
            >
              <option value="all">All Status</option>
              <option value="present">Present</option>
              <option value="absent_leave">Absent / Leave</option>
              <option value="half_day">Half Day</option>
              <option value="late">Late</option>
              <option value="holiday">Holiday</option>
            </select>
          </div>

          <section style={styles.personalTableCard}>
            {filteredPersonalAttendance.length === 0 ? (
              <div style={styles.emptyState}>
                No personal attendance records found.
              </div>
            ) : (
              <div style={styles.tableScroll}>
                <table style={styles.personalTable}>
                  <thead>
                    <tr>
                      <th style={styles.personalTh}>Date</th>
                      <th style={styles.personalTh}>Day</th>
                      <th style={styles.personalTh}>Status</th>
                      <th style={styles.personalTh}>Check In</th>
                      <th style={styles.personalTh}>Check Out</th>
                      <th style={styles.personalTh}>Working Hours</th>
                      <th style={styles.personalTh}>Remarks</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredPersonalAttendance.map((row, index) => {
                      const status = normalizeStatus(row.status);

                      return (
                        <tr
                          key={
                            row.attendance_id ||
                            `${row.attendance_date}-${index}`
                          }
                        >
                          <td style={styles.personalTd}>
                            <strong>
                              {getDateOnly(row.attendance_date)}
                            </strong>
                          </td>

                          <td style={styles.personalTd}>
                            {row.day_name || "-"}
                          </td>

                          <td style={styles.personalTd}>
                            <span
                              style={{
                                ...styles.statusBadge,
                                ...getStatusStyle(status),
                              }}
                            >
                              {formatStatus(status)}
                            </span>
                          </td>

                          <td style={styles.personalTd}>
                            {row.check_in_time || "-"}
                          </td>

                          <td style={styles.personalTd}>
                            {row.check_out_time || "-"}
                          </td>

                          <td style={styles.personalTd}>
                            {getWorkingHours(row)}
                          </td>

                          <td style={styles.personalTd}>
                            {row.remarks || "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="overall-attendance-section">
            <div className="section-title-row">
              <div>
                <h2>Overall Attendance</h2>
                <p>
                  Every employee and their attendance percentage.
                </p>
              </div>
            </div>

            <div className="attendance-overall-summary">
              <div>
                <span>Total Employees</span>
                <strong>{totalEmployees}</strong>
              </div>

              <div>
                <span>Average Attendance</span>
                <strong>{averageAttendance}%</strong>
              </div>

              <div>
                <span>Employees With Attendance</span>
                <strong>{employeesWithAttendance}</strong>
              </div>

              <div>
                <span>Visible Records</span>
                <strong>{filteredOverallAttendance.length}</strong>
              </div>
            </div>

            <div className="projects-toolbar">
              <div className="projects-search">
                <Search size={16} />

                <input
                  value={overallSearch}
                  onChange={(event) =>
                    setOverallSearch(event.target.value)
                  }
                  placeholder="Search employee, email, department, designation..."
                />
              </div>
            </div>

            <div className="projects-table-card">
              <table className="projects-table attendance-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>Designation</th>
                    <th>Attendance %</th>
                    <th>Present</th>
                    <th>Absent</th>
                    <th>Half Day</th>
                    <th>Leave</th>
                    <th>Total Days</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredOverallAttendance.length > 0 ? (
                    filteredOverallAttendance.map((employee) => {
                      const percentage =
                        getEmployeeAttendancePercentage(employee);

                      return (
                        <tr key={employee.user_id}>
                          <td>
                            <div className="user-name-cell">
                              <div className="user-avatar-small">
                                <CalendarCheck size={16} />
                              </div>

                              <div>
                                <strong>{employee.full_name}</strong>
                                <p>{employee.email}</p>
                                <p>{employee.employee_code || "-"}</p>
                              </div>
                            </div>
                          </td>

                          <td>{employee.department_name || "-"}</td>
                          <td>{employee.designation || "-"}</td>

                          <td>
                            <div className="attendance-percent-cell">
                              <div className="table-progress-track">
                                <div
                                  className="table-progress-fill"
                                  style={{
                                    width: `${percentage}%`,
                                  }}
                                />
                              </div>

                              <strong>{percentage}%</strong>
                            </div>
                          </td>

                          <td>{employee.present_days || 0}</td>
                          <td>{employee.absent_days || 0}</td>
                          <td>{getEmployeeHalfDays(employee)}</td>
                          <td>{employee.leave_days || 0}</td>
                          <td>{getEmployeeTotalDays(employee)}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="9" className="empty-projects">
                        No attendance found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="csv-help-card">
            <h3>Attendance Import Format</h3>

            <p>
              Import only the approved Excel/CSV attendance sheet from
              Administrator Dashboard. Attendance is matched with users
              using Employee ID / Employee Code.
            </p>

            <p className="csv-note">
              Allowed status values: present, absent, half_day, leave,
              holiday. If status is late, it is treated according to the
              backend attendance rules.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

const styles = {
  mainTabs: {
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    padding: "5px",
    marginBottom: "22px",
    border: "1px solid #e5e7eb",
    borderRadius: "14px",
    background: "#ffffff",
  },

  mainTab: {
    minHeight: "40px",
    padding: "0 17px",
    border: 0,
    borderRadius: "10px",
    background: "transparent",
    color: "#64748b",
    fontSize: "13px",
    fontWeight: 900,
    cursor: "pointer",
  },

  mainTabActive: {
    minHeight: "40px",
    padding: "0 17px",
    border: 0,
    borderRadius: "10px",
    background: "#ff5733",
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: 900,
    cursor: "pointer",
  },

  profileGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "14px",
    marginBottom: "20px",
  },

  profileBox: {
    minWidth: 0,
    padding: "18px",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "18px",
    overflow: "hidden",
  },

  profileLabel: {
    display: "block",
    marginBottom: "7px",
    color: "#94a3b8",
    fontSize: "11px",
    fontWeight: 800,
  },

  profileValue: {
    display: "block",
    color: "#111827",
    fontSize: "13px",
    fontWeight: 900,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  rangeTabs: {
    display: "flex",
    gap: "10px",
    marginBottom: "20px",
    flexWrap: "wrap",
  },

  rangeButton: {
    minHeight: "40px",
    padding: "0 16px",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    background: "#ffffff",
    color: "#475569",
    fontSize: "12px",
    fontWeight: 900,
    cursor: "pointer",
  },

  rangeButtonActive: {
    borderColor: "#ff5733",
    background: "#ff5733",
    color: "#ffffff",
  },

  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: "14px",
    marginBottom: "20px",
  },

  summaryCard: {
    minHeight: "92px",
    padding: "18px",
    border: "1px solid #e7eaf0",
    borderRadius: "17px",
    background: "#ffffff",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "7px",
  },

  personalFilters: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 210px",
    gap: "12px",
    marginBottom: "18px",
  },

  personalSearchBox: {
    height: "48px",
    display: "flex",
    alignItems: "center",
    gap: "9px",
    padding: "0 14px",
    border: "1px solid #d9dee7",
    borderRadius: "12px",
    background: "#ffffff",
  },

  personalSearchInput: {
    width: "100%",
    border: 0,
    outline: 0,
    background: "transparent",
    color: "#111827",
    fontSize: "12px",
    fontWeight: 700,
  },

  personalSelect: {
    height: "48px",
    padding: "0 13px",
    border: "1px solid #d9dee7",
    borderRadius: "12px",
    background: "#ffffff",
    color: "#111827",
    fontSize: "12px",
    fontWeight: 800,
  },

  personalTableCard: {
    padding: "16px",
    border: "1px solid #e5e7eb",
    borderRadius: "20px",
    background: "#ffffff",
    overflow: "hidden",
  },

  tableScroll: {
    overflowX: "auto",
  },

  personalTable: {
    width: "100%",
    minWidth: "900px",
    borderCollapse: "collapse",
  },

  personalTh: {
    padding: "12px 14px",
    borderBottom: "1px solid #e5e7eb",
    background: "#f8fafc",
    color: "#64748b",
    textAlign: "left",
    fontSize: "11px",
    fontWeight: 900,
  },

  personalTd: {
    padding: "13px 14px",
    borderBottom: "1px solid #eef1f4",
    color: "#475569",
    fontSize: "12px",
    fontWeight: 700,
  },

  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "26px",
    padding: "0 9px",
    borderRadius: "999px",
    fontSize: "10px",
    fontWeight: 900,
  },

  emptyState: {
    padding: "24px",
    color: "#64748b",
    textAlign: "center",
    fontSize: "12px",
    fontWeight: 800,
  },
};

export default AdministratorAttendance;
