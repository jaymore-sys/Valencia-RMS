const express = require("express");
const multer = require("multer");
const db = require("../config/db");
const authenticate = require("../middleware/authmiddleware");
const { requireRole } = require("../middleware/rolemiddleware");
const {
    categories, DesignRequestError, readText, readDate, allowedActions, transition, followUpLogActions, makeFollowUpLog, getChangedRequestDates,
    updateMessageActions, makeUpdateMessageLog,
} = require("../utils/designrequestworkflow");

const { queueDesignMail } = require("../jobs/designrequestemailjob");

const {
    acceptedStatuses, designProjectLink, validateProject, createSourceProject, linkProject, registerDesignProject,
    listDesignPeople, listDesignProjectAssignees, listWork, createWorkTask, readLinkedTask, addTaskAssignee, assignWorkTask, reviewWorkTask, requireDesignManager,
} = require("../utils/designrequestprojects");

const router = express.Router();
const uploads = multer({
    storage: multer.memoryStorage(),
    limits: { files: 5, fileSize: 10 * 1024 * 1024, fields: 12, fieldSize: 16000, parts: 17 },
}).array("files", 5);

router.use(authenticate);

const requestColumns = `q.id, q.requester_id, q.requester_department_id, q.owner_department_id,
    q.category, q.title, q.brief, q.status, q.stage, q.follow_up_note, q.draft_version, q.version, q.created_at,
    DATE_FORMAT(q.needed_by, '%Y-%m-%d') AS needed_by,
    DATE_FORMAT(q.delivery_due, '%Y-%m-%d') AS delivery_due,
    DATE_FORMAT(q.follow_up_date, '%Y-%m-%d') AS follow_up_date,
    u.full_name AS requester_name, requester_department.department_name AS requester_department,
    owner_department.department_name AS owner_department`;

const requestFrom = `FROM design_requests q
    LEFT JOIN users u ON u.user_id = q.requester_id
    LEFT JOIN departments requester_department ON requester_department.department_id = q.requester_department_id
    LEFT JOIN departments owner_department ON owner_department.department_id = q.owner_department_id`;

const openScheduledFollowUps = `e.action = 'follow_scheduled' AND NOT EXISTS (
    SELECT 1 FROM design_request_events done
    WHERE done.request_id = e.request_id AND done.action = 'follow_done'
    AND CAST(done.note AS BINARY) = CAST(e.id AS BINARY)
)`;

