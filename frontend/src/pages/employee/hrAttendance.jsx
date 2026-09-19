import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";

import api from "../../api/axios";
import "../../layouts/hrAttendance.css";

/* =========================================================
   HELPERS
========================================================= */

const toDateInput = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const todayString = () => toDateInput(new Date());

const addDays = (value, amount) => {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return toDateInput(date);
};

const monthStart = (value) => {
  const date = new Date(`${value}T00:00:00`);
  return toDateInput(new Date(date.getFullYear(), date.getMonth(), 1));
};

const monthEnd = (value) => {
  const date = new Date(`${value}T00:00:00`);
  return toDateInput(new Date(date.getFullYear(), date.getMonth() + 1, 0));
};

const weekStart = (value) => {
  const date = new Date(`${value}T00:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return toDateInput(date);
};

const weekEnd = (value) => addDays(weekStart(value), 6);

const displayDate = (value) => {
  if (!value) return "-";

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const displayDateTime = (value) => {
  if (!value) return "-";

  const date = new Date(String(value).replace(" ", "T"));

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const displayTime = (value) => {
  if (!value || value === "-") return "-";

  const [hour, minute] = String(value).slice(0, 8).split(":").map(Number);

  if (Number.isNaN(hour) || Number.isNaN(minute)) return value;

  const displayHour = hour % 12 || 12;
  const period = hour >= 12 ? "PM" : "AM";

  return `${String(displayHour).padStart(2, "0")}:${String(minute).padStart(
    2,
    "0"
  )} ${period}`;
};

const dayName = (value) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
  });

const normalize = (value) => String(value || "").trim().toLowerCase();

const titleCase = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const HR_DEPARTMENTS = [
  "Administration",
  "ADV",
  "Cans",
  "Consumer Goods",
  "Corporate Office",
  "Creatives",
  "Crunzzo",
  "Engineering",
  "Finance",
  "Formulation Team",
  "General",
  "IT",
  "Nutracare",
  "POS",
  "Sales",
  "Valencia Engineers Group",
];

/* =========================================================
   STATUS
========================================================= */

const StatusBadge = ({ value }) => {
  const status = normalize(value);

  let type = "neutral";

  if (["present", "approved"].includes(status)) type = "success";
  else if (["rejected", "absent"].includes(status)) type = "danger";
  else if (status === "pending") type = "warning";
  else if (status === "field visit") type = "purple";
  else if (status.includes("leave")) type = "blue";
  else if (
    ["late", "half day", "needs review", "no punch", "escalated"].includes(
      status
    )
  ) {
    type = "orange";
  }

  return (
    <span className={`hr-status hr-status-${type}`}>
      {value || "-"}
    </span>
  );
};

/* =========================================================
   COMPONENT
========================================================= */

export default function HrAttendance() {
  const today = todayString();
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState("attendance");

  const [selectedDate, setSelectedDate] = useState(today);
  const [rangeMode, setRangeMode] = useState("day");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);

  const [records, setRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState({});

  const [leaveApplications, setLeaveApplications] = useState([]);
  const [leaveSummary, setLeaveSummary] = useState({
    total: 0,
    pending: 0,
    escalated: 0,
    approved: 0,
    rejected: 0,
  });

  const [fieldVisits, setFieldVisits] = useState([]);
  const [fieldSummary, setFieldSummary] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    employees: 0,
    locations: 0,
  });

  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");

  const [leaveStatus, setLeaveStatus] = useState("all");
  const [leaveType, setLeaveType] = useState("all");

  const [fieldStatus, setFieldStatus] = useState("all");

  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: 100,
    total_records: 0,
    total_pages: 1,
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [showExport, setShowExport] = useState(false);
  const [showAddAttendance, setShowAddAttendance] = useState(false);

  const [selectedLeave, setSelectedLeave] = useState(null);
  const [reviewRemark, setReviewRemark] = useState("");
  const [reviewingLeaveId, setReviewingLeaveId] = useState(null);

  const [toast, setToast] = useState(null);
  const [error, setError] = useState("");

  const [attendanceForm, setAttendanceForm] = useState({
    employee_id: "",
    attendance_date: today,
    check_in_time: "",
    check_out_time: "",
    status: "present",
    custom_status: "",
    remarks: "",
  });

  /* =========================================================
     TOAST
  ========================================================= */

  const notify = (message, type = "success") => {
    setToast({ message, type });

    window.setTimeout(() => {
      setToast(null);
    }, 3200);
  };

  /* =========================================================
     FETCH
  ========================================================= */

  const fetchAttendance = async ({
    nextPage = 1,
    startDate = fromDate,
    endDate = toDate,
    searchValue = search,
    departmentValue = department,
    statusValue = status,
  } = {}) => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/hr-attendance", {
        params: {
          from_date: startDate,
          to_date: endDate,
          page: nextPage,
          page_size: 100,
          search: searchValue.trim(),
          department: departmentValue === "all" ? "" : departmentValue,
          status: statusValue === "all" ? "" : statusValue,
        },
      });

      const data = response.data || {};
      const attendanceRows = Array.isArray(data.records) ? data.records : [];

      setRecords(attendanceRows);
      setUsers(Array.isArray(data.users) ? data.users : []);
      setSummary(data.summary || {});

      setLeaveApplications(
        Array.isArray(data.leave_applications) ? data.leave_applications : []
      );

      setLeaveSummary(
        data.leave_application_summary || {
          total: 0,
          pending: 0,
          escalated: 0,
          approved: 0,
          rejected: 0,
        }
      );

      /*
        Backend will later return all field_visits.
        Until then approved attendance-linked visits still display.
      */
      const fallbackVisits = attendanceRows
        .filter((row) => row.field_visit_id)
        .map((row) => ({
          visit_id: row.field_visit_id,
          employee_id: row.user_id,
          employee_name: row.full_name,
          employee_code: row.employee_code,
          department_name: row.department_name,
          role_name: row.role_name || "Employee",
          visit_type: row.field_visit_type,
          visit_date: row.attendance_date,
          duration_type: row.field_visit_duration,
          half_day_session: row.field_visit_half_day_session,
          start_time: row.field_visit_start_time,
          end_time: row.field_visit_end_time,
          location: row.field_visit_location,
          status: "approved",
          reviewed_by_name: row.approved_by_name,
          comment: row.field_visit_reason,
          review_remark: row.field_visit_review_remark,
        }));

      const visits = Array.isArray(data.field_visits)
        ? data.field_visits
        : fallbackVisits;

      setFieldVisits(visits);

      if (data.field_visit_summary) {
        setFieldSummary(data.field_visit_summary);
      } else {
        const statuses = visits.map((item) => normalize(item.status));

        setFieldSummary({
          total: visits.length,
          pending: statuses.filter((item) => item === "pending").length,
          approved: statuses.filter((item) => item === "approved").length,
          rejected: statuses.filter((item) => item === "rejected").length,
          employees: new Set(
            visits.map((item) => item.employee_id).filter(Boolean)
          ).size,
          locations: new Set(
            visits.map((item) => item.location).filter(Boolean)
          ).size,
        });
      }

      const nextPagination = data.pagination || {
        page: nextPage,
        page_size: 100,
        total_records: 0,
        total_pages: 1,
      };

      setPagination(nextPagination);
      setPage(nextPagination.page || nextPage);
    } catch (err) {
      console.error("HR Attendance:", err);

      setError(
        err?.response?.data?.message || "Failed to load HR attendance."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance({
      nextPage: 1,
      startDate: today,
      endDate: today,
      searchValue: "",
      departmentValue: "all",
      statusValue: "all",
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================================================
     EMAIL DEEP LINK
  ========================================================= */

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("view") === "leave") {
      setActiveTab("leave");
    }
  }, []);

  useEffect(() => {
    if (!leaveApplications.length) return;

    const params = new URLSearchParams(window.location.search);
    const leaveId = Number(params.get("openLeave") || 0);

    if (!leaveId) return;

    const leave = leaveApplications.find(
      (item) => Number(item.leave_id) === leaveId
    );

    if (!leave) return;

    setActiveTab("leave");
    setSelectedLeave(leave);
    setReviewRemark(leave.review_remark || "");
  }, [leaveApplications]);

  /* =========================================================
     DATE
  ========================================================= */

  const loadDay = (date) => {
    setSelectedDate(date);
    setRangeMode("day");
    setFromDate(date);
    setToDate(date);
    setPage(1);

    fetchAttendance({
      nextPage: 1,
      startDate: date,
      endDate: date,
    });
  };

  const loadToday = () => loadDay(today);

  const loadWeek = (anchor = selectedDate) => {
    const start = weekStart(anchor);
    let end = weekEnd(anchor);

    if (end > today) end = today;

    setSelectedDate(anchor);
    setRangeMode("week");
    setFromDate(start);
    setToDate(end);
    setPage(1);

    fetchAttendance({
      nextPage: 1,
      startDate: start,
      endDate: end,
    });
  };

  const loadMonth = (anchor = selectedDate) => {
    const start = monthStart(anchor);
    let end = monthEnd(anchor);

    if (start <= today && end > today) end = today;

    setSelectedDate(anchor);
    setRangeMode("month");
    setFromDate(start);
    setToDate(end);
    setPage(1);

    fetchAttendance({
      nextPage: 1,
      startDate: start,
      endDate: end,
    });
  };

  const loadSelectedMonth = (monthValue) => {
    if (!monthValue) return;
    loadMonth(`${monthValue}-01`);
  };

  const navigatePeriod = (direction) => {
    if (rangeMode === "month") {
      const date = new Date(`${selectedDate}T00:00:00`);
      date.setMonth(date.getMonth() + direction);

      loadMonth(toDateInput(date));
      return;
    }

    if (rangeMode === "week") {
      loadWeek(addDays(selectedDate, direction * 7));
      return;
    }

    loadDay(addDays(selectedDate, direction * 7));
  };

  const dateStrip = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        addDays(selectedDate, index - 3)
      ),
    [selectedDate]
  );

  /* =========================================================
     OPTIONS / FILTERS
  ========================================================= */

  const departments = useMemo(() => {
    const fromUsers = users.map((user) => user.department_name).filter(Boolean);

    return [...new Set([...HR_DEPARTMENTS, ...fromUsers])].sort();
  }, [users]);

  const filteredLeaves = useMemo(() => {
    const term = search.trim().toLowerCase();

    return leaveApplications.filter((leave) => {
      const searchable = [
        leave.employee_name,
        leave.employee_code,
        leave.employee_email,
        leave.department_name,
        leave.designation,
        leave.leave_type,
        leave.display_status,
        leave.reason,
        leave.reviewed_by_name,
        leave.review_remark,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (term && !searchable.includes(term)) return false;

      if (
        department !== "all" &&
        leave.department_name !== department
      ) {
        return false;
      }

      if (
        leaveStatus !== "all" &&
        leave.display_status !== leaveStatus
      ) {
        return false;
      }

      if (leaveType !== "all" && leave.leave_code !== leaveType) {
        return false;
      }

      return true;
    });
  }, [leaveApplications, search, department, leaveStatus, leaveType]);

  const filteredFieldVisits = useMemo(() => {
    const term = search.trim().toLowerCase();

    return fieldVisits.filter((visit) => {
      const searchable = [
        visit.employee_name,
        visit.employee_code,
        visit.employee_email,
        visit.department_name,
        visit.role_name,
        visit.visit_type,
        visit.location,
        visit.status,
        visit.reviewed_by_name,
        visit.comment,
        visit.review_remark,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (term && !searchable.includes(term)) return false;

      if (
        department !== "all" &&
        visit.department_name !== department
      ) {
        return false;
      }

      if (
        fieldStatus !== "all" &&
        normalize(visit.status) !== fieldStatus
      ) {
        return false;
      }

      return true;
    });
  }, [fieldVisits, search, department, fieldStatus]);

  const applyFilters = () => {
    setPage(1);
    fetchAttendance({ nextPage: 1 });
  };

  const clearFilters = () => {
    setSearch("");
    setDepartment("all");
    setStatus("all");
    setLeaveStatus("all");
    setLeaveType("all");
    setFieldStatus("all");
    setPage(1);

    fetchAttendance({
      nextPage: 1,
      searchValue: "",
      departmentValue: "all",
      statusValue: "all",
    });
  };

  /* =========================================================
     DISPLAY
  ========================================================= */

  const attendanceTime = (record) => {
    if (record.final_status === "Field Visit") {
      const start = displayTime(record.field_visit_start_time);
      const end = displayTime(record.field_visit_end_time);

      if (start !== "-" || end !== "-") return `${start} – ${end}`;

      return record.field_visit_duration
        ? titleCase(record.field_visit_duration)
        : "-";
    }

    if (record.leave_id) {
      if (record.leave_duration === "Half Day") {
        return record.leave_session
          ? `Half Day · ${titleCase(record.leave_session)}`
          : "Half Day";
      }

      return "Full Day";
    }

    const start = displayTime(record.check_in_time);
    const end = displayTime(record.check_out_time);

    if (start === "-" && end === "-") return "-";

    return `${start} – ${end}`;
  };

  const leaveVisit = (record) =>
    record.leave_type ||
    record.field_visit_type ||
    (record.field_visit_id ? "Field Visit" : "-");

  const recordRemark = (record) =>
    record.leave_reason ||
    record.field_visit_reason ||
    record.attendance_remarks ||
    record.detail ||
    "-";

  const visitDuration = (visit) => {
    if (visit.duration_type) {
      const value = titleCase(visit.duration_type);

      return visit.half_day_session
        ? `${value} · ${titleCase(visit.half_day_session)}`
        : value;
    }

    const start = displayTime(visit.start_time);
    const end = displayTime(visit.end_time);

    if (start !== "-" || end !== "-") return `${start} – ${end}`;

    return "-";
  };

  /* =========================================================
     LEAVE REVIEW
  ========================================================= */

  const reviewLeave = async (leave, nextStatus) => {
    if (leave.display_status !== "Pending") return;

    if (nextStatus === "rejected" && !reviewRemark.trim()) {
      notify(
        "Please enter an approval/rejection remark before rejecting.",
        "error"
      );
      return;
    }

    try {
      setReviewingLeaveId(leave.leave_id);

      const response = await api.patch(
        `/admin-leaves/${leave.leave_id}/status`,
        {
          status: nextStatus,
          review_remark: reviewRemark.trim(),
        }
      );

      notify(
        response.data?.message ||
          (nextStatus === "approved"
            ? "Leave approved successfully."
            : "Leave rejected successfully.")
      );

      setSelectedLeave(null);
      setReviewRemark("");

      await fetchAttendance({ nextPage: page });
    } catch (err) {
      notify(
        err?.response?.data?.message || "Failed to review leave.",
        "error"
      );
    } finally {
      setReviewingLeaveId(null);
    }
  };

  /* =========================================================
     ADD ATTENDANCE
  ========================================================= */

  const openAddAttendance = () => {
    setAttendanceForm({
      employee_id: "",
      attendance_date: selectedDate,
      check_in_time: "",
      check_out_time: "",
      status: "present",
      custom_status: "",
      remarks: "",
    });

    setShowAddAttendance(true);
  };

  const saveAttendance = async () => {
    if (!attendanceForm.employee_id) {
      notify("Please select an employee.", "error");
      return;
    }

    if (!attendanceForm.attendance_date) {
      notify("Please select a date.", "error");
      return;
    }

    if (
      attendanceForm.status === "custom" &&
      !attendanceForm.custom_status.trim()
    ) {
      notify("Please enter the custom attendance status.", "error");
      return;
    }

    try {
      setSaving(true);

      /*
        Existing status enum stays safe.
        Backend will store custom_status separately.
      */
      const payload = {
        ...attendanceForm,
        status:
          attendanceForm.status === "custom"
            ? "present"
            : attendanceForm.status,
        custom_status:
          attendanceForm.status === "custom"
            ? attendanceForm.custom_status.trim()
            : "",
      };

      const response = await api.post("/hr-attendance", payload);

      notify(response.data?.message || "Attendance saved successfully.");

      setShowAddAttendance(false);

      await fetchAttendance({ nextPage: page });
    } catch (err) {
      notify(
        err?.response?.data?.message || "Failed to save attendance.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  /* =========================================================
     IMPORT / EXPORT
  ========================================================= */

  const handleImport = () => {
    if (importing) return;

    fileInputRef.current.value = "";
    fileInputRef.current.click();
  };

  const importAttendance = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const extension = String(file.name || "").toLowerCase();

    if (
      !extension.endsWith(".xlsx") &&
      !extension.endsWith(".xls") &&
      !extension.endsWith(".csv")
    ) {
      notify("Please select an Excel or CSV file.", "error");
      return;
    }

    try {
      setImporting(true);

      const formData = new FormData();
      formData.append("file", file, file.name);

      const response = await api.post("/hr-attendance/import", formData, {
        timeout: 120000,
      });

      const result = response.data || {};

      notify(
        `Import complete — Inserted: ${result.inserted_rows || 0}, Updated: ${
          result.updated_rows || 0
        }, Duplicates: ${result.duplicate_rows || 0}, Unmatched: ${
          result.unmatched_rows || 0
        }, Skipped: ${result.skipped_rows || 0}`
      );

      await fetchAttendance({ nextPage: 1 });
    } catch (err) {
      notify(
        err?.response?.data?.message || "Attendance import failed.",
        "error"
      );
    } finally {
      setImporting(false);
      fileInputRef.current.value = "";
    }
  };

  const exportAttendance = async (format) => {
    try {
      setExporting(true);
      setShowExport(false);

      const response = await api.get("/hr-attendance/export", {
        params: {
          from_date: fromDate,
          to_date: toDate,
          format,
        },
        responseType: "blob",
      });

      const blob = new Blob([response.data], {
        type: response.headers["content-type"],
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `hr-attendance-${fromDate}-to-${toDate}.${format}`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch {
      notify("Failed to export attendance.", "error");
    } finally {
      setExporting(false);
    }
  };

  /* =========================================================
     PAGINATION
  ========================================================= */

  const changePage = (nextPage) => {
    if (
      nextPage < 1 ||
      nextPage > pagination.total_pages ||
      nextPage === page
    ) {
      return;
    }

    fetchAttendance({ nextPage });
  };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="hr-page">
      {toast && (
        <div className={`hr-toast hr-toast-${toast.type}`}>
          {toast.message}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={importAttendance}
      />

      <header className="hr-header">
        <div>
          <h1>HR Attendance</h1>
          <p>Attendance, leave and field visit management</p>
        </div>

        <div className="hr-header-actions">
          <button
            className="hr-button secondary"
            onClick={() => fetchAttendance({ nextPage: page })}
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            className="hr-button secondary"
            onClick={handleImport}
            disabled={importing}
          >
            <Upload size={16} />
            {importing ? "Importing..." : "Import"}
          </button>

          <div className="hr-export">
            <button
              className="hr-button secondary"
              onClick={() => setShowExport((current) => !current)}
              disabled={exporting}
            >
              <Download size={16} />
              Export
            </button>

            {showExport && (
              <div className="hr-export-menu">
                <button onClick={() => exportAttendance("xlsx")}>
                  <FileSpreadsheet size={15} />
                  Excel
                </button>

                <button onClick={() => exportAttendance("csv")}>
                  <Download size={15} />
                  CSV
                </button>
              </div>
            )}
          </div>

          <button className="hr-button primary" onClick={openAddAttendance}>
            <Plus size={16} />
            Add Attendance
          </button>
        </div>
      </header>

      {error && <div className="hr-error">{error}</div>}

      {/* TABS */}

      <div className="hr-tabs">
        <Tab
          active={activeTab === "attendance"}
          icon={<CheckCircle2 size={16} />}
          label="Attendance"
          onClick={() => setActiveTab("attendance")}
        />

        <Tab
          active={activeTab === "leave"}
          icon={<CalendarDays size={16} />}
          label="Leave"
          onClick={() => setActiveTab("leave")}
        />

        <Tab
          active={activeTab === "field"}
          icon={<MapPin size={16} />}
          label="Field Visits"
          onClick={() => setActiveTab("field")}
        />
      </div>

      {/* DATE CONTROLS */}

      <div className="hr-date-bar">
        <button className="hr-arrow" onClick={() => navigatePeriod(-1)}>
          <ChevronLeft size={17} />
        </button>

        <div className="hr-date-strip">
          {dateStrip.map((date) => (
            <button
              key={date}
              className={`hr-day ${
                rangeMode === "day" && selectedDate === date ? "active" : ""
              }`}
              onClick={() => loadDay(date)}
            >
              <strong>{date.slice(8, 10)}</strong>
              <span>{dayName(date)}</span>
            </button>
          ))}
        </div>

        <button className="hr-arrow" onClick={() => navigatePeriod(1)}>
          <ChevronRight size={17} />
        </button>

        <button
          className={`hr-range ${
            rangeMode === "day" && selectedDate === today ? "active" : ""
          }`}
          onClick={loadToday}
        >
          Today
        </button>

        <button
          className={`hr-range ${rangeMode === "week" ? "active" : ""}`}
          onClick={() => loadWeek()}
        >
          This Week
        </button>

        <button
          className={`hr-range ${rangeMode === "month" ? "active" : ""}`}
          onClick={() => loadMonth()}
        >
          This Month
        </button>

        <input
          className="hr-month-picker"
          type="month"
          value={selectedDate.slice(0, 7)}
          onChange={(event) => loadSelectedMonth(event.target.value)}
        />
      </div>

      {/* FILTERS */}

      <div className="hr-filters">
        <div className="hr-search">
          <Search size={17} />

          <input
            value={search}
            placeholder="Search employee..."
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyFilters();
            }}
          />
        </div>

        <select
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
        >
          <option value="all">All Departments</option>

          {departments.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        {activeTab === "attendance" && (
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All Status</option>
            <option value="Present">Present</option>
            <option value="Late">Late</option>
            <option value="Half Day">Half Day</option>
            <option value="Absent">Absent</option>
            <option value="No Punch">No Punch</option>
            <option value="Needs Review">Needs Review</option>
            <option value="Field Visit">Field Visit</option>
            <option value="Sick Leave">Sick Leave</option>
            <option value="Casual Leave">Casual Leave</option>
            <option value="Privileged Leave">Privileged Leave</option>
            <option value="Festival Leave">Festival Leave</option>
            <option value="Unpaid Leave">Unpaid Leave</option>
            <option value="Weekly Off">Weekly Off</option>
            <option value="Holiday">Holiday</option>
          </select>
        )}

        {activeTab === "leave" && (
          <>
            <select
              value={leaveStatus}
              onChange={(e) => setLeaveStatus(e.target.value)}
            >
              <option value="all">All Leave Status</option>
              <option value="Pending">Pending</option>
              <option value="Escalated">Escalated</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>

            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
            >
              <option value="all">All Leave Types</option>
              <option value="sick">Sick Leave</option>
              <option value="casual">Casual Leave</option>
              <option value="mandatory">Privileged Leave</option>
              <option value="festival">Festival Leave</option>
              <option value="unpaid">Unpaid Leave</option>
            </select>
          </>
        )}

        {activeTab === "field" && (
          <select
            value={fieldStatus}
            onChange={(e) => setFieldStatus(e.target.value)}
          >
            <option value="all">All Visit Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        )}

        <button className="hr-filter-apply" onClick={applyFilters}>
          Apply
        </button>

        <button className="hr-filter-clear" onClick={clearFilters}>
          Clear
        </button>
      </div>

      {/* ATTENDANCE */}

      {activeTab === "attendance" && (
        <>
          <div className="hr-metrics seven">
            <Metric label="Employees" value={summary.employees || 0} />
            <Metric label="Present" value={summary.present || 0} />
            <Metric label="Field Visit" value={summary.field_visit || 0} />
            <Metric label="Leave" value={summary.leave || 0} />
            <Metric label="Absent" value={summary.absent || 0} />
            <Metric label="Late" value={summary.late || 0} />
            <Metric label="Needs Review" value={summary.needs_review || 0} />
          </div>

          <section className="hr-card">
            <CardHeader
              title="Attendance Register"
              subtitle={
                fromDate === toDate
                  ? displayDate(fromDate)
                  : `${displayDate(fromDate)} – ${displayDate(toDate)}`
              }
              right={`${pagination.total_records || 0} records`}
            />

            <div className="hr-attendance-grid hr-table-head">
              <span>Employee</span>
              <span>Department</span>
              <span>Status</span>
              <span>Time / Duration</span>
              <span>Leave / Visit</span>
              <span>Remark</span>
              <span>Reviewed By</span>
            </div>

            {loading ? (
              <Empty text="Loading attendance..." />
            ) : records.length === 0 ? (
              <Empty text="No attendance records found." />
            ) : (
              records.map((record, index) => (
                <div
                  className="hr-attendance-grid hr-table-row"
                  key={`${record.user_id}-${record.attendance_date}-${index}`}
                >
                  <Employee
                    name={record.full_name}
                    code={record.employee_code}
                  />

                  <span>{record.department_name || "-"}</span>

                  <div>
                    <StatusBadge
                      value={record.custom_status || record.final_status}
                    />
                  </div>

                  <span>{attendanceTime(record)}</span>

                  <span>{leaveVisit(record)}</span>

                  <span className="ellipsis" title={recordRemark(record)}>
                    {recordRemark(record)}
                  </span>

                  <span>{record.approved_by_name || "-"}</span>
                </div>
              ))
            )}

            <Pagination
              page={page}
              totalPages={pagination.total_pages || 1}
              totalRecords={pagination.total_records || 0}
              onChange={changePage}
            />
          </section>
        </>
      )}

      {/* LEAVE */}

      {activeTab === "leave" && (
        <>
          <div className="hr-metrics five">
            <Metric label="All Leave" value={leaveSummary.total || 0} />
            <Metric label="Pending" value={leaveSummary.pending || 0} />
            <Metric label="Escalated" value={leaveSummary.escalated || 0} />
            <Metric label="Approved" value={leaveSummary.approved || 0} />
            <Metric label="Rejected" value={leaveSummary.rejected || 0} />
          </div>

          <section className="hr-card">
            <CardHeader
              title="Leave Applications"
              subtitle="Pending, escalated, approved and rejected leave applications"
              right={`${filteredLeaves.length} applications`}
            />

            <div className="hr-leave-grid hr-table-head">
              <span>Employee</span>
              <span>Department</span>
              <span>Leave</span>
              <span>Dates</span>
              <span>Status</span>
              <span>Reviewed / Escalated By</span>
              <span>Action</span>
            </div>

            {filteredLeaves.length === 0 ? (
              <Empty text="No leave applications found." />
            ) : (
              filteredLeaves.map((leave) => (
                <div className="hr-leave-grid hr-table-row" key={leave.leave_id}>
                  <Employee
                    name={leave.employee_name}
                    code={leave.employee_code}
                  />

                  <span>{leave.department_name || "-"}</span>
                  <span>{leave.leave_type || "-"}</span>

                  <span>
                    {displayDate(leave.start_date)}
                    {leave.start_date !== leave.end_date &&
                      ` – ${displayDate(leave.end_date)}`}
                  </span>

                  <div>
                    <StatusBadge value={leave.display_status} />
                  </div>

                  <span>
                    {leave.reviewed_by_name ||
                      (leave.display_status === "Escalated"
                        ? "Final review pending"
                        : "-")}
                  </span>

                  <button
                    className="hr-view-button"
                    onClick={() => {
                      setSelectedLeave(leave);
                      setReviewRemark(leave.review_remark || "");
                    }}
                  >
                    <Eye size={14} />
                    View
                  </button>
                </div>
              ))
            )}
          </section>
        </>
      )}

      {/* FIELD VISITS */}

      {activeTab === "field" && (
        <>
          <div className="hr-metrics six">
            <Metric label="Total Visits" value={fieldSummary.total || 0} />
            <Metric label="Pending" value={fieldSummary.pending || 0} />
            <Metric label="Approved" value={fieldSummary.approved || 0} />
            <Metric label="Rejected" value={fieldSummary.rejected || 0} />
            <Metric label="Employees" value={fieldSummary.employees || 0} />
            <Metric label="Locations" value={fieldSummary.locations || 0} />
          </div>

          <section className="hr-card">
            <CardHeader
              title="Field Visits"
              subtitle="Pending, approved and rejected field visits"
              right={`${filteredFieldVisits.length} visits`}
            />

            <div className="hr-horizontal-scroll">
              <div className="hr-field-grid hr-table-head">
                <span>Employee</span>
                <span>Department</span>
                <span>Role</span>
                <span>Visit Type</span>
                <span>Date</span>
                <span>Duration</span>
                <span>Location</span>
                <span>Status</span>
                <span>Reviewed By</span>
                <span>Description</span>
                <span>Approval/Rejection Remark</span>
              </div>

              {filteredFieldVisits.length === 0 ? (
                <Empty text="No field visits found." />
              ) : (
                filteredFieldVisits.map((visit, index) => (
                  <div
                    className="hr-field-grid hr-table-row"
                    key={visit.visit_id || index}
                  >
                    <Employee
                      name={visit.employee_name}
                      code={visit.employee_code}
                    />

                    <span>{visit.department_name || "-"}</span>
                    <span>{visit.role_name || "-"}</span>
                    <span>{visit.visit_type || "-"}</span>
                    <span>{displayDate(visit.visit_date)}</span>
                    <span>{visitDuration(visit)}</span>

                    <span className="ellipsis" title={visit.location || "-"}>
                      {visit.location || "-"}
                    </span>

                    <div>
                      <StatusBadge value={titleCase(visit.status)} />
                    </div>

                    <span>{visit.reviewed_by_name || "-"}</span>

                    <span className="ellipsis" title={visit.comment || "-"}>
                      {visit.comment || "-"}
                    </span>

                    <span
                      className="ellipsis"
                      title={visit.review_remark || "-"}
                    >
                      {visit.review_remark || "-"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}

      {/* ADD ATTENDANCE */}

      {showAddAttendance && (
        <Modal
          title="Add Attendance"
          subtitle="Add or correct an attendance record"
          onClose={() => setShowAddAttendance(false)}
        >
          <div className="hr-form">
            <label>Employee</label>

            <select
              value={attendanceForm.employee_id}
              onChange={(event) =>
                setAttendanceForm((current) => ({
                  ...current,
                  employee_id: event.target.value,
                }))
              }
            >
              <option value="">Select Employee</option>

              {users.map((user) => (
                <option key={user.user_id} value={user.user_id}>
                  {user.full_name} — {user.employee_code}
                </option>
              ))}
            </select>

            <label>Date</label>

            <input
              type="date"
              value={attendanceForm.attendance_date}
              onChange={(event) =>
                setAttendanceForm((current) => ({
                  ...current,
                  attendance_date: event.target.value,
                }))
              }
            />

            <div className="hr-form-two">
              <div>
                <label>First Punch</label>

                <input
                  type="time"
                  value={attendanceForm.check_in_time}
                  onChange={(event) =>
                    setAttendanceForm((current) => ({
                      ...current,
                      check_in_time: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label>Last Punch</label>

                <input
                  type="time"
                  value={attendanceForm.check_out_time}
                  onChange={(event) =>
                    setAttendanceForm((current) => ({
                      ...current,
                      check_out_time: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <label>Status</label>

            <select
              value={attendanceForm.status}
              onChange={(event) =>
                setAttendanceForm((current) => ({
                  ...current,
                  status: event.target.value,
                  custom_status:
                    event.target.value === "custom"
                      ? current.custom_status
                      : "",
                }))
              }
            >
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="half_day">Half Day</option>
              <option value="absent">Absent</option>
              <option value="holiday">Holiday</option>
              <option value="custom">Other / Custom Status</option>
            </select>

            {attendanceForm.status === "custom" && (
              <>
                <label>Custom Status</label>

                <input
                  type="text"
                  maxLength={100}
                  placeholder="Example: Work From Home"
                  value={attendanceForm.custom_status}
                  onChange={(event) =>
                    setAttendanceForm((current) => ({
                      ...current,
                      custom_status: event.target.value,
                    }))
                  }
                />
              </>
            )}

            <label>Remark</label>

            <textarea
              rows={4}
              value={attendanceForm.remarks}
              onChange={(event) =>
                setAttendanceForm((current) => ({
                  ...current,
                  remarks: event.target.value,
                }))
              }
            />
          </div>

          <div className="hr-modal-footer">
            <button
              className="hr-button secondary"
              onClick={() => setShowAddAttendance(false)}
            >
              Cancel
            </button>

            <button
              className="hr-button primary"
              onClick={saveAttendance}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Attendance"}
            </button>
          </div>
        </Modal>
      )}

      {/* LEAVE DETAILS */}

      {selectedLeave && (
        <Modal
          title="Leave Details"
          subtitle="Leave application information"
          onClose={() => {
            setSelectedLeave(null);
            setReviewRemark("");
          }}
        >
          <div className="hr-details">
            <Detail label="Employee" value={selectedLeave.employee_name} />
            <Detail
              label="Employee Code"
              value={selectedLeave.employee_code}
            />
            <Detail
              label="Department"
              value={selectedLeave.department_name}
            />
            <Detail label="Role" value={selectedLeave.role_name} />
            <Detail label="Leave Type" value={selectedLeave.leave_type} />
            <Detail
              label="From"
              value={displayDate(selectedLeave.start_date)}
            />
            <Detail label="To" value={displayDate(selectedLeave.end_date)} />
            <Detail label="Days" value={selectedLeave.total_days} />
            <Detail label="Reason" value={selectedLeave.reason} />
            <Detail label="Status" value={selectedLeave.display_status} />
            <Detail
              label="Reviewed By"
              value={selectedLeave.reviewed_by_name}
            />
            <Detail
              label="Reviewed At"
              value={displayDateTime(selectedLeave.reviewed_at)}
            />
            <Detail
              label="Review Remark"
              value={selectedLeave.review_remark}
            />
          </div>

          {selectedLeave.display_status === "Pending" && (
            <div className="hr-review-box">
              <label>Approval / Rejection Remark</label>

              <textarea
                rows={4}
                placeholder="Enter review remark"
                value={reviewRemark}
                onChange={(event) => setReviewRemark(event.target.value)}
              />
            </div>
          )}

          <div className="hr-modal-footer">
            {selectedLeave.display_status === "Pending" && (
              <>
                <button
                  className="hr-button danger"
                  disabled={reviewingLeaveId === selectedLeave.leave_id}
                  onClick={() => reviewLeave(selectedLeave, "rejected")}
                >
                  Reject Leave
                </button>

                <button
                  className="hr-button approve"
                  disabled={reviewingLeaveId === selectedLeave.leave_id}
                  onClick={() => reviewLeave(selectedLeave, "approved")}
                >
                  <CheckCircle2 size={16} />

                  {reviewingLeaveId === selectedLeave.leave_id
                    ? "Saving..."
                    : "Approve Leave"}
                </button>
              </>
            )}

            <button
              className="hr-button secondary"
              onClick={() => {
                setSelectedLeave(null);
                setReviewRemark("");
              }}
            >
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function Tab({ active, icon, label, onClick }) {
  return (
    <button className={`hr-tab ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function Metric({ label, value }) {
  return (
    <div className="hr-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Employee({ name, code }) {
  return (
    <div className="hr-employee">
      <strong>{name || "-"}</strong>
      <small>{code || "-"}</small>
    </div>
  );
}

function Empty({ text }) {
  return <div className="hr-empty">{text}</div>;
}

function CardHeader({ title, subtitle, right }) {
  return (
    <div className="hr-card-header">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>

      {right && <strong>{right}</strong>}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="hr-detail">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function Modal({ title, subtitle, onClose, children }) {
  return (
    <div className="hr-overlay">
      <div className="hr-modal">
        <div className="hr-modal-header">
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>

          <button onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, totalRecords, onChange }) {
  return (
    <div className="hr-pagination">
      <span>{totalRecords} records</span>

      <div>
        <button disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft size={16} />
        </button>

        <strong>
          {page} / {totalPages}
        </strong>

        <button
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}