const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
    assignWorkTask, listWork, projectDesignTaskIds, sourceProjectDesignTaskIds, requireDesignManager, requireProjectWork, reviewWorkTask,
} = require("../src/utils/designrequestprojects");

test("only accepted and active requests can change linked work", () => {
    const design = { design: true };
    assert.doesNotThrow(() => requireProjectWork({ status: "accepted" }, design));
    assert.doesNotThrow(() => requireProjectWork({ status: "in_progress" }, design));
    assert.throws(() => requireProjectWork({ status: "new" }, design), { status: 409 });
    assert.throws(() => requireProjectWork({ status: "completed" }, design), { status: 409 });
    assert.throws(() => requireProjectWork({ status: "accepted" }, {}), { status: 404 });
});

test("Personal shows work through either project ownership or a Main Task assignment", async () => {
    const replies = [
        [{ request_id: 1, assignee_id: 5 }, { request_id: 2 }, { request_id: 3 }],
        [{ request_id: 2, task_id: 20, assignee_id: 5 }, { request_id: 2, task_id: 21, assignee_id: 6 }],
        [{ parent_task_id: 20, task_id: 40 }],
        [],
        [],
    ];
    const db = { query: async () => [replies.shift()] };
    const work = await listWork(db, "q.owner_department_id = ?", [2], 5);
    assert.deepEqual(work.map(row => row.request_id), [1, 2]);
    assert.deepEqual(work[1].tasks.map(task => task.task_id), [20]);
    assert.deepEqual(work[1].tasks[0].subtasks.map(task => task.task_id), [40]);
});

test("Main Task assignment uses existing Personal Tasks and preserves started assignments", async () => {
    const calls = [];
    const db = { query: async (...args) => { calls.push(args); } };
    await assert.rejects(() => assignWorkTask(db, { task_id: 30, status: "ongoing", assigned_to_user_id: 6 }, 5, 7), { status: 409 });
    assert.equal(calls.length, 0);
    await assignWorkTask(db, { task_id: 30, status: "not_started" }, 5, 7);
    assert.match(calls[2][0], /INSERT INTO task_assignments/);
    assert.deepEqual(calls[2][1], [30, 5, 7, 30, 5]);
});

test("normal project workflows tolerate an unapplied design links migration", async () => {
    const db = { query: async () => { throw Object.assign(new Error("missing table"), { code: "ER_NO_SUCH_TABLE" }); } };
    assert.deepEqual(await projectDesignTaskIds(db, 3), new Set());
});

test("native project rollups exclude only Design tasks on the originating project", async () => {
    const db = { query: async (sql, params) => {
        assert.match(sql, /l.generated_project = 0/);
        assert.deepEqual(params, [3]);
        return [[{ task_id: 31 }]];
    } };
    assert.deepEqual(await sourceProjectDesignTaskIds(db, 3), new Set([31]));
});

test("a requesting admin can view the work but cannot manage Design tasks", () => {
    assert.throws(() => requireDesignManager({ status: "accepted" }, { requester: true }), { status: 403 });
    assert.doesNotThrow(() => requireDesignManager({ status: "accepted" }, { design: true }));
});

test("subtask assignees get the existing parent task access", async () => {
    const calls = [];
    const db = { query: async (...args) => { calls.push(args); } };
    await assignWorkTask(db, { task_id: 30, assigned_to_user_id: 5 }, 6, 7, 31);
    assert.match(calls[0][0], /INSERT INTO task_assignments/);
    assert.deepEqual(calls[0][1], [30, 6, 7, 30, 6]);
    assert.deepEqual(calls[1][1], [6, 31, 30]);
});

test("rejecting a subtask reopens its submitted Main Task for the existing employee flow", async () => {
    const calls = [];
    const db = { query: async (...args) => {
        calls.push(args);
        if (calls.length === 1) return [[{ task_id: 31, parent_task_id: 30, status: "completed", parent_status: "under_review" }]];
    } };
    await reviewWorkTask(db, 4, 31, 7, { action: "reject", note: "Fix the artwork." });
    assert.deepEqual(calls[0][1], [31, 4]);
    assert.deepEqual(calls[1][1].slice(0, 4), ["not_started", 0, 0, "rejected"]);
    assert.match(calls[2][0], /status = 'ongoing'/);
});

test("Main Task approval refuses incomplete subtasks and leaves both tasks untouched", async () => {
    const replies = [[{ task_id: 30, status: "under_review" }], [{ task_id: 31 }]];
    const db = { query: async () => [replies.shift()] };
    await assert.rejects(() => reviewWorkTask(db, 4, 30, 7, { action: "approve" }), { status: 409 });
    assert.equal(replies.length, 0);
});