function handle(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

async function getDepartments(connection, user) {
    const [rows] = await connection.query("SELECT department_id FROM user_departments WHERE user_id = ?", [user.user_id]);
    return [...new Set([user.department_id, ...rows.map(row => row.department_id)].map(Number).filter(id => id > 0))];
}

async function defaultDepartment(connection) {
    const configured = Number(process.env.DESIGN_REQUEST_DEPARTMENT_ID);
    const [rows] = configured > 0
        ? await connection.query("SELECT department_id FROM departments WHERE department_id = ?", [configured])
        : await connection.query("SELECT department_id FROM departments WHERE LOWER(TRIM(department_name)) IN ('design team', 'design') LIMIT 2");
    return rows.length === 1 ? Number(rows[0].department_id) : null;
}

function accessTo(row, user, departments) {
    return {
        requester: Number(row.requester_id) === Number(user.user_id),
        design: user.role_name === "admin" && departments.includes(Number(row.owner_department_id)),
    };
}

async function readRequest(connection, id, lock = false) {
    const [[row]] = await connection.query(`SELECT ${requestColumns} ${requestFrom} WHERE q.id = ?${lock ? " FOR UPDATE" : ""}`, [id]);
    return row;
}

async function inTransaction(handler) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const result = await handler(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function addEvent(connection, requestId, userId, action, event, files) {
    const [result] = await connection.query(
        `INSERT INTO design_request_events
        (request_id, actor_id, action, note, delivery_due, follow_up_date, follow_up_note, draft_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [requestId, userId, action, event.note, event.deliveryDue, event.followDate, event.followNote, event.draftVersion]
    );
    for (const file of files) {
        await connection.query("INSERT INTO design_request_files (event_id, name, content) VALUES (?, ?, ?)",
            [result.insertId, file.originalname.slice(0, 255), file.buffer]);
    }
    return result.insertId;
}

async function getDesignAccess(user) {
    const [departments, owner] = await Promise.all([getDepartments(db, user), defaultDepartment(db)]);
    const canReview = user.role_name === "admin" && departments.includes(owner);
    return { departments, owner, canReview };
}

router.get("/department", handle(async (req, res) => {
    const { owner, canReview } = await getDesignAccess(req.user);
    res.json({ department_id: owner, can_review: canReview });
}));

async function listRequests(req, res, inboxOnly) {
    const { departments, owner, canReview } = await getDesignAccess(req.user);
    if (inboxOnly && !canReview) {
        throw new DesignRequestError(403, "The Design Inbox is available to Design Team Admins.");
    }
    const inboxDepartments = req.user.role_name === "admin" ? departments : [];
    const scope = inboxOnly ? "q.owner_department_id = ?" :
        `q.requester_id = ?${inboxDepartments.length ? " OR q.owner_department_id IN (?)" : ""}`;
    const scopeValues = inboxOnly ? [owner] :
        inboxDepartments.length ? [req.user.user_id, inboxDepartments] : [req.user.user_id];
    const [rows] = await db.query(`SELECT ${requestColumns}, DATE_FORMAT((
        SELECT MIN(e.follow_up_date) FROM design_request_events e
        WHERE e.request_id = q.id AND ${openScheduledFollowUps}
    ), '%Y-%m-%d') AS scheduled_follow_up_date,
        latest_update.follow_up_note AS latest_design_update,
        latest_update.created_at AS latest_design_update_at
        ${requestFrom}
        LEFT JOIN design_request_events latest_update ON q.requester_id = ? AND latest_update.id = (
            SELECT MAX(e.id) FROM design_request_events e
            WHERE e.request_id = q.id AND e.action = 'respond_update'
        )
        WHERE ${scope}
        ORDER BY q.created_at DESC, q.id DESC`, [req.user.user_id, ...scopeValues]);
    const requests = rows.map(row => ({ ...row, access: accessTo(row, req.user, departments) }));
    res.json({
        requests,
        can_review: canReview,
        can_submit: Boolean(owner),
    });
}

async function recoverDesignProjects(owner, actorId) {
    const [missing] = await db.query(`
        SELECT q.id FROM design_requests q LEFT JOIN design_request_project_links l ON l.request_id = q.id
        WHERE q.owner_department_id = ? AND q.status IN (?) AND l.request_id IS NULL ORDER BY q.id
    `, [owner, acceptedStatuses]);
    for (const { id } of missing) {
        await inTransaction(async connection => {
            const request = await readRequest(connection, id, true);
            if (request?.owner_department_id && Number(request.owner_department_id) === owner &&
                acceptedStatuses.includes(request.status)) {
                await registerDesignProject(connection, request, actorId);
            }
        });
    }
}

router.get("/projects", requireRole("admin", "administrator", "superadmin"), handle(async (req, res) => {
    const { canReview, owner, departments } = await getDesignAccess(req.user);
    const personal = req.query.view === "personal";
    const designOnly = req.query.view === "design";
    if (canReview && !personal && !designOnly) await recoverDesignProjects(owner, req.user.user_id);
    let projects;
    if (designOnly) {
        projects = canReview ? await listWork(db, "q.owner_department_id = ?", [owner]) : [];
    } else if (personal) {
        projects = departments.includes(owner) ? await listWork(db, "q.owner_department_id = ?", [owner], req.user.user_id) : [];
    } else {
        projects = await listWork(db, canReview
            ? "q.owner_department_id = ? OR q.requester_id = ?" : "q.requester_id = ?",
        canReview ? [owner, req.user.user_id] : [req.user.user_id]);
    }
    res.json({ projects, user_id: req.user.user_id, can_assign: canReview, design_department_id: canReview ? owner : null });
}));

router.get("/:id/work", requireRole("admin", "administrator", "superadmin"), handle(async (req, res) => {
    const { request, access } = await withWorkRequest(db, req);
    const [project] = await listWork(db, "q.id = ?", [request.id]);
    const [people] = project && access.design && req.query.people === "1"
        ? await listDesignPeople(db, request.owner_department_id) : [[]];
    res.json({ project: project || null, people, access, user_id: req.user.user_id, status: request.status });
}));

router.use(requireRole("admin", "administrator", "superadmin"));

router.get("/", handle((req, res) => listRequests(req, res, false)));
router.get("/inbox", handle((req, res) => listRequests(req, res, true)));
router.get("/inbox/activity", handle(async (req, res) => {
    const { owner, canReview } = await getDesignAccess(req.user);
    if (!canReview) throw new DesignRequestError(403, "The Design Inbox is available to Design Team Admins.");

    const [events] = await db.query(`SELECT e.id, e.request_id, e.action, e.note, e.follow_up_note,
        DATE_FORMAT(e.follow_up_date, '%Y-%m-%d') AS follow_up_date,
        e.created_at, actor.full_name AS actor_name
        FROM design_request_events e
        JOIN design_requests q ON q.id = e.request_id
        LEFT JOIN users actor ON actor.user_id = e.actor_id
        WHERE q.owner_department_id = ? AND e.action IN ('follow_scheduled', 'follow_done', ?)
        ORDER BY e.id DESC`, [owner, updateMessageActions]);
    res.json({ events });
}));

router.post("/", uploads, handle(async (req, res) => {
    const body = req.body || {};
    const title = readText(body.title, "Title", 160, true);
    const brief = readText(body.brief, "Design brief", 8000, true);
    const neededBy = readDate(body.needed_by, "needed-by date");
    if (!categories.includes(body.category)) throw new DesignRequestError(400, "Select a design category.");
    const files = req.files || [];
    let attachmentLabels = [];
    if (body.file_labels !== undefined) {
        try {
            attachmentLabels = JSON.parse(body.file_labels);
            if (!Array.isArray(attachmentLabels) || attachmentLabels.length !== files.length ||
                attachmentLabels.some(label => typeof label !== "string" || !label.trim() || label.length > 200)) {
                throw new Error("Invalid attachment labels");
            }
        } catch {
            throw new DesignRequestError(400, "The attachment labels could not be read. Choose the files again.");
        }
    }

    let projectDraft;
    if (body.project_draft !== undefined && body.project_id !== undefined) {
        throw new DesignRequestError(400, "Choose one originating project.");
    }
    if (body.project_draft !== undefined) {
        try {
            projectDraft = JSON.parse(body.project_draft);
            if (!projectDraft || typeof projectDraft !== "object" || Array.isArray(projectDraft)) throw new Error();
        } catch {
            throw new DesignRequestError(400, "The project details could not be read.");
        }
    }
    const created = await inTransaction(async connection => {
        const owner = await defaultDepartment(connection);
        if (!owner) throw new DesignRequestError(503, "The Design Team inbox has not been configured.");
        const departments = await getDepartments(connection, req.user);
        let projectId = null;
        if (body.project_id !== undefined) {
            projectId = Number(body.project_id);
            await validateProject(connection, projectId, req.user.user_id, departments);
        } else if (projectDraft) {
            projectId = await createSourceProject(connection, projectDraft, req.user.user_id, departments);
        }
        const [result] = await connection.query(
            `INSERT INTO design_requests (requester_id, requester_department_id, owner_department_id,
            category, title, brief, needed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.user.user_id, departments[0] || null, owner, body.category, title, brief, neededBy]
        );
        if (projectId) await linkProject(connection, result.insertId, projectId);
        await addEvent(connection, result.insertId, req.user.user_id, "submit", {
            note: null, deliveryDue: null, followDate: null,
            followNote: attachmentLabels.length ? JSON.stringify({ attachmentLabels }) : null, draftVersion: 0,
        }, files);
        await queueDesignMail(connection, {
            id: result.insertId, requester_id: req.user.user_id, owner_department_id: owner, title,
        }, `submitted:${result.insertId}`, "design", "New design request",
        [neededBy && `Needed by: ${neededBy}`, brief].filter(Boolean).join("\n\n"));
        return { id: result.insertId, project_id: projectId };
    });
    res.status(201).json(created);
}));


