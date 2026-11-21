const { DesignRequestError, readDate, readText } = require("./designrequestworkflow");

const acceptedStatuses = ["accepted", "in_progress", "completed"];
const mainTaskCondition = "(t.parent_task_id IS NULL OR t.parent_task_id = 0)";

async function designProjectLink(connection, requestId) {
    const [[row]] = await connection.query(
        "SELECT project_id, assignee_id, generated_project FROM design_request_project_links WHERE request_id = ?", [requestId]
    );
    return row || null;
}

function requireProjectWork(request, access) {
    if (!access.design && !access.requester) throw new DesignRequestError(404, "Design request not found.");
    if (!["accepted", "in_progress"].includes(request.status)) {
        throw new DesignRequestError(409, "Project work can be changed after acceptance and before completion.");
    }
}

function requireDesignManager(request, access) {
    requireProjectWork(request, access);
    if (!access.design) throw new DesignRequestError(403, "Only a Design Team admin can manage this work.");
}

async function validateProject(connection, projectId, requesterId, departmentIds) {
    if (!Number.isSafeInteger(projectId) || projectId < 1) {
        throw new DesignRequestError(400, "Choose a project.");
    }
    const [[project]] = await connection.query(
        `SELECT project_id FROM projects
         WHERE project_id = ? AND (created_by_user_id = ? OR department_id IN (?)) FOR UPDATE`,
        [projectId, requesterId, departmentIds.length ? departmentIds : [0]]
    );
    if (!project) throw new DesignRequestError(404, "Project not found in the requesting department.");
}

