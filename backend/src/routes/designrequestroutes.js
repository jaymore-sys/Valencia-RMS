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

const router = express.Router();
const uploads = multer({
    storage: multer.memoryStorage(),
    limits: { files: 5, fileSize: 10 * 1024 * 1024, fields: 12, fieldSize: 16000, parts: 17 },
}).array("files", 5);

router.use(authenticate, requireRole("admin", "administrator", "superadmin"));

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

    const id = await inTransaction(async connection => {
        const owner = await defaultDepartment(connection);
        if (!owner) throw new DesignRequestError(503, "The Design Team inbox has not been configured.");
        const departments = await getDepartments(connection, req.user);
        const [result] = await connection.query(
            `INSERT INTO design_requests (requester_id, requester_department_id, owner_department_id,
            category, title, brief, needed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.user.user_id, departments[0] || null, owner, body.category, title, brief, neededBy]
        );
        await addEvent(connection, result.insertId, req.user.user_id, "submit", {
            note: null, deliveryDue: null, followDate: null,
            followNote: attachmentLabels.length ? JSON.stringify({ attachmentLabels }) : null, draftVersion: 0,
        }, files);
        await queueDesignMail(connection, {
            id: result.insertId, requester_id: req.user.user_id, owner_department_id: owner, title,
        }, `submitted:${result.insertId}`, "design", "New design request",
        [neededBy && `Needed by: ${neededBy}`, brief].filter(Boolean).join("\n\n"));
        return result.insertId;
    });
    res.status(201).json({ id });
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
    res.json({ ...row, access, actions: allowedActions(row, access), events, files });
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

        for (const change of event.scheduledDateChanges) {
            const scheduled = await readOpenFollowUp(connection, row.id, change.id);
            if (scheduled.follow_up_date === change.date) continue;
            const changeLog = makeFollowUpLog({ ...event, rescheduledDate: change.date }, scheduled, "follow_reschedule", [], null);
            await updateScheduledDate(connection, row.id, scheduled.id, change.date);
            const changeId = await addEvent(connection, row.id, req.user.user_id, "follow_reschedule", changeLog, []);
            await queueDesignMail(connection, row, `scheduled-change:${changeId}`, "both",
                "Design follow-up rescheduled", `Previous date: ${scheduled.follow_up_date}\nNew date: ${change.date}\n${event.note || ""}`);
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
                    [`New date: ${event.rescheduledDate}`, event.note].filter(Boolean).join("\n"));
            }
            if (event.followDate && event.followDate !== row.follow_up_date) {
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
        if (error.message?.includes("design_request_email_outbox")) {
            return res.status(503).json({ message: "Apply the Design Request email migration, then try again." });
        }
        return res.status(503).json({ message: "The design requests database migration has not been applied." });
    }
    return next(error);
});

module.exports = router;