async function withWorkRequest(connection, req, lock = false) {
    const departments = await getDepartments(connection, req.user);
    const request = await readRequest(connection, req.params.id, lock);
    const access = request && accessTo(request, req.user, departments);
    if (!access || (!access.design && !access.requester)) throw new DesignRequestError(404, "Design request not found.");
    return { request, access };
}


router.post("/:id/work/tasks", handle(async (req, res) => {
    const taskId = await inTransaction(async connection => {
        const { request, access } = await withWorkRequest(connection, req, true);
        requireDesignManager(request, access);
        const link = await designProjectLink(connection, request.id);
        if (!link) throw new DesignRequestError(409, "Design work is unavailable. Reopen the Projects board and try again.");
        const parent = req.body?.parent_id
            ? await readLinkedTask(connection, request.id, Number(req.body.parent_id)) : null;
        const actorId = req.user.user_id;
        const body = req.body || {};
        const assigneeIds = body.assignee_ids !== undefined
            ? readAssigneeIds(body.assignee_ids)
            : body.assignee_id ? readAssigneeIds([body.assignee_id]) : [];
        if (assigneeIds.length) await requireDesignAssignees(connection, request, assigneeIds);
        if (parent && assigneeIds.length > 1) {
            throw new DesignRequestError(400, "Choose one assignee for the Subtask.");
        }
        if (!parent) {
            if (!assigneeIds.length) throw new DesignRequestError(400, "Select an assignee for the Main Task.");
            if (body.assignee_ids !== undefined) {
                const [[memberCount]] = await connection.query(`
                    SELECT COUNT(DISTINCT employee_id) AS total FROM project_assignments
                    WHERE project_id = ? AND employee_id IN (?) AND COALESCE(assignment_status, 'assigned') <> 'removed'
                `, [link.project_id, assigneeIds]);
                if (Number(memberCount.total) !== assigneeIds.length) {
                    throw new DesignRequestError(400, "Add these employees to the project first.");
                }
            }
        }
        const primaryAssigneeId = assigneeIds[0] || parent?.assigned_to_user_id;
        if (!primaryAssigneeId) throw new DesignRequestError(400, "Select an assignee for the Subtask.");
        const taskId = await createWorkTask(connection, request, link, actorId, body, parent, primaryAssigneeId);
        for (const id of assigneeIds) {
            await addTaskAssignee(connection, parent?.task_id || taskId, id, actorId);
        }
        return taskId;
    });
    res.status(201).json({ task_id: taskId });
}));

