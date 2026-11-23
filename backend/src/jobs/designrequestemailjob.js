const cron = require("node-cron");
const db = require("../config/db");
const { sendMail } = require("../utils/emailservice");

const zone = "Asia/Kolkata";
const indiaDate = new Intl.DateTimeFormat("en-CA", { timeZone: zone });
const escapeHtml = value => String(value).replace(/[&<>"']/g, char =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const rmsUrl = (process.env.RMS_PUBLIC_URL || 'https://myvol.in').replace(/\/+$/, '');
function designRequestUrl(id, fileId) {
    const suffix = fileId ? `?fileId=${encodeURIComponent(fileId)}` : '';
    return `${rmsUrl}/design-request/${encodeURIComponent(id)}${suffix}`;
}
function prettyDate(value) { return value || 'Not set'; }
function designEmailHtml(entry, request, files) {
    const lines = entry.message.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    // Existing brief is already captured in the message. Render each question/answer pair.
    const detailLines = lines.filter((line, i) => i > 1);
    const rows = [];
    for (let i = 0; i < detailLines.length; i++) {
        const line = detailLines[i];
        const colon = line.indexOf(':');
        if (colon > 0 && colon < 65 && line.slice(colon + 1).trim()) {
            rows.push([line.slice(0, colon), line.slice(colon + 1)]);
        } else if (line.endsWith('?') && i + 1 < detailLines.length) {
            rows.push([line, detailLines[++i]]);
        } else if (i + 1 < detailLines.length && /^(Design request type|Additional brief|Is |Are |What |How |Do |Does |Which |Needed by)$/i.test(line)) {
            rows.push([line, detailLines[++i]]);
        } else {
            rows.push(['Details', line]);
        }
    }
    const cell = 'padding:11px 14px;border-bottom:1px solid #e8edf4;font-size:13px;vertical-align:top;';
    const row = (key, value) => `<tr><th scope="row" style="${cell}width:39%;background:#f8fafc;color:#526075;text-align:left;font-weight:600">${escapeHtml(key)}</th><td style="${cell}color:#16243b;white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(value ?? '-')}</td></tr>`;
    const details = rows.map(pair => row(...pair)).join('');
    const attachments = files.length ? files.map(file => {
        const url = designRequestUrl(request.id, file.id);
        return `<tr><td style="${cell}"><span style="color:#19253d">📎 ${escapeHtml(file.name)}</span></td><td style="${cell}text-align:right"><a href="${escapeHtml(url)}" style="color:#ad3c20;font-weight:600;text-decoration:none">Download file</a></td></tr>`;
    }).join('') : `<tr><td style="${cell}color:#66758b" colspan="2">No files attached to this request.</td></tr>`;
    const metadata = [
        ['Request ID', `#${request.id}`], ['Category', request.category],
        ['Requested by', [request.requester_name, request.requester_department].filter(Boolean).join(' · ')],
        ['Needed by', prettyDate(request.needed_by)],
        ['Committed delivery', prettyDate(request.delivery_due)],
        ['Next follow-up', prettyDate(request.follow_up_date)],
        ['Current status', (request.status || 'new').replace(/_/g, ' ')],
    ].map(pair => row(...pair)).join('');
    const href = designRequestUrl(request.id);
    const heading = entry.subject.split(' | ')[0];
    return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:24px;background:#f5f6fa;font-family:Arial,Helvetica,sans-serif;color:#18243a">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
      <table role="presentation" width="100%" style="max-width:680px;background:#fff;border:1px solid #e6e9ef;border-radius:14px;overflow:hidden" cellspacing="0" cellpadding="0">
      <tr><td style="background:#ffffff;color:#172139;padding:25px 30px;border-bottom:4px solid #ad3c20"><div style="font-size:13px;letter-spacing:1.6px;font-weight:bold;color:#ad3c20">VALENCIA RMS</div><div style="font-size:24px;font-weight:700;margin-top:10px">${escapeHtml(heading)}</div><div style="font-size:14px;color:#4f5d72;margin-top:8px">${escapeHtml(request.title)}</div></td></tr>
      <tr><td style="padding:26px 30px"><h2 style="font-size:17px;margin:0 0 12px">Request summary</h2><table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e8edf4">${metadata}</table>
      <h2 style="font-size:17px;margin:26px 0 12px">Request details and updates</h2><table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e8edf4">${details || row('Details','Open the request in RMS to view its discussion.')}</table>
      <h2 style="font-size:17px;margin:26px 0 12px">Attached files (${files.length})</h2><table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e8edf4">${attachments}</table>
      <div style="margin-top:28px;text-align:center"><a href="${escapeHtml(href)}" style="display:inline-block;background:#ad3c20;color:white;text-decoration:none;border-radius:9px;padding:15px 25px;font-size:15px;font-weight:bold">View Request in Valencia RMS</a></div>
      <p style="color:#6a7789;font-size:12px;line-height:1.6;text-align:center;margin:19px 0 0">Sign in with your RMS account if prompted. File downloads require access to this request.</p></td></tr>
      <tr><td style="background:#f8fafc;border-top:1px solid #e6e9ef;padding:18px 30px;color:#718095;font-size:12px">Valencia Nutrition · Design Request Notifications</td></tr>
      </table></td></tr></table></body></html>`;
}

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
            SELECT delivery_key, request_id, recipient_email, subject, message FROM design_request_email_outbox
            WHERE sent_at_utc IS NULL AND available_at_utc <= UTC_TIMESTAMP() AND attempts < 12
            ORDER BY available_at_utc, delivery_key LIMIT 25`);
        for (const entry of entries) {
            let failure = null;
            try {
                const [[request]] = await connection.query(`
                    SELECT q.id, q.title, q.category, q.status,
                        DATE_FORMAT(q.needed_by, '%d %b %Y') AS needed_by,
                        DATE_FORMAT(q.delivery_due, '%d %b %Y') AS delivery_due,
                        DATE_FORMAT(q.follow_up_date, '%d %b %Y') AS follow_up_date,
                        u.full_name AS requester_name,
                        d.department_name AS requester_department
                    FROM design_requests q
                    LEFT JOIN users u ON u.user_id = q.requester_id
                    LEFT JOIN departments d ON d.department_id = q.requester_department_id
                    WHERE q.id = ?`, [entry.request_id]);
                if (!request) throw new Error('Design request not found for email.');
                const [files] = await connection.query(`
                    SELECT f.id, f.name, e.action FROM design_request_files f
                    JOIN design_request_events e ON e.id = f.event_id
                    WHERE e.request_id = ? ORDER BY f.id ASC`, [entry.request_id]);
                const result = await sendMail({
                    to: entry.recipient_email,
                    subject: entry.subject,
                    text: entry.message + '\n\nOpen request: ' + designRequestUrl(entry.request_id),
                    html: designEmailHtml(entry, request, files),
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
