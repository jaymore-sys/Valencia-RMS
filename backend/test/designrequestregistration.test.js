const assert = require("node:assert/strict");
const { test } = require("node:test");
const express = require("express");

const db = require("../src/config/db");
const authPath = require.resolve("../src/middleware/authmiddleware");
require(authPath);
require.cache[authPath].exports = (req, res, next) => {
    req.user = req.get("X-Test-Requester")
        ? { user_id: 8, department_id: 3, role_name: "admin" }
        : { user_id: 7, department_id: 2, role_name: "admin" };
    next();
};
const router = require("../src/routes/designrequestroutes");

test("Design routes register work on acceptance and recover older requests once", async () => {
    const rows = {
        1: { id: 1, owner_department_id: 2, title: "New request", status: "new", stage: "review" },
        2: { id: 2, owner_department_id: 2, title: "Linked request", status: "new", stage: "review" },
        3: { id: 3, owner_department_id: 2, title: "cb", status: "in_progress", stage: "working" },
        4: { id: 4, owner_department_id: 2, title: "Failed registration", status: "new", stage: "review" },
        5: { id: 5, owner_department_id: 3, title: "Another department", status: "in_progress", stage: "working" },
    };
    for (const row of Object.values(rows)) {
        Object.assign(row, { requester_id: 8, version: 1, brief: "Brief", created_at: "2026-11-21", draft_version: 0 });
    }
    const links = { 2: { project_id: 100, generated_project: 0 } };
    const projects = { 100: { project_id: 100, status: "completed" } };
    let snapshot;
    let nextProject = 101;
    let lastRequest;
    const queued = [];
    const scheduledFollowUp = { id: 15, name: "Proof check", date: "2026-11-24" };
    let rollbacks = 0;
    const team = new Map();
    const assigned = [];
    const mainTasks = [];
    const people = [{ user_id: 7, full_name: "Design admin" }, { user_id: 9, full_name: "Designer" },
        { user_id: 10, full_name: "Another designer" }];

    const connection = {
        async beginTransaction() { snapshot = structuredClone({ rows, links, projects }); },
        async commit() { snapshot = null; },
        async rollback() {
            for (const [key, object] of Object.entries({ rows, links, projects })) {
                for (const id of Object.keys(object)) delete object[id];
                Object.assign(object, snapshot[key]);
            }
            rollbacks++;
        },
        release() {},
        async query(sql, args) {
            if (sql.includes("SELECT department_id FROM user_departments")) return [[]];
            if (sql.includes("FROM departments WHERE")) return [[{ department_id: 2 }]];
            if (sql.includes("owner_department.department_name AS owner_department") && sql.includes("q.id = ?")) {
                lastRequest = Number(args[0]);
                return [[rows[lastRequest] && { ...rows[lastRequest] }]];
            }
            if (sql.includes("AND l.request_id IS NULL")) {
                return [Object.values(rows).filter(row =>
                    row.owner_department_id === args[0] && args[1].includes(row.status) && !links[row.id])];
            }
            if (sql.includes("FROM design_request_project_links WHERE request_id")) return [[links[args[0]]]];
            if (sql.includes("INSERT INTO projects")) {
                const id = nextProject++;
                projects[id] = { project_id: id, status: args[4] };
                return [{ insertId: id }];
            }
            if (sql.includes("INSERT INTO design_request_project_links")) {
                if (lastRequest === 4) throw new Error("Simulated link failure");
                links[args[0]] = { project_id: args[1], generated_project: 1 };
                return [{}];
            }
            if (sql.includes("UPDATE projects SET status")) {
                projects[args[5]].status = args[0];
                return [{}];
            }
            if (sql.includes("UPDATE design_requests SET")) {
                const row = rows[args[6]];
                Object.assign(row, { status: args[0], stage: args[1], delivery_due: args[2], follow_up_date: args[3], follow_up_note: args[4], version: row.version + 1 });
                return [{}];
            }
            if (sql.includes("INSERT INTO design_request_events")) return [{ insertId: 17 }];
            if (sql.includes("SELECT project_id FROM projects WHERE project_id")) return [[projects[args[0]]]];
            if (sql.includes("SELECT employee_id, assignment_status FROM project_assignments")) {
                return [args[1].filter(id => team.has(id)).map(id => ({ employee_id: id, assignment_status: "assigned" }))];
            }
            if (sql.includes("INSERT INTO project_assignments")) {
                team.set(args[1], args[0]);
                return [{}];
            }
            if (sql.includes("COUNT(DISTINCT employee_id) AS total")) {
                return [[{ total: args[1].filter(id => team.get(id) === args[0]).length }]];
            }
            if (sql.includes("FROM projects WHERE project_id = ? FOR UPDATE")) {
                return [[{ start_date: "2026-11-21", due_date: "2026-11-29" }]];
            }
            if (sql.includes("INSERT INTO tasks (")) {
                assert.ok(args[3], "The primary assignee must be set in the initial INSERT.");
                mainTasks.push({ project_id: args[0], primary_assignee_id: args[3], title: args[4] });
                return [{ insertId: 500 }];
            }
            if (sql.includes("INSERT INTO design_request_task_links") || sql.includes("UPDATE tasks SET assigned_to_user_id")) return [{}];
            if (sql.includes("INSERT INTO task_assignments")) {
                assigned.push(args[1]);
                return [{}];
            }
            if (sql.includes("SELECT u.user_id, u.full_name FROM users")) return [people];
            if (sql.includes("SELECT e.id, e.note AS name")) return [[scheduledFollowUp]];
            if (sql.includes("FROM design_request_events e") && sql.includes("e.id = ?")) {
                return [[{ id: scheduledFollowUp.id, follow_up_date: scheduledFollowUp.date }]];
            }
            if (sql.includes("UPDATE design_request_events SET")) {
                scheduledFollowUp.date = args[0];
                return [{}];
            }
            if (sql.includes("SELECT user_id, email FROM users")) {
                return [[{ user_id: 8, email: "requester@example.invalid" }]];
            }
            if (sql.includes("SELECT u.user_id, u.email FROM users")) {
                return [[{ user_id: 7, email: "design@example.invalid" }]];
            }
            if (sql.includes("INSERT INTO design_request_email_outbox")) {
                for (let i = 0; i < args.length; i += 5) {
                    const [, , to, subject, message] = args.slice(i, i + 5);
                    queued.push({ to, subject, message });
                }
                return [{}];
            }
            if (sql.includes("FROM users") && sql.includes("JOIN roles")) return [[]];
            if (sql.includes("q.status IN (?)") && sql.includes("JOIN projects p")) {
                return [Object.values(rows).filter(row => links[row.id] && args[0].includes(row.status)
                    && (!sql.includes("AND (q.id = ?)") || row.id === args[1]))
                    .map(row => ({ request_id: row.id, request_status: row.status, ...links[row.id] }))];
            }
            if (sql.includes("JOIN project_assignments a")) {
                return [args[0].flatMap(requestId => people.filter(person => team.get(person.user_id) === links[requestId]?.project_id)
                    .map(person => ({ request_id: requestId, ...person })))];
            }
            if (sql.includes("FROM design_request_task_links")) return [[]];
            throw new Error("Unexpected SQL in test: " + sql);
        },
    };
    const mockQuery = test.mock.method(db, "query", connection.query);
    const mockConnection = test.mock.method(db, "getConnection", async () => connection);
    const app = express();
    app.use(express.json());
    app.use("/api/design-requests", router);
    app.use((error, req, res, next) => res.status(500).json({ message: error.message }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const base = "http://127.0.0.1:" + server.address().port + "/api/design-requests";

    function act(id, action = "accept", version = "1", overrides = {}) {
        const body = new FormData();
        for (const [key, value] of Object.entries({
            action, version, delivery_due: "2026-11-29", follow_up_date: "2026-11-23", follow_up_note: "Review artwork", ...overrides,
        })) body.set(key, value);
        return fetch(base + "/" + id + "/actions", { method: "POST", body });
    }

    try {
        const failed = await act(4);
        assert.equal(failed.status, 500);
        assert.equal((await failed.json()).message, "Simulated link failure");
        assert.equal(rollbacks, 1);
        assert.equal(rows[4].status, "new");
        assert.deepEqual(Object.keys(projects), ["100"]);

        rows[1].follow_up_date = "2026-11-23";
        const accepted = await act(1);
        assert.equal(accepted.status, 200, await accepted.text());
        const acceptanceMail = queued.splice(0);
        assert.deepEqual(acceptanceMail.map(item => item.to), ["requester@example.invalid", "design@example.invalid"]);
        for (const item of acceptanceMail) {
            assert.match(item.subject, /^Design request accepted/);
            assert.match(item.message, /Committed delivery: 2026-11-29/);
            assert.match(item.message, /Next follow-up: 2026-11-23/);
            assert.match(item.message, /2026-11-24 · Proof check/);
        }
        const confirmed = await act(1, "timeline", "2", { note: "Keep current dates" });
        assert.equal(confirmed.status, 200, await confirmed.text());
        assert.equal(queued.length, 2);
        assert.ok(queued.every(item => item.subject.startsWith("Design timeline confirmed")));
        queued.length = 0;
        const revised = await act(1, "timeline", "3", {
            delivery_due: "2026-11-30", note: "Proof check moved",
            scheduled_date_changes: JSON.stringify([{ id: 15, date: "2026-11-25" }]),
        });
        assert.equal(revised.status, 200, await revised.text());
        assert.equal(queued.length, 2);
        for (const item of queued.splice(0)) {
            assert.match(item.subject, /^Design timeline revised/);
            assert.match(item.message, /2026-11-30 \(was 2026-11-29\)/);
            assert.match(item.message, /2026-11-25 \(was 2026-11-24\) · Proof check/);
        }
        const retried = await act(1);
        assert.equal(retried.status, 409);
        assert.equal(projects[links[1].project_id].status, "not_started");

        assert.equal((await act(2)).status, 200);
        assert.equal((await act(2, "start", "2")).status, 200);
        assert.equal(links[2].project_id, 100);
        assert.equal(projects[100].status, "completed");

        const board = await (await fetch(base + "/projects?view=admin")).json();
        assert.deepEqual(board.projects.map(row => [row.request_id, row.request_status]), [
            [1, "accepted"], [2, "in_progress"], [3, "in_progress"],
        ]);
        const legacyProject = links[3].project_id;
        assert.equal(projects[legacyProject].status, "ongoing");
        assert.equal(links[5], undefined);
        assert.equal((await fetch(base + "/projects?view=admin")).status, 200);
        assert.equal(links[3].project_id, legacyProject);
        assert.equal(Object.keys(projects).length, 3);
        assert.equal((await fetch(base + "/3/project-options")).status, 404);

        const send = (path, body, requester = false) => fetch(base + "/2/work/" + path, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(requester ? { "X-Test-Requester": "1" } : {}) },
            body: JSON.stringify(body),
        });
        const task = { title: "Main Task", start_date: "2026-11-21", due_date: "2026-11-29", assignee_ids: [7, 9] };
        assert.equal((await send("tasks", task)).status, 400);
        assert.equal((await send("team", { assignee_ids: [7, 9] }, true)).status, 403);
        assert.equal((await send("team", { assignee_ids: [8] })).status, 400);
        const added = await send("team", { assignee_ids: [7, 9] });
        assert.equal(added.status, 200, await added.text());
        assert.deepEqual([...team.entries()], [[7, 100], [9, 100]]);
        assert.equal((await send("team", { assignee_ids: [7, 9] })).status, 200);
        assert.equal((await send("team", { assignee_ids: [10] })).status, 409);
        const requesterWork = await fetch(base + "/2/work", { headers: { "X-Test-Requester": "1" } });
        assert.equal(requesterWork.status, 200);
        assert.deepEqual((await requesterWork.json()).project.assignees.map(person => person.user_id), [7, 9]);
        const created = await send("tasks", task);
        assert.equal(created.status, 201, await created.text());
        assert.deepEqual(mainTasks, [{ project_id: 100, primary_assignee_id: 7, title: "Main Task" }]);
        assert.deepEqual(assigned, [7, 9]);
        assert.equal(projects[100].status, "completed");
    } finally {
        mockQuery.mock.restore();
        mockConnection.mock.restore();
        server.close();
    }
});