function readAssigneeIds(value) {
    const ids = Array.isArray(value) ? [...new Set(value.map(Number))] : [];
    if (!ids.length || ids.some(id => !Number.isSafeInteger(id) || id < 1)) {
        throw new DesignRequestError(400, "Select at least one Design Team member.");
    }
    return ids;
}

async function requireDesignAssignees(connection, request, ids) {
    const [people] = await listDesignPeople(connection, request.owner_department_id);
    const available = new Set(people.map(person => Number(person.user_id)));
    if (ids.some(id => !available.has(id))) {
        throw new DesignRequestError(400, "Choose active members of the Design Team.");
    }
}

router.post("/:id/work/team", handle(async (req, res) => {
    const ids = readAssigneeIds(req.body?.assignee_ids);
    await inTransaction(async connection => {
        const { request, access } = await withWorkRequest(connection, req, true);
        requireDesignManager(request, access);
        const link = await designProjectLink(connection, request.id);
        if (!link) throw new DesignRequestError(409, "Design work is unavailable.");
        await requireDesignAssignees(connection, request, ids);
        // Serialize team updates when separate requests link to the same project.
        const [[project]] = await connection.query("SELECT project_id FROM projects WHERE project_id = ? FOR UPDATE", [link.project_id]);
        if (!project) throw new DesignRequestError(404, "Project not found.");
        const [savedTeam] = await listDesignProjectAssignees(connection, [request.id], true);
        if (savedTeam.length) {
            const savedIds = new Set(savedTeam.map(user => Number(user.user_id)));
            if (ids.every(id => savedIds.has(id)) && ids.length === savedIds.size) return;
            throw new DesignRequestError(409, "The Design Team has already been assigned to this project.");
        }
        const [existing] = await connection.query(`
            SELECT employee_id, assignment_status FROM project_assignments WHERE project_id = ? AND employee_id IN (?)
        `, [link.project_id, ids]);
        for (const id of ids) {
            const matches = existing.filter(row => Number(row.employee_id) === id);
            if (matches.some(row => row.assignment_status !== "removed")) continue;
            if (matches.length) {
                await connection.query(`
                    UPDATE project_assignments SET assignment_status = 'assigned', assigned_by_user_id = ?, assigned_at = NOW()
                    WHERE project_id = ? AND employee_id = ? AND assignment_status = 'removed'
                `, [req.user.user_id, link.project_id, id]);
            } else {
                await connection.query(`
                    INSERT INTO project_assignments (project_id, employee_id, assigned_by_user_id, assignment_status, employee_progress, assigned_at)
                    VALUES (?, ?, ?, 'assigned', 0, NOW())
                `, [link.project_id, id, req.user.user_id]);
            }
        }
    });
    res.json({ success: true });
}));

