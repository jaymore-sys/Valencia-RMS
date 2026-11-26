import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import "./designRequests.css";

const message = (error, fallback) => error.response?.data?.message || fallback;
export const designInboxHref = id => `/admin/design-requests?requestId=${id}`;
export const designProjectHref = (id, personal = false) =>
  `/admin/projects?${personal ? "view=personal&" : ""}designRequestId=${id}`;
const designTaskHref = (taskId, personal) =>
  "/admin/tasks?" + (personal ? "view=personal&" : "") + "taskId=" + taskId;

function useDesignWork(url, revision) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!url) return;
    let current = true;
    api.get(url).then(({ data }) => {
      if (!current) return;
      setResult(data);
      setError("");
    }).catch(err => {
      if (current) setError(err.response?.status === 404 && err.response?.data?.message === "API route not found"
        ? "The running RMS backend does not have the Design Projects routes. Start the backend from the same checkout as the preview."
        : message(err, "Could not load design work."));
    });
    return () => { current = false; };
  }, [url, version, revision]);
  return { result, error, reload: () => setVersion(value => value + 1) };
}

export function useDesignProjects(view, revision) {
  return useDesignWork(view ? `/design-requests/projects?view=${view}` : null, revision);
}

function designProjectStatus(project) {
  if (project.request_status === "completed") return "completed";
  const remaining = project.tasks.filter(task => task.status !== 'completed');
  if (remaining.length && remaining.every(task=>task.status==='on_hold')) return 'on_hold';
  if (remaining.length && remaining.every(task=>task.status==='under_review')) return 'under_review';
  if (remaining.length && remaining.every(task=>task.status==='rejected')) return 'rejected';
  const started = project.tasks.some(task => !["not_started", "to_do", "todo", "pending"].includes(task.status));
  return project.request_status === "in_progress" || started ? "in_progress" : "not_started";
}

export function combineDesignProjects(projects, linked = [], normalize = row => row) {
  const generatedIds = new Set(linked.filter(row => row.generated_project).map(row => String(row.project_id)));
  return [
    ...projects.filter(project => !generatedIds.has(String(project.project_id))),
    ...linked.map(link => {
      const status = designProjectStatus(link);
      return {
        ...normalize({
          ...link,
          status,
          project_title: link.request_title,
          design_request_id: link.request_id,
          main_tasks: link.tasks,
          design_team: link.assignees || [],
          overall_progress: link.tasks.length
            ? Math.round(link.tasks.reduce((sum, task) => sum + (Number(task.progress) || 0), 0) / link.tasks.length)
            : Number(link.request_status === "completed") * 100,
          assignees: link.assignees?.length ? link.assignees
            : link.assignee_name ? [{ user_id: link.assignee_id, full_name: link.assignee_name }] : [],
        }),
        design_request_id: link.request_id,
      };
    }),
  ];
}

function TaskForm({ project, parent, people, onClose, onSave }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    try {
      await api.post(`/design-requests/${project.request_id}/work/tasks`, { ...body, parent_id: parent?.task_id });
      onSave();
    } catch (err) {
      setError(message(err, "Could not save the task."));
    } finally {
      setBusy(false);
    }
  }
  return <form className="dr-work-form dr-card" onSubmit={submit}>
    <label>{parent ? "Subtask title" : "Main Task title"} <input name="title" required maxLength={160} /></label>
    <label>Description <textarea name="description" maxLength={4000} /></label>
    <div className="dr-work-dates">
      <label>Start date <input name="start_date" type="date" defaultValue={parent?.start_date || project.start_date} required /></label>
      <label>Deadline <input name="due_date" type="date" defaultValue={parent?.due_date || project.due_date} required /></label>
    </div>
    <label>Assign to
      <select name="assignee_id" defaultValue={parent?.assignee_id || ""}>
        <option value="">{parent ? "Use the Main Task assignee" : "Assign later"}</option>
        {people.map(person => <option key={person.user_id} value={person.user_id}>{person.full_name}</option>)}
      </select>
    </label>
    {error && <p role="alert" className="dr-error">{error}</p>}
    <div className="dr-buttons">
      <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="dr-primary" disabled={busy}>{busy ? "Saving…" : parent ? "Add Subtask" : "Add Main Task"}</button>
    </div>
  </form>;
}

