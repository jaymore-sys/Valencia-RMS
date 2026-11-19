const assert = require("node:assert/strict");
const { test } = require("node:test");
const { allowedActions, transition, makeFollowUpLog, getChangedRequestDates, makeUpdateMessageLog } = require("../src/utils/designrequestworkflow");

const design = { design: true, requester: false };
const requester = { design: false, requester: true };
const follow = { follow_up_date: "2026-11-20", follow_up_note: "Share the next proof." };
const row = { stage: "review", status: "new", delivery_due: null, draft_version: 0 };
const draft = { ...row, stage: "draft", status: "in_progress", draft_version: 1 };
const file = { originalname: "proof.pdf" };

test("acceptance requires dates and preserves manual Start Work", () => {
    const dates = { ...follow, delivery_due: "2026-11-24" };
    const result = transition(row, design, "accept", dates, []);
    assert.equal(result.status, "accepted");
    assert.equal(result.stage, "ready");
    assert.throws(() => transition(row, design, "start", follow, []), { status: 409 });
    assert.throws(() => transition({ ...row, stage: "ready" }, requester, "start", follow, []), { status: 409 });
    assert.equal(transition({ ...row, stage: "ready", status: "accepted" }, design, "start", follow, []).status, "in_progress");
});

test("missing information moves to Pending and keeps the same request on reply", () => {
    const ask = transition(row, design, "ask", { ...follow, note: "Need the dieline." }, []);
    assert.equal(ask.status, "pending");
    const reply = transition({ ...row, stage: ask.stage, status: ask.status }, requester, "reply", { ...follow, note: "Attached." }, [file]);
    assert.equal(reply.status, "pending");
    assert.equal(reply.stage, "review");
    assert.ok(allowedActions({ ...row, stage: reply.stage }, design).includes("accept"));
});

test("each revision needs a dated next action and a newly shared draft", () => {
    assert.throws(() => transition(draft, requester, "changes", { note: "Move logo" }, []), { status: 400 });
    const changes = transition(draft, requester, "changes", { ...follow, note: "Move logo" }, [file]);
    assert.equal(changes.status, "in_progress");
    const revised = transition({ ...draft, stage: changes.stage }, design, "timeline",
        { ...follow, note: "Artwork change", delivery_due: "2026-11-27" }, []);
    assert.equal(revised.stage, "revise");
    assert.equal(revised.deliveryDue, "2026-11-27");
    const reviseRow = { ...draft, stage: revised.stage, delivery_due: revised.deliveryDue };
    assert.throws(() => transition(reviseRow, design, "share", follow, []), { status: 400 });
    const shared = transition(reviseRow, design, "share", follow, [file]);
    assert.equal(shared.draftVersion, 2);
    assert.equal(shared.deliveryDue, "2026-11-27");
    const updatedDraft = { ...reviseRow, stage: shared.stage, draft_version: shared.draftVersion };
    assert.throws(() => transition(updatedDraft, design, "complete", {}, []), { status: 409 });
    const approved = transition(updatedDraft, requester, "approve", follow, []);
    const completed = transition({ ...updatedDraft, stage: approved.stage }, design, "complete", {}, [file]);
    assert.equal(completed.status, "completed");
    assert.equal(completed.followDate, null);
});

test("rejects impossible dates and unauthorized actions", () => {
    assert.throws(() => transition(row, design, "accept",
        { ...follow, delivery_due: "2026-02-30" }, []), { status: 400 });
    assert.deepEqual(allowedActions(row, { requester: false, design: false }), []);
    assert.throws(() => transition(draft, design, "changes", follow, []), { status: 409 });
});