router.put("/:id/work/tasks/:taskId/review", handle(async (req, res) => {
    await inTransaction(async connection => {
        const { request, access } = await withWorkRequest(connection, req, true);
        requireDesignManager(request, access);
        await reviewWorkTask(connection, request.id, Number(req.params.taskId), req.user.user_id, req.body || {});
    });
    res.json({ success: true });
}));

router.put("/:id/work/assignment", handle(async (req, res) => {
    await inTransaction(async connection => {
        const { request, access } = await withWorkRequest(connection, req, true);
        requireDesignManager(request, access);
        const link = await designProjectLink(connection, request.id);
        if (!link) throw new DesignRequestError(409, "Design work is unavailable. Reopen the Projects board and try again.");
        const userId = Number(req.body?.assignee_id);
        await requireDesignAssignees(connection, request, [userId]);
        if (req.body?.task_id) {
            const task = await readLinkedTask(connection, request.id, Number(req.body.task_id));
            const subtaskId = Number(req.body.subtask_id);
            if (req.body.subtask_id !== undefined) {
                const [[subtask]] = await connection.query(
                    "SELECT status FROM tasks WHERE task_id = ? AND parent_task_id = ? FOR UPDATE",
                    [subtaskId || 0, task.task_id]
                );
                if (!subtask) throw new DesignRequestError(404, "Subtask not found on this Main Task.");
                if (subtask.status !== "not_started" || !["not_started", "ongoing"].includes(task.status)) {
                    throw new DesignRequestError(409, "Only unstarted subtasks on open Main Tasks can be reassigned.");
                }
            }
            await assignWorkTask(connection, task, userId, req.user.user_id, subtaskId);
        } else {
            throw new DesignRequestError(400, "Use the project’s one-time Design Team selection.");
        }
    });
    res.json({ success: true });
}));

router.get("/:id", handle(async (req, res) => {
    const departments = await getDepartments(db, req.user);
    const row = await readRequest(db, req.params.id);
    const access = row && accessTo(row, req.user, departments);
    if (!access || (!access.design && !access.requester)) throw new DesignRequestError(404, "Request not found.");
    const [events] = await db.query(`SELECT e.*, u.full_name AS actor_name,
        DATE_FORMAT(e.delivery_due, '%Y-%m-%d') AS delivery_due,
        DATE_FORMAT(e.follow_up_date, '%Y-%m-%d') AS follow_up_date
        FROM design_request_events e LEFT JOIN users u ON u.user_id = e.actor_id
        WHERE e.request_id = ? ORDER BY e.id DESC`, [row.id]);
    const [files] = await db.query(`SELECT f.id, f.event_id, f.name FROM design_request_files f
        JOIN design_request_events e ON e.id = f.event_id WHERE e.request_id = ? ORDER BY f.id DESC`, [row.id]);
    const link = await designProjectLink(db, row.id).catch(error => {
        if (error.code === "ER_NO_SUCH_TABLE") return null;
        throw error;
    });
    res.json({ ...row, ...link, access, actions: allowedActions(row, access), events, files });
}));

async function readOpenFollowUp(connection, requestId, id) {
    if (!Number.isSafeInteger(id) || id < 1) throw new DesignRequestError(400, "Select a follow-up.");
    const [[entry]] = await connection.query(`SELECT e.id,
        DATE_FORMAT(e.follow_up_date, '%Y-%m-%d') AS follow_up_date
        FROM design_request_events e
        WHERE e.request_id = ? AND e.id = ? AND ${openScheduledFollowUps}`, [requestId, id]);
    if (!entry) throw new DesignRequestError(409, "This follow-up is no longer open. Refresh and try again.");
    return entry;
}

function updateScheduledDate(connection, requestId, id, date) {
    return connection.query(
        "UPDATE design_request_events SET follow_up_date = ? WHERE id = ? AND request_id = ?",
        [date, id, requestId]
    );
}

function timelineDate(current, previous) {
    if (!current) return "Not set";
    return previous && previous !== current ? `${current} (was ${previous})` : current;
}