function ReviewForm({ requestId, target, onClose, onSave }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const approve = target.action === "approve";
  const label = ({approve:"Approve",reject:"Reject",on_hold:"Hold",in_progress:"Resume"})[target.action];
  async function submit(event) {
    event.preventDefault();
    const note = new FormData(event.currentTarget).get("note");
    setBusy(true);
    setError("");
    try {
      await api.put(`/design-requests/${requestId}/work/tasks/${target.taskId}/review`, { action: target.action, note });
      onSave();
    } catch (err) {
      setError(message(err, "Could not review the task."));
    } finally {
      setBusy(false);
    }
  }
  return <form className="dr-work-form dr-card" onSubmit={submit}>
    <label>{approve ? "Review note (optional)" : `Reason for ${label.toLowerCase()}`}
      <textarea name="note" required={!approve} maxLength={1000} />
    </label>
    {error && <p role="alert" className="dr-error">{error}</p>}
    <div className="dr-buttons">
      <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
      <button className="dr-primary" disabled={busy}>{busy ? "Saving…" : label}</button>
    </div>
  </form>;
}

const workStatuses = { not_started: "To Do", ongoing: "In Progress", under_review: "Under Review",
  completed: "Completed", rejected: "Rejected", on_hold: "On Hold", approved: "Approved",
  accepted: "Accepted", in_progress: "In Progress" };

function workDates(work) {
  return [work.start_date && `Starts ${work.start_date}`, work.due_date && `Due ${work.due_date}`].filter(Boolean).join(" · ");
}

export function DesignTaskExtras({ task, project, people, canManage, onChange }) {
  const [form, setForm] = useState(null);
  const requestId = task.design_request_id;
  const work = { ...project, request_id: requestId, due_date: project.end_date };
  const openTask = ["to_do", "in_progress"].includes(task.status);
  const saved = () => { setForm(null); onChange(); };

  function reviewButtons(item) {
    if (!canManage || form) return null;
    return <div className="dr-buttons">
      {(item.task_id === task.task_id ? (item.status === "on_hold" ? ["in_progress"] : ["approve", "on_hold", "reject"]) : ["approve", "reject"]).map(action => <button key={action} type="button"
        onClick={() => setForm({ action, taskId: item.task_id })}>
        {({approve:"Approve",reject:"Reject",on_hold:"Hold",in_progress:"Resume"})[action]}
      </button>)}
    </div>;
  }

  return <div className="design-requests">
    {task.review_status && task.review_status !== "none" && <p>Review · {workStatuses[task.review_status] || task.review_status}</p>}
    {task.review_note && <p>{task.review_note}</p>}
    {["under_review","on_hold"].includes(task.status) && reviewButtons(task)}
    {!!task.subtasks?.length && <ul className="dr-list">{task.subtasks.map(child => <li key={child.task_id}>
      <strong>{child.task_title}</strong> · {child.assignee_name || "Unassigned"} · {workStatuses[child.status] || child.status}
      <div>{workDates(child)}</div>
      {child.review_status && child.review_status !== "none" && <div>Review · {workStatuses[child.review_status] || child.review_status}</div>}
      {child.review_note && <p>{child.review_note}</p>}
      {canManage && openTask && child.status === "not_started" && !form &&
        <button type="button" onClick={() => setForm({ subtask: child })}>Assign Subtask</button>}
      {(openTask || task.status === "under_review") && child.status === "completed" &&
        child.review_status !== "approved" && reviewButtons(child)}
    </li>)}</ul>}
    {canManage && openTask && !form && <button type="button" onClick={() => setForm({ create: true })}>+ Add Subtask</button>}
    {form?.create && <TaskForm project={work} parent={task} people={people} onClose={() => setForm(null)} onSave={saved} />}
    {form?.subtask && <Assignment project={work} task={task} subtask={form.subtask} onClose={() => setForm(null)} onSave={saved} />}
    {form?.action && <ReviewForm requestId={requestId} target={form} onClose={() => setForm(null)} onSave={saved} />}
  </div>;
}