async function createSourceProject(connection, draft, userId, departmentIds) {
    const departmentId = departmentIds[0];
    if (!departmentId) throw new DesignRequestError(400, "Select a requesting department before creating a project.");
    const title = readText(draft.project_title, "Project title", 160, true);
    const description = readText(draft.project_description, "Project description", 8000) || "";
    const start = readDate(draft.start_date, "project start date", true);
    const end = readDate(draft.due_date, "project deadline", true);
    if (end < start) throw new DesignRequestError(400, "The project deadline must be on or after its start date.");
    const [[division]] = await connection.query(
        "SELECT division_id, division_name FROM divisions WHERE division_id = ? AND is_active = 1", [Number(draft.division_id) || 0]
    );
    if (!division) throw new DesignRequestError(400, "Select an active project division.");
    const suppliedIds = Array.isArray(draft.assignee_ids) ? draft.assignee_ids : [];
    const ids = [...new Set(suppliedIds.map(Number))];
    if (ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw new DesignRequestError(400, "Invalid project assignee.");
    if (ids.length) {
        const [eligible] = await connection.query(`
            SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id
            WHERE u.user_id IN (?) AND LOWER(COALESCE(u.status, 'active')) = 'active'
            AND LOWER(r.role_name) IN ('employee', 'administrator', 'admin')
            AND (u.department_id IN (?) OR EXISTS (
                SELECT 1 FROM user_departments ud WHERE ud.user_id = u.user_id AND ud.department_id IN (?)
            ))
        `, [ids, departmentIds, departmentIds]);
        if (eligible.length !== ids.length) throw new DesignRequestError(403, "Project assignees must belong to the requesting department.");
    }
    const [project] = await connection.query(`
        INSERT INTO projects (created_by_user_id, department_id, division_id, division, project_title,
            project_description, priority, status, start_date, due_date, overall_progress, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'medium', 'not_started', ?, ?, 0, NOW(), NOW())
    `, [userId, departmentId, division.division_id, division.division_name, title, description, start, end]);
    for (const id of ids) {
        await connection.query(`
            INSERT INTO project_assignments (project_id, employee_id, assigned_by_user_id, assignment_status, employee_progress, assigned_at)
            VALUES (?, ?, ?, 'assigned', 0, NOW())
        `, [project.insertId, id, userId]);
    }
    return project.insertId;
}

function linkProject(connection, requestId, projectId) {
    return connection.query("INSERT INTO design_request_project_links (request_id, project_id) VALUES (?, ?)", [requestId, projectId]);
}

// The caller holds the request row lock and commits the project, link and status together.
async function registerDesignProject(connection, request, actorId, deliveryDue) {
    const existing = await designProjectLink(connection, request.id);
    if (existing) return existing;

    const status = { accepted: "not_started", in_progress: "ongoing", completed: "completed" }[request.status];
    const due = deliveryDue || request.delivery_due || request.needed_by;
    const [project] = await connection.query(`
        INSERT INTO projects (created_by_user_id, department_id, project_title, project_description,
            priority, status, start_date, due_date, overall_progress, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'medium', ?, LEAST(DATE(?), COALESCE(?, DATE(?))),
            COALESCE(?, DATE(?)), ?, NOW(), NOW())
    `, [actorId, request.owner_department_id, request.title, request.brief, status,
        request.created_at, due, request.created_at, due, request.created_at, status === "completed" ? 100 : 0]);
    await connection.query(
        "INSERT INTO design_request_project_links (request_id, project_id, generated_project) VALUES (?, ?, 1)",
        [request.id, project.insertId]
    );
    return { project_id: project.insertId, generated_project: 1 };
}

function listDesignPeople(connection, departmentId) {
    return connection.query(`
        SELECT u.user_id, u.full_name FROM users u INNER JOIN roles r ON r.role_id = u.role_id
        WHERE LOWER(COALESCE(u.status, 'active')) = 'active'
        AND LOWER(r.role_name) IN ('employee', 'admin', 'administrator')
        AND (u.department_id = ? OR EXISTS (
            SELECT 1 FROM user_departments ud WHERE ud.user_id = u.user_id AND ud.department_id = ?
        ))
        ORDER BY u.full_name, u.user_id
    `, [departmentId, departmentId]);
}

function groupRows(rows, field) {
    const groups = new Map();
    for (const row of rows) {
        const key = String(row[field]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return groups;
}

function listDesignProjectAssignees(connection, requestIds, lock = false) {
    return connection.query(`
        SELECT q.id AS request_id, u.user_id, u.full_name, d.department_name
        FROM design_requests q JOIN design_request_project_links l ON l.request_id = q.id
        JOIN project_assignments a ON a.project_id = l.project_id
        JOIN users u ON u.user_id = a.employee_id
        JOIN departments d ON d.department_id = q.owner_department_id
        WHERE q.id IN (?) AND COALESCE(a.assignment_status, 'assigned') <> 'removed'
        AND (u.department_id = q.owner_department_id OR EXISTS (
            SELECT 1 FROM user_departments ud WHERE ud.user_id = u.user_id AND ud.department_id = q.owner_department_id
        ))
        ORDER BY u.full_name, u.user_id${lock ? " FOR UPDATE" : ""}
    `, [requestIds]);
}

async function listWork(connection, scope, params, personalUserId) {
    const [projects] = await connection.query(`
        SELECT q.id AS request_id, q.title AS request_title, q.status AS request_status, q.version,
            q.requester_id, q.owner_department_id, department.department_name, p.project_id,
            p.project_title, p.project_description, p.division, creator.full_name AS created_by_name,
            DATE_FORMAT(p.start_date, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(COALESCE(q.delivery_due, p.due_date), '%Y-%m-%d') AS due_date,
            l.generated_project, l.assignee_id, owner.full_name AS assignee_name
        FROM design_requests q JOIN design_request_project_links l ON l.request_id = q.id
        JOIN projects p ON p.project_id = l.project_id
        LEFT JOIN users owner ON owner.user_id = l.assignee_id
        LEFT JOIN users creator ON creator.user_id = p.created_by_user_id
        LEFT JOIN departments department ON department.department_id = q.owner_department_id
        WHERE q.status IN (?) AND (${scope})
        ORDER BY p.project_title, q.id
    `, [acceptedStatuses, ...params]);
    if (!projects.length) return [];
    const requestIds = projects.map(row => row.request_id);
    const [tasks] = await connection.query(`
        SELECT d.request_id, t.task_id, t.task_title, t.task_description, t.status, t.progress, t.review_status, t.review_note,
            DATE_FORMAT(t.start_date, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(t.due_date, '%Y-%m-%d') AS due_date,
            t.assigned_to_user_id AS assignee_id, u.full_name AS assignee_name
        FROM design_request_task_links d JOIN tasks t ON t.task_id = d.task_id
        LEFT JOIN users u ON u.user_id = t.assigned_to_user_id
        WHERE d.request_id IN (?) AND ${mainTaskCondition} ORDER BY t.task_id
    `, [requestIds]);
    const taskIds = tasks.map(row => row.task_id);
    const [subtasks] = taskIds.length ? await connection.query(`
        SELECT s.task_id, s.parent_task_id, s.task_title, s.task_description, s.status,
            s.review_status, s.review_note, s.is_checked, s.progress,
            DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(s.due_date, '%Y-%m-%d') AS due_date, s.assigned_to_user_id AS assignee_id, u.full_name AS assignee_name
        FROM tasks s LEFT JOIN users u ON u.user_id = s.assigned_to_user_id
        WHERE s.parent_task_id IN (?) ORDER BY s.task_id
    `, [taskIds]) : [[]];
    const [taskAssignments] = taskIds.length ? await connection.query(`
        SELECT a.task_id, u.user_id, u.full_name FROM task_assignments a JOIN users u ON u.user_id = a.employee_id
        WHERE a.task_id IN (?) ORDER BY u.full_name, u.user_id
    `, [taskIds]) : [[]];
    const [projectAssignments] = await listDesignProjectAssignees(connection, requestIds);
    const taskAssignees = groupRows(taskAssignments, "task_id");
    const projectAssignees = groupRows(projectAssignments, "request_id");
    const groups = new Map();
    const childGroups = new Map();
    for (const row of subtasks) {
        const key = String(row.parent_task_id);
        if (!childGroups.has(key)) childGroups.set(key, []);
        childGroups.get(key).push(row);
    }
    for (const row of tasks) {
        const children = childGroups.get(String(row.task_id)) || [];
        const assignees = taskAssignees.get(String(row.task_id)) || [];
        if (personalUserId && Number(row.assignee_id) !== Number(personalUserId)
            && !assignees.some(user => Number(user.user_id) === Number(personalUserId))
            && !children.some(child => Number(child.assignee_id) === Number(personalUserId))) continue;
        const key = String(row.request_id);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ ...row, assignees, subtasks: children });
    }
    return projects.map(project => ({
        ...project,
        assignees: projectAssignees.get(String(project.request_id)) || [],
        tasks: groups.get(String(project.request_id)) || [],
    })).filter(project => !personalUserId || Number(project.assignee_id) === Number(personalUserId)
        || project.assignees.some(user => Number(user.user_id) === Number(personalUserId)) || project.tasks.length);
}

async function createWorkTask(connection, request, link, actorId, body, parent, primaryAssigneeId) {
    const title = readText(body.title, "Task title", 160, true);
    const description = readText(body.description, "Task description", 4000) || "";
    const [[project]] = await connection.query(`
        SELECT DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date
        FROM projects WHERE project_id = ? FOR UPDATE
    `, [link.project_id]);
    if (!project) throw new DesignRequestError(404, "The linked project no longer exists.");
    const start = readDate(body.start_date || parent?.start_date || project.start_date, "task start date", true);
    const due = readDate(body.due_date || parent?.due_date || request.delivery_due || project.due_date, "task deadline", true);
    if (start > due || (parent?.start_date && start < parent.start_date) || (parent?.due_date && due > parent.due_date)) {
        throw new DesignRequestError(400, "Check the task dates and keep subtasks within their Main Task timeline.");
    }
    if (parent && ["under_review", "completed", "rejected", "on_hold"].includes(parent.status)) {
        throw new DesignRequestError(409, "Subtasks can be added while the Main Task is open for work.");
    }
    const [result] = await connection.query(`
        INSERT INTO tasks (project_id, parent_task_id, created_by_user_id, assigned_to_user_id, task_title,
            task_description, task_type, creation_source, status, priority, progress, is_checked, start_date,
            due_date, review_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'admin_assigned', 'not_started', 'medium', 0, 0, ?, ?, 'none', NOW(), NOW())
    `, [link.project_id, parent?.task_id || null, actorId, primaryAssigneeId,
        title, description, parent ? "subtask" : "main", start, due]);
    if (!parent) {
        await connection.query("INSERT INTO design_request_task_links (task_id, request_id) VALUES (?, ?)", [result.insertId, request.id]);
    }
    return result.insertId;
}

async function readLinkedTask(connection, requestId, taskId) {
    const [[row]] = await connection.query(`
        SELECT t.task_id, t.assigned_to_user_id, t.status,
            DATE_FORMAT(t.start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(t.due_date, '%Y-%m-%d') AS due_date
        FROM design_request_task_links d JOIN tasks t ON t.task_id = d.task_id
        WHERE d.request_id = ? AND d.task_id = ? AND ${mainTaskCondition} FOR UPDATE
    `, [requestId, taskId]);
    if (!row) throw new DesignRequestError(404, "Main Task not found on this design request.");
    return row;
}

async function addTaskAssignee(connection, taskId, assigneeId, actorId) {
    await connection.query(`
        INSERT INTO task_assignments (task_id, employee_id, assigned_by_user_id, assigned_at)
        SELECT ?, ?, ?, NOW() WHERE NOT EXISTS (
            SELECT 1 FROM task_assignments WHERE task_id = ? AND employee_id = ?
        )
    `, [taskId, assigneeId, actorId, taskId, assigneeId]);
}

async function assignWorkTask(connection, task, assigneeId, actorId, subtaskId) {
    if (subtaskId) {
        await addTaskAssignee(connection, task.task_id, assigneeId, actorId);
        await connection.query("UPDATE tasks SET assigned_to_user_id = ? WHERE task_id = ? AND parent_task_id = ?",
            [assigneeId, subtaskId, task.task_id]);
        return;
    }
    if (Number(task.assigned_to_user_id) === assigneeId) return;
    if (task.status !== "not_started") {
        throw new DesignRequestError(409, "Only Main Tasks that have not started can be reassigned.");
    }
    await connection.query("UPDATE tasks SET assigned_to_user_id = ?, updated_at = NOW() WHERE task_id = ?", [assigneeId, task.task_id]);
    await connection.query(`
        UPDATE tasks SET assigned_to_user_id = ? WHERE parent_task_id = ? AND status = 'not_started'
        AND (assigned_to_user_id IS NULL OR assigned_to_user_id = ?)
    `, [assigneeId, task.task_id, task.assigned_to_user_id || null]);
    if (task.assigned_to_user_id) {
        await connection.query(`
            DELETE FROM task_assignments WHERE task_id = ? AND employee_id = ?
            AND NOT EXISTS (SELECT 1 FROM tasks WHERE parent_task_id = ? AND assigned_to_user_id = ?)
        `, [task.task_id, task.assigned_to_user_id, task.task_id, task.assigned_to_user_id]);
    }
    await addTaskAssignee(connection, task.task_id, assigneeId, actorId);
}

async function reviewWorkTask(connection, requestId, taskId, actorId, body) {
    if (!["approve", "reject"].includes(body.action)) {
        throw new DesignRequestError(400, "Choose Approve or Reject.");
    }
    const approved = body.action === "approve";
    const note = readText(body.note, "Review note", 1000, !approved);
    const [[task]] = await connection.query(`
        SELECT t.task_id, t.parent_task_id, t.status, t.is_checked, t.review_status, parent.status AS parent_status
        FROM tasks t JOIN design_request_task_links d ON d.task_id = COALESCE(NULLIF(t.parent_task_id, 0), t.task_id)
        LEFT JOIN tasks parent ON parent.task_id = t.parent_task_id
        WHERE t.task_id = ? AND d.request_id = ? FOR UPDATE
    `, [taskId, requestId]);
    if (!task) throw new DesignRequestError(404, "Design task not found.");
    if (task.parent_task_id) {
        if (!["not_started", "ongoing", "under_review"].includes(task.parent_status)
            || task.status !== "completed" || task.review_status === "approved") {
            throw new DesignRequestError(409, "Only completed subtasks on open Main Tasks are available for review.");
        }
        await connection.query(`
            UPDATE tasks SET status = ?, is_checked = ?, progress = ?, review_status = ?,
            reviewed_by_user_id = ?, reviewed_at = NOW(), review_note = ?,
            completed_at = IF(?, completed_at, NULL), updated_at = NOW() WHERE task_id = ?
        `, [approved ? "completed" : "not_started", approved ? 1 : 0, approved ? 100 : 0,
            approved ? "approved" : "rejected", actorId, note, approved, taskId]);
        if (!approved && task.parent_status === "under_review") {
            await connection.query(`
                UPDATE tasks SET status = 'ongoing', review_status = 'changes_requested', reviewed_by_user_id = ?,
                reviewed_at = NOW(), review_note = ?, updated_at = NOW() WHERE task_id = ?
            `, [actorId, note, task.parent_task_id]);
        }
        return;
    }
    if (task.status !== "under_review") throw new DesignRequestError(409, "This Main Task is not under review.");
    if (approved) {
        const [[incomplete]] = await connection.query(`
            SELECT task_id FROM tasks WHERE parent_task_id = ? AND status <> 'completed' LIMIT 1
        `, [taskId]);
        if (incomplete) throw new DesignRequestError(409, "All subtasks must be completed first.");
        await connection.query(`
            UPDATE tasks SET review_status = 'approved', reviewed_by_user_id = ?, reviewed_at = NOW(),
            updated_at = NOW() WHERE parent_task_id = ? AND COALESCE(review_status, 'none') <> 'approved'
        `, [actorId, taskId]);
    }
    await connection.query(`
        UPDATE tasks SET status = ?, review_status = ?, reviewed_by_user_id = ?, reviewed_at = NOW(),
        review_note = ?, completed_at = IF(?, NOW(), NULL), updated_at = NOW() WHERE task_id = ?
    `, [approved ? "completed" : "rejected", approved ? "approved" : "rejected", actorId, note, approved, taskId]);
}

async function sourceProjectDesignTaskIds(connection, projectId) {
    const [rows] = await connection.query(`
        SELECT d.task_id FROM design_request_task_links d
        JOIN design_request_project_links l ON l.request_id = d.request_id
        JOIN tasks t ON t.task_id = d.task_id
        WHERE t.project_id = ? AND l.generated_project = 0
    `, [projectId]).catch(error => {
        if (error.code === "ER_NO_SUCH_TABLE") return [[]];
        if (error.code === "ER_BAD_FIELD_ERROR" && error.message?.includes("generated_project")) {
            return projectDesignTaskIds(connection, projectId).then(ids => [[...ids].map(task_id => ({ task_id }))]);
        }
        throw error;
    });
    return new Set(rows.map(row => Number(row.task_id)));
}

async function projectDesignTaskIds(connection, projectId) {
    const [rows] = await connection.query(`
        SELECT d.task_id FROM design_request_task_links d
        JOIN tasks t ON t.task_id = d.task_id WHERE t.project_id = ?
    `, [projectId]).catch(error => {
        if (error.code === "ER_NO_SUCH_TABLE") return [[]];
        throw error;
    });
    return new Set(rows.map(row => Number(row.task_id)));
}

module.exports = {
    acceptedStatuses, designProjectLink, requireProjectWork, requireDesignManager, validateProject, createSourceProject,
    linkProject, registerDesignProject, listDesignPeople, listDesignProjectAssignees, listWork, createWorkTask, readLinkedTask, addTaskAssignee, assignWorkTask, reviewWorkTask, projectDesignTaskIds, sourceProjectDesignTaskIds,
};
