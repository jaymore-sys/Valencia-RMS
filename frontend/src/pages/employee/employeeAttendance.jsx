import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Highlighter,
  List,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import api from "../../api/axios";
const getResponseData = (response) => {
  return response?.data?.data || response?.data || {};
};
const asArray = (value) => {
  if (Array.isArray(value)) return value;
  return [];
};
const createEmptyVisitStop = () => ({
  location: "",
  visit_time: "",
  description: "",
});
const getVisitStops = (visit = {}) => {
  const savedStops = asArray(visit.visit_stops)
    .filter((stop) =>
      String(stop?.location || "").trim() ||
      String(stop?.description || "").trim()
    )
    .sort(
      (a, b) =>
        Number(a?.sequence_no || 0) -
        Number(b?.sequence_no || 0)
    );
  if (savedStops.length) {
    return savedStops;
  }
  if (visit.location || visit.comment) {
    return [
      {
        stop_id: null,
        sequence_no: 1,
        location: visit.location || "",
        visit_time: null,
        description: visit.comment || "",
        is_legacy: true,
      },
    ];
  }
  return [];
};
const escapeVisitHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const visitInlineMarkupToHtml = (value) =>
  escapeVisitHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /==(.+?)==/g,
      '<span style="background-color:#fef3c7;color:#92400e;padding:0 2px;border-radius:3px;">$1</span>'
    );

const visitMarkupToEditorHtml = (value) => {
  const lines = String(value || "").split(/\r?\n/);
  const html = [];
  let bulletItems = [];

  const flushBullets = () => {
    if (!bulletItems.length) return;
    html.push(
      `<ul>${bulletItems
        .map((item) => `<li>${visitInlineMarkupToHtml(item)}</li>`)
        .join("")}</ul>`
    );
    bulletItems = [];
  };

  lines.forEach((line) => {
    if (/^\s*-\s+/.test(line)) {
      bulletItems.push(line.replace(/^\s*-\s+/, ""));
      return;
    }

    flushBullets();
    html.push(
      `<div>${line ? visitInlineMarkupToHtml(line) : "<br>"}</div>`
    );
  });

  flushBullets();
  return html.join("");
};

const editorNodeToVisitMarkup = (node) => {
  if (!node) return "";

  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue || "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const tag = node.tagName?.toLowerCase();
  const children = Array.from(node.childNodes)
    .map(editorNodeToVisitMarkup)
    .join("");

  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") {
    return children ? `**${children}**` : "";
  }
  if (tag === "mark") {
    return children ? `==${children}==` : "";
  }
  if (tag === "span") {
    const background = String(
      node.style?.backgroundColor || ""
    )
      .trim()
      .toLowerCase();

    const isHighlight =
      background &&
      ![
        "transparent",
        "white",
        "#fff",
        "#ffffff",
        "rgb(255, 255, 255)",
        "rgba(0, 0, 0, 0)",
      ].includes(background);

    if (isHighlight) {
      return children ? `==${children}==` : "";
    }
  }
  if (tag === "li") return children;
  if (tag === "ul") {
    const items = Array.from(node.children)
      .filter((child) => child.tagName?.toLowerCase() === "li")
      .map((item) => `- ${editorNodeToVisitMarkup(item).trim()}`)
      .join("\n");
    return items ? `${items}\n` : "";
  }
  if (tag === "div" || tag === "p") {
    return `${children}\n`;
  }

  return children;
};

const editorToVisitMarkup = (element) =>
  Array.from(element?.childNodes || [])
    .map(editorNodeToVisitMarkup)
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n+$/, "");


const renderVisitInline = (value, keyPrefix = "visit") => {
  const parts = String(value || "").split(/(\*\*.*?\*\*|==.*?==)/g);

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("==") && part.endsWith("==") && part.length >= 4) {
      return (
        <mark
          key={key}
          style={{
            background: "#fef3c7",
            color: "#92400e",
            padding: "0 2px",
            borderRadius: "3px",
          }}
        >
          {part.slice(2, -2)}
        </mark>
      );
    }

    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
};

const FormattedVisitText = ({ value }) => {
  const text = String(value || "").trim();

  if (!text) {
    return <span>-</span>;
  }

  const lines = text.split(/\r?\n/);
  const content = [];
  let bullets = [];

  const flushBullets = () => {
    if (!bullets.length) return;

    content.push(
      <ul
        key={`bullets-${content.length}`}
        style={{ margin: "4px 0 4px 18px", padding: 0 }}
      >
        {bullets.map((item, index) => (
          <li key={index} style={{ marginBottom: "2px" }}>
            {renderVisitInline(item, `bullet-${content.length}-${index}`)}
          </li>
        ))}
      </ul>
    );

    bullets = [];
  };

  lines.forEach((line, index) => {
    if (/^\s*-\s+/.test(line)) {
      bullets.push(line.replace(/^\s*-\s+/, ""));
      return;
    }

    flushBullets();

    content.push(
      <div key={`line-${index}`} style={{ minHeight: line ? "auto" : "1em" }}>
        {line ? renderVisitInline(line, `line-${index}`) : <br />}
      </div>
    );
  });

  flushBullets();

  return (
    <div style={{ whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.5 }}>
      {content}
    </div>
  );
};