export function DesignProjectPanel({ requestId }) {
  const { result, error } = useDesignWork("/design-requests/" + requestId + "/work");
  if (!result) return <p role={error ? "alert" : "status"}>{error || "Loading design work…"}</p>;
  const { project, status } = result;
  if (!project) return null;
  return <section className="design-requests dr-card dr-linked-work">
    <h2>Design work · {project.request_title}</h2>
    <p>{workStatuses[status]} · {workDates(project)}</p>
    <p><strong>Design Team</strong> · {
      project.assignees?.map(user => user.full_name).join(", ") || project.assignee_name || "Awaiting assignment"
    }</p>
    {project.tasks.map(task => <article key={task.task_id} className="dr-item dr-work-task">
      <strong>{task.task_title}</strong>
      <p>{task.assignees?.map(user => user.full_name).join(", ") || task.assignee_name || "Unassigned"} · {
        workStatuses[task.status] || task.status
      } · {workDates(task)}</p>
      <DesignTaskExtras project={project} task={task} />
    </article>)}
  </section>;
}

function Assignment({ project, task, subtask, onSave, onClose }) {
  const { result, error } = useDesignWork(`/design-requests/${project.request_id}/work?people=1`);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  async function submit(event) {
    event.preventDefault();
    const assignee = new FormData(event.currentTarget).get("assignee_id");
    setSaving(true);
    setSaveError("");
    try {
      await api.put(`/design-requests/${project.request_id}/work/assignment`, { assignee_id: Number(assignee), task_id: task?.task_id, subtask_id: subtask?.task_id });
      onSave();
    } catch (err) {
      setSaveError(message(err, "Could not assign this work."));
    } finally {
      setSaving(false);
    }
  }
  return <form className="dr-work-form" onSubmit={submit}>
    {(error || saveError) && <p className="dr-error" role="alert">{error || saveError}</p>}
    {result ? <label>Assign to
      <select name="assignee_id" required defaultValue={(subtask || task || project).assignee_id ?? ""}>
        <option value="">Choose a Design Team member</option>
        {result.people.map(person => <option key={person.user_id} value={person.user_id}>{person.full_name}</option>)}
      </select>
    </label> : !error && <p role="status">Loading Design Team…</p>}
    <div className="dr-buttons">
      <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
      {result && <button className="dr-primary" disabled={saving}>{saving ? "Saving…" : "Save assignment"}</button>}
    </div>
  </form>;
}

const dueDateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
});

function DueDate({ value }) {
  if (!value) return "–";
  const date = new Date(value + "T00:00:00Z");
  return Number.isNaN(date.getTime()) ? "–" : <time dateTime={value}>{dueDateFormat.format(date)}</time>;
}

function assigneeNames(item) {
  return item.assignees?.map(user => user.full_name).join(", ") || item.assignee_name || "Unassigned";
}

function WorkStatus({ status }) {
  const tone = { not_started: "new", ongoing: "in_progress", under_review: "under_review" }[status] || status;
  return <span className="dr-badge" data-status={tone}>{workStatuses[status] || status}</span>;
}

export function DesignWorkAssignments({ revision }) {
  const { result, error } = useDesignProjects("design", revision);
  const projects = result?.projects || [];
  return <div className="design-requests">
    {error && <p className="dr-error" role="alert">{error}</p>}
    {!result && !error && <p role="status">Loading assignments…</p>}
    {result && !projects.length && <p>No linked Design projects yet.</p>}
    {!!projects.length && <div className="dr-ownership-table-wrap">
      <table className="dr-ownership-table" aria-label="Design projects and Main Task assignments">
        <thead><tr>
          <th scope="col">Project / Main Task</th>
          <th scope="col">Assigned to</th>
          <th scope="col">Status</th>
          <th scope="col">Due date</th>
        </tr></thead>
        {projects.map(project => <tbody key={project.request_id}>
          <tr className="dr-ownership-project">
            <th scope="row"><Link to={designProjectHref(project.request_id)}>{project.request_title}</Link></th>
            <td>{assigneeNames(project)}</td>
            <td><WorkStatus status={designProjectStatus(project)} /></td>
            <td><DueDate value={project.due_date} /></td>
          </tr>
          {project.tasks.map(task => {
            const selfAssigned = Number(task.assignee_id) === Number(result.user_id)
              || task.assignees?.some(user => Number(user.user_id) === Number(result.user_id));
            return <tr key={task.task_id} className="dr-ownership-task">
              <th scope="row"><Link to={designTaskHref(task.task_id, selfAssigned)}>{task.task_title}</Link></th>
              <td>{assigneeNames(task)}</td>
              <td><WorkStatus status={task.status} /></td>
              <td><DueDate value={task.due_date} /></td>
            </tr>;
          })}
        </tbody>)}
      </table>
    </div>}
  </div>;
}