test("schedules multiple independent follow-ups without changing request status or delivery", () => {
    const accepted = {
        ...row, status: "accepted", stage: "ready",
        delivery_due: "2026-11-29", follow_up_date: "2026-11-21", follow_up_note: "Review the brief.",
    };
    const body = { follow_ups: JSON.stringify([
        { date: "2026-11-24", note: "Review first concept." },
        { date: "2026-11-26", note: "Confirm revisions." },
    ]) };
    const result = transition(accepted, design, "follow", body, []);
    assert.equal(result.status, "accepted");
    assert.equal(result.deliveryDue, "2026-11-29");
    assert.equal(result.followDate, "2026-11-21");
    assert.deepEqual(result.scheduled, [
        { followDate: "2026-11-24", note: null, followNote: "Review first concept." },
        { followDate: "2026-11-26", note: null, followNote: "Confirm revisions." },
    ]);
    assert.equal(transition(accepted, design, "follow_done", { description: "Review meeting", work_done: "Reviewed artwork" }, []).followDate, "2026-11-21");
    assert.throws(() => transition(accepted, requester, "follow", body, []), { status: 409 });
    assert.throws(() => transition({ ...accepted, stage: "closed" }, design, "follow_done", {}, []), { status: 409 });
    assert.throws(() => transition(accepted, design, "follow", { follow_ups: '[{"date":"2026-02-30","note":"Invalid"}]' }, []), { status: 400 });
});

test("named follow-ups store their own name and optional documentation note", () => {
    const entry = { date: "2026-11-24", name: "Artwork review" };
    const schedule = input => transition(row, design, "follow", { follow_ups: JSON.stringify([input]) }, []).scheduled;
    assert.deepEqual(schedule(entry), [{ followDate: entry.date, note: entry.name, followNote: null }]);
    assert.equal(schedule({ ...entry, note: "Bring the print proof." })[0].followNote, "Bring the print proof.");
    assert.throws(() => schedule({ ...entry, name: " ", note: "A note" }), { status: 400 });
});

test("requester questions and design updates preserve dates and can be scoped to a follow-up", () => {
    const working = { ...draft, stage: "working", delivery_due: "2026-11-29", ...follow };
    const question = { note: "Can you share the latest artwork?" };
    const asked = transition(working, requester, "request_update", question, [file]);
    assert.equal(asked.status, working.status);
    assert.equal(asked.stage, working.stage);
    assert.equal(asked.deliveryDue, working.delivery_due);
    assert.equal(asked.followDate, working.follow_up_date);
    assert.equal(asked.followNote, working.follow_up_note);
    const requestMessage = makeUpdateMessageLog(asked, null);
    assert.equal(requestMessage.note, null);
    assert.equal(requestMessage.followNote, question.note);
    assert.equal(requestMessage.followDate, null);
    const replied = transition(working, design, "respond_update", { note: "See the attached proof." }, [file]);
    const followUpMessage = makeUpdateMessageLog(replied, { id: 7, follow_up_date: "2026-11-30" });
    assert.equal(followUpMessage.note, "7");
    assert.equal(followUpMessage.followNote, replied.note);
    assert.throws(() => transition(working, requester, "respond_update", question, []), { status: 409 });
    assert.throws(() => transition(working, design, "request_update", question, []), { status: 409 });
    assert.throws(() => transition(working, requester, "request_update", {}, [file]), { status: 400 });
    assert.throws(() => transition({ ...working, stage: "closed" }, requester, "request_update", question, []), { status: 409 });
});

test("starts work with a single confirmation and uses the question as the information follow-up note", () => {
    const accepted = { ...row, status: "accepted", stage: "ready", follow_up_date: "2026-11-20" };
    const started = transition(accepted, design, "start", {}, []);
    assert.equal(started.status, "in_progress");
    assert.equal(started.followDate, accepted.follow_up_date);
    const asked = transition(row, design, "ask", { follow_up_date: "2026-11-20", note: "Send pack dimensions." }, []);
    assert.equal(asked.followNote, "Send pack dimensions.");
});

test("attendance actions are retired and only design admins can document follow-ups", () => {
    for (const access of [design, requester]) {
        for (const action of ["follow_invite", "follow_attend"]) {
            assert.equal(allowedActions(row, access).includes(action), false);
            assert.throws(() => transition(row, access, action, {}, []), { status: 409 });
        }
    }
    assert.throws(() => transition(row, requester, "follow_update", {}, [file]), { status: 409 });
    assert.throws(() => transition(row, requester, "follow_done", {}, []), { status: 409 });
});

