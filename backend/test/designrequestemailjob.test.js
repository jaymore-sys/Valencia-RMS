const assert = require("node:assert/strict");
const { test } = require("node:test");
const db = require("../src/config/db");
const mail = require("../src/utils/emailservice");

test("Design reminders start at 9 a.m. IST and a reminder query failure does not block the outbox", async t => {
    const sent = [];
    t.mock.method(mail, "sendMail", async message => {
        sent.push(message);
        return { skipped: false };
    });
    const { processDesignRequestEmails } = require("../src/jobs/designrequestemailjob");
    const outbox = new Map();
    const request = { id: 12, requester_id: 8, owner_department_id: 2, title: "Design pilot" };
    let reminderQueries = 0;
    let failReminders = false;
    const connection = {
        release() {},
        async query(sql, args) {
            if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
            if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
            if (sql.includes("AS follow_key")) {
                reminderQueries++;
                assert.deepEqual(args, ["2026-11-21"]);
                if (failReminders) throw new Error("Simulated reminder query failure");
                if (sql.includes("JOIN design_request_events")) {
                    assert.match(sql, /CAST\(d.note AS BINARY\) = CAST\(e.id AS BINARY\)/);
                    return [[{ ...request, follow_key: 15, follow_name: "Packaging check" }]];
                }
                return [[{ ...request, follow_key: "next", follow_note: "Review artwork" }]];
            }
            if (sql.includes("SELECT user_id, email")) return [[{ user_id: 8, email: "requester@example.invalid" }]];
            if (sql.includes("SELECT u.user_id, u.email")) return [[{ user_id: 7, email: "design@example.invalid" }]];
            if (sql.includes("INSERT INTO design_request_email_outbox")) {
                for (let i = 0; i < args.length; i += 5) {
                    const [delivery_key, , recipient_email, subject, message] = args.slice(i, i + 5);
                    if (!outbox.has(delivery_key)) outbox.set(delivery_key, { delivery_key, recipient_email, subject, message });
                }
                return [{}];
            }
            if (sql.includes("SELECT delivery_key")) return [[...outbox.values()].filter(entry => !entry.sent)];
            if (sql.includes("SET sent_at_utc")) {
                outbox.get(args[0]).sent = true;
                return [{}];
            }
            throw new Error("Unexpected SQL in test");
        },
    };
    t.mock.method(db, "getConnection", async () => connection);
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-21T03:29:00Z") });
    await processDesignRequestEmails();
    assert.equal(reminderQueries, 0);

    t.mock.timers.setTime(Date.parse("2026-11-21T03:30:00Z"));
    await processDesignRequestEmails();
    assert.equal(sent.length, 4);
    assert.ok(sent.every(message => message.text.includes("Follow-up date: 2026-11-21")));
    await processDesignRequestEmails();
    assert.equal(sent.length, 4);

    outbox.set("acceptance", {
        delivery_key: "acceptance", recipient_email: "requester@example.invalid",
        subject: "Design request accepted", message: "Already queued",
    });
    failReminders = true;
    await assert.rejects(processDesignRequestEmails, /Simulated reminder query failure/);
    assert.equal(sent.at(-1).subject, "Design request accepted");
    assert.equal(outbox.get("acceptance").sent, true);
});
