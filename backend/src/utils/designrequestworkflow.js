const categories = ["packaging", "label", "logo", "rd_tables", "other"];

const activeStages = ["review", "info", "ready", "working", "draft", "changes", "revise", "approved"];
const followUpLogActions = ["follow_update", "follow_done", "follow_reschedule"];
const updateMessageActions = ["request_update", "respond_update"];

const actions = {
    ask: { role: "design", stages: ["review"], status: "pending", stage: "info", note: true, follow: true },
    reply: { role: "requester", stages: ["info"], stage: "review", note: true, follow: true, files: true },
    accept: { role: "design", stages: ["review"], status: "accepted", stage: "ready", delivery: true, follow: true },
    reject: { role: "design", stages: ["review"], status: "rejected", stage: "closed", note: true },
    start: { role: "design", stages: ["ready"], status: "in_progress", stage: "working", preserveFollow: true },
    share: { role: "design", stages: ["working", "revise"], stage: "draft", follow: true, files: true },
    changes: { role: "requester", stages: ["draft"], stage: "changes", note: true, follow: true, files: true },
    confirm: { role: "design", stages: ["changes"], stage: "revise", follow: true },
    timeline: { role: "design", stages: ["ready", "working", "draft", "changes", "revise"], delivery: true, follow: true, note: true },
    follow: { role: "design", stages: activeStages, preserveFollow: true },
    follow_update: { role: "design", stages: activeStages, preserveFollow: true, files: true },
    follow_reschedule: { role: "design", stages: activeStages, preserveFollow: true, note: true },
    follow_done: { role: "design", stages: activeStages, preserveFollow: true, files: true },
    request_update: { role: "requester", stages: activeStages, preserveFollow: true, note: true, files: true },
    respond_update: { role: "design", stages: activeStages, preserveFollow: true, note: true, files: true },
    approve: { role: "requester", stages: ["draft"], stage: "approved", follow: true },
    complete: { role: "design", stages: ["approved"], status: "completed", stage: "closed", files: true },
};

class DesignRequestError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function readText(value, label, max, required = false) {
    const text = typeof value === "string" ? value.trim() : "";
    if ((required && !text) || text.length > max) {
        throw new DesignRequestError(400, `${label} must contain ${required ? "1 to" : "at most"} ${max} characters.`);
    }
    return text || null;
}

function readDate(value, label, required = false) {
    if (!value && !required) return null;
    const parsed = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value) : null;
    if (!parsed || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value || value < "1000-01-01") {
        throw new DesignRequestError(400, `Enter a valid ${label}.`);
    }
    return value;
}

function readFollowUps(body) {
    let entries;
    try {
        entries = body.follow_ups === undefined && body.follow_up_date
            ? [{ date: body.follow_up_date, note: body.follow_up_note }]
            : JSON.parse(body.follow_ups);
    } catch {
        throw new DesignRequestError(400, "Enter at least one follow-up.");
    }
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 10) {
        throw new DesignRequestError(400, "Add 1 to 10 follow-ups at a time.");
    }
    return entries.map(entry => ({
        followDate: readDate(entry?.date, "follow-up date", true),
        note: readText(entry?.name, "Follow-up name", 160, entry?.name !== undefined),
        followNote: readText(entry?.note, "Follow-up note", 1000, entry?.name === undefined),
    }));
}

function readScheduledDateChanges(value) {
    if (value === undefined) return [];
    let entries;
    try {
        entries = JSON.parse(value);
    } catch {
        throw new DesignRequestError(400, "Invalid scheduled follow-up dates.");
    }
    if (!Array.isArray(entries)) throw new DesignRequestError(400, "Invalid scheduled follow-up dates.");

    const ids = new Set();
    return entries.map(entry => {
        const id = entry?.id;
        if (!Number.isSafeInteger(id) || id < 1 || ids.has(id)) {
            throw new DesignRequestError(400, "Select each scheduled follow-up only once.");
        }
        ids.add(id);
        return { id, date: readDate(entry.date, "new follow-up date", true) };
    });
}