test("records changes to committed delivery and the request follow-up date", () => {
    const before = { delivery_due: "2026-11-25", follow_up_date: "2026-11-21" };
    assert.deepEqual(getChangedRequestDates(before, { deliveryDue: "2026-11-27", followDate: "2026-11-23" }), [
        { field: "delivery_due", previous: "2026-11-25", current: "2026-11-27" },
        { field: "follow_up_date", previous: "2026-11-21", current: "2026-11-23" },
    ]);
    assert.deepEqual(getChangedRequestDates(before, { deliveryDue: before.delivery_due, followDate: null }), []);
});

test("reschedules a single open follow-up and records its previous date and reason", () => {
    const scheduled = { id: 7, follow_up_date: "2026-11-24" };
    const body = { rescheduled_date: "2026-11-26", note: "Awaiting the approved brief" };
    const event = transition(row, design, "follow_reschedule", body, []);
    const log = makeFollowUpLog(event, scheduled, "follow_reschedule", [], "2026-11-23");
    assert.equal(log.note, "7");
    assert.deepEqual(JSON.parse(log.followNote), {
        previous: "2026-11-24", current: "2026-11-26", reason: "Awaiting the approved brief",
    });
    assert.throws(() => transition(row, requester, "follow_reschedule", body, []), { status: 409 });
    assert.throws(() => makeFollowUpLog({ ...event, rescheduledDate: scheduled.follow_up_date },
        scheduled, "follow_reschedule", [], "2026-11-23"), { status: 400 });
});

test("design admin can document and complete a due follow-up with multiple files", () => {
    const scheduled = { id: 8, follow_up_date: "2026-11-24" };
    const files = [file, { originalname: "review.png" }];
    const logged = transition(row, design, "follow_update", { note: "Reviewed proof." }, files);
    assert.throws(() => makeFollowUpLog(logged, scheduled, "follow_update", files, "2026-11-23"), { status: 409 });
    assert.equal(makeFollowUpLog(logged, scheduled, "follow_update", files, "2026-11-24").followNote, "Reviewed proof.");
    assert.throws(() => makeFollowUpLog({ ...logged, note: null }, scheduled, "follow_update", [], "2026-11-25"), { status: 400 });
    assert.throws(() => transition(row, design, "follow_done", {}, files), { status: 400 });
    const done = transition(row, design, "follow_done", {
        description: "Review meeting", work_done: "Approved artwork", work_left: "Prepare print files",
    }, files);
    const log = makeFollowUpLog(done, scheduled, "follow_done", files, "2026-11-25");
    assert.equal(log.note, "8");
    assert.deepEqual(JSON.parse(log.followNote), {
        kind: "follow_up_completion", description: "Review meeting",
        done: "Approved artwork", left: "Prepare print files",
    });
    assert.equal(log.status, row.status);
});

test("timeline accepts multiple scheduled dates and preserves the next follow-up when omitted", () => {
    const accepted = { ...row, status: "accepted", stage: "ready",
        delivery_due: "2026-11-25", follow_up_date: "2026-11-21", follow_up_note: "Review brief" };
    const dates = [{ id: 7, date: "2026-11-24" }, { id: 8, date: "2026-11-27" }];
    const body = { delivery_due: accepted.delivery_due, note: "Updated review plan",
        scheduled_date_changes: JSON.stringify(dates) };
    const event = transition(accepted, design, "timeline", body, []);
    assert.deepEqual(event.scheduledDateChanges, dates);
    assert.equal(event.followDate, accepted.follow_up_date);
    assert.equal(event.followNote, accepted.follow_up_note);
    assert.equal(event.status, "accepted");
    assert.throws(() => transition(accepted, requester, "timeline", body, []), { status: 409 });
    for (const invalid of [[dates[0], dates[0]], [{ id: 7, date: "2026-02-30" }]]) {
        assert.throws(() => transition(accepted, design, "timeline", {
            ...body, scheduled_date_changes: JSON.stringify(invalid),
        }, []), { status: 400 });
    }
});