async function queueTimelineMail(connection, request, event, eventId, action, rescheduled) {
    const [openFollowUps] = await connection.query(`
        SELECT e.id, e.note AS name,
            DATE_FORMAT(e.follow_up_date, '%Y-%m-%d') AS date
        FROM design_request_events e
        WHERE e.request_id = ? AND ${openScheduledFollowUps}
        ORDER BY e.follow_up_date, e.id
    `, [request.id]);
    const scheduled = openFollowUps.map(followUp =>
        `- ${timelineDate(followUp.date, rescheduled.get(String(followUp.id)))}${followUp.name ? ` · ${followUp.name}` : ""}`);
    const details = [
        `Committed delivery: ${timelineDate(event.deliveryDue, request.delivery_due)}`,
        `Next follow-up: ${timelineDate(event.followDate, request.follow_up_date)}`,
        event.followNote && `Next follow-up details: ${event.followNote}`,
        scheduled.length ? ["Scheduled follow-ups:", ...scheduled].join("\n") : "Scheduled follow-ups: None",
        event.note && `Note: ${event.note}`,
    ].filter(Boolean).join("\n");
    const datesChanged = rescheduled.size || event.deliveryDue !== request.delivery_due ||
        event.followDate !== request.follow_up_date;
    const heading = action === "accept" ? "Design request accepted"
        : datesChanged ? "Design timeline revised" : "Design timeline confirmed";
    await queueDesignMail(connection, request, `timeline:${eventId}`, "both", heading, details);
}

router.post("/:id/actions", uploads, handle(async (req, res) => {
    const body = req.body || {};
    await inTransaction(async connection => {
        const departments = await getDepartments(connection, req.user);
        const row = await readRequest(connection, req.params.id, true);
        const access = row && accessTo(row, req.user, departments);
        if (!access || (!access.design && !access.requester)) throw new DesignRequestError(404, "Request not found.");
        if (Number(body.version) !== Number(row.version)) {
            throw new DesignRequestError(409, "This request changed. Review the latest details before saving again.");
        }
        const files = req.files || [];
        const event = transition(row, access, body.action, body, files);
        if (["accept", "start", "timeline", "complete"].includes(body.action) && acceptedStatuses.includes(event.status)) {
            const link = await registerDesignProject(connection, { ...row, status: event.status }, req.user.user_id, event.deliveryDue);
            if (link.generated_project && body.action !== "accept") {
                const status = { accepted: "not_started", in_progress: "ongoing", completed: "completed" }[event.status];
                await connection.query(`
                    UPDATE projects SET status = ?, due_date = COALESCE(?, due_date),
                    start_date = LEAST(start_date, COALESCE(?, due_date)),
                    completed_at = IF(? = 'completed', COALESCE(completed_at, NOW()), NULL),
                    overall_progress = IF(? = 'completed', 100, overall_progress), updated_at = NOW()
                    WHERE project_id = ?
                `, [status, event.deliveryDue, event.deliveryDue, status, status, link.project_id]);
            }
        }
        let log = event;
        let followUpContext;
        if (followUpLogActions.includes(body.action)) {
            const scheduled = await readOpenFollowUp(connection, row.id, Number(body.follow_up_id));
            followUpContext = scheduled.follow_up_date;
            const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
            log = makeFollowUpLog(event, scheduled, body.action, files, currentDate);
            if (body.action === "follow_reschedule") {
                await updateScheduledDate(connection, row.id, scheduled.id, event.rescheduledDate);
            }
        }
        if (updateMessageActions.includes(body.action)) {
            const scheduled = body.follow_up_id === undefined ? null
                : await readOpenFollowUp(connection, row.id, Number(body.follow_up_id));
            log = makeUpdateMessageLog(event, scheduled);
            followUpContext = scheduled?.follow_up_date;
        }

        const rescheduled = new Map();
        for (const change of event.scheduledDateChanges) {
            const scheduled = await readOpenFollowUp(connection, row.id, change.id);
            if (scheduled.follow_up_date === change.date) continue;
            const changeLog = makeFollowUpLog({ ...event, rescheduledDate: change.date }, scheduled, "follow_reschedule", [], null);
            await updateScheduledDate(connection, row.id, scheduled.id, change.date);
            await addEvent(connection, row.id, req.user.user_id, "follow_reschedule", changeLog, []);
            rescheduled.set(String(change.id), scheduled.follow_up_date);
        }
        await connection.query(
            `UPDATE design_requests SET status = ?, stage = ?, delivery_due = ?, follow_up_date = ?,
            follow_up_note = ?, draft_version = ?, version = version + 1 WHERE id = ?`,
            [event.status, event.stage, event.deliveryDue, event.followDate, event.followNote, event.draftVersion, row.id]
        );
        if (event.scheduled.length) {
            for (const followUp of event.scheduled) {
                const eventId = await addEvent(connection, row.id, req.user.user_id, "follow_scheduled",
                    { ...event, ...followUp }, []);
                await queueDesignMail(connection, row, `scheduled:${eventId}`, "both", "Design follow-up scheduled",
                    [`Follow-up date: ${followUp.followDate}`, followUp.note, followUp.followNote].filter(Boolean).join("\n"));
            }
        } else {
            const eventId = await addEvent(connection, row.id, req.user.user_id, body.action, log, files);
            const messages = {
                respond_update: ["requester", "Design Team update"],
                request_update: ["design", "Requester asked for an update"],
                reply: ["design", "New information for a design request"],
                ask: ["requester", "More information requested"],
                changes: ["design", "Design changes requested"],
                follow_update: ["requester", "New information added to a design follow-up"],
                follow_done: ["requester", "Design follow-up completed"],
                share: ["requester", "Design draft shared"],
                complete: ["requester", "Design request completed"],
            };
            if (Object.hasOwn(messages, body.action)) {
                const [audience, heading] = messages[body.action];
                await queueDesignMail(connection, row, `message:${eventId}`, audience, heading,
                    [event.completion ? [event.completion.description, `Done: ${event.completion.done}`, `Left: ${event.completion.left}`].join("\n") : event.note, followUpContext && `Follow-up date: ${followUpContext}`, files.length && `${files.length} file(s) added in RMS.`]
                        .filter(Boolean).join("\n\n"));
            }
            if (body.action === "follow_reschedule") {
                await queueDesignMail(connection, row, `scheduled-change:${eventId}`, "both", "Design follow-up rescheduled",
                    [`Previous date: ${followUpContext}`, `New date: ${event.rescheduledDate}`, event.note].filter(Boolean).join("\n"));
            }
            if (body.action === "accept" || body.action === "timeline") {
                await queueTimelineMail(connection, row, event, eventId, body.action, rescheduled);
            } else if (event.followDate && event.followDate !== row.follow_up_date) {
                await queueDesignMail(connection, row, `next-date:${eventId}`, "both", "Design follow-up date",
                    [`Follow-up date: ${event.followDate}`, event.followNote].filter(Boolean).join("\n"));
            }
        }
        const changes = getChangedRequestDates(row, event);
        if (changes.length) {
            await addEvent(connection, row.id, req.user.user_id, "dates_changed", {
                ...event,
                note: event.note,
                deliveryDue: null,
                followDate: null,
                followNote: JSON.stringify(changes),
            }, []);
        }
    });
    res.json({ success: true });
}));

