const cron = require("node-cron");
const db = require("../config/db");
const { sendMail } = require("../utils/emailservice");

const zone = "Asia/Kolkata";
const indiaDate = new Intl.DateTimeFormat("en-CA", { timeZone: zone });
const escapeHtml = value => String(value).replace(/[&<>"']/g, char =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

async function queueDesignMail(connection, request, key, audience, heading, details) {
    const recipients = new Map();
    if (audience !== "design") {
        const [[requester]] = await connection.query(
            "SELECT user_id, email FROM users WHERE user_id = ? AND email IS NOT NULL AND email <> ''",
            [request.requester_id]
        );
        if (requester) recipients.set(requester.email.trim().toLowerCase(), requester);
    }
    if (audience !== "requester") {
        const [team] = await connection.query(`
            SELECT u.user_id, u.email FROM users u JOIN roles r ON r.role_id = u.role_id
            WHERE r.role_name = 'admin' AND u.email IS NOT NULL AND u.email <> ''
            AND (u.department_id = ? OR EXISTS (
                SELECT 1 FROM user_departments ud WHERE ud.user_id = u.user_id AND ud.department_id = ?
            ))
            ORDER BY u.user_id`, [request.owner_department_id, request.owner_department_id]);
        for (const user of team) {
            const email = user.email.trim().toLowerCase();
            if (!recipients.has(email)) recipients.set(email, user);
        }
    }
    const rows = Array.from(recipients, ([email, user]) => [
        `${key}:${user.user_id}`, request.id, email,
        `${heading} | ${request.title}`.replace(/[\r\n]+/g, " ").slice(0, 240),
        [request.title, `Design request #${request.id}`, details, "Open the design request in Valencia RMS to view the full discussion and files."].filter(Boolean).join("\n\n"),
    ]).filter(row => row[2]);
    if (!rows.length) return;
    const placeholders = rows.map(() => "(?, ?, ?, ?, ?, UTC_TIMESTAMP())").join(", ");
    await connection.query(`
        INSERT INTO design_request_email_outbox
          (delivery_key, request_id, recipient_email, subject, message, available_at_utc)
        VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE delivery_key = VALUES(delivery_key)`, rows.flat());
}

async function queueDueFollowUps(connection, date) {
    const [nextFollowUps] = await connection.query(`
        SELECT id, title, requester_id, owner_department_id,
               'next' AS follow_key, NULL AS follow_name, follow_up_note AS follow_note
        FROM design_requests
        WHERE follow_up_date = ? AND status NOT IN ('completed', 'rejected')
    `, [date]);
    const [scheduledFollowUps] = await connection.query(`
        SELECT q.id, q.title, q.requester_id, q.owner_department_id,
               e.id AS follow_key, e.note AS follow_name, e.follow_up_note AS follow_note
        FROM design_requests q JOIN design_request_events e ON e.request_id = q.id
        WHERE e.follow_up_date = ? AND e.action = 'follow_scheduled'
        AND q.status NOT IN ('completed', 'rejected')
        AND NOT EXISTS (
            SELECT 1 FROM design_request_events d
            WHERE d.request_id = q.id AND d.action = 'follow_done'
            AND CAST(d.note AS BINARY) = CAST(e.id AS BINARY)
        )
    `, [date]);
    for (const request of [...nextFollowUps, ...scheduledFollowUps]) {
        const details = [`Follow-up date: ${date}`, request.follow_name, request.follow_note].filter(Boolean).join("\n");
        await queueDesignMail(connection, request, `due:${request.id}:${request.follow_key}:${date}`,
            "both", "Design follow-up scheduled today", details);
    }
}

async function processDesignRequestEmails() {
    const connection = await db.getConnection();
    let locked = false;
    try {
        const [[result]] = await connection.query("SELECT GET_LOCK('valencia_rms_design_email_v1', 0) AS acquired");
        locked = Number(result.acquired) === 1;
        if (!locked) return;

        const now = new Date();
        const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }).format(now));
        let reminderError;
        if (hour >= 9) {
            try {
                await queueDueFollowUps(connection, indiaDate.format(now));
            } catch (error) {
                reminderError = error;
            }
        }

        const [entries] = await connection.query(`
            SELECT delivery_key, recipient_email, subject, message FROM design_request_email_outbox
            WHERE sent_at_utc IS NULL AND available_at_utc <= UTC_TIMESTAMP() AND attempts < 12
            ORDER BY available_at_utc, delivery_key LIMIT 25`);
        for (const entry of entries) {
            let failure = null;
            try {
                const result = await sendMail({
                    to: entry.recipient_email,
                    subject: entry.subject,
                    text: entry.message,
                    html: `<div style="font-family:Arial,sans-serif;line-height:1.55;white-space:pre-wrap">${escapeHtml(entry.message)}</div>`,
                });
                if (result.skipped) failure = result.message;
            } catch (error) {
                failure = error.message || "Email delivery failed.";
            }
            if (failure) {
                await connection.query(`
                    UPDATE design_request_email_outbox
                    SET attempts = attempts + 1, last_error = ?, available_at_utc = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)
                    WHERE delivery_key = ?`, [failure.slice(0, 500), entry.delivery_key]);
            } else {
                await connection.query(`
                    UPDATE design_request_email_outbox SET sent_at_utc = UTC_TIMESTAMP(), last_error = NULL
                    WHERE delivery_key = ?`, [entry.delivery_key]);
            }
        }
        if (reminderError) throw reminderError;
    } finally {
        try {
            if (locked) await connection.query("SELECT RELEASE_LOCK('valencia_rms_design_email_v1')");
        } finally {
            connection.release();
        }
    }
}

function startDesignRequestEmailJob() {
    cron.schedule("* * * * *", () => processDesignRequestEmails().catch(error =>
        console.error("Design request email job:", error.message)), { timezone: zone });
}

module.exports = { queueDesignMail, processDesignRequestEmails, startDesignRequestEmailJob };