function allowedActions(row, access) {
    return Object.keys(actions).filter(key => {
        const action = actions[key];
        return access[action.role] && action.stages.includes(row.stage);
    });
}

function transition(row, access, action, body, files) {
    if (!allowedActions(row, access).includes(action)) {
        throw new DesignRequestError(409, "That action is unavailable for this request. Refresh and check its latest status.");
    }
    const rule = actions[action];
    if ((files.length && !rule.files) || (action === "share" && !files.length)) {
        throw new DesignRequestError(400, action === "share" ? "Attach at least one draft file." : "This action does not accept files.");
    }
    const stage = action === "timeline" && row.stage === "changes" ? "revise" : rule.stage || row.stage;
    const reviseNextFollowUp = action !== "timeline" || Boolean(body.follow_up_date);
    const followDate = rule.follow && reviseNextFollowUp ? readDate(body.follow_up_date, "follow-up date", true) : null;
    const followNote = rule.follow && reviseNextFollowUp ? (
        action === "ask" ? readText(body.note, "Information needed", 4000, true)
            : readText(body.follow_up_note, "What to share or do", 1000, true)
    ) : null;
    const preserveFollow = rule.preserveFollow || !reviseNextFollowUp;
    return {
        status: rule.status || row.status,
        stage,
        note: readText(body.note, "Details", 4000, rule.note),
        deliveryDue: rule.delivery ? readDate(body.delivery_due, "delivery date", true) : row.delivery_due,
        followDate: preserveFollow ? row.follow_up_date ?? null : followDate,
        followNote: preserveFollow ? row.follow_up_note ?? null : followNote,
        scheduled: action === "follow" ? readFollowUps(body) : [],
        scheduledDateChanges: action === "timeline" ? readScheduledDateChanges(body.scheduled_date_changes) : [],
        rescheduledDate: action === "follow_reschedule" ? readDate(body.rescheduled_date, "new follow-up date", true) : null,
        completion: action === "follow_done" ? {
            kind: "follow_up_completion",
            description: readText(body.description, "Description", 4000, true),
            done: readText(body.work_done, "What’s done", 4000, true),
            left: readText(body.work_left, "What’s left", 4000) || "None",
        } : null,
        draftVersion: row.draft_version + Number(action === "share"),
    };
}

function getChangedRequestDates(row, event) {
    return [
        { field: "delivery_due", previous: row.delivery_due, current: event.deliveryDue },
        { field: "follow_up_date", previous: row.follow_up_date, current: event.followDate },
    ].filter(({ previous, current }) => previous && current && previous !== current);
}

function makeFollowUpLog(event, scheduled, action, files, currentDate) {
    if ((action === "follow_update" || files.length > 0) && scheduled.follow_up_date > currentDate) {
        throw new DesignRequestError(409, "You can document this follow-up on or after its scheduled date.");
    }
    if (action === "follow_update" && !event.note && !files.length) {
        throw new DesignRequestError(400, "Add a note or attach at least one file.");
    }
    const rescheduled = action === "follow_reschedule";
    if (rescheduled && scheduled.follow_up_date === event.rescheduledDate) {
        throw new DesignRequestError(400, "Choose a different follow-up date.");
    }
    const details = rescheduled ? {
        previous: scheduled.follow_up_date,
        current: event.rescheduledDate,
        reason: event.note,
    } : event.completion;
    return {
        ...event,
        note: String(scheduled.id),
        followDate: null,
        followNote: details ? JSON.stringify(details) : event.note,
    };
}

function makeUpdateMessageLog(event, scheduled) {
    return { ...event, note: scheduled ? String(scheduled.id) : null, followDate: null, followNote: event.note };
}

module.exports = { categories, DesignRequestError, readText, readDate, allowedActions, transition, followUpLogActions, makeFollowUpLog, getChangedRequestDates, updateMessageActions, makeUpdateMessageLog };