const RichVisitEditor = ({ value, onChange, placeholder, style }) => {
  const editorRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(!String(value || "").trim());
  const [selectionState, setSelectionState] = useState({
    hasSelection: false,
    bold: false,
    highlight: false,
    bullet: false,
  });

  const getSelectionInfo = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();

    if (!editor || !selection?.rangeCount) {
      return { editor, selection, inside: false, hasSelection: false };
    }

    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    const inside = Boolean(
      anchor && focus && editor.contains(anchor) && editor.contains(focus)
    );
    const hasSelection = inside && !selection.isCollapsed && Boolean(selection.toString().trim());

    return { editor, selection, inside, hasSelection };
  };

  const nodeHasHighlight = (node, editor) => {
    let element = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;

    while (element && element !== editor) {
      const tag = element.tagName?.toLowerCase();
      const background = String(element.style?.backgroundColor || "")
        .trim()
        .toLowerCase();

      if (tag === "mark") return true;

      if (
        background &&
        ![
          "transparent",
          "white",
          "#fff",
          "#ffffff",
          "rgb(255, 255, 255)",
          "rgba(0, 0, 0, 0)",
        ].includes(background)
      ) {
        return true;
      }

      element = element.parentElement;
    }

    return false;
  };

  const selectedTextHasHighlight = () => {
    const { editor, selection, hasSelection } = getSelectionInfo();
    if (!editor || !selection || !hasSelection) return false;

    const range = selection.getRangeAt(0);
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();

    while (node) {
      try {
        if (
          node.textContent?.trim() &&
          range.intersectsNode(node) &&
          nodeHasHighlight(node, editor)
        ) {
          return true;
        }
      } catch {
        // Ignore nodes the browser cannot test against this range.
      }

      node = walker.nextNode();
    }

    return false;
  };

  const updateSelectionState = () => {
    const { hasSelection } = getSelectionInfo();

    if (!hasSelection) {
      setSelectionState({
        hasSelection: false,
        bold: false,
        highlight: false,
        bullet: false,
      });
      return;
    }

    let bold = false;
    let bullet = false;

    try {
      bold = document.queryCommandState("bold");
      bullet = document.queryCommandState("insertUnorderedList");
    } catch {
      bold = false;
      bullet = false;
    }

    setSelectionState({
      hasSelection: true,
      bold: Boolean(bold),
      highlight: selectedTextHasHighlight(),
      bullet: Boolean(bullet),
    });
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;

    const html = visitMarkupToEditorHtml(value);
    if (editor.innerHTML !== html) editor.innerHTML = html;
    setIsEmpty(!String(value || "").trim());
  }, [value]);

  useEffect(() => {
    const handleSelectionChange = () => updateSelectionState();
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  const syncValue = () => {
    const nextValue = editorToVisitMarkup(editorRef.current);
    setIsEmpty(!nextValue.trim());
    onChange(nextValue);
  };

  const applyFormat = (command) => {
    const { editor, hasSelection } = getSelectionInfo();
    if (!editor || !hasSelection) return;

    editor.focus();

    if (command === "bold") {
      document.execCommand("bold", false);
    } else if (command === "highlight") {
      const removeHighlight = selectedTextHasHighlight();
      const color = removeHighlight ? "#ffffff" : "#fef3c7";
      const applied = document.execCommand("hiliteColor", false, color);
      if (!applied) document.execCommand("backColor", false, color);
    } else if (command === "bullet") {
      document.execCommand("insertUnorderedList", false);
    }

    syncValue();
    updateSelectionState();
  };

  const baseButton = {
    width: "34px",
    height: "34px",
    border: "1px solid #d6dde8",
    background: "#ffffff",
    borderRadius: "8px",
    display: "grid",
    placeItems: "center",
    padding: 0,
    color: "#111827",
  };

  const buttonStyle = (active) => ({
    ...baseButton,
    cursor: selectionState.hasSelection ? "pointer" : "default",
    opacity: selectionState.hasSelection ? 1 : 0.55,
    ...(active
      ? {
          background: "#fff0eb",
          border: "1px solid #ff5733",
          color: "#ff5733",
          boxShadow: "0 0 0 2px rgba(255,87,51,0.08)",
        }
      : {}),
  });

  const toolbarButton = (command, title, active, icon) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={!selectionState.hasSelection}
      style={buttonStyle(active)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => applyFormat(command)}
    >
      {icon}
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "7px" }}>
        {toolbarButton(
          "bold",
          "Bold selected text",
          selectionState.bold,
          <Bold size={16} strokeWidth={2.6} />
        )}
        {toolbarButton(
          "highlight",
          selectionState.highlight ? "Remove highlight" : "Highlight selected text",
          selectionState.highlight,
          <Highlighter size={16} strokeWidth={2.4} />
        )}
        {toolbarButton(
          "bullet",
          "Toggle bullet list",
          selectionState.bullet,
          <List size={17} strokeWidth={2.4} />
        )}
      </div>

      <div style={{ position: "relative" }}>
        {isEmpty && (
          <div
            style={{
              position: "absolute",
              top: "13px",
              left: "13px",
              right: "13px",
              color: "#64748b",
              pointerEvents: "none",
              fontSize: "14px",
              fontWeight: 400,
              lineHeight: 1.45,
            }}
          >
            {placeholder}
          </div>
        )}

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          style={{
            ...style,
            height: "auto",
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}
          onInput={() => {
            syncValue();
            updateSelectionState();
          }}
          onMouseUp={updateSelectionState}
          onKeyUp={updateSelectionState}
          onFocus={updateSelectionState}
          onBlur={() => {
            syncValue();
            setTimeout(updateSelectionState, 0);
          }}
          onPaste={(event) => {
            event.preventDefault();
            const text = event.clipboardData?.getData("text/plain") || "";
            document.execCommand("insertText", false, text);
            syncValue();
            updateSelectionState();
          }}
        />
      </div>
    </div>
  );
};
const formatVisitDate = (value) => {
  if (!value) return "-";
  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text || "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const normalizeStatus = (
  status
) => {
  const value =
    String(status || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "_")
      .replace(/-/g, "_");
  if (
    value === "present"
  ) {
    return "present";
  }
  if (
    value === "absent"
  ) {
    return "absent";
  }
  if (
    value === "late"
  ) {
    return "late";
  }
  if (
    value === "half_day"
  ) {
    return "half_day";
  }
  if (
    value === "no_punch"
  ) {
    return "no_punch";
  }
  if (
    value ===
    "field_visit"
  ) {
    return "field_visit";
  }
  if (
    value ===
    "field_visit_late"
  ) {
    return "field_visit_late";
  }
  /*
    Sick Leave
    Casual Leave
    Privileged Leave
    Festival Leave
    Unpaid Leave
    Half Day Leave
  */
  if (
    value.includes(
      "leave"
    )
  ) {
    return value;
  }
  return value ||
    "absent";
};
const formatStatus = (
  status
) => {
  const value =
    normalizeStatus(status);
  if (
    value === "present"
  ) {
    return "Present";
  }
  if (
    value === "absent"
  ) {
    return "Absent";
  }
  if (
    value === "late"
  ) {
    return "Late";
  }
  if (
    value === "half_day"
  ) {
    return "Half Day";
  }
  if (
    value ===
    "half_day_leave"
  ) {
    return "Half Day Leave";
  }
  if (
    value ===
    "sick_leave"
  ) {
    return "Sick Leave";
  }
  if (
    value ===
    "casual_leave"
  ) {
    return "Casual Leave";
  }
  if (
    value ===
    "mandatory_leave"
  ) {
    return "Privileged Leave";
  }
  if (
    value ===
    "festival_leave"
  ) {
    return "Festival Leave";
  }
  if (
    value ===
    "unpaid_leave"
  ) {
    return "Unpaid Leave";
  }
  if (
    value ===
    "field_visit"
  ) {
    return "Field Visit";
  }
  if (
    value ===
    "field_visit_late"
  ) {
    return "Field Visit · Late";
  }
  if (
    value ===
    "no_punch"
  ) {
    return "No Punch";
  }
  return value
    .replace(/_/g, " ")
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );
};
const getStatusStyle = (
  status
) => {
  const value =
    normalizeStatus(status);
  if (
    value === "present"
  ) {
    return {
      background: "#dcfce7",
      color: "#166534",
    };
  }
  if (
    value === "absent"
  ) {
    return {
      background: "#fee2e2",
      color: "#991b1b",
    };
  }
  if (
    value === "late" ||
    value ===
      "field_visit_late"
  ) {
    return {
      background: "#fef3c7",
      color: "#92400e",
    };
  }
  if (
    value === "half_day"
  ) {
    return {
      background: "#ffedd5",
      color: "#9a3412",
    };
  }
  if (
    value.includes(
      "leave"
    )
  ) {
    return {
      background: "#e0e7ff",
      color: "#3730a3",
    };
  }
  if (
    value ===
    "field_visit"
  ) {
    return {
      background: "#dbeafe",
      color: "#1d4ed8",
    };
  }
  if (
    value ===
    "no_punch"
  ) {
    return {
      background: "#f1f5f9",
      color: "#475569",
    };
  }
  return {
    background: "#eef2ff",
    color: "#334155",
  };
};
const normalizeAttendanceResponse = (rawData) => {
  const data = rawData || {};
  const profile =
    data.profile ||
    data.employee ||
    data.user ||
    data.employee_profile ||
    {};
  const summary =
    data.summary ||
    data.stats ||
    data.attendance_summary ||
    {};
  const attendance =
    data.attendance ||
    data.records ||
    data.attendance_records ||
    data.rows ||
    [];
  return {
    profile,
    summary,
    attendance: asArray(attendance),
  };
};
const getDateOnly = (dateValue) => {
  if (!dateValue) return "";
  const value = String(dateValue);
  if (value.includes("T")) return value.split("T")[0];
  return value.slice(0, 10);
};
const getCurrentWeekRange = () => {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  const toDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const dayValue = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${dayValue}`;
  };
  return {
    start: toDateString(monday),
    end: toDateString(saturday),
  };
};
const isCurrentMonth = (dateValue) => {
  const dateString = getDateOnly(dateValue);
  if (!dateString) return false;
  const today = new Date();
  const currentMonth = String(today.getMonth() + 1).padStart(2, "0");
  const currentYear = String(today.getFullYear());
  return dateString.startsWith(`${currentYear}-${currentMonth}`);
};
const EmployeeAttendance = ({
  mode = "attendance",
}) => {
  const fieldVisitsOnly =
    mode === "fieldVisits";
  const [profile, setProfile] = useState({});
  const [summary, setSummary] = useState({
    total_records: 0,
    present: 0,
    absent: 0,
    late: 0,
    leave: 0,
  });
  const [visitorSearch, setVisitorSearch] = useState("");
  const [attendance, setAttendance] = useState([]);
  const [activeRange, setActiveRange] = useState("week");
  const [attendanceMonth,setAttendanceMonth] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attendanceView, setAttendanceView] =
  useState(
    fieldVisitsOnly
      ? "fieldVisits"
      : "attendance"
  );
  const [fieldVisits, setFieldVisits] = useState([]);
  const [visitSummary, setVisitSummary] = useState({
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
  });
  const [visitSearch, setVisitSearch] = useState("");
  const [visitStatus, setVisitStatus] = useState("all");
  const [showVisitModal, setShowVisitModal] =
    useState(false);
  const [editVisitTarget, setEditVisitTarget] = useState(null);
  const [savingVisit, setSavingVisit] =
    useState(false);
  const [visitError, setVisitError] = useState("");
  const [visitSuccess, setVisitSuccess] =
    useState("");
  const [employees, setEmployees] = useState([]);
  const [selectedVisitors, setSelectedVisitors] = useState([]);
  const [visitForm, setVisitForm] = useState({
    visit_type: "Sales Visit",
    visit_date: "",
    end_date: "",
    duration_type: "full_day",
    half_day_session: "",
    visit_stops: [createEmptyVisitStop()],
    conclusion: "",
    remark: "",
  });
  const fetchAttendance = async () => {
    setLoading(true);
    setError("");
    try {
      let response;
      try {
        response = await api.get("/employee-attendance");
      } catch {
        response = await api.get("/employee-attendance/my");
      }
      const normalized = normalizeAttendanceResponse(getResponseData(response));
      setProfile(normalized.profile || {});
      setSummary({
        total_records:
          normalized.summary.total_records ||
          normalized.summary.totalRecords ||
          normalized.attendance.length ||
          0,
        present: normalized.summary.present || 0,
        absent: normalized.summary.absent || 0,
        late: normalized.summary.late || 0,
        leave: normalized.summary.leave || 0,
      });
      setAttendance(normalized.attendance);
    } catch (err) {
      console.error("Employee attendance frontend error:", err);
      setError(
        err.response?.data?.message ||
        err.response?.data?.error ||
        "Failed to fetch employee attendance."
      );
    } finally {
      setLoading(false);
    }
  };
  const fetchFieldVisits = async () => {
    try {
      const response = await api.get(
        "/employee-attendance/field-visits"
      );
      setFieldVisits(
        Array.isArray(response.data?.visits)
          ? response.data.visits
          : []
      );
      setVisitSummary({
        total: Number(
          response.data?.summary?.total || 0
        ),
        approved: Number(
          response.data?.summary?.approved || 0
        ),
        pending: Number(
          response.data?.summary?.pending || 0
        ),
        rejected: Number(
          response.data?.summary?.rejected || 0
        ),
      });
    } catch (err) {
      console.error(
        "Field visits fetch error:",
        err
      );
      setVisitError(
        err?.response?.data?.message ||
        "Failed to fetch field visits."
      );
    }
  };
  const fetchEmployees = async () => {
    try {
      const response = await api.get(
        "/employee-attendance/employees"
      );
      setEmployees(
        response.data?.employees || []
      );
    } catch (err) {
      console.error(
        "Employee fetch error",
        err
      );
    }
  };
  const openEmployeeCorrection = (visit) => {
    setEditVisitTarget(visit);
    setVisitForm({
      visit_type: visit.visit_type || "Sales Visit",
      visit_date: formatVisitDate(visit.visit_date),
      end_date: visit.end_date ? formatVisitDate(visit.end_date) : "",
      duration_type: visit.duration_type || "full_day",
      half_day_session: visit.half_day_session || "",
      visit_stops: getVisitStops(visit).map(stop => ({
        location: stop.location || "", visit_time: String(stop.visit_time || "").slice(0,5), description: stop.description || "",
      })),
      conclusion: visit.conclusion || "", remark: visit.remark || "",
    });
    setVisitError("");
    setShowVisitModal(true);
  };
  const fieldVisitWordCount = (stops) => (Array.isArray(stops) ? stops : []).reduce((total, stop) =>
    total + String(stop.description || "").replace(/\*\*|==/g, "").trim().split(/\s+/).filter(Boolean).length, 0);
  const submitFieldVisit = async () => {
    setVisitError("");
    setVisitSuccess("");
    const visitStops = asArray(visitForm.visit_stops)
      .map((stop) => ({
        location: String(stop?.location || "").trim(),
        visit_time: String(stop?.visit_time || "").trim() || null,
        description: String(stop?.description || "").trim(),
      }))
      .filter((stop) => stop.location || stop.description);
    if (
      !visitForm.visit_date ||
      !visitForm.duration_type ||
      !visitStops.length ||
      visitStops.some(
        (stop) =>
          !stop.location ||
          !stop.description
      )
    ) {
      setVisitError(
        "Please complete the date, duration and every visit location with its description."
      );
      return;
    }
    if (visitForm.end_date && visitForm.end_date < visitForm.visit_date) {
      setVisitError("End Date cannot be earlier than Visit Date.");
      return;
    }
    if (
      visitForm.duration_type ===
      "half_day" &&
      ![
        "first_half",
        "second_half",
      ].includes(
        visitForm.half_day_session
      )
    ) {
      setVisitError(
        "Please select First Half or Second Half."
      );
      return;
    }
    const wordCount = fieldVisitWordCount(visitStops);
    if (wordCount < 50) {
      setVisitError(`Description needs at least 50 words (currently ${wordCount}).`);
      return;
    }
    try {
      setSavingVisit(true);
      const firstStop = visitStops[0];
      await (editVisitTarget ? api.put : api.post)(
        editVisitTarget ? `/employee-attendance/field-visits/${editVisitTarget.visit_id}/resubmit` : "/employee-attendance/field-visits",
        {
          visit_type: visitForm.visit_type,
          visit_date: visitForm.visit_date,
          end_date: visitForm.end_date || null,
          duration_type:
            visitForm.duration_type,
          half_day_session:
            visitForm.duration_type ===
              "half_day"
              ? visitForm.half_day_session
              : null,
          // Legacy fields are intentionally preserved for
          // attendance and older Field Visit screens.
          location: firstStop.location,
          comment: firstStop.description,
          visit_stops: visitStops,
          conclusion: String(
            visitForm.conclusion || ""
          ).trim(),
          remark: String(
            visitForm.remark || ""
          ).trim(),
          // Preserve original team members when correcting an existing visit.
          ...(editVisitTarget ? {} : { visitor_ids: selectedVisitors }),
        }
      );
      setVisitForm({
        visit_type: "Sales Visit",
        visit_date: "",
        duration_type: "full_day",
        half_day_session: "",
        visit_stops: [createEmptyVisitStop()],
        conclusion: "",
        remark: "",
      });
      setShowVisitModal(false);
      setEditVisitTarget(null);
      setVisitSuccess(
        editVisitTarget ? "Corrected field visit resubmitted for approval." : "Field visit submitted for approval."
      );
      await fetchFieldVisits();
    } catch (err) {
      setVisitError(
        err?.response?.data?.message ||
        "Failed to submit field visit."
      );
    } finally {
      setSavingVisit(false);
    }
  };
  useEffect(() => {
    fetchAttendance();
    fetchFieldVisits();
  }, []);
  const attendanceMonths = useMemo(()=>[...new Set(attendance.map(r=>getDateOnly(r.attendance_date||r.date).slice(0,7)).filter(m=>/^\d{4}-\d{2}$/.test(m)))].sort().reverse(),[attendance]);
  useEffect(()=>{if(attendanceMonths.length&&!attendanceMonths.includes(attendanceMonth))setAttendanceMonth(attendanceMonths[0]);},[attendanceMonths,attendanceMonth]);
  const filteredAttendance = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const weekRange = getCurrentWeekRange();
    return attendance.filter((row) => {
      const rowDate = getDateOnly(row.attendance_date || row.date);
      const matchesRange =
        activeRange === "all" ||
        (activeRange === "month" && rowDate.startsWith(attendanceMonth)) ||
        (activeRange === "week" &&
          rowDate >= weekRange.start &&
          rowDate <= weekRange.end);
      const rowStatus = normalizeStatus(row.status || row.attendance_status);
     const matchesStatus =
  statusFilter === "all" ||
  (
    statusFilter ===
      "absent_leave" &&
    (
      rowStatus ===
        "absent" ||
      rowStatus.includes(
        "leave"
      )
    )
  ) ||
  (
    statusFilter ===
      "leave" &&
    rowStatus.includes(
      "leave"
    )
  ) ||
  (
    statusFilter ===
      "field_visit" &&
    (
      rowStatus ===
        "field_visit" ||
      rowStatus ===
        "field_visit_late"
    )
  ) ||
  (
    statusFilter ===
      "late" &&
    (
      rowStatus ===
        "late" ||
      rowStatus ===
        "field_visit_late"
    )
  ) ||
  rowStatus ===
    statusFilter;
      const searchableText = [
        rowDate,
        rowStatus,
        row.check_in_time,
        row.check_out_time,
        row.working_hours,
        row.remarks,
        row.day_name,
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch = !query || searchableText.includes(query);
      return matchesRange && matchesStatus && matchesSearch;
    });
  }, [attendance, activeRange, attendanceMonth, statusFilter, searchText]);
  const visibleSummary =
  useMemo(() => {
    const totalRecords =
      filteredAttendance.length;
    let present = 0;
    let absent = 0;
    let late = 0;
    let leave = 0;
    filteredAttendance.forEach(
      (row) => {
        const status =
          normalizeStatus(
            row.status
          );
        if (
          status ===
            "present" ||
          status ===
            "late"
        ) {
          present += 1;
        }
        if (
          status ===
          "half_day"
        ) {
          present += 0.5;
        }
        if (
          status ===
          "absent"
        ) {
          absent += 1;
        }
        if (
          status ===
            "late" ||
          status ===
            "field_visit_late"
        ) {
          late += 1;
        }
        if (
          status.includes(
            "leave"
          )
        ) {
          leave +=
            status ===
            "half_day_leave"
              ? 0.5
              : 1;
        }
      }
    );
    return {
      total_records:
        totalRecords,
      present,
      absent,
      late,
      leave,
    };
  }, [
    filteredAttendance,
  ]);
  const summaryToShow = activeRange === "all" && !searchText && statusFilter === "all"
    ? summary
    : visibleSummary;
  const filteredFieldVisits = useMemo(() => {
    const query =
      visitSearch.trim().toLowerCase();
    return fieldVisits.filter((visit) => {
      const status = String(
        visit.status || ""
      ).toLowerCase();
      const matchesStatus =
        visitStatus === "all" ||
        status === visitStatus;
      const stopSearchText =
        getVisitStops(visit)
          .flatMap((stop) => [
            stop.location,
            stop.visit_time,
            stop.description,
          ])
          .join(" ");
      const matchesSearch =
        !query ||
        [
          visit.visit_date,
          visit.end_date,
          visit.visit_type,
          visit.team_members,
          Array.isArray(visit.all_people)
            ? visit.all_people.join(" ")
            : visit.all_people,
          visit.location,
          visit.comment,
          stopSearchText,
          visit.conclusion,
          visit.remark,
          visit.review_remark,
          visit.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [
    fieldVisits,
    visitSearch,
    visitStatus,
  ]);
  return (
    <div style={styles.page}>
      <div style={styles.topActions}>
        {fieldVisitsOnly && (
          <button
            type="button"
            style={styles.addVisitBtn}
            onClick={() => {
              setVisitError("");
              fetchEmployees();
              setEditVisitTarget(null);
              setShowVisitModal(true);
            }}
          >
            <Plus size={18} />
            Add Visit
          </button>
        )}
        <button
          type="button"
          style={styles.refreshBtn}
          onClick={() => {
  if (fieldVisitsOnly) {
    fetchFieldVisits();
  } else {
    fetchAttendance();
  }
}}
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>
      {error && <div style={styles.errorBox}>{error}</div>}
      <section style={styles.profileCard}>
        <div style={styles.profileBox}>
          <span style={styles.profileLabel}>Employee</span>
          <strong style={styles.profileValue}>
            {profile.full_name || profile.name || "-"}
          </strong>
        </div>
        <div style={styles.profileBox}>
          <span style={styles.profileLabel}>Email</span>
          <strong style={styles.profileEmailValue}>
            {profile.email || "-"}
          </strong>
        </div>
        <div style={styles.profileBox}>
          <span style={styles.profileLabel}>Department</span>
          <strong style={styles.profileValue}>
            {profile.department_name || profile.department || "-"}
          </strong>
        </div>
        <div style={styles.profileBox}>
          <span style={styles.profileLabel}>Designation</span>
          <strong style={styles.profileValue}>
            {profile.designation || "-"}
          </strong>
        </div>
      </section>
      {!fieldVisitsOnly && (
        <>
          <div style={styles.tabs}>
            <button
              type="button"
              style={{
                ...styles.tabBtn,
                ...(activeRange === "week" ? styles.activeTabBtn : {}),
              }}
              onClick={() => setActiveRange("week")}
            >
              This Week
            </button>
            <button
              type="button"
              style={{
                ...styles.tabBtn,
                ...(activeRange === "month" ? styles.activeTabBtn : {}),
              }}
              onClick={() => setActiveRange("month")}
            >
              This Month
            </button>
            <button
              type="button"
              style={{
                ...styles.tabBtn,
                ...(activeRange === "all" ? styles.activeTabBtn : {}),
              }}
              onClick={() => setActiveRange("all")}
            >
              All Records
            </button>
            <select aria-label="Attendance month" value={attendanceMonth} disabled={!attendanceMonths.length} onChange={e=>{setAttendanceMonth(e.target.value);setActiveRange("month");}} style={{height:48,minWidth:174,borderRadius:12,border:"1px solid #cbd5e1",background:"white",padding:"0 12px",fontWeight:700}}>
              {!attendanceMonths.length&&<option value="">No months</option>}
              {attendanceMonths.map(m=><option key={m} value={m}>{new Date(`${m}-01T12:00:00`).toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</option>)}
            </select>
          </div>
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <strong>{summaryToShow.total_records || 0}</strong>
              <span>Total Records</span>
            </div>
            <div style={styles.statCard}>
              <strong>{summaryToShow.present || 0}</strong>
              <span>Present</span>
            </div>
            <div style={styles.statCard}>
              <strong>{summaryToShow.absent || 0}</strong>
              <span>Absent</span>
            </div>
            <div style={styles.statCard}>
              <strong>{summaryToShow.late || 0}</strong>
              <span>Late</span>
            </div>
            <div style={styles.statCard}>
              <strong>{summaryToShow.leave || 0}</strong>
              <span>Leave</span>
            </div>
          </div>
          <div style={styles.filterRow}>
            <div style={styles.searchBox}>
              <Search size={18} color="#64748b" />
              <input
                style={styles.searchInput}
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search date, status, time, remarks..."
              />
            </div>
            <select
              style={styles.select}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
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
<option value="half_day">
  Half Day
</option>
<option value="field_visit">
  Field Visit
</option>
<option value="leave">
  Leave
</option>
<option value="absent">
  Absent
</option>
<option value="no_punch">
  No Punch
</option>
            </select>
          </div>
          <section style={styles.tableCard}>
            {filteredAttendance.length === 0 ? (
              <div style={styles.emptyBox}>
                No attendance records found for this employee.
              </div>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Day</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Check In</th>
                      <th style={styles.th}>Check Out</th>
                      <th style={styles.th}>Working Hours</th>
                      <th style={styles.th}>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAttendance.map((row, index) => {
                      const status = normalizeStatus(row.status);
                      const statusStyle = getStatusStyle(status);
                      return (
                        <tr key={row.attendance_id || `${row.attendance_date}-${index}`}>
                          <td style={styles.td}>
                            <strong>{getDateOnly(row.attendance_date || row.date)}</strong>
                          </td>
                          <td style={styles.td}>{row.day_name || "-"}</td>
                          <td style={styles.td}>
                            <span style={{ ...styles.statusBadge, ...statusStyle }}>
                              {formatStatus(status)}
                            </span>
                          </td>
                          <td style={styles.td}>{row.check_in_time || "-"}</td>
                          <td style={styles.td}>{row.check_out_time || "-"}</td>
                          <td style={styles.td}>{row.working_hours || "-"}</td>
                          <td style={styles.td}>{row.remarks || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {fieldVisitsOnly && (
        <>
          {visitError && (
            <div style={styles.errorBox}>
              {visitError}
            </div>
          )}
          {visitSuccess && (
            <div style={styles.visitSuccess}>
              {visitSuccess}
            </div>
          )}
          <div style={styles.visitStatsGrid}>
            <div style={styles.statCard}>
              <strong>{visitSummary.total}</strong>
              <span>Total Visits</span>
            </div>
            <div style={styles.statCard}>
              <strong>
                {visitSummary.approved}
              </strong>
              <span>Approved</span>
            </div>
            <div style={styles.statCard}>
              <strong>
                {visitSummary.pending}
              </strong>
              <span>Pending</span>
            </div>
            <div style={styles.statCard}>
              <strong>
                {visitSummary.rejected}
              </strong>
              <span>Rejected</span>
            </div>
          </div>
          <div style={styles.filterRow}>
            <div style={styles.searchBox}>
              <Search
                size={18}
                color="#64748b"
              />
              <input
                style={styles.searchInput}
                value={visitSearch}
                onChange={(event) =>
                  setVisitSearch(
                    event.target.value
                  )
                }
                placeholder="Search date, type, location, details, conclusion or remark..."
              />
            </div>
            <select
              style={styles.select}
              value={visitStatus}
              onChange={(event) =>
                setVisitStatus(
                  event.target.value
                )
              }
            >
              <option value="all">
                All Status
              </option>
              <option value="pending">
                Pending
              </option>
              <option value="approved">
                Approved
              </option>
              <option value="rejected">
                Rejected
              </option>
              <option value="changes_requested">Changes Requested</option>
            </select>
          </div>
          <section style={styles.tableCard}>
            {filteredFieldVisits.length === 0 ? (
              <div style={styles.emptyBox}>No field visits found.</div>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Type</th>
                      <th style={styles.th}>Team Members</th>
                      <th style={styles.th}>Duration</th>
                      <th style={styles.th}>Visit Details</th>
                      <th style={styles.th}>Conclusion / Remark</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Admin Remark</th>
                      <th style={styles.th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFieldVisits.map((visit) => {
                      const status = String(visit.status || "pending").toLowerCase();
                      const locations = getVisitStops(visit);
                      return (
                        <tr key={visit.visit_id}>
                          <td style={styles.td}>
                            <strong>{formatVisitDate(visit.visit_date)}{visit.end_date && formatVisitDate(visit.end_date) !== formatVisitDate(visit.visit_date) ? ` – ${formatVisitDate(visit.end_date)}` : ""}</strong>
                          </td>
                          <td style={styles.td}>{visit.visit_type || "-"}</td>
                          <td style={styles.td}>
                            <div style={{ maxWidth: "200px", whiteSpace: "normal", lineHeight: "1.5" }}>
                              {visit.team_members ||
                                (Array.isArray(visit.all_people)
                                  ? visit.all_people.join(", ")
                                  : visit.all_people) ||
                                "-"}
                            </div>
                          </td>
                          <td style={styles.td}>
                            {visit.duration_type === "half_day"
                              ? visit.half_day_session === "first_half"
                                ? "Half Day - First Half"
                                : visit.half_day_session === "second_half"
                                  ? "Half Day - Second Half"
                                  : "Half Day"
                              : visit.duration_type === "full_day"
                                ? "Full Day"
                                : "-"}
                          </td>
                          <td style={styles.td}>
                            <div style={styles.visitJourney}>
                              {locations.map((location, index) => (
                                <div
                                  key={location.stop_id || `${visit.visit_id}-location-${index}`}
                                  style={styles.visitStopItem}
                                >
                                  <div style={styles.visitStopHeader}>
                                    <MapPin size={14} />
                                    <strong>{location.location || "-"}</strong>
                                    {location.visit_time && (
                                      <span>· {String(location.visit_time).slice(0, 5)}</span>
                                    )}
                                  </div>
                                  <div style={styles.visitStopDescription}>
                                    <FormattedVisitText value={location.description} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td style={styles.td}>
                            <div style={styles.outcomeBlock}>
                              <div>
                                <span style={styles.outcomeLabel}>Conclusion</span>
                                <div style={styles.outcomeText}>
                                  <FormattedVisitText value={visit.conclusion} />
                                </div>
                              </div>
                              <div>
                                <span style={styles.outcomeLabel}>Remark / Follow-up</span>
                                <div style={styles.outcomeText}>
                                  <FormattedVisitText value={visit.remark} />
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={styles.td}>
                            <span
                              style={{
                                ...styles.visitStatusBadge,
                                ...(status === "approved"
                                  ? styles.visitApproved
                                  : status === "rejected"
                                    ? styles.visitRejected
                                    : styles.visitPending),
                              }}
                            >
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </span>
                          </td>
                          <td style={styles.td}>
                            <FormattedVisitText value={visit.review_remark} />
                          </td>
                          <td style={styles.td}>
                            {status === "changes_requested" && (
                              <button type="button" onClick={() => openEmployeeCorrection(visit)}
                                style={{border:"none",background:"#fff1ed",color:"#e34c2a",fontWeight:800,padding:"8px 10px",borderRadius:8,cursor:"pointer",whiteSpace:"nowrap"}}>
                                Edit & Resubmit
                              </button>
                            )}
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
      )}
      {showVisitModal && (
        <div
          style={styles.modalOverlay}
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setShowVisitModal(false);
            }
          }}
        >
          <div style={styles.visitModal}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={styles.modalTitle}>
                  {editVisitTarget ? "Correct Field Visit" : "Add Field Visit"}
                </h2>
                <p style={styles.modalSubtitle}>
                  Add your outside sales or
                  business visit details.
                </p>
              </div>
              <button
                type="button"
                style={styles.closeBtn}
                onClick={() =>
                  setShowVisitModal(false)
                }
              >
                <X size={20} />
              </button>
            </div>
            {editVisitTarget?.review_remark && (
              <div style={{padding:12,background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:10,marginBottom:12}}>
                <strong>Review requested:</strong> <FormattedVisitText value={editVisitTarget.review_remark} />
              </div>
            )}
            {visitError && (
              <div style={styles.errorBox}>
                {visitError}
              </div>
            )}
            <div style={styles.visitFormGrid}>
              <label style={styles.formGroup}>
                <span>Visit Type *</span>
                <select
                  style={styles.formInput}
                  value={
                    visitForm.visit_type
                  }
                  onChange={(event) =>
                    setVisitForm(
                      (previous) => ({
                        ...previous,
                        visit_type:
                          event.target.value,
                      })
                    )
                  }
                >
                  <option value="Sales Visit">
                    Sales Visit
                  </option>
                  <option value="Exhibition Visit">
                    Exhibition Visit
                  </option>
                  <option value="Manufacturer Visit">
                    Manufacturer Visit
                  </option>
                  <option value="Business Visit">
                    Business Visit
                  </option>
                  <option value="Document Visit">
                    Document Visit
                  </option>
                  <option value="Procurement Visit">
                    Procurement Visit
                  </option>
                  <option value="Client Visit">
                    Client Visit
                  </option>
                  <option value="Market Visit">
                    Market Visit
                  </option>
                  <option value="Vendor Visit">
                    Vendor Visit
                  </option>
                </select>
              </label>
              <label style={styles.formGroup}>
                <span>
                  Visitors / Team Members
                </span>
                <input
                  type="text"
                  style={styles.formInput}
                  placeholder="Search employee..."
                  value={visitorSearch}
                  onChange={(e) => setVisitorSearch(e.target.value)}
                />
                {/* SELECTED EMPLOYEES */}
                {
                  selectedVisitors.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                        marginTop: "10px",
                        marginBottom: "10px"
                      }}
                    >
                      {
                        selectedVisitors.map((id) => {
                          const emp =
                            employees.find(
                              (e) => e.user_id === id
                            );
                          return (
                            <div
                              key={id}
                              style={{
                                background: "#fff0eb",
                                color: "#ff5733",
                                border: "1px solid #ffd1c7",
                                padding: "5px 10px",
                                borderRadius: "999px",
                                fontSize: "11px",
                                fontWeight: 800,
                                display: "flex",
                                alignItems: "center",
                                gap: "6px"
                              }}
                            >
                              {emp?.full_name}
                              <button
                                type="button"
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  cursor: "pointer",
                                  fontWeight: 900,
                                  color: "#ff5733"
                                }}
                                onClick={() => {
                                  setSelectedVisitors(
                                    prev =>
                                      prev.filter(
                                        (item) => item !== id
                                      )
                                  );
                                }}
                              >
                                ×
                              </button>
                            </div>
                          )
                        })
                      }
                    </div>
                  )
                }
                <div
                  style={{
                    border: "1px solid #d6dde8",
                    borderRadius: "14px",
                    marginTop: "8px",
                    height: "95px",
                    overflowY: "auto",
                    padding: "8px",
                    background: "#fff"
                  }}
                >
                  {
                    employees.length === 0 ? (
                      <div
                        style={{
                          color: "#64748b",
                          fontSize: "14px"
                        }}
                      >
                        No employees found
                      </div>
                    )
                      :
                      employees
                        .filter((emp) => {
                          return emp.full_name
                            ?.toLowerCase()
                            .includes(
                              visitorSearch.toLowerCase()
                            );
                        })
                        .map((emp) => (
                          <label
                            key={emp.user_id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              padding: "8px 5px",
                              cursor: "pointer"
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={
                                selectedVisitors.includes(
                                  emp.user_id
                                )
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedVisitors(
                                    prev => [
                                      ...prev,
                                      emp.user_id
                                    ]
                                  );
                                }
                                else {
                                  setSelectedVisitors(
                                    prev =>
                                      prev.filter(
                                        id => id !== emp.user_id
                                      )
                                  );
                                }
                              }}
                            />
                            <span>
                              {emp.full_name}
                            </span>
                          </label>
                        ))
                  }
                </div>
              </label>
              <label style={styles.formGroup}>
                <span>Date *</span>
                <input
                  type="date"
                  style={styles.formInput}
                  disabled={Boolean(editVisitTarget)}
                  value={visitForm.visit_date}
                  onChange={(event) =>
                    setVisitForm(
                      (previous) => ({
                        ...previous,
                        visit_date:
                          event.target.value,
                      })
                    )
                  }
                />
              </label>
              <label style={styles.formGroup}>
                <span>End Date (Optional)</span>
                <input
                  type="date"
                  style={styles.formInput}
                  min={visitForm.visit_date || undefined}
                  disabled={Boolean(editVisitTarget)}
                  value={visitForm.end_date}
                  onChange={(event) =>
                    setVisitForm((previous) => ({
                      ...previous,
                      end_date: event.target.value,
                    }))
                  }
                />
              </label>
              <label style={styles.formGroup}>
                <span>Duration *</span>
                <select
                  style={styles.formInput}
                  value={visitForm.duration_type}
                  onChange={(event) => {
                    const value =
                      event.target.value;
                    setVisitForm(
                      (previous) => ({
                        ...previous,
                        duration_type:
                          value,
                        half_day_session:
                          value === "half_day"
                            ? previous.half_day_session
                            : "",
                      })
                    );
                    setVisitError("");
                  }}
                >
                  <option value="full_day">
                    Full Day
                  </option>
                  <option value="half_day">
                    Half Day
                  </option>
                </select>
              </label>
              {visitForm.duration_type ===
                "half_day" && (
                  <label style={styles.formGroup}>
                    <span>
                      Half Day Session *
                    </span>
                    <select
                      style={styles.formInput}
                      value={
                        visitForm.half_day_session
                      }
                      onChange={(event) =>
                        setVisitForm(
                          (previous) => ({
                            ...previous,
                            half_day_session:
                              event.target.value,
                          })
                        )
                      }
                    >
                      <option value="">
                        Select Half
                      </option>
                      <option value="first_half">
                        First Half
                      </option>
                      <option value="second_half">
                        Second Half
                      </option>
                    </select>
                  </label>
                )}
            </div>
            <section style={styles.visitStopsSection}>
              <div style={styles.visitStopsHeader}>
                <div>
                  <strong>Visit Locations *</strong>
                  <div style={styles.formatHint}>
                    Add each location in the order visited. Description is required; time is optional.
                  </div>
                </div>
                <button
                  type="button"
                  style={styles.addStopButton}
                  onClick={() =>
                    setVisitForm((previous) => ({
                      ...previous,
                      visit_stops: [
                        ...asArray(previous.visit_stops),
                        createEmptyVisitStop(),
                      ],
                    }))
                  }
                >
                  <Plus size={15} />
                  Add Location
                </button>
              </div>
              {asArray(visitForm.visit_stops).map((stop, index) => (
                <div key={`visit-stop-${index}`} style={styles.stopCard}>
                  <div style={styles.stopCardHeader}>
                    <strong style={styles.stopTitle}>
                      Visit Location
                    </strong>
                    {visitForm.visit_stops.length > 1 && (
                      <button
                        type="button"
                        style={styles.removeStopButton}
                        onClick={() =>
                          setVisitForm((previous) => ({
                            ...previous,
                            visit_stops: previous.visit_stops.filter(
                              (_, stopIndex) => stopIndex !== index
                            ),
                          }))
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div style={styles.stopGrid}>
                    <label style={styles.formGroup}>
                      <span>Location *</span>
                      <input
                        type="text"
                        style={styles.formInput}
                        placeholder="Example: Vashi, Navi Mumbai"
                        value={stop.location}
                        onChange={(event) =>
                          setVisitForm((previous) => ({
                            ...previous,
                            visit_stops: previous.visit_stops.map(
                              (item, stopIndex) =>
                                stopIndex === index
                                  ? {
                                      ...item,
                                      location: event.target.value,
                                    }
                                  : item
                            ),
                          }))
                        }
                      />
                    </label>
                    <label style={styles.formGroup}>
                      <span>Visit Time</span>
                      <input
                        type="time"
                        style={styles.formInput}
                        value={stop.visit_time || ""}
                        onChange={(event) =>
                          setVisitForm((previous) => ({
                            ...previous,
                            visit_stops: previous.visit_stops.map(
                              (item, stopIndex) =>
                                stopIndex === index
                                  ? {
                                      ...item,
                                      visit_time: event.target.value,
                                    }
                                  : item
                            ),
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label style={styles.formGroup}>
                    <span>Description / Purpose *</span>
                    <div style={{fontSize:12,color:"#b91c1c",marginBottom:4}}>Description: {fieldVisitWordCount([stop])} words (minimum 50 across all stops)</div>
                    <RichVisitEditor
                      style={styles.formTextarea}
                      placeholder="What was discussed, checked or completed at this stop?"
                      value={stop.description}
                      onChange={(nextValue) =>
                        setVisitForm((previous) => ({
                          ...previous,
                          visit_stops: previous.visit_stops.map(
                            (item, stopIndex) =>
                              stopIndex === index
                                ? {
                                    ...item,
                                    description: nextValue,
                                  }
                                : item
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
              ))}
            </section>
            <label style={styles.formGroup}>
              <span>Conclusion</span>
              <RichVisitEditor
                style={styles.formTextarea}
                placeholder="Overall result or conclusion from the complete visit..."
                value={visitForm.conclusion}
                onChange={(nextValue) =>
                  setVisitForm((previous) => ({
                    ...previous,
                    conclusion: nextValue,
                  }))
                }
              />
            </label>
            <label style={styles.formGroup}>
              <span>Remark / Follow-up</span>
              <RichVisitEditor
                style={styles.formTextarea}
                placeholder="Next action, follow-up, quotation, callback or other remark..."
                value={visitForm.remark}
                onChange={(nextValue) =>
                  setVisitForm((previous) => ({
                    ...previous,
                    remark: nextValue,
                  }))
                }
              />
            </label>
            <div style={styles.modalFooter}>
              <button
                type="button"
                style={styles.modalCancelBtn}
                onClick={() =>
                  setShowVisitModal(false)
                }
              >
                Cancel
              </button>
              <button
                type="button"
                style={styles.modalSubmitBtn}
                disabled={savingVisit}
                onClick={submitFieldVisit}
              >
                {savingVisit
                  ? "Submitting..."
                  : editVisitTarget ? "Resubmit Visit" : "Submit Visit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
const styles = {
  page: {
    width: "100%",
    padding: 0,
  },
  topActions: {
    width: "100%",
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: "12px",
    marginBottom: "22px",
  },
  viewSwitch: {
    display: "flex",
    alignItems: "center",
    padding: "4px",
    border: "1px solid #e2e8f0",
    background: "#ffffff",
    borderRadius: "14px",
  },
  viewSwitchBtn: {
    height: "44px",
    padding: "0 20px",
    border: "none",
    borderRadius: "11px",
    background: "transparent",
    color: "#64748b",
    fontSize: "14px",
    fontWeight: 900,
    cursor: "pointer",
  },
  viewSwitchActive: {
    background: "#fff0eb",
    color: "#ff5733",
  },
  addVisitBtn: {
    height: "52px",
    padding: "0 22px",
    border: "1px solid #ff5733",
    borderRadius: "16px",
    background: "#ffffff",
    color: "#ff5733",
    fontSize: "15px",
    fontWeight: 900,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    cursor: "pointer",
  },
  visitStatsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4, minmax(0, 1fr))",
    gap: "18px",
    marginBottom: "24px",
  },
  visitSuccess: {
    background: "#dcfce7",
    border: "1px solid #bbf7d0",
    color: "#166534",
    borderRadius: "16px",
    padding: "14px 18px",
    fontWeight: 800,
    marginBottom: "20px",
  },
  locationCell: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
  },
  visitStatusBadge: {
    display: "inline-flex",
    padding: "7px 12px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 900,
  },
  visitApproved: {
    background: "#dcfce7",
    color: "#166534",
  },
  visitPending: {
    background: "#fef3c7",
    color: "#92400e",
  },
  visitRejected: {
    background: "#fee2e2",
    color: "#b91c1c",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background:
      "rgba(15, 23, 42, 0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
  },
  visitModal: {
    width: "min(780px, 95vw)",
    maxHeight: "90vh",
    overflowY: "auto",
    background: "#ffffff",
    borderRadius: "24px",
    padding: "26px",
    boxShadow:
      "0 30px 80px rgba(15, 23, 42, 0.25)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "20px",
    marginBottom: "22px",
  },
  modalTitle: {
    margin: "0 0 6px",
    color: "#111827",
    fontSize: "26px",
    fontWeight: 900,
  },
  modalSubtitle: {
    margin: 0,
    color: "#64748b",
    fontSize: "14px",
  },
  closeBtn: {
    width: "42px",
    height: "42px",
    border: "none",
    borderRadius: "12px",
    background: "#f1f5f9",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },
  visitFormGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    columnGap: "14px",
    rowGap: "10px",
    alignItems: "start",
  },
  visitTypeFix: {
    gridColumn: "2",
    gridRow: "1",
  },
  employeeList: {
    border: "1px solid #d6dde8",
    borderRadius: "12px",
    marginTop: "6px",
    height: "65px",
    overflowY: "auto",
    padding: "4px 8px",
    background: "#ffffff",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginBottom: "8px",
    color: "#111827",
    fontSize: "13px",
    fontWeight: 900,
  },
  formInput: {
    width: "100%",
    height: "48px",
    boxSizing: "border-box",
    border: "1px solid #d6dde8",
    borderRadius: "12px",
    padding: "0 13px",
    background: "#ffffff",
    outline: "none",
    fontSize: "14px",
  },
  formTextarea: {
    width: "100%",
    minHeight: "110px",
    boxSizing: "border-box",
    border: "1px solid #d6dde8",
    borderRadius: "12px",
    padding: "13px",
    resize: "vertical",
    outline: "none",
    fontSize: "14px",
    fontFamily: "inherit",
  },
  visitStopsSection: {
    marginBottom: "18px",
  },
  visitStopsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "14px",
    marginBottom: "12px",
  },
  formatHint: {
    marginTop: "4px",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 700,
    lineHeight: 1.45,
  },
  addStopButton: {
    border: "1px solid #ff5733",
    background: "#ffffff",
    color: "#ff5733",
    borderRadius: "10px",
    padding: "9px 12px",
    fontSize: "12px",
    fontWeight: 900,
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  stopCard: {
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    background: "#f8fafc",
    padding: "16px",
    marginBottom: "12px",
  },
  stopCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    marginBottom: "12px",
  },
  stopTitle: {
    color: "#111827",
    fontSize: "14px",
    fontWeight: 900,
  },
  removeStopButton: {
    border: "none",
    background: "#fee2e2",
    color: "#b91c1c",
    borderRadius: "9px",
    padding: "7px 10px",
    fontSize: "11px",
    fontWeight: 900,
    cursor: "pointer",
  },
  stopGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 180px",
    gap: "12px",
  },
  visitJourney: {
    minWidth: "260px",
    maxWidth: "420px",
  },
  visitStopItem: {
    padding: "8px 0",
    borderBottom: "1px solid #eef2f7",
  },
  visitStopHeader: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: "#334155",
    fontSize: "12px",
    lineHeight: 1.4,
  },
  visitStopDescription: {
    marginTop: "4px",
    paddingLeft: "20px",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 700,
  },
  outcomeBlock: {
    display: "grid",
    gap: "10px",
    minWidth: "220px",
    maxWidth: "340px",
  },
  outcomeLabel: {
    display: "block",
    marginBottom: "3px",
    color: "#94a3b8",
    fontSize: "10px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  outcomeText: {
    color: "#334155",
    fontSize: "12px",
    fontWeight: 700,
  },
  modalFooter: {
    borderTop: "1px solid #e5e7eb",
    marginTop: "8px",
    paddingTop: "18px",
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
  },
  modalCancelBtn: {
    height: "46px",
    padding: "0 22px",
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    background: "#ffffff",
    color: "#111827",
    fontWeight: 900,
    cursor: "pointer",
  },
  modalSubmitBtn: {
    height: "46px",
    padding: "0 24px",
    border: "none",
    borderRadius: "12px",
    background: "#ff5733",
    color: "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
  },
  refreshBtn: {
    border: "none",
    background: "#ff5733",
    color: "#ffffff",
    borderRadius: "18px",
    padding: "15px 24px",
    fontSize: "16px",
    fontWeight: 900,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    cursor: "pointer",
    boxShadow: "0 14px 28px rgba(255, 87, 51, 0.22)",
  },
  errorBox: {
    background: "#fff1f2",
    border: "1px solid #fecdd3",
    color: "#b91c1c",
    borderRadius: "18px",
    padding: "16px 20px",
    fontSize: "16px",
    fontWeight: 800,
    marginBottom: "22px",
  },
  profileCard: {
    background: "#ffffff",
    borderRadius: "26px",
    padding: "26px",
    marginBottom: "24px",
    boxShadow: "0 16px 40px rgba(15, 23, 42, 0.06)",
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "18px",
  },
  profileBox: {
    background: "#f8fafc",
    border: "1px solid #e5e7eb",
    borderRadius: "18px",
    padding: "18px 20px",
    minHeight: "94px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "10px",
    minWidth: 0,
    overflow: "hidden",
  },
  tabs: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    marginBottom: "24px",
    flexWrap: "wrap",
  },
  tabBtn: {
    border: "none",
    background: "#ffffff",
    color: "#111827",
    borderRadius: "16px",
    padding: "16px 28px",
    fontSize: "16px",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 10px 26px rgba(15, 23, 42, 0.05)",
  },
  activeTabBtn: {
    background: "#ff5733",
    color: "#ffffff",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: "18px",
    marginBottom: "24px",
  },
  statCard: {
    background: "#ffffff",
    borderRadius: "20px",
    padding: "22px",
    minHeight: "105px",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.05)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "12px",
  },
  filterRow: {
    display: "grid",
    gridTemplateColumns: "1fr 230px",
    gap: "14px",
    marginBottom: "24px",
  },
  searchBox: {
    height: "58px",
    background: "#ffffff",
    border: "1px solid #d6dde8",
    borderRadius: "16px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "0 18px",
  },
  searchInput: {
    width: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: "15px",
    fontWeight: 700,
    color: "#111827",
  },
  select: {
    height: "58px",
    background: "#ffffff",
    border: "1px solid #d6dde8",
    borderRadius: "16px",
    padding: "0 18px",
    fontSize: "15px",
    fontWeight: 800,
    color: "#111827",
    outline: "none",
  },
  tableCard: {
    background: "#ffffff",
    borderRadius: "26px",
    padding: "26px",
    boxShadow: "0 16px 40px rgba(15, 23, 42, 0.06)",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: "16px",
    color: "#64748b",
    fontSize: "14px",
    fontWeight: 900,
    borderBottom: "1px solid #e5e7eb",
  },
  td: {
    padding: "18px 16px",
    color: "#111827",
    fontSize: "15px",
    borderBottom: "1px solid #eef2f7",
    verticalAlign: "middle",
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    padding: "8px 14px",
    fontSize: "13px",
    fontWeight: 900,
    minWidth: "82px",
  },
  emptyBox: {
    border: "1px dashed #cbd5e1",
    borderRadius: "18px",
    padding: "32px",
    textAlign: "center",
    color: "#64748b",
    fontSize: "16px",
    fontWeight: 900,
    background: "#f8fafc",
  },
  profileLabel: {
    color: "#64748b",
    fontSize: "14px",
    fontWeight: 900,
    lineHeight: 1.2,
  },
  profileValue: {
    color: "#111827",
    fontSize: "17px",
    fontWeight: 900,
    lineHeight: 1.3,
    maxWidth: "100%",
    overflowWrap: "break-word",
    wordBreak: "break-word",
  },
  profileEmailValue: {
    color: "#111827",
    fontSize: "13px",
    fontWeight: 900,
    lineHeight: 1.35,
    maxWidth: "100%",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
};
export default EmployeeAttendance;
