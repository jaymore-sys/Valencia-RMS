import { Navigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import api from "../../api/axios";
import "./designRequests.css";

const categories = {
  packaging: "Packaging Design", label: "Label Design", logo: "Logo Design",
  rd_tables: "R&D Tables", other: "Other Design Requests",
};
const statuses = {
  new: "New", pending: "Pending", accepted: "Accepted",
  in_progress: "In Progress", completed: "Completed", rejected: "Rejected",
};
const actions = {
  submit: "Request submitted", ask: "Ask for information", reply: "Reply with information",
  accept: "Accept & set timeline", reject: "Reject request", start: "Start Work",
  share: "Share draft", changes: "Request changes", confirm: "Confirm changes & follow-up",
  timeline: "Revise timeline", follow: "Add follow-ups", follow_scheduled: "Follow-up scheduled", follow_done: "Follow-up completed", approve: "Approve draft", complete: "Mark completed",
};
const updateMessages = {
  request_update: { button: "Ask for an update", event: "Requester asked for an update", prompt: "What would you like to ask the Design Team?" },
  respond_update: { button: "Send update", event: "Design Team sent an update", prompt: "What would you like to tell the requester?" },
};
const followUpActions = {
  follow_invite: { event: "Asked to attend" },
  follow_attend: { event: "Confirmed attendance" },
  follow_reschedule: { button: "Reschedule", event: "Follow-up rescheduled", prompt: "Reason for changing the date" },
  follow_update: { button: "Add notes or files", event: "Follow-up documented", prompt: "Follow-up notes" },
  follow_done: { button: "Mark done", event: "Follow-up completed", prompt: "Outcome or next steps (optional)" },
  ...updateMessages,
};
const nextOwner = {
  review: "Design Team", info: "Requesting Admin", ready: "Design Team", working: "Design Team",
  draft: "Requesting Admin", changes: "Design Team", revise: "Design Team", approved: "Design Team",
};
const actionNotes = {
  ask: "What information is missing?", reply: "Your reply",
  reject: "Reason for rejection", changes: "What needs to change and where?",
  timeline: "Reason for changing dates",
};
const followPrompts = {
  reply: "Review the new information and confirm the next step.",
  accept: "Review the brief and start work when ready.",
  share: "Approve this version or send changes with a marked-up reference.",
  changes: "Review the requested changes and confirm the date for the revised draft.",
  confirm: "Share the revised draft.",
  approve: "Share the final files and mark the request complete.",
};
const date = value => value
  ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(value))
  : "—";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

