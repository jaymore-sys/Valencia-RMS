import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  MapPin,
  RefreshCw,
  Search,
  Timer,
  UserPlus,
  Users,
  X,
  XCircle,
} from "lucide-react";

import api from "../../api/axios";

/* =========================================================
   HELPERS
========================================================= */

const formatToday = () => {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getMonthStart = () => {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}-01`;
};

const formatDisplayDate = (value) => {
  if (!value) return "-";

  const date = new Date(
    `${String(value).slice(0, 10)}T00:00:00`
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatApprovalDate = (value) => {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getInitials = (name) =>
  String(name || "U")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const normalizeStatus = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const titleCase = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );

const getStatusStyle = (status) => {
  const value =
    normalizeStatus(status);

  if (value === "present") {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #bbf7d0",
    };
  }

  if (value === "late") {
    return {
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fde68a",
    };
  }

  if (
    value === "half day" ||
    value === "half day leave"
  ) {
    return {
      background: "#ede9fe",
      color: "#6d28d9",
      border: "1px solid #ddd6fe",
    };
  }

  if (value === "absent") {
    return {
      background: "#fee2e2",
      color: "#991b1b",
      border: "1px solid #fecaca",
    };
  }

  if (value === "needs review") {
    return {
      background: "#fff7ed",
      color: "#c2410c",
      border: "1px solid #fed7aa",
    };
  }

  if (value === "no punch") {
    return {
      background: "#f1f5f9",
      color: "#475569",
      border: "1px solid #cbd5e1",
    };
  }

  if (value.includes("leave")) {
    return {
      background: "#e0f2fe",
      color: "#0369a1",
      border: "1px solid #bae6fd",
    };
  }

  if (value === "field visit") {
    return {
      background: "#ffedd5",
      color: "#c2410c",
      border: "1px solid #fed7aa",
    };
  }

  if (value === "weekly off") {
    return {
      background: "#f8fafc",
      color: "#64748b",
      border: "1px solid #e2e8f0",
    };
  }

  if (value === "holiday") {
    return {
      background: "#fce7f3",
      color: "#be185d",
      border: "1px solid #fbcfe8",
    };
  }

  return {
    background: "#f8fafc",
    color: "#475569",
    border: "1px solid #e2e8f0",
  };
};

/* =========================================================
   METRIC CARD
========================================================= */

const MetricCard = ({
  label,
  value,
  icon,
  active,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      ...styles.metricCard,
      ...(active
        ? styles.metricCardActive
        : {}),
    }}
  >
    <div
      style={{
        ...styles.metricIcon,
        ...(active
          ? styles.metricIconActive
          : {}),
      }}
    >
      {icon}
    </div>

    <div>
      <div style={styles.metricLabel}>
        {label}
      </div>

      <strong style={styles.metricValue}>
        {value ?? 0}
      </strong>
    </div>
  </button>
);

/* =========================================================
   HR ATTENDANCE
========================================================= */

const HrAttendance = () => {
  const fileInputRef =
    useRef(null);

  const initialRangeRef =
    useRef(false);

  const [activeOverview, setActiveOverview] =
    useState("attendance");

  const [quickFilter, setQuickFilter] =
    useState("all");

  const [importing, setImporting] =
    useState(false);

  const [exporting, setExporting] =
    useState(false);

  const [
    showExportMenu,
    setShowExportMenu,
  ] = useState(false);

  const [
    showAddModal,
    setShowAddModal,
  ] = useState(false);

  const [saving, setSaving] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [records, setRecords] =
    useState([]);

  const [users, setUsers] =
    useState([]);

  const [summary, setSummary] =
    useState({});

  const [
    biometricRange,
    setBiometricRange,
  ] = useState({
    first_date: null,
    last_date: null,
  });

  const [search, setSearch] =
    useState("");

  const [department, setDepartment] =
    useState("all");

  const [status, setStatus] =
    useState("all");

  const [fromDate, setFromDate] =
    useState(getMonthStart());

  const [toDate, setToDate] =
    useState(formatToday());

  const [
    attendanceForm,
    setAttendanceForm,
  ] = useState({
    employee_id: "",
    attendance_date: formatToday(),
    check_in_time: "",
    check_out_time: "",
    status: "present",
    remarks: "",
  });

  /* =========================================================
     FETCH
  ========================================================= */

  const fetchAttendance = async (
    startDate = fromDate,
    endDate = toDate,
    initializeRange = false
  ) => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get(
        "/hr-attendance",
        {
          params: {
            from_date: startDate,
            to_date: endDate,
          },
        }
      );

      const data =
        response.data || {};

      setRecords(
        data.records || []
      );

      setUsers(
        data.users || []
      );

      setSummary(
        data.summary || {}
      );

      const range =
        data.biometric_range || {};

      setBiometricRange({
        first_date:
          range.first_date || null,

        last_date:
          range.last_date || null,
      });

      /*
        Default HR page:
        first biometric date → today.

        Backend avoids fake absence after the
        latest biometric import date.
      */

      if (
        initializeRange &&
        !initialRangeRef.current &&
        range.first_date
      ) {
        initialRangeRef.current = true;

        const automaticFrom =
          range.first_date;

        const automaticTo =
          formatToday();

        setFromDate(
          automaticFrom
        );

        setToDate(
          automaticTo
        );

        if (
          automaticFrom !== startDate ||
          automaticTo !== endDate
        ) {
          await fetchAttendance(
            automaticFrom,
            automaticTo,
            false
          );
        }
      }
    } catch (err) {
      console.error(
        "HR Attendance:",
        err
      );

      setError(
        err?.response?.data?.message ||
          "Failed to load HR attendance."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance(
      getMonthStart(),
      formatToday(),
      true
    );
  }, []);

  /* =========================================================
     DEPARTMENTS
  ========================================================= */

  const departments =
    useMemo(() => {
      return Array.from(
        new Set(
          users
            .map(
              (user) =>
                user.department_name
            )
            .filter(Boolean)
        )
      ).sort();
    }, [users]);

  /* =========================================================
     FIELD VISIT STATS
  ========================================================= */

  const fieldVisitStats =
    useMemo(() => {
      const visits =
        records.filter(
          (record) =>
            Boolean(
              record.field_visit_id
            )
        );

      const employeeIds =
        new Set(
          visits.map(
            (record) =>
              record.user_id
          )
        );

      const locations =
        new Set(
          visits
            .map(
              (record) =>
                record.field_visit_location
            )
            .filter(Boolean)
        );

      return {
        visits:
          visits.length,

        employees:
          employeeIds.size,

        locations:
          locations.size,
      };
    }, [records]);

  /* =========================================================
     QUICK FILTER
  ========================================================= */

  const matchesQuickFilter = (
    record,
    filter
  ) => {
    const finalStatus =
      normalizeStatus(
        record.final_status
      );

    switch (filter) {
      case "present":
        return finalStatus === "present";

      case "late":
        return finalStatus === "late";

      case "half_day":
        return (
          finalStatus === "half day" ||
          finalStatus === "half day leave"
        );

      case "absent":
        return finalStatus === "absent";

      case "no_punch":
        return finalStatus === "no punch";

      case "needs_review":
        return finalStatus === "needs review";

      case "field_visit":
        return Boolean(
          record.field_visit_id
        );

      case "leave":
        return Boolean(
          record.leave_id
        );

      case "sick_leave":
        return (
          record.leave_code === "sick"
        );

      case "casual_leave":
        return (
          record.leave_code === "casual"
        );

      case "privileged_leave":
        return (
          record.leave_code ===
          "mandatory"
        );

      case "festival_leave":
        return (
          record.leave_code ===
          "festival"
        );

      case "unpaid_leave":
        return (
          record.leave_code ===
          "unpaid"
        );

      default:
        return true;
    }
  };

  /* =========================================================
     FILTERED RECORDS
  ========================================================= */

  const filteredRecords =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase();

      return records.filter(
        (record) => {
          const searchable =
            [
              record.full_name,
              record.email,
              record.employee_code,
              record.department_name,
              record.designation,
              record.final_status,
              record.leave_type,
              record.field_visit_type,
              record.field_visit_location,
              record.approved_by_name,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

          const matchesSearch =
            !term ||
            searchable.includes(term);

          const matchesDepartment =
            department === "all" ||
            record.department_name ===
              department;

          const matchesStatus =
            status === "all" ||
            normalizeStatus(
              record.final_status
            ) === status;

          const matchesQuick =
            matchesQuickFilter(
              record,
              quickFilter
            );

          return (
            matchesSearch &&
            matchesDepartment &&
            matchesStatus &&
            matchesQuick
          );
        }
      );
    }, [
      records,
      search,
      department,
      status,
      quickFilter,
    ]);

  /* =========================================================
     OVERVIEW FILTER
  ========================================================= */

  const applyQuickFilter = (
    value
  ) => {
    setQuickFilter(value);
    setStatus("all");
  };

  const showAll = () => {
    setQuickFilter("all");
    setStatus("all");
  };

  /* =========================================================
     ADD ATTENDANCE
  ========================================================= */

  const handleAddAttendance =
    () => {
      setAttendanceForm({
        employee_id: "",
        attendance_date:
          formatToday(),
        check_in_time: "",
        check_out_time: "",
        status: "present",
        remarks: "",
      });

      setShowAddModal(true);
    };

  const saveAttendance =
    async () => {
      try {
        if (
          !attendanceForm.employee_id
        ) {
          alert(
            "Please select an employee."
          );

          return;
        }

        if (
          !attendanceForm.attendance_date
        ) {
          alert(
            "Please select a date."
          );

          return;
        }

        setSaving(true);

        const response =
          await api.post(
            "/hr-attendance",
            attendanceForm
          );

        alert(
          response.data?.message ||
            "Attendance saved successfully."
        );

        setShowAddModal(false);

        await fetchAttendance();
      } catch (err) {
        alert(
          err?.response?.data?.message ||
            "Failed to save attendance."
        );
      } finally {
        setSaving(false);
      }
    };

  /* =========================================================
     IMPORT
  ========================================================= */

  const handleImport = () => {
    if (importing) return;

    if (fileInputRef.current) {
      fileInputRef.current.value =
        "";

      fileInputRef.current.click();
    }
  };

  const handleImportFile =
    async (event) => {
      const file =
        event.target.files?.[0];

      if (!file) return;

      const fileName =
        String(
          file.name || ""
        ).toLowerCase();

      const valid =
        fileName.endsWith(".xlsx") ||
        fileName.endsWith(".xls") ||
        fileName.endsWith(".csv");

      if (!valid) {
        alert(
          "Please select an Excel or CSV attendance file."
        );

        event.target.value = "";

        return;
      }

      try {
        setImporting(true);

        const formData =
          new FormData();

        formData.append(
          "file",
          file,
          file.name
        );

        const response =
          await api.post(
            "/hr-attendance/import",
            formData,
            {
              transformRequest: [
                (data) => data,
              ],

              headers: {
                "Content-Type":
                  undefined,
              },

              timeout:
                120000,
            }
          );

        const result =
          response.data || {};

        alert(
`Attendance import completed.

Inserted: ${result.inserted_rows || 0}
Updated: ${result.updated_rows || 0}
Duplicates Skipped: ${result.duplicate_rows || 0}
Unmatched Rows: ${result.unmatched_rows || 0}
Skipped Rows: ${result.skipped_rows || 0}`
        );

        await fetchAttendance();
      } catch (err) {
        console.error(
          "HR Attendance Import:",
          err
        );

        alert(
          err?.response?.data?.message ||
            "Attendance import failed."
        );
      } finally {
        setImporting(false);

        if (
          fileInputRef.current
        ) {
          fileInputRef.current.value =
            "";
        }
      }
    };

  /* =========================================================
     EXPORT
  ========================================================= */

  const handleExport =
    async (exportFormat) => {
      try {
        setExporting(true);
        setShowExportMenu(false);

        const response =
          await api.get(
            "/hr-attendance/export",
            {
              params: {
                from_date:
                  fromDate,

                to_date:
                  toDate,

                format:
                  exportFormat,
              },

              responseType:
                "blob",
            }
          );

        const type =
          exportFormat === "csv"
            ? "text/csv;charset=utf-8"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

        const blob =
          new Blob(
            [response.data],
            { type }
          );

        const url =
          window.URL.createObjectURL(
            blob
          );

        const link =
          document.createElement("a");

        link.href = url;

        link.download =
          `hr-attendance-${fromDate}-to-${toDate}.${exportFormat}`;

        document.body.appendChild(
          link
        );

        link.click();
        link.remove();

        window.URL.revokeObjectURL(
          url
        );
      } catch (err) {
        console.error(
          "HR Attendance export:",
          err
        );

        let message =
          "Failed to export attendance.";

        try {
          if (
            err?.response?.data instanceof Blob
          ) {
            const text =
              await err.response.data.text();

            const parsed =
              JSON.parse(text);

            message =
              parsed?.message ||
              message;
          }
        } catch {}

        alert(message);
      } finally {
        setExporting(false);
      }
    };

  /* =========================================================
     RENDER OVERVIEW
  ========================================================= */

  const renderOverview = () => {
    if (
      activeOverview === "leave"
    ) {
      return (
        <>
          <div style={styles.overviewHeading}>
            <div>
              <h2 style={styles.overviewTitle}>
                Leave Overview
              </h2>

              <p style={styles.overviewSubtitle}>
                Approved RMS leave records for the selected period.
              </p>
            </div>

            <button
              type="button"
              style={styles.showAllButton}
              onClick={showAll}
            >
              Show All
            </button>
          </div>

          <div style={styles.leaveMetrics}>
            <MetricCard
              label="All Leave"
              value={summary.leave}
              icon={
                <CalendarDays
                  size={19}
                />
              }
              active={
                quickFilter ===
                "leave"
              }
              onClick={() =>
                applyQuickFilter(
                  "leave"
                )
              }
            />

            <MetricCard
              label="Sick Leave"
              value={
                summary.sick_leave
              }
              icon={
                <CalendarDays
                  size={19}
                />
              }
              active={
                quickFilter ===
                "sick_leave"
              }
              onClick={() =>
                applyQuickFilter(
                  "sick_leave"
                )
              }
            />

            <MetricCard
              label="Casual Leave"
              value={
                summary.casual_leave
              }
              icon={
                <CalendarDays
                  size={19}
                />
              }
              active={
                quickFilter ===
                "casual_leave"
              }
              onClick={() =>
                applyQuickFilter(
                  "casual_leave"
                )
              }
            />

            <MetricCard
              label="Privileged Leave"
              value={
                summary.privileged_leave
              }
              icon={
                <CalendarDays
                  size={19}
                />
              }
              active={
                quickFilter ===
                "privileged_leave"
              }
              onClick={() =>
                applyQuickFilter(
                  "privileged_leave"
                )
              }
            />

            <MetricCard
              label="Festival Leave"
              value={
                summary.festival_leave
              }
              icon={
                <CalendarDays
                  size={19}
                />
              }
              active={
                quickFilter ===
                "festival_leave"
              }
              onClick={() =>
                applyQuickFilter(
                  "festival_leave"
                )
              }
            />

            <MetricCard
              label="Unpaid Leave"
              value={
                summary.unpaid_leave
              }
              icon={
                <CalendarDays
                  size={19}
                />
              }
              active={
                quickFilter ===
                "unpaid_leave"
              }
              onClick={() =>
                applyQuickFilter(
                  "unpaid_leave"
                )
              }
            />
          </div>
        </>
      );
    }

    if (
      activeOverview ===
      "field_visit"
    ) {
      return (
        <>
          <div style={styles.overviewHeading}>
            <div>
              <h2 style={styles.overviewTitle}>
                Field Visits
              </h2>

              <p style={styles.overviewSubtitle}>
                Approved field visits recorded through RMS.
              </p>
            </div>

            <button
              type="button"
              style={styles.showAllButton}
              onClick={showAll}
            >
              Show All
            </button>
          </div>

          <div style={styles.fieldMetrics}>
            <MetricCard
              label="Approved Visits"
              value={
                fieldVisitStats.visits
              }
              icon={
                <MapPin size={19} />
              }
              active={
                quickFilter ===
                "field_visit"
              }
              onClick={() =>
                applyQuickFilter(
                  "field_visit"
                )
              }
            />

            <MetricCard
              label="Employees"
              value={
                fieldVisitStats.employees
              }
              icon={
                <Users size={19} />
              }
              active={false}
              onClick={() =>
                applyQuickFilter(
                  "field_visit"
                )
              }
            />

            <MetricCard
              label="Locations"
              value={
                fieldVisitStats.locations
              }
              icon={
                <MapPin size={19} />
              }
              active={false}
              onClick={() =>
                applyQuickFilter(
                  "field_visit"
                )
              }
            />
          </div>
        </>
      );
    }

    return (
      <>
        <div style={styles.overviewHeading}>
          <div>
            <h2 style={styles.overviewTitle}>
              Attendance Overview
            </h2>

            <p style={styles.overviewSubtitle}>
              Click a metric to filter the register below.
            </p>
          </div>

          <button
            type="button"
            style={styles.showAllButton}
            onClick={showAll}
          >
            Show All
          </button>
        </div>

        <div style={styles.attendanceMetrics}>
          <MetricCard
            label="Employees"
            value={summary.employees}
            icon={
              <Users size={19} />
            }
            active={
              quickFilter === "all"
            }
            onClick={showAll}
          />

          <MetricCard
            label="Present"
            value={summary.present}
            icon={
              <CheckCircle2
                size={19}
              />
            }
            active={
              quickFilter ===
              "present"
            }
            onClick={() =>
              applyQuickFilter(
                "present"
              )
            }
          />

          <MetricCard
            label="Late"
            value={summary.late}
            icon={
              <Timer size={19} />
            }
            active={
              quickFilter === "late"
            }
            onClick={() =>
              applyQuickFilter("late")
            }
          />

          <MetricCard
            label="Half Day"
            value={summary.half_day}
            icon={
              <Clock3 size={19} />
            }
            active={
              quickFilter ===
              "half_day"
            }
            onClick={() =>
              applyQuickFilter(
                "half_day"
              )
            }
          />

          <MetricCard
            label="Absent"
            value={summary.absent}
            icon={
              <XCircle size={19} />
            }
            active={
              quickFilter ===
              "absent"
            }
            onClick={() =>
              applyQuickFilter(
                "absent"
              )
            }
          />

          <MetricCard
            label="No Punch"
            value={summary.no_punch}
            icon={
              <Clock3 size={19} />
            }
            active={
              quickFilter ===
              "no_punch"
            }
            onClick={() =>
              applyQuickFilter(
                "no_punch"
              )
            }
          />

          <MetricCard
            label="Needs Review"
            value={
              summary.needs_review
            }
            icon={
              <AlertTriangle
                size={19}
              />
            }
            active={
              quickFilter ===
              "needs_review"
            }
            onClick={() =>
              applyQuickFilter(
                "needs_review"
              )
            }
          />
        </div>
      </>
    );
  };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div style={styles.page}>
      <input
        ref={fileInputRef}
        name="file"
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleImportFile}
        style={{
          display: "none",
        }}
      />

      {/* HEADER */}

      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            HR Attendance
          </h1>

          <p style={styles.subtitle}>
            Organization-wide attendance, leave and field visit register.
          </p>

          {biometricRange.last_date && (
            <p style={styles.rangeNote}>
              Biometric data available:{" "}
              {formatDisplayDate(
                biometricRange.first_date
              )}
              {" to "}
              {formatDisplayDate(
                biometricRange.last_date
              )}
            </p>
          )}
        </div>

        <div style={styles.headerActions}>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() =>
              fetchAttendance(
                fromDate,
                toDate
              )
            }
          >
            <RefreshCw size={17} />
            Refresh
          </button>

          <button
            type="button"
            style={styles.secondaryButton}
            disabled={importing}
            onClick={handleImport}
          >
            <FileSpreadsheet
              size={17}
            />

            {importing
              ? "Importing..."
              : "Import"}
          </button>

          <div style={styles.exportWrap}>
            <button
              type="button"
              style={styles.secondaryButton}
              disabled={exporting}
              onClick={() =>
                setShowExportMenu(
                  (previous) =>
                    !previous
                )
              }
            >
              <Download size={17} />

              {exporting
                ? "Exporting..."
                : "Export"}
            </button>

            {showExportMenu && (
              <div style={styles.exportMenu}>
                <button
                  type="button"
                  style={styles.exportMenuButton}
                  onClick={() =>
                    handleExport("xlsx")
                  }
                >
                  <FileSpreadsheet
                    size={16}
                  />
                  Export Excel
                </button>

                <button
                  type="button"
                  style={styles.exportMenuButton}
                  onClick={() =>
                    handleExport("csv")
                  }
                >
                  <Download size={16} />
                  Export CSV
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            style={styles.primaryButton}
            onClick={
              handleAddAttendance
            }
          >
            <UserPlus size={17} />
            Add Attendance
          </button>
        </div>
      </div>

      {error && (
        <div style={styles.errorBox}>
          {error}
        </div>
      )}

      {/* OVERVIEW NAVIGATION */}

      <div style={styles.overviewTabs}>
        <button
          type="button"
          style={{
            ...styles.overviewTab,
            ...(activeOverview ===
            "attendance"
              ? styles.overviewTabActive
              : {}),
          }}
          onClick={() => {
            setActiveOverview(
              "attendance"
            );
            showAll();
          }}
        >
          <CheckCircle2
            size={17}
          />
          Attendance Overview
        </button>

        <button
          type="button"
          style={{
            ...styles.overviewTab,
            ...(activeOverview ===
            "leave"
              ? styles.overviewTabActive
              : {}),
          }}
          onClick={() => {
            setActiveOverview("leave");
            showAll();
          }}
        >
          <CalendarDays
            size={17}
          />
          Leave Overview
        </button>

        <button
          type="button"
          style={{
            ...styles.overviewTab,
            ...(activeOverview ===
            "field_visit"
              ? styles.overviewTabActive
              : {}),
          }}
          onClick={() => {
            setActiveOverview(
              "field_visit"
            );
            showAll();
          }}
        >
          <MapPin size={17} />
          Field Visits
        </button>
      </div>

      {/* ACTIVE OVERVIEW */}

      <div style={styles.overviewCard}>
        {renderOverview()}
      </div>

      {/* FILTERS */}

      <div style={styles.filterCard}>
        <div style={styles.searchWrap}>
          <Search size={18} />

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search employee, code, department..."
            style={styles.searchInput}
          />
        </div>

        <select
          value={department}
          onChange={(event) =>
            setDepartment(
              event.target.value
            )
          }
          style={styles.select}
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
          value={status}
          onChange={(event) => {
            setStatus(
              event.target.value
            );

            setQuickFilter("all");
          }}
          style={styles.select}
        >
          <option value="all">
            All Status
          </option>

          <option value="present">
            Present
          </option>

          <option value="late">
            Late
          </option>

          <option value="half day">
            Half Day
          </option>

          <option value="absent">
            Absent
          </option>

          <option value="no punch">
            No Punch
          </option>

          <option value="needs review">
            Needs Review
          </option>

          <option value="field visit">
            Field Visit
          </option>

          <option value="sick leave">
            Sick Leave
          </option>

          <option value="casual leave">
            Casual Leave
          </option>

          <option value="privileged leave">
            Privileged Leave
          </option>

          <option value="festival leave">
            Festival Leave
          </option>

          <option value="unpaid leave">
            Unpaid Leave
          </option>

          <option value="weekly off">
            Weekly Off
          </option>

          <option value="holiday">
            Holiday
          </option>
        </select>

        <input
          type="date"
          value={fromDate}
          onChange={(event) =>
            setFromDate(
              event.target.value
            )
          }
          style={styles.dateInput}
        />

        <input
          type="date"
          value={toDate}
          onChange={(event) =>
            setToDate(
              event.target.value
            )
          }
          style={styles.dateInput}
        />

        <button
          type="button"
          style={styles.applyButton}
          onClick={() => {
            showAll();

            fetchAttendance(
              fromDate,
              toDate
            );
          }}
        >
          Apply
        </button>
      </div>

      {/* REGISTER */}

      <div style={styles.tableCard}>
        <div style={styles.tableTop}>
          <div>
            <div style={styles.registerTitleRow}>
              <h2 style={styles.sectionTitle}>
                Attendance Register
              </h2>

              {quickFilter !== "all" && (
                <span style={styles.filterBadge}>
                  {titleCase(
                    quickFilter
                  )}
                </span>
              )}
            </div>

            <p style={styles.sectionSubtitle}>
              {filteredRecords.length} records visible
            </p>
          </div>

          {quickFilter !== "all" && (
            <button
              type="button"
              style={styles.showAllButton}
              onClick={showAll}
            >
              <X size={14} />
              Show All
            </button>
          )}
        </div>

        <div style={styles.tableScroll}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>
                  Employee
                </th>

                <th style={styles.th}>
                  Department
                </th>

                <th style={styles.th}>
                  Date
                </th>

                <th style={styles.th}>
                  Day
                </th>

                <th style={styles.th}>
                  First Punch
                </th>

                <th style={styles.th}>
                  Last Punch
                </th>

                <th style={styles.th}>
                  Total Time
                </th>

                <th style={styles.th}>
                  Status
                </th>

                <th style={styles.th}>
                  Leave
                </th>

                <th style={styles.th}>
                  Field Visit
                </th>

                <th style={styles.th}>
                  Approved By
                </th>

                <th style={styles.th}>
                  Approved At
                </th>

                <th style={styles.th}>
                  Remark
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={13}
                    style={styles.emptyTd}
                  >
                    Loading attendance...
                  </td>
                </tr>
              ) : filteredRecords.length ===
                0 ? (
                <tr>
                  <td
                    colSpan={13}
                    style={styles.emptyTd}
                  >
                    <div style={styles.emptyState}>
                      <div style={styles.emptyIcon}>
                        <Search size={24} />
                      </div>

                      <strong>
                        No records found
                      </strong>

                      <span>
                        Change the filter or click Show All.
                      </span>

                      <button
                        type="button"
                        style={styles.emptyButton}
                        onClick={showAll}
                      >
                        Show All Records
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map(
                  (record, index) => {
                    const badgeStyle =
                      getStatusStyle(
                        record.final_status
                      );

                    return (
                      <tr
                        key={`${record.user_id}-${record.attendance_date}-${index}`}
                      >
                        <td style={styles.td}>
                          <div style={styles.employeeCell}>
                            <div style={styles.avatar}>
                              {getInitials(
                                record.full_name
                              )}
                            </div>

                            <div>
                              <strong style={styles.employeeName}>
                                {record.full_name ||
                                  "-"}
                              </strong>

                              <div style={styles.employeeCode}>
                                {record.employee_code ||
                                  "-"}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td style={styles.td}>
                          {record.department_name ||
                            "-"}
                        </td>

                        <td style={styles.td}>
                          {formatDisplayDate(
                            record.attendance_date
                          )}
                        </td>

                        <td style={styles.td}>
                          {record.day_name ||
                            "-"}
                        </td>

                        <td style={styles.td}>
                          {record.check_in_time ||
                            "-"}
                        </td>

                        <td style={styles.td}>
                          {record.check_out_time ||
                            "-"}
                        </td>

                        <td style={styles.td}>
                          {record.working_hours ||
                            "-"}
                        </td>

                        <td style={styles.td}>
                          <span
                            style={{
                              ...styles.statusBadge,
                              ...badgeStyle,
                            }}
                          >
                            {record.final_status ||
                              "-"}
                          </span>
                        </td>

                        <td style={styles.td}>
                          {record.leave_type ? (
                            <div style={styles.detailBlock}>
                              <strong>
                                {record.leave_type}
                              </strong>

                              {record.leave_duration && (
                                <span>
                                  {record.leave_duration}
                                </span>
                              )}

                              {record.leave_session && (
                                <span>
                                  {record.leave_session}
                                </span>
                              )}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>

                        <td style={styles.td}>
                          {record.field_visit_id ? (
                            <div style={styles.detailBlock}>
                              <strong>
                                {record.field_visit_type ||
                                  "Field Visit"}
                              </strong>

                              {record.field_visit_location && (
                                <span>
                                  {record.field_visit_location}
                                </span>
                              )}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>

                        <td style={styles.td}>
                          {record.approved_by_name ||
                            "-"}
                        </td>

                        <td style={styles.td}>
                          {formatApprovalDate(
                            record.approved_at
                          )}
                        </td>

                        <td style={styles.td}>
                          <div style={styles.remarkCell}>
                            {record.leave_reason ||
                              record.field_visit_reason ||
                              record.attendance_remarks ||
                              record.detail ||
                              "-"}
                          </div>
                        </td>
                      </tr>
                    );
                  }
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD ATTENDANCE MODAL */}

      {showAddModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={styles.modalTitle}>
                  Add Attendance
                </h2>

                <p style={styles.modalSubtitle}>
                  Add or correct an employee attendance record.
                </p>
              </div>

              <button
                type="button"
                style={styles.closeButton}
                onClick={() =>
                  setShowAddModal(
                    false
                  )
                }
              >
                ×
              </button>
            </div>

            <div style={styles.formGrid}>
              <div style={styles.fullField}>
                <label style={styles.label}>
                  Employee
                </label>

                <select
                  style={styles.formInput}
                  value={
                    attendanceForm.employee_id
                  }
                  onChange={(event) =>
                    setAttendanceForm({
                      ...attendanceForm,

                      employee_id:
                        event.target.value,
                    })
                  }
                >
                  <option value="">
                    Select Employee
                  </option>

                  {users.map(
                    (user) => (
                      <option
                        key={
                          user.user_id
                        }
                        value={
                          user.user_id
                        }
                      >
                        {user.full_name}
                        {" — "}
                        {user.employee_code ||
                          "No Code"}
                        {" — "}
                        {user.department_name ||
                          "No Department"}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label style={styles.label}>
                  Date
                </label>

                <input
                  type="date"
                  style={styles.formInput}
                  value={
                    attendanceForm.attendance_date
                  }
                  onChange={(event) =>
                    setAttendanceForm({
                      ...attendanceForm,

                      attendance_date:
                        event.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label style={styles.label}>
                  Status
                </label>

                <select
                  style={styles.formInput}
                  value={
                    attendanceForm.status
                  }
                  onChange={(event) =>
                    setAttendanceForm({
                      ...attendanceForm,

                      status:
                        event.target.value,
                    })
                  }
                >
                  <option value="present">
                    Present
                  </option>

                  <option value="late">
                    Late
                  </option>

                  <option value="half_day">
                    Half Day
                  </option>

                  <option value="absent">
                    Absent
                  </option>

                  <option value="holiday">
                    Holiday
                  </option>
                </select>
              </div>

              <div>
                <label style={styles.label}>
                  First Punch
                </label>

                <input
                  type="time"
                  style={styles.formInput}
                  value={
                    attendanceForm.check_in_time
                  }
                  onChange={(event) =>
                    setAttendanceForm({
                      ...attendanceForm,

                      check_in_time:
                        event.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label style={styles.label}>
                  Last Punch
                </label>

                <input
                  type="time"
                  style={styles.formInput}
                  value={
                    attendanceForm.check_out_time
                  }
                  onChange={(event) =>
                    setAttendanceForm({
                      ...attendanceForm,

                      check_out_time:
                        event.target.value,
                    })
                  }
                />
              </div>

              <div style={styles.fullField}>
                <label style={styles.label}>
                  Remark
                </label>

                <textarea
                  rows={3}
                  style={{
                    ...styles.formInput,
                    paddingTop: "10px",
                    resize: "vertical",
                  }}
                  value={
                    attendanceForm.remarks
                  }
                  onChange={(event) =>
                    setAttendanceForm({
                      ...attendanceForm,

                      remarks:
                        event.target.value,
                    })
                  }
                  placeholder="Example: Missing biometric punch / attendance correction"
                />
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button
                type="button"
                style={styles.cancelButton}
                onClick={() =>
                  setShowAddModal(
                    false
                  )
                }
              >
                Cancel
              </button>

              <button
                type="button"
                style={styles.primaryButton}
                disabled={saving}
                onClick={
                  saveAttendance
                }
              >
                {saving
                  ? "Saving..."
                  : "Save Attendance"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* =========================================================
   STYLES
========================================================= */

const styles = {
  page: {
    width: "100%",
    padding: "20px 22px 30px",
    boxSizing: "border-box",
    background: "#f7f8fb",
    minHeight: "100vh",
  },

  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "20px",
    marginBottom: "18px",
    flexWrap: "wrap",
  },

  title: {
    margin: 0,
    color: "#101828",
    fontSize: "34px",
    lineHeight: 1.1,
    fontWeight: 900,
  },

  subtitle: {
    margin: "6px 0 0",
    color: "#667085",
    fontSize: "14px",
    fontWeight: 600,
  },

  rangeNote: {
    margin: "5px 0 0",
    color: "#98a2b3",
    fontSize: "11px",
    fontWeight: 700,
  },

  headerActions: {
    display: "flex",
    gap: "9px",
    alignItems: "center",
    flexWrap: "wrap",
  },

  primaryButton: {
    minHeight: "42px",
    padding: "0 16px",
    border: 0,
    borderRadius: "10px",
    background: "#ff5733",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    cursor: "pointer",
    fontWeight: 800,
  },

  secondaryButton: {
    minHeight: "42px",
    padding: "0 14px",
    border: "1px solid #dfe3ea",
    borderRadius: "10px",
    background: "#fff",
    color: "#344054",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    cursor: "pointer",
    fontWeight: 800,
  },

  errorBox: {
    padding: "12px 14px",
    marginBottom: "16px",
    borderRadius: "10px",
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#b91c1c",
    fontWeight: 700,
  },

  /* TABS */

  overviewTabs: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    background: "#fff",
    border: "1px solid #e4e7ec",
    borderRadius: "13px",
    overflow: "hidden",
    marginBottom: "14px",
  },

  overviewTab: {
    height: "48px",
    border: 0,
    borderRight: "1px solid #eef0f3",
    background: "#fff",
    color: "#667085",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 800,
  },

  overviewTabActive: {
    background: "#fff7f4",
    color: "#e54726",
    boxShadow: "inset 0 -3px 0 #ff5733",
  },

  /* OVERVIEW */

  overviewCard: {
    background: "#fff",
    border: "1px solid #e4e7ec",
    borderRadius: "15px",
    padding: "17px 18px",
    marginBottom: "14px",
  },

  overviewHeading: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "14px",
  },

  overviewTitle: {
    margin: 0,
    color: "#101828",
    fontSize: "18px",
    fontWeight: 900,
  },

  overviewSubtitle: {
    margin: "4px 0 0",
    color: "#667085",
    fontSize: "12px",
    fontWeight: 600,
  },

  attendanceMetrics: {
    display: "grid",
    gridTemplateColumns:
      "repeat(7, minmax(0, 1fr))",
    gap: "10px",
  },

  leaveMetrics: {
    display: "grid",
    gridTemplateColumns:
      "repeat(6, minmax(0, 1fr))",
    gap: "10px",
  },

  fieldMetrics: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3, minmax(0, 220px))",
    gap: "10px",
  },

  metricCard: {
    minHeight: "72px",
    width: "100%",
    border: "1px solid #eaecf0",
    borderRadius: "11px",
    background: "#fafbfc",
    padding: "11px 12px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    cursor: "pointer",
    textAlign: "left",
  },

  metricCardActive: {
    border: "1px solid #ff5733",
    background: "#fff7f4",
    boxShadow: "0 0 0 2px rgba(255,87,51,.05)",
  },

  metricIcon: {
    width: "38px",
    height: "38px",
    borderRadius: "10px",
    background: "#fff1ed",
    color: "#ff5733",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },

  metricIconActive: {
    background: "#ff5733",
    color: "#fff",
  },

  metricLabel: {
    color: "#667085",
    fontSize: "11px",
    fontWeight: 800,
    lineHeight: 1.15,
  },

  metricValue: {
    display: "block",
    marginTop: "2px",
    color: "#101828",
    fontSize: "21px",
    fontWeight: 900,
  },

  showAllButton: {
    minHeight: "34px",
    padding: "0 11px",
    border: "1px solid #dfe3ea",
    borderRadius: "8px",
    background: "#fff",
    color: "#475467",
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    cursor: "pointer",
    fontWeight: 800,
  },

  /* FILTERS */

  filterCard: {
    display: "grid",
    gridTemplateColumns:
      "minmax(260px, 1fr) 190px 190px 160px 160px 90px",
    gap: "9px",
    background: "#fff",
    border: "1px solid #e4e7ec",
    borderRadius: "14px",
    padding: "11px",
    marginBottom: "14px",
  },

  searchWrap: {
    minHeight: "42px",
    padding: "0 12px",
    border: "1px solid #dfe3ea",
    borderRadius: "9px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#98a2b3",
  },

  searchInput: {
    width: "100%",
    border: 0,
    outline: 0,
    background: "transparent",
    color: "#101828",
    fontSize: "13px",
  },

  select: {
    minHeight: "42px",
    padding: "0 10px",
    border: "1px solid #dfe3ea",
    borderRadius: "9px",
    background: "#fff",
    color: "#344054",
    outline: 0,
    fontWeight: 700,
  },

  dateInput: {
    minHeight: "42px",
    padding: "0 10px",
    border: "1px solid #dfe3ea",
    borderRadius: "9px",
    background: "#fff",
    color: "#344054",
    outline: 0,
    fontWeight: 700,
  },

  applyButton: {
    minHeight: "42px",
    border: 0,
    borderRadius: "9px",
    background: "#101828",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
  },

  /* TABLE */

  tableCard: {
    background: "#fff",
    border: "1px solid #e4e7ec",
    borderRadius: "15px",
    overflow: "hidden",
  },

  tableTop: {
    minHeight: "62px",
    padding: "13px 16px",
    borderBottom: "1px solid #eaecf0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },

  registerTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },

  sectionTitle: {
    margin: 0,
    color: "#101828",
    fontSize: "18px",
    fontWeight: 900,
  },

  sectionSubtitle: {
    margin: "3px 0 0",
    color: "#667085",
    fontSize: "11px",
    fontWeight: 600,
  },

  filterBadge: {
    padding: "4px 8px",
    borderRadius: "999px",
    background: "#fff1ed",
    color: "#d73d1e",
    fontSize: "10px",
    fontWeight: 900,
  },

  tableScroll: {
    width: "100%",
    maxHeight: "calc(100vh - 355px)",
    overflow: "auto",
  },

  table: {
    width: "100%",
    minWidth: "1750px",
    borderCollapse: "separate",
    borderSpacing: 0,
  },

  th: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    padding: "11px 12px",
    borderBottom: "1px solid #eaecf0",
    background: "#f9fafb",
    color: "#667085",
    textAlign: "left",
    whiteSpace: "nowrap",
    fontSize: "10px",
    fontWeight: 900,
  },

  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #f2f4f7",
    color: "#344054",
    verticalAlign: "middle",
    fontSize: "11px",
    fontWeight: 650,
  },

  employeeCell: {
    minWidth: "190px",
    display: "flex",
    alignItems: "center",
    gap: "9px",
  },

  avatar: {
    width: "32px",
    height: "32px",
    borderRadius: "8px",
    background: "#101828",
    color: "#fff",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    fontSize: "10px",
    fontWeight: 900,
  },

  employeeName: {
    display: "block",
    color: "#101828",
    fontSize: "11px",
    whiteSpace: "nowrap",
  },

  employeeCode: {
    marginTop: "2px",
    color: "#98a2b3",
    fontSize: "9px",
  },

  statusBadge: {
    minHeight: "24px",
    padding: "0 8px",
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "nowrap",
    fontSize: "9px",
    fontWeight: 900,
  },

  detailBlock: {
    minWidth: "110px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    color: "#475467",
    fontSize: "9px",
  },

  remarkCell: {
    maxWidth: "240px",
    color: "#667085",
    whiteSpace: "normal",
    lineHeight: 1.35,
  },

  emptyTd: {
    padding: 0,
    textAlign: "center",
  },

  emptyState: {
    minHeight: "210px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: "7px",
    color: "#667085",
  },

  emptyIcon: {
    width: "48px",
    height: "48px",
    borderRadius: "12px",
    background: "#f2f4f7",
    color: "#98a2b3",
    display: "grid",
    placeItems: "center",
  },

  emptyButton: {
    marginTop: "5px",
    minHeight: "34px",
    padding: "0 12px",
    border: "1px solid #dfe3ea",
    borderRadius: "8px",
    background: "#fff",
    color: "#344054",
    cursor: "pointer",
    fontWeight: 800,
  },

  /* MODAL */

  modalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    padding: "20px",
    background: "rgba(16,24,40,.45)",
    display: "grid",
    placeItems: "center",
  },

  modal: {
    width: "100%",
    maxWidth: "650px",
    background: "#fff",
    borderRadius: "18px",
    overflow: "hidden",
    boxShadow:
      "0 25px 70px rgba(16,24,40,.22)",
  },

  modalHeader: {
    padding: "18px 20px",
    borderBottom: "1px solid #eaecf0",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
  },

  modalTitle: {
    margin: 0,
    color: "#101828",
    fontSize: "21px",
    fontWeight: 900,
  },

  modalSubtitle: {
    margin: "4px 0 0",
    color: "#667085",
    fontSize: "12px",
  },

  closeButton: {
    width: "32px",
    height: "32px",
    border: 0,
    borderRadius: "8px",
    background: "#f2f4f7",
    color: "#475467",
    cursor: "pointer",
    fontSize: "20px",
  },

  formGrid: {
    padding: "19px 20px",
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    gap: "14px",
  },

  fullField: {
    gridColumn: "1 / -1",
  },

  label: {
    display: "block",
    marginBottom: "6px",
    color: "#475467",
    fontSize: "11px",
    fontWeight: 800,
  },

  formInput: {
    width: "100%",
    minHeight: "40px",
    padding: "0 10px",
    boxSizing: "border-box",
    border: "1px solid #dfe3ea",
    borderRadius: "9px",
    background: "#fff",
    color: "#101828",
    outline: 0,
  },

  modalFooter: {
    padding: "14px 20px",
    borderTop: "1px solid #eaecf0",
    display: "flex",
    justifyContent: "flex-end",
    gap: "9px",
  },

  cancelButton: {
    minHeight: "40px",
    padding: "0 15px",
    border: "1px solid #dfe3ea",
    borderRadius: "9px",
    background: "#fff",
    color: "#344054",
    cursor: "pointer",
    fontWeight: 800,
  },

  /* EXPORT */

  exportWrap: {
    position: "relative",
  },

  exportMenu: {
    position: "absolute",
    top: "calc(100% + 7px)",
    right: 0,
    zIndex: 100,
    width: "175px",
    padding: "6px",
    background: "#fff",
    border: "1px solid #e4e7ec",
    borderRadius: "10px",
    boxShadow:
      "0 15px 35px rgba(16,24,40,.14)",
  },

  exportMenuButton: {
    width: "100%",
    minHeight: "37px",
    padding: "0 10px",
    border: 0,
    borderRadius: "7px",
    background: "transparent",
    color: "#344054",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    textAlign: "left",
    fontWeight: 700,
  },
};

export default HrAttendance;