router.get("/:id/files/:fileId", handle(async (req, res) => {
    const departments = await getDepartments(db, req.user);
    const row = await readRequest(db, req.params.id);
    const access = row && accessTo(row, req.user, departments);
    if (!access || (!access.design && !access.requester)) throw new DesignRequestError(404, "File not found.");
    const [[file]] = await db.query(`SELECT f.name, f.content FROM design_request_files f
        JOIN design_request_events e ON e.id = f.event_id WHERE f.id = ? AND e.request_id = ?`, [req.params.fileId, row.id]);
    if (!file) throw new DesignRequestError(404, "File not found.");
    res.set("Cache-Control", "private, no-store");
    res.attachment(file.name).type("application/octet-stream").send(file.content);
}));

router.use((error, req, res, next) => {
    if (error instanceof DesignRequestError) return res.status(error.status).json({ message: error.message });
    if (error instanceof multer.MulterError) return res.status(400).json({ message: "Uploads support up to 5 files, 10 MB per file." });
    if (error.code === "ER_NO_SUCH_TABLE") {
        if (/design_request_(project|task)_links/.test(error.message || "")) {
            return res.status(503).json({ message: "Apply the Design Request project links migration, then try again." });
        }
        if (error.message?.includes("design_request_email_outbox")) {
            return res.status(503).json({ message: "Apply the Design Request email migration, then try again." });
        }
        return res.status(503).json({ message: "The design requests database migration has not been applied." });
    }
    if (error.code === "ER_BAD_FIELD_ERROR" && error.message?.includes("generated_project")) {
        return res.status(503).json({ message: "Apply backend/sql/design_request_generated_projects.sql to the preview database." });
    }
    return next(error);
});

module.exports = router;