function ActionForm({ action, request, onSave, onCancel, busy }) {
  const [followUps, setFollowUps] = useState([{ id: 0 }]);
  const nextRowId = useRef(1);
  const message = updateMessages[action];
  const needsFollow = !message && !["reject", "complete", "start", "follow"].includes(action);
  const note = message?.prompt || actionNotes[action];
  const scheduled = action === "timeline" ? openScheduledFollowUps(request.events) : [];
  const allowFiles = message || ["reply", "share", "changes", "complete"].includes(action);
  return (
    <form className="dr-form" onSubmit={onSave}>
      <h3>{message?.button || actions[action]}</h3>
      {["accept", "timeline"].includes(action) && (
        <label>Committed delivery date<input type="date" name="delivery_due" defaultValue={request.delivery_due || ""} required /></label>
      )}
      {note && <label>{note}<textarea name="note" maxLength={4000} required /></label>}
      {action === "start" && <p>Move this request to In Progress.</p>}
      {action === "follow" && <>
        {followUps.map((entry, index) => <fieldset className="dr-follow-edit" key={entry.id}>
          <legend>Follow-up {index + 1}</legend>
          <label>Follow-up date<input type="date" name="scheduled_date" required /></label>
          <label>Follow-up name<input name="scheduled_name" required maxLength={160} /></label>
          <label>Follow-up note (optional)<input name="scheduled_note" maxLength={1000} /></label>
          {followUps.length > 1 && <button type="button" disabled={busy}
            onClick={() => setFollowUps(rows => rows.filter(row => row.id !== entry.id))}>Remove</button>}
        </fieldset>)}
        <div><button type="button" disabled={busy || followUps.length >= 10} onClick={() => {
          const id = nextRowId.current++;
          setFollowUps(rows => [...rows, { id }]);
        }}>+ Add another date</button></div>
      </>}
      {needsFollow && <>
        <label>{action === "changes" ? "Requested follow-up date" : action === "share" ? "Feedback due" : action === "timeline" ? "Next follow-up date" : "Follow-up date"}
          <input type="date" name="follow_up_date" defaultValue={["confirm", "timeline"].includes(action) ? request.follow_up_date || "" : ""} required={action !== "timeline" || Boolean(request.follow_up_date)} />
        </label>
        {action !== "ask" && <label>What should be shared or done by that date?
          <textarea name="follow_up_note" maxLength={1000} required={action !== "timeline" || Boolean(request.follow_up_date)}
            defaultValue={followPrompts[action] || request.follow_up_note || ""} />
        </label>}
      </>}
      {scheduled.length > 0 && <fieldset className="dr-follow-edit dr-timeline-dates">
        <legend>Scheduled follow-ups</legend>
        {scheduled.map(entry => (
          <label key={entry.id} className="dr-timeline-row">
            <span>{followUpName(entry)}<small>Current date · {date(entry.follow_up_date)}</small></span>
            <input type="date" name={`scheduled_date_${entry.id}`} defaultValue={entry.follow_up_date} required />
          </label>
        ))}
      </fieldset>}
      {allowFiles && <label>{action === "share" ? "Draft files" : action === "complete" ? "Final files (optional)" : "Reference files (optional)"}
        <input type="file" name="files" multiple required={action === "share"} />
      </label>}
      <div className="dr-buttons">
        <button className="dr-primary" disabled={busy}>{message ? "Send" : action === "start" ? "Start Work" : "Save"}</button>
        <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

export function RequestsDialog({ title, onClose, busy, children }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    dialogRef.current.showModal();
    const dialog = dialogRef.current;
    return () => dialog.close();
  }, []);

  return (
    <dialog ref={dialogRef} className="dr-dialog" aria-label={title} onCancel={event => {
      event.preventDefault();
      if (!busy) onClose();
    }}>
      <div className="design-requests">
        <header className="dr-header">
          <h2>{title}</h2>
          <button type="button" disabled={busy} onClick={onClose}>Close</button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export async function loadDesignDepartment() {
  const { data } = await api.get("/design-requests/department");
  return data.department_id;
}

export function DesignRequestForm({ project, onClose }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentId, setSentId] = useState(null);
  const [tracking, setTracking] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (busy || sentId) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/design-requests", new FormData(event.currentTarget));
      setSentId(data.id);
    } catch (err) {
      setError(err.response?.data?.message || "Could not send the design request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (tracking) {
    return <DesignRequestsContent initialRequestId={sentId} mode="sent" />;
  }

  return (
    <section className="design-requests dr-card" aria-label="Design request details">
      {error && <p role="alert" className="dr-error">{error}</p>}
      {sentId ? <>
        <p role="status">Request sent to the Design Team.</p>
        <div className="dr-buttons">
          <button type="button" onClick={() => setTracking(true)}>View My Request</button>
          <button type="button" onClick={onClose}>Done</button>
        </div>
      </> :
        <form className="dr-form" onSubmit={submit}>
          <label>Category<select name="category" required defaultValue="">
            <option value="" disabled>Select a category</option>
            {Object.entries(categories).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
          </select></label>
          <label>Request title<input name="title" defaultValue={project?.project_title} maxLength={160} required /></label>
          <label>Design brief<textarea name="brief" defaultValue={project?.project_description} maxLength={8000} required /></label>
          <label>Needed by (optional)<input type="date" name="needed_by" defaultValue={project?.end_date || project?.due_date} /></label>
          <label>Reference files (optional)<input type="file" name="files" multiple /></label>
          <div className="dr-buttons">
            <button className="dr-primary" disabled={busy}>{busy ? "Sending…" : "Send to Design Team"}</button>
          </div>
        </form>}
    </section>
  );
}

export async function loadDesignRequests(mode = "sent") {
  return (await api.get(mode === "inbox" ? "/design-requests/inbox" : "/design-requests")).data;
}

const inboxViews = [
  ["requests", "Requests"], ["messages", "Messages"], ["follow-ups", "Follow-ups"], ["work", "Who’s doing what"],
];

function isClosed(request) {
  return ["completed", "rejected"].includes(request.status);
}

function followUpStatus(day, currentDay, done, closed) {
  if (done) return "Done";
  if (closed) return "Closed";
  if (day < currentDay) return "Overdue";
  return day === currentDay ? "Due today" : "Scheduled";
}

function responsibleParty(request) {
  return nextOwner[request.stage] === "Design Team"
    ? request.owner_department || "Design Team"
    : request.requester_name || "Requesting Admin";
}

function InboxActivity({ view, requests, events, followFilter, onFollowFilterChange, onOpen, onRefresh }) {
  const byId = new Map(requests.map(request => [String(request.id), request]));
  const scheduled = events.filter(event => event.action === "follow_scheduled");
  const scheduleById = new Map(scheduled.map(event => [String(event.id), event]));
  const completed = new Set(events.filter(event => event.action === "follow_done").map(event => String(event.note)));
  const currentDay = today();
  let rows;

  if (view === "messages") {
    rows = events.filter(event => Object.hasOwn(updateMessages, event.action) && byId.has(String(event.request_id))).map(event => {
      const request = byId.get(String(event.request_id));
      const followUp = event.note && scheduleById.get(String(event.note));
      return {
        key: event.id, request, followUpId: followUp?.id, title: request.title,
        details: [followUp ? followUpName(followUp) : "Request", event.actor_name, date(event.created_at)].filter(Boolean).join(" · "),
        body: event.follow_up_note, status: event.action === "request_update" ? "Received" : "Sent",
      };
    });
  } else if (view === "follow-ups") {
    const scheduledRows = scheduled.flatMap(event => {
      const request = byId.get(String(event.request_id));
      return request ? [{
        key: event.id, request, followUpId: event.id, title: followUpName(event),
        details: [request.title, request.requester_name].filter(Boolean).join(" · "),
        day: event.follow_up_date,
        status: followUpStatus(event.follow_up_date, currentDay, completed.has(String(event.id)), isClosed(request)),
      }] : [];
    });
    const nextRows = requests.filter(request => !isClosed(request) && request.follow_up_date).map(request => ({
      key: `next-${request.id}`, request, title: "Next follow-up",
      details: [request.title, responsibleParty(request)].join(" · "), day: request.follow_up_date,
      status: followUpStatus(request.follow_up_date, currentDay, false, false),
    }));
    rows = [...scheduledRows, ...nextRows]
      .filter(row => followFilter === "all" || ["Overdue", "Due today"].includes(row.status))
      .sort((a, b) => a.day.localeCompare(b.day));
  } else {
    rows = requests.filter(request => nextOwner[request.stage]).map(request => ({
      key: request.id, request, title: request.title, details: `Next action · ${responsibleParty(request)}`,
      body: request.follow_up_note || "Review the submitted brief and set the next step.",
      day: request.follow_up_date, status: statuses[request.status],
    }));
  }

  return <>
    <div className="dr-buttons dr-activity-controls">
      {view === "follow-ups" && <label className="dr-filter">Show
        <select value={followFilter} onChange={event => onFollowFilterChange(event.target.value)}>
          <option value="all">All follow-ups</option>
          <option value="due">Due and overdue</option>
        </select>
      </label>}
      <button type="button" onClick={onRefresh}>Refresh</button>
    </div>
    <div className="dr-list">
      {rows.map(row => <button type="button" className="dr-item" key={row.key}
        onClick={() => onOpen({ requestId: row.request.id, followUpId: row.followUpId })}>
        <span><strong>{row.title}</strong><small>{row.details}</small>
          {row.body && <span className="dr-activity-preview">{row.body}</span>}
        </span>
        <span className="dr-item-meta">
          <span className="dr-badge" data-status={row.status === "Overdue" ? "rejected" : row.status === "Done" ? "completed" : undefined}>{row.status}</span>
          {row.day && <small>{date(row.day)}</small>}
        </span>
      </button>)}
      {!rows.length && <p>{view === "messages" ? "No messages yet." : view === "work" ? "No active requests." : "No follow-ups match this view."}</p>}
    </div>
  </>;
}

export function DesignInboxPage() {
  const [access, setAccess] = useState("loading");
  const [activity, setActivity] = useState(null);
  const [activityError, setActivityError] = useState(false);
  const [view, setView] = useState("requests");
  const [followFilter, setFollowFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const requestNumber = useRef(0);

  async function checkAccess() {
    const number = ++requestNumber.current;
    try {
      const queue = await loadDesignRequests("inbox");
      if (number !== requestNumber.current) return;
      setAccess(queue);
      const { data } = await api.get("/design-requests/inbox/activity");
      if (number !== requestNumber.current) return;
      setActivity(data.events);
      setActivityError(false);
    } catch (err) {
      if (number !== requestNumber.current) return;
      setAccess(current => err.response?.status === 403 ? "denied" : typeof current === "object" ? current : "error");
      setActivityError(true);
    }
  }

  useEffect(() => {
    checkAccess();
    const refresh = () => { if (!document.hidden) checkAccess(); };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      requestNumber.current += 1;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  if (access === "denied") return <Navigate to="/admin/projects" replace />;

  const seenThreads = new Set();
  const completedFollowUps = new Set((activity || []).filter(event => event.action === "follow_done").map(event => String(event.note)));
  const activeRequests = new Set((access.requests || []).filter(request => !isClosed(request)).map(request => String(request.id)));
  const awaitingReply = (activity || []).filter(event => {
    if (!Object.hasOwn(updateMessages, event.action) || !activeRequests.has(String(event.request_id)) ||
      completedFollowUps.has(String(event.note))) return false;
    const thread = `${event.request_id}:${event.note || ""}`;
    if (seenThreads.has(thread)) return false;
    seenThreads.add(thread);
    return event.action === "request_update";
  }).length;

  return (
    <section className="design-requests dr-inbox-page">
      <h1>Design Inbox</h1>
      {access === "loading" && <p role="status">Loading design requests…</p>}
      {access === "error" && <div role="alert">
        <p>Design Inbox could not load.</p>
        <button type="button" onClick={checkAccess}>Retry</button>
      </div>}
      {typeof access === "object" && <>
        <nav className="dr-inbox-views" aria-label="Design Inbox views">
          {inboxViews.map(([key, label]) => <button type="button" key={key}
            aria-current={view === key ? "page" : undefined} className={view === key ? "dr-primary" : ""}
            onClick={() => { setView(key); setSelected(null); checkAccess(); }}>
            {label}{key === "messages" && awaitingReply > 0 && <span className="dr-tab-count"
              aria-label={`${awaitingReply} conversations awaiting a reply`}>{awaitingReply}</span>}
          </button>)}
        </nav>
        {view === "requests" ? <DesignRequestsContent mode="inbox" initialQueue={access} onActivityChange={checkAccess} />
          : selected ? <DesignRequestsContent key={selected.requestId} mode="inbox"
            initialRequestId={selected.requestId} initialFollowUpId={selected.followUpId}
            onActivityChange={checkAccess}
            onBack={() => { setSelected(null); checkAccess(); }} />
          : <>
            {activityError && <div role="alert" className="dr-error">
              <p>Design Inbox activity could not refresh.</p>
              <button type="button" onClick={checkAccess}>Retry</button>
            </div>}
            {!activity && !activityError && view !== "work" && <p role="status">Loading activity…</p>}
            {(activity || view === "work") && <InboxActivity view={view} requests={access.requests}
              events={activity || []} followFilter={followFilter} onFollowFilterChange={setFollowFilter}
              onOpen={setSelected} onRefresh={checkAccess} />}
          </>}
      </>}
    </section>
  );
}

export default function DesignRequests({ onClose }) {
  return <RequestsDialog title="Requests Sent" onClose={onClose}>
    <DesignRequestsContent mode="sent" />
  </RequestsDialog>;
}

export function DesignRequestRows({ requests, onOpen, disabled }) {
  return (
    <div className="design-requests dr-list">
      {requests.map(item => (
        <button type="button" className="dr-item" key={item.id} disabled={disabled} onClick={() => onOpen(item.id)}>
          <span>
            <strong>{item.title}</strong>
            <small>{categories[item.category]} · {item.access.design ? item.requester_department || "Requesting department" : item.owner_department || "Design Team"}</small>
          </span>
          <span className="dr-item-meta">
            <span className="dr-badge" data-status={item.status}>{statuses[item.status]}</span>
            {nextOwner[item.stage] && (item.follow_up_date || item.scheduled_follow_up_date) &&
              <small>Follow-up {date([item.follow_up_date, item.scheduled_follow_up_date].filter(Boolean).sort()[0])}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}

function FollowUpResult({ note }) {
  if (!note) return null;
  let result;
  try {
    result = JSON.parse(note);
  } catch {
    return <p className="dr-note">{note}</p>;
  }
  if (result?.kind !== "follow_up_completion") return <p className="dr-note">{note}</p>;
  return (
    <dl className="dr-completion">
      {[
        ["Description", result.description],
        ["What’s done", result.done],
        ["What’s left", result.left],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="dr-note">{value}</dd></div>)}
    </dl>
  );
}

function readDateChanges(events) {
  return events.filter(event => event.action === "dates_changed").flatMap(event => {
    try {
      const changes = JSON.parse(event.follow_up_note);
      return Array.isArray(changes) ? changes.map(change => ({
        ...change, actor: event.actor_name, changedAt: event.created_at, reason: event.note,
      })) : [];
    } catch {
      return [];
    }
  });
}

const dateFieldLabels = { delivery_due: "Committed delivery", follow_up_date: "Follow-up date" };

function DateChange({ change }) {
  if (!change) return null;
  return (
    <small className="dr-date-change">
      Changed from {date(change.previous)} to {date(change.current)} by {change.actor || "Admin"} on {date(change.changedAt)}
      {change.reason && <span className="dr-date-reason">{change.reason}</span>}
    </small>
  );
}

function scheduledDateChange(event) {
  if (!event) return null;
  try {
    return { ...JSON.parse(event.follow_up_note), actor: event.actor_name, changedAt: event.created_at };
  } catch {
    return null;
  }
}

function openScheduledFollowUps(events) {
  const completed = new Set(events.filter(event => event.action === "follow_done").map(event => String(event.note)));
  return events.filter(event => event.action === "follow_scheduled" && !completed.has(String(event.id)))
    .sort((a, b) => a.follow_up_date.localeCompare(b.follow_up_date));
}

function followUpName(entry) {
  return entry.note || entry.follow_up_note || "Follow-up";
}

function UpdateMessage({ event, files, busy, onDownload }) {
  return <div className="dr-follow-log">
    <strong>{updateMessages[event.action].event}</strong>
    <small>{event.actor_name || "Admin"} · {date(event.created_at)}</small>
    <p className="dr-note">{event.follow_up_note}</p>
    {files.length > 0 && <div className="dr-buttons">{files.map(file => (
      <button type="button" key={file.id} disabled={busy} onClick={() => onDownload(file)}>{file.name}</button>
    ))}</div>}
  </div>;
}

function ScheduledFollowUp({ entry, request, closed, busy, currentDay, onSave, onDownload, focused }) {
  const [action, setAction] = useState("");
  const detailsRef = useRef(null);
  const summaryRef = useRef(null);
  const formRef = useRef(null);
  const history = request.events.filter(event =>
    Object.hasOwn(followUpActions, event.action) && String(event.note) === String(entry.id));
  const dateHistory = history.filter(event => event.action === "follow_reschedule");
  const activity = history.filter(event => event.action !== "follow_reschedule");
  const done = history.some(event => event.action === "follow_done");
  const due = entry.follow_up_date <= currentDay;
  const status = followUpStatus(entry.follow_up_date, currentDay, done, closed);
  const available = !done && !closed ? Object.keys(followUpActions)
    .filter(key => followUpActions[key].button && request.actions.includes(key) && (key !== "follow_update" || due)) : [];
  const canUpload = Object.hasOwn(updateMessages, action) ||
    (request.access.design && due && ["follow_update", "follow_done"].includes(action));
  const canAsk = available.includes("request_update");
  const detailActions = available.filter(key => key !== "request_update");

  useEffect(() => {
    if (!focused) return;
    detailsRef.current.open = true;
    summaryRef.current.focus({ preventScroll: true });
    summaryRef.current.scrollIntoView({ block: "nearest" });
  }, [focused]);

  useEffect(() => {
    if (action === "request_update") formRef.current?.querySelector("textarea")?.focus();
  }, [action]);

  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("follow_up_id", entry.id);
    if (await onSave(action, data)) setAction("");
  }

  return (
    <li className={`dr-follow-up${canAsk ? " dr-has-quick-action" : ""}`}>
      {canAsk && <button type="button" className="dr-primary dr-quick-action" disabled={busy}
        onClick={() => { detailsRef.current.open = true; setAction("request_update"); }}>
        Ask for an update
      </button>}
      <details ref={detailsRef}>
        <summary ref={summaryRef}>
          <strong>{date(entry.follow_up_date)}</strong>
          <span className="dr-badge" data-status={done ? "completed" : undefined}>{status}</span>
          <strong className="dr-follow-name">{followUpName(entry)}</strong>
          <DateChange change={scheduledDateChange(dateHistory[0])} />
          {entry.note && entry.follow_up_note && <span className="dr-note dr-follow-description">{entry.follow_up_note}</span>}
        </summary>
        <div className="dr-follow-up-body">
          {dateHistory.length > 1 && <div className="dr-follow-history">
            <h4>Earlier date changes</h4>
            {dateHistory.slice(1).map(event => <DateChange key={event.id} change={scheduledDateChange(event)} />)}
          </div>}
          {detailActions.length > 0 && <div className="dr-buttons">
            {detailActions.map(key => <button type="button" key={key} aria-pressed={action === key} disabled={busy}
              onClick={() => setAction(key)}>{followUpActions[key].button}</button>)}
          </div>}
          {available.includes(action) && <form ref={formRef} className="dr-form" key={action} onSubmit={submit}>
            {action === "follow_reschedule" && <label>New follow-up date
              <input type="date" name="rescheduled_date" defaultValue={entry.follow_up_date} required />
            </label>}
            {action === "follow_done" ? <>
              <label>Description<textarea name="description" maxLength={4000} required /></label>
              <label>What’s done<textarea name="work_done" maxLength={4000} required /></label>
              <label>What’s left<textarea name="work_left" maxLength={4000} placeholder="Leave blank if nothing is left" /></label>
            </> : <label>{followUpActions[action].prompt}<textarea name="note" maxLength={4000} required={action !== "follow_update"} /></label>}
            {canUpload && <label>Images and files<input type="file" name="files" multiple />
              <small>Up to 5 files per upload, 10 MB each.</small>
            </label>}
            <div className="dr-buttons">
              <button className="dr-primary" disabled={busy}>{action === "request_update" ? "Send" : followUpActions[action].button}</button>
              <button type="button" disabled={busy} onClick={() => setAction("")}>Cancel</button>
            </div>
          </form>}
          {activity.length > 0 && <div className="dr-follow-history">
            <h4>Follow-up activity</h4>
            {activity.map(event => Object.hasOwn(updateMessages, event.action)
              ? <UpdateMessage key={event.id} event={event} busy={busy} onDownload={onDownload}
                files={request.files.filter(file => file.event_id === event.id)} /> : (
              <div key={event.id} className="dr-follow-log">
                <strong>{followUpActions[event.action].event}</strong>
                <small>{event.actor_name || "Admin"} · {date(event.created_at)}</small>
                {event.action === "follow_done" && <FollowUpResult note={event.follow_up_note} />}
                {event.action !== "follow_done" && event.follow_up_note &&
                  <p className="dr-note">{event.follow_up_note}</p>}
                <div className="dr-buttons">
                  {request.files.filter(file => file.event_id === event.id).map(file => (
                    <button type="button" key={file.id} disabled={busy} onClick={() => onDownload(file)}>{file.name}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>}
        </div>
      </details>
    </li>
  );
}

export function DesignRequestsContent({ mode, initialRequestId, initialQueue, onBack, initialFollowUpId, onActivityChange }) {
  const [queue, setQueue] = useState(initialQueue || null);
  const [filter, setFilter] = useState("all");
  const [request, setRequest] = useState(null);
  const detailsRef = useRef(null);
  const [form, setForm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stale = false;
    const detail = initialRequestId ? api.get(`/design-requests/${initialRequestId}`) : null;
    Promise.resolve(initialQueue || loadDesignRequests(mode)).then(data => {
      if (!stale) setQueue(data);
    }).catch(err => {
      if (!stale) setError(err.response?.data?.message || "Could not load design requests.");
    });
    detail?.then(result => {
      if (!stale) setRequest(result.data);
    }).catch(err => {
      if (!stale) setError(err.response?.data?.message || "Could not load the submitted request.");
    });
    return () => { stale = true; };
  }, [initialQueue, initialRequestId, mode]);

  useEffect(() => {
    if (!request?.id || initialFollowUpId) return;
    detailsRef.current?.focus({ preventScroll: true });
    detailsRef.current?.scrollIntoView({ block: "start" });
  }, [request?.id, initialFollowUpId]);

  async function run(operation) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await operation();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || "The operation failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const readRequest = async id => (await api.get(`/design-requests/${id}`)).data;

  function openRequest(id) {
    return run(async () => {
      setRequest(await readRequest(id));
      setForm("");
    });
  }

  function saveAction(action, data) {
    return run(async () => {
      data.set("action", action);
      data.set("version", request.version);
      await api.post(`/design-requests/${request.id}/actions`, data);
      setForm("");
      const updated = await readRequest(request.id);
      setRequest(updated);
      setQueue(await loadDesignRequests(mode));
      onActivityChange?.();
    });
  }

  function save(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (form === "follow") {
      const notes = data.getAll("scheduled_note");
      const names = data.getAll("scheduled_name");
      const followUps = data.getAll("scheduled_date").map((date, index) => ({ date, name: names[index], note: notes[index] }));
      data.delete("scheduled_date");
      data.delete("scheduled_name");
      data.delete("scheduled_note");
      data.set("follow_ups", JSON.stringify(followUps));
    }
    if (form === "timeline") {
      const changes = openScheduledFollowUps(request.events).flatMap(entry => {
        const name = `scheduled_date_${entry.id}`;
        const date = data.get(name);
        data.delete(name);
        return date && date !== entry.follow_up_date ? [{ id: Number(entry.id), date }] : [];
      });
      data.set("scheduled_date_changes", JSON.stringify(changes));
    }
    return saveAction(form, data);
  }

  function download(file) {
    return run(async () => {
      const result = await api.get(`/design-requests/${request.id}/files/${file.id}`, { responseType: "blob" });
      const url = URL.createObjectURL(result.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  const detailOnly = Boolean(onBack);
  const currentDay = today();
  const visible = (queue?.requests || []).filter(item => {
    if (mode === "sent") return item.access.requester;
    if (!item.access.design) return false;
    if (filter === "due") {
      return Boolean(nextOwner[item.stage] && [item.follow_up_date, item.scheduled_follow_up_date]
        .some(value => value && value <= currentDay));
    }
    return filter === "all" || item.status === filter;
  });
  const activeDates = request?.follow_up_date;
  const revision = request?.stage === "changes";
  const dateChanges = readDateChanges(request?.events || []);
  const latestDateChange = (field, current) => {
    const change = dateChanges.find(entry => entry.field === field);
    return change?.current === current ? change : null;
  };
  const closed = request && isClosed(request);
  const backLabel = detailOnly && mode === "sent" ? "Requests Sent" : "Back to list";
  const lastFollow = closed ? request.events.find(entry => entry.follow_up_date && entry.action !== "follow_scheduled") : null;
  const scheduled = (request?.events || []).filter(entry => entry.action === "follow_scheduled")
    .sort((a, b) => a.follow_up_date.localeCompare(b.follow_up_date));
  const reviewActions = (request?.actions || []).filter(action => action !== "follow" &&
    (!Object.hasOwn(followUpActions, action) || Object.hasOwn(updateMessages, action)));
  const requestMessages = (request?.events || []).filter(event => !event.note && Object.hasOwn(updateMessages, event.action));

  function refresh() {
    return run(async () => {
      const [nextQueue, detail] = await Promise.all([
        loadDesignRequests(mode),
        request ? readRequest(request.id) : null,
      ]);
      setQueue(nextQueue);
      if (detail) setRequest(detail);
    });
  }

  return (
    <section className="design-requests" aria-label={mode === "inbox" ? "Design inbox" : "Requests sent"}>
      {!request && detailOnly && <div className="dr-buttons">
        <button type="button" onClick={onBack}>← {backLabel}</button>
      </div>}
      {!request && !detailOnly && <div className="dr-header dr-list-header">
        <div className="dr-buttons">
          {mode !== "inbox" && <h3>Requests sent</h3>}
        </div>
        <div className="dr-buttons">
          {mode === "inbox" && <label className="dr-filter">Status
            <select value={filter} onChange={event => setFilter(event.target.value)}>
              <option value="all">All requests</option>
              {Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              <option value="due">Due follow-ups</option>
            </select>
          </label>}
          <button type="button" disabled={busy} onClick={refresh}>Refresh</button>
        </div>
      </div>}
      {error && <p role="alert" className="dr-error">{error}</p>}
      {(!queue || (detailOnly && !request)) && !error && <p role="status">Loading request…</p>}

      {!request && queue && !detailOnly && (visible.length
        ? <DesignRequestRows requests={visible} onOpen={openRequest} disabled={busy} />
        : <p>No requests in this view.</p>)}

      {request && <article className="dr-card" ref={detailsRef} tabIndex={-1} aria-label={request.title}>
        <header className="dr-header">
          <div><button type="button" disabled={busy} onClick={onBack || (() => { setRequest(null); setForm(""); })}>← {detailOnly ? backLabel : "Back to requests"}</button>
            <h2>{request.title}</h2><p>{categories[request.category]} · {request.requester_name} · {request.requester_department || "Department unassigned"}</p></div>
          <div className="dr-buttons"><span className="dr-badge" data-status={request.status}>{statuses[request.status]}</span>
            <button type="button" disabled={busy} onClick={refresh}>Refresh</button></div>
        </header>
        {form ? <ActionForm key={form} action={form} request={request} onSave={save} onCancel={() => setForm("")} busy={busy} /> :
          reviewActions.length > 0 && <div className="dr-buttons">{reviewActions.map((action, index) => (
            <button type="button" key={action} className={(action === "accept" || (index === 0 && !reviewActions.includes("accept"))) ? "dr-primary" : ""} disabled={busy}
              onClick={() => { setForm(action); setError(""); }}>{updateMessages[action]?.button || actions[action]}</button>
          ))}</div>}
        {!form && <>
        {nextOwner[request.stage] && <section className="dr-next">
          <h3>Next follow-up</h3>
          <dl>
            <div><dt>{revision ? "Requested follow-up date" : "Follow-up date"}</dt><dd>{activeDates ? date(activeDates) : "To be set"}{activeDates && activeDates <= currentDay && <strong> · {activeDates < currentDay ? "Overdue" : "Due today"}</strong>}<DateChange change={latestDateChange("follow_up_date", activeDates)} /></dd></div>
            <div><dt>Who acts next</dt><dd>{nextOwner[request.stage] === "Design Team" ? request.owner_department || "Design Team" : "Requesting Admin"}</dd></div>
          </dl>
          <div><span>What to share or do</span><p>{request.follow_up_note || "Review the submitted brief and set the next step."}</p></div>
        </section>}
        {requestMessages.length > 0 && <section className="dr-section dr-follow-history">
          <h3>Questions and updates</h3>
          {requestMessages.map(event => <UpdateMessage key={event.id} event={event} busy={busy} onDownload={download}
            files={request.files.filter(file => file.event_id === event.id)} />)}
        </section>}
        {closed && <section className="dr-next" data-status={request.status}>
          <h3>{request.status === "rejected" ? "Request rejected" : "Request completed"}</h3>
          {request.status === "rejected" && <p className="dr-note">{request.events.find(entry => entry.action === "reject")?.note || "No reason recorded."}</p>}
          {lastFollow && <p>Last action follow-up · {date(lastFollow.follow_up_date)}{lastFollow.follow_up_note && ` · ${lastFollow.follow_up_note}`}</p>}
        </section>}
        {(scheduled.length > 0 || request.actions.includes("follow")) && <section className="dr-section dr-follow-plan">
          <div className="dr-header">
            <h3>Scheduled follow-ups</h3>
            {request.actions.includes("follow") && <button type="button" disabled={busy}
              onClick={() => { setForm("follow"); setError(""); }}>+ Add follow-ups</button>}
          </div>
          {scheduled.length ? <ul>{scheduled.map(entry => (
            <ScheduledFollowUp key={entry.id} entry={entry} request={request} closed={closed} busy={busy}
              focused={String(initialFollowUpId) === String(entry.id)}
              currentDay={currentDay} onSave={saveAction} onDownload={download} />
          ))}</ul> : <p>No additional follow-ups scheduled.</p>}
        </section>}
        <dl className="dr-meta">
          <div><dt>Submitted</dt><dd>{date(request.created_at)}</dd></div>
          <div><dt>Needed by</dt><dd>{date(request.needed_by)}</dd></div>
          <div><dt>Committed delivery</dt><dd>{date(request.delivery_due)}<DateChange change={latestDateChange("delivery_due", request.delivery_due)} /></dd></div>
        </dl>
        <details open><summary>Request brief</summary><p className="dr-note">{request.brief}</p></details>
        {request.files.length > 0 && <section className="dr-section">
          <h3>Shared files</h3>
          <ul>{request.files.map(file => {
            const source = request.events.find(entry => entry.id === file.event_id);
            return <li key={file.id}><button type="button" disabled={busy} onClick={() => download(file)}>{file.name}</button>
              <small>{source?.action === "share" ? `Draft v${source.draft_version}` : followUpActions[source?.action]?.event || actions[source?.action]} · {source?.actor_name}</small></li>;
          })}</ul>
        </section>}
        <details className="dr-section">
          <summary>Activity</summary>
          {dateChanges.length > 0 && <ul aria-label="Date changes">{dateChanges.map((change, index) => (
            <li key={index}><strong>{dateFieldLabels[change.field]}</strong><DateChange change={change} /></li>
          ))}</ul>}
          <ol>{request.events.filter(entry => !["follow_scheduled", "dates_changed"].includes(entry.action) && !Object.hasOwn(followUpActions, entry.action)).map(entry => <li key={entry.id}>
            <strong>{actions[entry.action]}{entry.action === "share" && ` · v${entry.draft_version}`}</strong>
            <small>{entry.actor_name || "Admin"} · {date(entry.created_at)}</small>
            {entry.note && <p className="dr-note">{entry.note}</p>}
            {entry.follow_up_date && <p>Follow-up {date(entry.follow_up_date)}{entry.action !== "ask" && entry.follow_up_note && ` · ${entry.follow_up_note}`}</p>}
            {["accept", "timeline"].includes(entry.action) && <p>Committed delivery {date(entry.delivery_due)}</p>}
          </li>)}</ol>
        </details>
        </>}
      </article>}
    </section>
  );
}
