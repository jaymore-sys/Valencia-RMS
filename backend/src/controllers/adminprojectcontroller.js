const db = require("../config/db");
const { sendProjectAssignmentEmails, sendProjectUpdateEmails, sendMainTaskAssignmentEmails, } = require("../utils/projectemailnotifications");
const { sendMail } = require("../utils/emailservice");
/*
========================================================
HELPERS
========================================================
*/
const getLoggedInUserId = (req) => Number(req.user?.user_id || req.user?.id || req.userId || 0);
const getLoggedInDepartmentId = (req) => Number(req.user?.department_id || req.user?.departmentId || 0);
const getUserDepartmentIds = async (executor, userId, legacyDepartmentId = 0) => {
    const departmentIds = new Set();
    const legacyId = Number(legacyDepartmentId || 0);
    if (legacyId > 0) {
        departmentIds.add(legacyId);
    }
    if (userId) {
        const [rows] = await executor.query(`SELECT DISTINCT department_id FROM user_departments WHERE user_id = ? AND department_id IS NOT NULL`, [userId]);
        rows.forEach((row) => {
            const departmentId = Number(row.department_id || 0);
            if (departmentId > 0) {
                departmentIds.add(departmentId);
            }
        });
    }
    return [...departmentIds];
};
const getValidAssigneesForDepartments = async (executor, employeeIds, departmentIds) => {
    if (!employeeIds.length || !departmentIds.length) {
        return [];
    }
    const [rows] = await executor.query(`SELECT DISTINCT u.user_id FROM users u LEFT JOIN roles r ON r.role_id = u.role_id LEFT JOIN user_departments ud ON ud.user_id = u.user_id WHERE u.user_id IN (?) AND LOWER(COALESCE(u.status, 'active')) = 'active' AND LOWER(COALESCE(r.role_name, '')) IN ( 'employee', 'administrator', 'admin' ) AND ( u.department_id IN (?) OR ud.department_id IN (?) )`, [employeeIds, departmentIds, departmentIds]);
    return rows.map((row) => Number(row.user_id));
};
const canAdminManageProjectRow = (project, adminUserId, adminDepartmentIds) => {
    if (!project)
        return false;
    const createdBy = Number(project.created_by_user_id ||
        project.project_created_by_user_id ||
        0);
    const departmentId = Number(project.department_id ||
        project.project_department_id ||
        0);
    return (createdBy === Number(adminUserId) ||
        adminDepartmentIds.map(Number).includes(departmentId));
};
const getValidProjectAssigneeIds = async (executor, projectId, employeeIds) => {
    if (!projectId || !employeeIds.length) {
        return [];
    }
    const [rows] = await executor.query(`SELECT DISTINCT employee_id FROM project_assignments WHERE project_id = ? AND employee_id IN (?) AND COALESCE(assignment_status, 'assigned') <> 'removed'`, [projectId, employeeIds]);
    return rows.map((row) => Number(row.employee_id));
};
const createRmsNotification = async (executor, { receiverUserId, actorUserId, eventKey, projectId = null, referenceType, referenceId, notificationType, priority = "normal", title, message, targetUrl = "/admin/projects", }) => {
    await executor.query(`INSERT INTO notifications ( receiver_user_id, actor_user_id, event_key, project_id, task_id, reference_type, reference_id, notification_type, category, priority, title, message, target_url, is_read, is_active ) VALUES ( ?, ?, ?, ?, NULL, ?, ?, ?, 'project', ?, ?, ?, ?, 0, 1 ) ON DUPLICATE KEY UPDATE actor_user_id = VALUES(actor_user_id), title = VALUES(title), message = VALUES(message), target_url = VALUES(target_url), is_active = 1, updated_at = CURRENT_TIMESTAMP`, [
        receiverUserId,
        actorUserId || null,
        eventKey,
        projectId,
        referenceType,
        referenceId,
        notificationType,
        priority,
        title,
        message,
        targetUrl,
    ]);
};
const normalizeIdArray = (value) => {
    if (!Array.isArray(value))
        return [];
    return [
        ...new Set(value
            .map(Number)
            .filter((item) => Number.isInteger(item) &&
            item > 0)),
    ];
};
const resolveProjectDivision = async (executor, divisionId, divisionName) => {
    const numericDivisionId = Number(divisionId || 0);
    if (numericDivisionId > 0) {
        const [rows] = await executor.query(`SELECT division_id, division_name FROM divisions WHERE division_id = ? AND is_active = 1 LIMIT 1`, [numericDivisionId]);
        if (!rows.length) {
            return null;
        }
        return {
            division_id: Number(rows[0].division_id),
            division_name: rows[0].division_name,
        };
    }
    const cleanDivisionName = String(divisionName || "").trim();
    if (!cleanDivisionName) {
        return null;
    }
    const [rows] = await executor.query(`SELECT division_id, division_name FROM divisions WHERE LOWER(TRIM(division_name)) = LOWER(TRIM(?)) AND is_active = 1 LIMIT 1`, [cleanDivisionName]);
    if (!rows.length) {
        return null;
    }
    return {
        division_id: Number(rows[0].division_id),
        division_name: rows[0].division_name,
    };
};
const formatDateOnly = (value) => {
    if (!value)
        return null;
    if (typeof value === "string") {
        return value.slice(0, 10);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};
const normalizeStatus = (status) => {
    const value = String(status || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "_")
        .replace(/-/g, "_");
    if ([
        "",
        "todo",
        "to_do",
        "not_started",
        "pending",
    ].includes(value)) {
        return "not_started";
    }
    if ([
        "ongoing",
        "in_progress",
        "progress",
    ].includes(value)) {
        return "ongoing";
    }
    if ([
        "under_review",
        "review",
        "pending_review",
    ].includes(value)) {
        return "under_review";
    }
    if ([
        "completed",
        "done",
        "complete",
    ].includes(value)) {
        return "completed";
    }
    if (["rejected", "reject"].includes(value)) {
        return "rejected";
    }
    if (["on_hold", "hold"].includes(value)) {
        return "on_hold";
    }
    return value || "not_started";
};
/*
========================================================
PROJECT ASSIGNMENTS

project_assignments:
Employees who belong to / can see the project.

task_assignments:
Employees assigned to a specific Main Task.
========================================================
*/
const syncProjectAssignments = async (connection, projectId, employeeIds, assignedByUserId) => {
    /*
    Remove direct assignments but preserve employees
    approved through an active Interdepartment request.
    */
    await connection.query(`DELETE pa FROM project_assignments pa WHERE pa.project_id = ? AND NOT EXISTS ( SELECT 1 FROM interdepartment_project_assignments ipa WHERE ipa.project_id = pa.project_id AND ipa.employee_id = pa.employee_id AND LOWER( COALESCE( ipa.assignment_status, 'active' ) ) = 'active' )`, [projectId]);
    for (const employeeId of employeeIds) {
        await connection.query(`INSERT INTO project_assignments ( project_id, employee_id, assigned_by_user_id, assignment_status, employee_progress, assigned_at ) SELECT ?, ?, ?, 'assigned', 0, NOW() WHERE NOT EXISTS ( SELECT 1 FROM project_assignments WHERE project_id = ? AND employee_id = ? AND COALESCE( assignment_status, 'assigned' ) <> 'removed' )`, [
            projectId,
            employeeId,
            assignedByUserId || null,
            projectId,
            employeeId,
        ]);
    }
};
/*
========================================================
MAIN TASK ASSIGNMENTS

One Main Task row.
Multiple employees through task_assignments.
========================================================
*/
const syncMainTaskAssignments = async (connection, taskId, employeeIds, assignedByUserId) => {
    await connection.query(`DELETE FROM task_assignments WHERE task_id = ?`, [taskId]);
    for (const employeeId of employeeIds) {
        await connection.query(`INSERT INTO task_assignments ( task_id, employee_id, assigned_by_user_id, assigned_at ) VALUES ( ?, ?, ?, NOW() )`, [
            taskId,
            employeeId,
            assignedByUserId || null,
        ]);
    }
    /*
    Keep assigned_to_user_id populated for older RMS
    functionality. The first employee remains primary.
    */
    const primaryEmployeeId = employeeIds.length > 0
        ? employeeIds[0]
        : null;
    await connection.query(`UPDATE tasks SET assigned_to_user_id = ? WHERE task_id = ?`, [
        primaryEmployeeId,
        taskId,
    ]);
};
/*
========================================================
ASSIGNABLE USERS
========================================================
*/
const getAssignableUsersForAdminProjects = async (req, res) => {
    try {
        const adminUserId = getLoggedInUserId(req);
        const legacyDepartmentId = getLoggedInDepartmentId(req);
        if (!adminUserId) {
            return res.status(401).json({
                success: false,
                message: "Admin account not found.",
            });
        }
        const departmentIds = await getUserDepartmentIds(db, adminUserId, legacyDepartmentId);
        if (!departmentIds.length) {
            return res.status(200).json({
                success: true,
                users: [],
            });
        }
        const [users] = await db.query(`SELECT DISTINCT u.user_id, u.full_name, u.email, u.employee_code, u.designation, u.status, u.department_id, d.department_name, r.role_id, r.role_name FROM users u LEFT JOIN departments d ON d.department_id = u.department_id LEFT JOIN roles r ON r.role_id = u.role_id LEFT JOIN user_departments ud ON ud.user_id = u.user_id WHERE LOWER( COALESCE( u.status, 'active' ) ) = 'active' AND LOWER( COALESCE( r.role_name, '' ) ) IN ( 'employee', 'administrator', 'admin' ) AND ( u.department_id IN (?) OR ud.department_id IN (?) ) ORDER BY u.full_name ASC`, [
            departmentIds,
            departmentIds,
        ]);
        return res.status(200).json({
            success: true,
            users,
            department_ids: departmentIds,
        });
    }
    catch (error) {
        console.error("Get assignable project users error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch assignable employees.",
            error: error.message,
        });
    }
};
/*
========================================================
GET PROJECT DIVISIONS
========================================================
*/
const getProjectDivisions = async (req, res) => {
    try {
        const [divisions] = await db.query(`SELECT division_id, division_name FROM divisions WHERE is_active = 1 AND TRIM( COALESCE( division_name, '' ) ) <> '' ORDER BY division_name ASC`);
        return res.status(200).json({
            success: true,
            divisions,
        });
    }
    catch (error) {
        console.error("Get project divisions error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch project divisions.",
            error: error.message,
            sqlMessage: error.sqlMessage || null,
        });
    }
};
/*
========================================================
GET ADMIN PROJECTS
========================================================
*/
const getAdminProjects = async (req, res) => {
    try {
        const adminUserId = getLoggedInUserId(req);
        const adminDepartmentId = getLoggedInDepartmentId(req);
        const whereParts = [];
        const whereValues = [];
        /*
        Department Admin normally sees projects
        in their department and projects they created.
    
        OR is intentional because legacy records may
        not have department_id populated.
        */
        if (adminDepartmentId &&
            adminUserId) {
            whereParts.push(`
        (
          p.department_id = ?
          OR p.created_by_user_id = ?
        )
        `);
            whereValues.push(adminDepartmentId, adminUserId);
        }
        else if (adminDepartmentId) {
            whereParts.push("p.department_id = ?");
            whereValues.push(adminDepartmentId);
        }
        else if (adminUserId) {
            whereParts.push("p.created_by_user_id = ?");
            whereValues.push(adminUserId);
        }
        const whereClause = whereParts.length > 0
            ? `WHERE ${whereParts.join(" AND ")}`
            : "";
        const [projects] = await db.query(`SELECT p.project_id, p.created_by_user_id, p.department_id, p.project_title, p.project_description, p.priority, p.status, p.division_id, COALESCE( division_master.division_name, NULLIF( TRIM(p.division), '' ), 'Unassigned Legacy' ) AS division, DATE_FORMAT( p.start_date, '%Y-%m-%d' ) AS start_date, DATE_FORMAT( p.due_date, '%Y-%m-%d' ) AS due_date, DATE_FORMAT( p.due_date, '%Y-%m-%d' ) AS end_date, p.completed_at, COALESCE( p.overall_progress, 0 ) AS overall_progress, p.created_at, p.updated_at, creator.full_name AS created_by_name, creator.email AS created_by_email, d.department_name FROM projects p LEFT JOIN users creator ON creator.user_id = p.created_by_user_id LEFT JOIN departments d ON d.department_id = p.department_id LEFT JOIN divisions division_master ON division_master.division_id = p.division_id ${whereClause} ORDER BY p.project_id DESC`, whereValues);
        if (!projects.length) {
            return res.status(200).json({
                success: true,
                projects: [],
            });
        }
        const projectIds = projects.map((project) => Number(project.project_id));
        /*
        ----------------------------------------------
        PROJECT ASSIGNEES
        ----------------------------------------------
        */
        const [projectAssignmentRows] = await db.query(`SELECT pa.assignment_id, pa.project_id, pa.employee_id, pa.assignment_status, pa.employee_progress, pa.assigned_at, u.full_name, u.email, u.employee_code, u.designation, d.department_name, r.role_name FROM project_assignments pa INNER JOIN users u ON u.user_id = pa.employee_id LEFT JOIN departments d ON d.department_id = u.department_id LEFT JOIN roles r ON r.role_id = u.role_id WHERE pa.project_id IN (?) AND COALESCE( pa.assignment_status, 'assigned' ) <> 'removed' ORDER BY u.full_name ASC`, [projectIds]);
        /*
        ----------------------------------------------
        MAIN TASKS
        ----------------------------------------------
        */
        const [mainTaskRows] = await db.query(`SELECT t.task_id, t.project_id, t.parent_task_id, t.created_by_user_id, t.assigned_to_user_id, t.task_title, t.task_description, t.task_type, t.status, t.priority, COALESCE( t.progress, 0 ) AS progress, COALESCE( t.is_checked, 0 ) AS is_checked, DATE_FORMAT( t.start_date, '%Y-%m-%d' ) AS start_date, DATE_FORMAT( t.due_date, '%Y-%m-%d' ) AS due_date, t.review_status, t.reviewed_by_user_id, t.reviewed_at, t.review_note, t.created_at, t.updated_at, creator.full_name AS created_by_name, creator.email AS created_by_email, reviewer.full_name AS reviewed_by_name, ( SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.task_id ) AS total_subtasks, ( SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.task_id AND ( COALESCE( st.is_checked, 0 ) = 1 OR LOWER( REPLACE( COALESCE( st.status, '' ), ' ', '_' ) ) IN ( 'completed', 'done', 'complete' ) ) ) AS completed_subtasks FROM tasks t LEFT JOIN users creator ON creator.user_id = t.created_by_user_id LEFT JOIN users reviewer ON reviewer.user_id = t.reviewed_by_user_id WHERE t.project_id IN (?) AND ( t.parent_task_id IS NULL OR t.parent_task_id = 0 ) ORDER BY t.task_id DESC`, [projectIds]);
        /*
        ----------------------------------------------
        MAIN TASK ASSIGNEES
        ----------------------------------------------
        */
        const mainTaskIds = mainTaskRows.map((task) => Number(task.task_id));
        let taskAssignmentRows = [];
        if (mainTaskIds.length > 0) {
            const [rows] = await db.query(`SELECT ta.task_assignment_id, ta.task_id, ta.employee_id, ta.assigned_by_user_id, ta.assigned_at, u.full_name, u.email, u.employee_code, u.designation, d.department_name FROM task_assignments ta INNER JOIN users u ON u.user_id = ta.employee_id LEFT JOIN departments d ON d.department_id = u.department_id WHERE ta.task_id IN (?) ORDER BY u.full_name ASC`, [mainTaskIds]);
            taskAssignmentRows = rows;
        }
        /*
        ----------------------------------------------
        BUILD MAPS
        ----------------------------------------------
        */
        const projectAssigneeMap = new Map();
        for (const assignment of projectAssignmentRows) {
            const projectId = Number(assignment.project_id);
            if (!projectAssigneeMap.has(projectId)) {
                projectAssigneeMap.set(projectId, []);
            }
            projectAssigneeMap
                .get(projectId)
                .push({
                user_id: assignment.employee_id,
                employee_id: assignment.employee_id,
                full_name: assignment.full_name,
                email: assignment.email,
                employee_code: assignment.employee_code,
                designation: assignment.designation,
                department_name: assignment.department_name,
                role_name: assignment.role_name,
                assignment_status: assignment.assignment_status,
                employee_progress: Number(assignment.employee_progress ||
                    0),
                assigned_at: assignment.assigned_at,
            });
        }
        const taskAssigneeMap = new Map();
        for (const assignment of taskAssignmentRows) {
            const taskId = Number(assignment.task_id);
            if (!taskAssigneeMap.has(taskId)) {
                taskAssigneeMap.set(taskId, []);
            }
            taskAssigneeMap
                .get(taskId)
                .push({
                user_id: assignment.employee_id,
                employee_id: assignment.employee_id,
                full_name: assignment.full_name,
                email: assignment.email,
                employee_code: assignment.employee_code,
                designation: assignment.designation,
                department_name: assignment.department_name,
                assigned_at: assignment.assigned_at,
            });
        }
        const taskMapByProject = new Map();
        for (const task of mainTaskRows) {
            const projectId = Number(task.project_id);
            if (!taskMapByProject.has(projectId)) {
                taskMapByProject.set(projectId, []);
            }
            const taskAssignees = taskAssigneeMap.get(Number(task.task_id)) || [];
            taskMapByProject
                .get(projectId)
                .push({
                ...task,
                start_date: formatDateOnly(task.start_date),
                due_date: formatDateOnly(task.due_date),
                status: normalizeStatus(task.status),
                progress: Number(task.progress || 0),
                total_subtasks: Number(task.total_subtasks ||
                    0),
                completed_subtasks: Number(task.completed_subtasks ||
                    0),
                assignees: taskAssignees,
                assignee_ids: taskAssignees.map((employee) => Number(employee.employee_id)),
                assigned_names: taskAssignees
                    .map((employee) => employee.full_name)
                    .filter(Boolean)
                    .join(", "),
                assigned_emails: taskAssignees
                    .map((employee) => employee.email)
                    .filter(Boolean)
                    .join(", "),
            });
        }
        /*
        ----------------------------------------------
        FINAL PROJECT RESPONSE
        ----------------------------------------------
        */
        const formattedProjects = projects.map((project) => {
            const projectId = Number(project.project_id);
            return {
                ...project,
                start_date: formatDateOnly(project.start_date),
                due_date: formatDateOnly(project.due_date),
                end_date: formatDateOnly(project.due_date),
                status: normalizeStatus(project.status),
                overall_progress: Number(project.overall_progress ||
                    0),
                assignees: projectAssigneeMap.get(projectId) || [],
                main_tasks: taskMapByProject.get(projectId) || [],
            };
        });
        return res.status(200).json({
            success: true,
            projects: formattedProjects,
        });
    }
    catch (error) {
        console.error("Get admin projects error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch projects.",
            error: error.message,
            sqlMessage: error.sqlMessage || null,
        });
    }
};
/*
========================================================
CREATE PROJECT
========================================================
*/
const createAdminProject = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const adminUserId = getLoggedInUserId(req);
        const adminDepartmentId = getLoggedInDepartmentId(req);
        const adminUser = {
            user_id: adminUserId,
            full_name: req.user?.full_name ||
                req.user?.name ||
                "Admin",
            email: req.user?.email ||
                process.env.SMTP_USER,
        };
        const projectTitle = req.body.project_title ||
            req.body.title ||
            req.body.project_name;
        const projectDescription = req.body.project_description ||
            req.body.description ||
            req.body.project_details ||
            "";
        const priority = req.body.priority ||
            "medium";
        const resolvedDivision = await resolveProjectDivision(connection, req.body.division_id, req.body.division);
        if (!resolvedDivision) {
            return res.status(400).json({
                success: false,
                message: "Please select a valid Division.",
            });
        }
        const startDate = formatDateOnly(req.body.start_date ||
            req.body.startDate ||
            req.body.project_start_date);
        const dueDate = formatDateOnly(req.body.due_date ||
            req.body.end_date ||
            req.body.endDate ||
            req.body.dueDate ||
            req.body.project_end_date);
        const assigneeIds = normalizeIdArray(req.body.assignee_ids ||
            req.body.assignees ||
            req.body.project_assignees);
        if (!projectTitle ||
            !String(projectTitle).trim()) {
            return res.status(400).json({
                success: false,
                message: "Project title is required.",
            });
        }
        if (!startDate ||
            !dueDate) {
            return res.status(400).json({
                success: false,
                message: "Project start date and deadline are required.",
            });
        }
        if (startDate > dueDate) {
            return res.status(400).json({
                success: false,
                message: "Project start date cannot be after project deadline.",
            });
        }
        if (!assigneeIds.length) {
            return res.status(400).json({
                success: false,
                message: "Select at least one project employee.",
            });
        }
        const adminDepartmentIds = await getUserDepartmentIds(connection, adminUserId, adminDepartmentId);
        if (!adminDepartmentIds.length) {
            return res.status(400).json({
                success: false,
                message: "No department or division is assigned to this Admin.",
            });
        }
        const validAssigneeIds = await getValidAssigneesForDepartments(connection, assigneeIds, adminDepartmentIds);
        const validIdSet = new Set(validAssigneeIds.map(Number));
        const invalidIds = assigneeIds.filter((employeeId) => !validIdSet.has(Number(employeeId)));
        if (invalidIds.length) {
            return res.status(403).json({
                success: false,
                message: "You can directly assign only employees from your assigned departments/divisions. Use Interdepartment Work Request for another department.",
            });
        }
        await connection.beginTransaction();
        const [result] = await connection.query(`INSERT INTO projects ( created_by_user_id, department_id, division_id, division, project_title, project_description, priority, status, start_date, due_date, overall_progress, created_at, updated_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, 'not_started', ?, ?, 0, NOW(), NOW() )`, [
            adminUserId,
            adminDepartmentId,
            resolvedDivision.division_id,
            resolvedDivision.division_name,
            String(projectTitle).trim(),
            String(projectDescription).trim(),
            priority,
            startDate,
            dueDate,
        ]);
        const projectId = result.insertId;
        await syncProjectAssignments(connection, projectId, assigneeIds, adminUserId);
        await connection.commit();
        let emailSummary = null;
        try {
            emailSummary =
                await sendProjectAssignmentEmails(projectId, adminUser);
        }
        catch (emailError) {
            console.error("Project assignment email error:", emailError);
        }
        return res.status(201).json({
            success: true,
            message: "Project created successfully.",
            project_id: projectId,
            assignee_ids: assigneeIds,
            email_summary: emailSummary,
        });
    }
    catch (error) {
        try {
            await connection.rollback();
        }
        catch { }
        console.error("Create admin project error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to create project.",
            error: error.message,
            sqlMessage: error.sqlMessage || null,
        });
    }
    finally {
        connection.release();
    }
};
/*
========================================================
UPDATE PROJECT
========================================================
*/
const updateAdminProject = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const adminUserId = getLoggedInUserId(req);
        const projectId = Number(req.params.projectId ||
            req.params.id);
        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Project ID is required.",
            });
        }
        const adminUser = {
            user_id: adminUserId,
            full_name: req.user?.full_name ||
                req.user?.name ||
                "Admin",
            email: req.user?.email ||
                process.env.SMTP_USER,
        };
        const resolvedDivision = await resolveProjectDivision(connection, req.body.division_id, req.body.division);
        if (!resolvedDivision) {
            return res.status(400).json({
                success: false,
                message: "Please select a valid Division.",
            });
        }
        const projectTitle = req.body.project_title ||
            req.body.title;
        const projectDescription = req.body.project_description ||
            req.body.description ||
            "";
        const priority = req.body.priority ||
            "medium";
        const startDate = formatDateOnly(req.body.start_date ||
            req.body.startDate);
        const dueDate = formatDateOnly(req.body.due_date ||
            req.body.end_date ||
            req.body.endDate ||
            req.body.dueDate);
        const assigneeIds = normalizeIdArray(req.body.assignee_ids ||
            req.body.assignees ||
            req.body.project_assignees);
        if (!projectTitle ||
            !String(projectTitle).trim()) {
            return res.status(400).json({
                success: false,
                message: "Project title is required.",
            });
        }
        if (!startDate ||
            !dueDate) {
            return res.status(400).json({
                success: false,
                message: "Project start date and deadline are required.",
            });
        }
        if (startDate > dueDate) {
            return res.status(400).json({
                success: false,
                message: "Project start date cannot be after project deadline.",
            });
        }
        if (!assigneeIds.length) {
            return res.status(400).json({
                success: false,
                message: "Select at least one project employee.",
            });
        }
        const adminDepartmentId = getLoggedInDepartmentId(req);
        const adminDepartmentIds = await getUserDepartmentIds(connection, adminUserId, adminDepartmentId);
        if (!adminDepartmentIds.length) {
            return res.status(400).json({
                success: false,
                message: "No department or division is assigned to this Admin.",
            });
        }
        const directValidAssigneeIds = await getValidAssigneesForDepartments(connection, assigneeIds, adminDepartmentIds);
        const [approvedExternalRows] = await connection.query(`SELECT DISTINCT employee_id FROM interdepartment_project_assignments WHERE project_id = ? AND employee_id IN (?) AND LOWER( COALESCE( assignment_status, 'active' ) ) = 'active'`, [
            projectId,
            assigneeIds,
        ]);
        const allowedAssigneeIds = new Set([
            ...directValidAssigneeIds.map(Number),
            ...approvedExternalRows.map((row) => Number(row.employee_id)),
        ]);
        const invalidIds = assigneeIds.filter((employeeId) => !allowedAssigneeIds.has(Number(employeeId)));
        if (invalidIds.length) {
            return res.status(403).json({
                success: false,
                message: "Employees from another department can only be added after an approved Interdepartment Work Request.",
            });
        }
        await connection.beginTransaction();
        const [existingRows] = await connection.query(`SELECT project_id FROM projects WHERE project_id = ? LIMIT 1`, [projectId]);
        if (!existingRows.length) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Project not found.",
            });
        }
        await connection.query(`UPDATE projects SET project_title = ?, project_description = ?, priority = ?, start_date = ?, due_date = ?, division_id = ?, division = ?, updated_at = NOW() WHERE project_id = ?`, [
            String(projectTitle).trim(),
            String(projectDescription).trim(),
            priority,
            startDate,
            dueDate,
            resolvedDivision.division_id,
            resolvedDivision.division_name,
            projectId,
        ]);
        await syncProjectAssignments(connection, projectId, assigneeIds, adminUserId);
        await connection.commit();
        let emailSummary = null;
        try {
            emailSummary =
                await sendProjectUpdateEmails(projectId, adminUser, {
                    projectTitle,
                    projectDescription,
                    startDate,
                    endDate: dueDate,
                    dueDate,
                });
        }
        catch (emailError) {
            console.error("Project update email error:", emailError);
        }
        return res.status(200).json({
            success: true,
            message: "Project updated successfully.",
            project_id: projectId,
            assignee_ids: assigneeIds,
            email_summary: emailSummary,
        });
    }
    catch (error) {
        try {
            await connection.rollback();
        }
        catch { }
        console.error("Update admin project error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update project.",
            error: error.message,
            sqlMessage: error.sqlMessage || null,
        });
    }
    finally {
        connection.release();
    }
};
/*
========================================================
DELETE PROJECT
========================================================
*/
const deleteAdminProject = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const projectId = Number(req.params.projectId ||
            req.params.id);
        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Project ID is required.",
            });
        }
        await connection.beginTransaction();
        const [projectRows] = await connection.query(`SELECT project_id, project_title, status, DATE_FORMAT( start_date, '%Y-%m-%d' ) AS start_date, DATE_FORMAT( due_date, '%Y-%m-%d' ) AS due_date FROM projects WHERE project_id = ? LIMIT 1`, [projectId]);
        if (!projectRows.length) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Project not found.",
            });
        }
        await connection.query(`DELETE ta FROM task_assignments ta INNER JOIN tasks t ON t.task_id = ta.task_id WHERE t.project_id = ?`, [projectId]);
        await connection.query(`DELETE FROM tasks WHERE project_id = ? AND parent_task_id IS NOT NULL AND parent_task_id <> 0`, [projectId]);
        await connection.query(`DELETE FROM tasks WHERE project_id = ?`, [projectId]);
        await connection.query(`DELETE FROM project_assignments WHERE project_id = ?`, [projectId]);
        const [deleteResult] = await connection.query(`DELETE FROM projects WHERE project_id = ?`, [projectId]);
        if (!deleteResult.affectedRows) {
            throw new Error("Project deletion did not affect any project row.");
        }
        await connection.commit();
        return res.status(200).json({
            success: true,
            message: "Project deleted successfully.",
            project_id: projectId,
        });
    }
    catch (error) {
        try {
            await connection.rollback();
        }
        catch { }
        console.error("Delete admin project error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete project from database.",
            error: error.message,
            sqlMessage: error.sqlMessage || null,
        });
    }
    finally {
        connection.release();
    }
};
/*
========================================================
CREATE MAIN TASK

One tasks row + multiple task_assignments rows.
========================================================
*/
const createMainTask = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const adminUserId = getLoggedInUserId(req);
        const adminUser = {
            user_id: adminUserId,
            full_name: req.user?.full_name ||
                req.user?.name ||
                "Admin",
            email: req.user?.email ||
                process.env.SMTP_USER,
        };
        const projectId = Number(req.params.projectId ||
            req.body.project_id);
        const taskTitle = req.body.task_title ||
            req.body.title;
        const taskDescription = req.body.task_description ||
            req.body.description ||
            "";
        const priority = req.body.priority ||
            "medium";
        const assigneeIds = normalizeIdArray(req.body.assignee_ids ||
            req.body.assignees ||
            req.body.assigned_to_user_ids);
        const requestedStartDate = formatDateOnly(req.body.start_date ||
            req.body.startDate);
        const requestedDueDate = formatDateOnly(req.body.due_date ||
            req.body.end_date ||
            req.body.endDate ||
            req.body.deadline);
        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Project ID is required.",
            });
        }
        if (!taskTitle ||
            !String(taskTitle).trim()) {
            return res.status(400).json({
                success: false,
                message: "Main Task title is required.",
            });
        }
        if (!assigneeIds.length) {
            return res.status(400).json({
                success: false,
                message: "Select at least one employee for the Main Task.",
            });
        }
        await connection.beginTransaction();
        const [projectRows] = await connection.query(`SELECT project_id, project_title, status, DATE_FORMAT( start_date, '%Y-%m-%d' ) AS start_date, DATE_FORMAT( due_date, '%Y-%m-%d' ) AS due_date FROM projects WHERE project_id = ? LIMIT 1`, [projectId]);
        if (!projectRows.length) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Project not found.",
            });
        }
        const project = projectRows[0];
        const projectStatus = normalizeStatus(project.status);
        if (![
            "not_started",
            "ongoing",
            "under_review",
        ].includes(projectStatus)) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Main Tasks cannot be added while this Project is completed, rejected, or on hold.",
            });
        }
        /*
        Main Task gets its own deadline.
    
        If frontend does not send dates, project dates
        remain the compatibility fallback.
        */
        const taskStartDate = requestedStartDate ||
            project.start_date;
        const taskDueDate = requestedDueDate ||
            project.due_date;
        if (!taskStartDate ||
            !taskDueDate) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Main Task start date and deadline are required.",
            });
        }
        if (taskStartDate >
            taskDueDate) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Main Task start date cannot be after its deadline.",
            });
        }
        if (project.start_date &&
            taskStartDate <
                project.start_date) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `Main Task start date cannot be before Project start date (${project.start_date}).`,
            });
        }
        if (project.due_date &&
            taskDueDate >
                project.due_date) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `Main Task deadline cannot exceed Project deadline (${project.due_date}).`,
            });
        }
        /*
        Main Task employees must already belong
        to this Project.
    
        External employees enter the Project only
        after Interdepartment approval.
        */
        const validProjectAssigneeIds = await getValidProjectAssigneeIds(connection, projectId, assigneeIds);
        const validProjectAssigneeSet = new Set(validProjectAssigneeIds.map(Number));
        const invalidTaskAssigneeIds = assigneeIds.filter((employeeId) => !validProjectAssigneeSet.has(Number(employeeId)));
        if (invalidTaskAssigneeIds.length) {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message: "Main Tasks can only be assigned to employees already assigned or approved for this project.",
            });
        }
        const primaryEmployeeId = assigneeIds[0];
        const [taskResult] = await connection.query(`INSERT INTO tasks ( project_id, parent_task_id, created_by_user_id, assigned_to_user_id, task_title, task_description, task_type, status, priority, progress, is_checked, start_date, due_date, review_status, created_at, updated_at ) VALUES ( ?, NULL, ?, ?, ?, ?, 'main', 'not_started', ?, 0, 0, ?, ?, 'none', NOW(), NOW() )`, [
            projectId,
            adminUserId || null,
            primaryEmployeeId,
            String(taskTitle).trim(),
            String(taskDescription).trim(),
            priority,
            taskStartDate,
            taskDueDate,
        ]);
        const taskId = taskResult.insertId;
        await syncMainTaskAssignments(connection, taskId, assigneeIds, adminUserId);
        /*
        If Admin adds another Main Task while Project
        is under review, return Project to In Progress.
        */
        if (projectStatus ===
            "under_review") {
            await connection.query(`UPDATE projects SET status = 'ongoing', updated_at = NOW() WHERE project_id = ?`, [projectId]);
        }
        await connection.commit();
        let emailSummary = null;
        try {
            emailSummary =
                await sendMainTaskAssignmentEmails(projectId, [taskId], adminUser);
        }
        catch (emailError) {
            console.error("Main Task assignment email error:", emailError);
        }
        return res.status(201).json({
            success: true,
            message: "Main Task added successfully.",
            task_id: taskId,
            task_ids: [
                taskId,
            ],
            assignee_ids: assigneeIds,
            start_date: taskStartDate,
            due_date: taskDueDate,
            email_summary: emailSummary,
        });
    }
    catch (error) {
        try {
            await connection.rollback();
        }
        catch { }
        console.error("Create Main Task error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to add Main Task.",
            error: error.message,
            sqlMessage: error.sqlMessage || null,
        });
    }
    finally {
        connection.release();
    }
};
/*
========================================================
UPDATE MAIN TASK

Main Task ID must remain unchanged because existing
Subtasks use parent_task_id = Main Task task_id.
========================================================
*/
const updateMainTask = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const adminUserId = getLoggedInUserId(req);
        const adminUser = {
            user_id: adminUserId,
            full_name: req.user?.full_name ||
                req.user?.name ||
                "Admin",
            email: req.user?.email ||
                process.env.SMTP_USER,
        };
        const taskId = Number(req.params.taskId ||
            req.body.task_id);
        const taskTitle = req.body.task_title ||
            req.body.title;
        const taskDescription = req.body.task_description ||
            req.body.description ||
            "";
        const priority = req.body.priority ||
            "medium";
        const assigneeIds = normalizeIdArray(req.body.assignee_ids ||
            req.body.assignees ||
            req.body.assigned_to_user_ids);
        if (!taskId) {
            return res.status(400).json({
                success: false,
                message: "Main Task ID is required.",
            });
        }
        if (!taskTitle ||
            !String(taskTitle).trim()) {
            return res.status(400).json({
                success: false,
                message: "Main Task title is required.",
            });
        }
        if (!assigneeIds.length) {
            return res.status(400).json({
                success: false,
                message: "Select at least one employee for the Main Task.",
            });
        }
        await connection.beginTransaction();
        const [taskRows] = await connection.query(`SELECT t.task_id, t.project_id, t.parent_task_id, t.status, DATE_FORMAT( t.start_date, '%Y-%m-%d' ) AS start_date, DATE_FORMAT( t.due_date, '%Y-%m-%d' ) AS due_date, DATE_FORMAT( p.start_date, '%Y-%m-%d' ) AS project_start_date, DATE_FORMAT( p.due_date, '%Y-%m-%d' ) AS project_due_date FROM tasks t INNER JOIN projects p ON p.project_id = t.project_id WHERE t.task_id = ? AND ( t.parent_task_id IS NULL OR t.parent_task_id = 0 ) LIMIT 1`, [taskId]);
        if (!taskRows.length) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Main Task not found.",
            });
        }
        const existingTask = taskRows[0];
        const projectId = Number(existingTask.project_id);
        const taskStartDate = formatDateOnly(req.body.start_date ||
            req.body.startDate) ||
            existingTask.start_date;
        const taskDueDate = formatDateOnly(req.body.due_date ||
            req.body.end_date ||
            req.body.endDate ||
            req.body.deadline) ||
            existingTask.due_date;
        if (!taskStartDate ||
            !taskDueDate) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Main Task start date and deadline are required.",
            });
        }
        if (taskStartDate >
            taskDueDate) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Main Task start date cannot be after its deadline.",
            });
        }
        if (existingTask.project_start_date &&
            taskStartDate <
                existingTask.project_start_date) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `Main Task start date cannot be before Project start date (${existingTask.project_start_date}).`,
            });
        }
        if (existingTask.project_due_date &&
            taskDueDate >
                existingTask.project_due_date) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `Main Task deadline cannot exceed Project deadline (${existingTask.project_due_date}).`,
            });
        }
        /*
        Prevent shortening Main Task deadline earlier
        than an existing Subtask deadline.
        */
        const [invalidSubtasks] = await connection.query(`SELECT task_id, task_title, DATE_FORMAT( due_date, '%Y-%m-%d' ) AS due_date FROM tasks WHERE parent_task_id = ? AND due_date IS NOT NULL AND due_date > ? LIMIT 1`, [
            taskId,
            taskDueDate,
        ]);
        if (invalidSubtasks.length) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `Main Task deadline cannot be earlier than existing Subtask "${invalidSubtasks[0].task_title}" deadline (${invalidSubtasks[0].due_date}).`,
            });
        }
        await connection.query(`UPDATE tasks SET task_title = ?, task_description = ?, priority = ?, start_date = ?, due_date = ?, updated_at = NOW() WHERE task_id = ?`, [
            String(taskTitle).trim(),
            String(taskDescription).trim(),
            priority,
            taskStartDate,
            taskDueDate,
            taskId,
        ]);
        const validProjectAssigneeIds = await getValidProjectAssigneeIds(connection, projectId, assigneeIds);
        const validProjectAssigneeSet = new Set(validProjectAssigneeIds.map(Number));
        const invalidTaskAssigneeIds = assigneeIds.filter((employeeId) => !validProjectAssigneeSet.has(Number(employeeId)));
        if (invalidTaskAssigneeIds.length) {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message: "Main Tasks can only be assigned to employees already assigned or approved for this project.",
            });
        }
        await syncMainTaskAssignments(connection, taskId, assigneeIds, adminUserId);
        await connection.commit();
        let emailSummary = null;
        try {
            emailSummary =
                await sendMainTaskAssignmentEmails(projectId, [taskId], adminUser);
        }
        catch (emailError) {
            console.error("Main Task update email error:", emailError);
        }
        return res.status(200).json({
            success: true,
            message: "Main Task updated successfully.",
            task_id: taskId,
            task_ids: [
                taskId,
            ],
            project_id: projectId,
            assignee_ids: assigneeIds,
            start_date: taskStartDate,
            due_date: taskDueDate,
            email_summary: emailSummary,
        });
    }
    catch (error) {
        try {
            await connection.rollback();
        }
        catch { }
        console.error("Update Main Task error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update Main Task.",
            error: error.message,
            sqlMessage: error.sqlMessage || null,
        });
    }
    finally {
        connection.release();
    }
};
/*
========================================================
INTERDEPARTMENT WORK REQUESTS
========================================================
*/
const getInterdepartmentDepartments = async (req, res) => {
    try {
        const adminUserId = getLoggedInUserId(req);
        if (!adminUserId) {
            return res.status(401).json({
                success: false,
                message: "Admin account not found.",
            });
        }
        const ownDepartmentIds = await getUserDepartmentIds(db, adminUserId, getLoggedInDepartmentId(req));
        const departmentWhere = ownDepartmentIds.length
            ? "AND department_id NOT IN (?)"
            : "";
        const departmentValues = ownDepartmentIds.length
            ? [ownDepartmentIds]
            : [];
        const [[departments], [divisions]] = await Promise.all([
            db.query(`SELECT department_id, department_name FROM departments WHERE TRIM(COALESCE(department_name, '')) <> '' ${departmentWhere} ORDER BY department_name ASC`, departmentValues),
            db.query(`SELECT division_id, division_name FROM divisions WHERE is_active = 1 AND TRIM(COALESCE(division_name, '')) <> '' ORDER BY division_name ASC`),
        ]);
        return res.status(200).json({
            success: true,
            departments,
            divisions,
        });
    }
    catch (error) {
        console.error("Get interdepartment departments error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch departments and divisions.",
            error: error.message,
            sqlMessage: error.sqlMessage || null,
        });
    }
};
const getInterdepartmentRequests = async (req, res) => {
    try {
        const adminUserId = getLoggedInUserId(req);
        if (!adminUserId) {
            return res.status(401).json({
                success: false,
                message: "Admin account not found.",
            });
        }
        const departmentIds = await getUserDepartmentIds(db, adminUserId, getLoggedInDepartmentId(req));
        const whereParts = ["ipr.requested_by_admin_id = ?"];
        const values = [adminUserId];
        if (departmentIds.length) {
            whereParts.push("ipr.requested_department_id IN (?)");
            values.push(departmentIds);
        }
        const [requests] = await db.query(`SELECT ipr.request_id, ipr.project_id, ipr.requested_by_admin_id, ipr.requesting_department_id, ipr.requested_department_id, ipr.requested_division_id, ipr.work_description, DATE_FORMAT( ipr.requested_start_date, '%Y-%m-%d' ) AS requested_start_date, DATE_FORMAT( ipr.requested_end_date, '%Y-%m-%d' ) AS requested_end_date, ipr.status, ipr.reviewed_by_admin_id, ipr.review_note, DATE_FORMAT( ipr.approved_start_date, '%Y-%m-%d' ) AS approved_start_date, DATE_FORMAT( ipr.approved_end_date, '%Y-%m-%d' ) AS approved_end_date, ipr.reviewed_at, ipr.created_at, ipr.updated_at, p.project_title, p.project_description, p.division_id, COALESCE( project_division.division_name, NULLIF(TRIM(p.division), ''), 'Unassigned Legacy' ) AS division, DATE_FORMAT( p.start_date, '%Y-%m-%d' ) AS project_start_date, DATE_FORMAT( p.due_date, '%Y-%m-%d' ) AS project_due_date, requester.full_name AS requested_by_name, requester.email AS requested_by_email, reviewer.full_name AS reviewed_by_name, source_department.department_name AS requesting_department_name, target_department.department_name AS requested_department_name, target_division.division_name AS requested_division_name FROM interdepartment_project_requests ipr INNER JOIN projects p ON p.project_id = ipr.project_id LEFT JOIN divisions project_division ON project_division.division_id = p.division_id LEFT JOIN divisions target_division ON target_division.division_id = ipr.requested_division_id LEFT JOIN users requester ON requester.user_id = ipr.requested_by_admin_id LEFT JOIN users reviewer ON reviewer.user_id = ipr.reviewed_by_admin_id LEFT JOIN departments source_department ON source_department.department_id = ipr.requesting_department_id LEFT JOIN departments target_department ON target_department.department_id = ipr.requested_department_id WHERE ( ${whereParts.join(" OR ")} ) ORDER BY ipr.created_at DESC`, values);
        const requestIds = requests.map((request) => Number(request.request_id));
        let assignmentRows = [];
        if (requestIds.length) {
            const [rows] = await db.query(`SELECT ipa.assignment_id, ipa.request_id, ipa.project_id, ipa.employee_id, ipa.assigned_by_admin_id, DATE_FORMAT( ipa.start_date, '%Y-%m-%d' ) AS start_date, DATE_FORMAT( ipa.due_date, '%Y-%m-%d' ) AS due_date, ipa.assignment_status, ipa.created_at, ipa.updated_at, u.full_name, u.email, u.employee_code, u.designation, d.department_name FROM interdepartment_project_assignments ipa INNER JOIN users u ON u.user_id = ipa.employee_id LEFT JOIN departments d ON d.department_id = u.department_id WHERE ipa.request_id IN (?) ORDER BY u.full_name ASC`, [requestIds]);
            assignmentRows = rows;
        }
        const assignmentMap = new Map();
        for (const assignment of assignmentRows) {
            const requestId = Number(assignment.request_id);
            if (!assignmentMap.has(requestId)) {
                assignmentMap.set(requestId, []);
            }
            assignmentMap.get(requestId).push({
                assignment_id: assignment.assignment_id,
                employee_id: assignment.employee_id,
                full_name: assignment.full_name,
                email: assignment.email,
                employee_code: assignment.employee_code,
                designation: assignment.designation,
                department_name: assignment.department_name,
                start_date: assignment.start_date,
                due_date: assignment.due_date,
                assignment_status: assignment.assignment_status,
            });
        }
        const formattedRequests = requests.map((request) => ({
            ...request,
            assignments: assignmentMap.get(Number(request.request_id)) || [],
        }));
        const incoming = formattedRequests.filter((request) => departmentIds.includes(Number(request.requested_department_id)));
        const outgoing = formattedRequests.filter((request) => Number(request.requested_by_admin_id) === Number(adminUserId));
        return res.status(200).json({
            success: true,
            incoming,
            outgoing,
            requests: formattedRequests,
        });
    }
    catch (error) {
        console.error("Get interdepartment requests error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch Interdepartment Work Requests.",
            error: error.message,
            sqlMessage: error.sqlMessage || null,
        });
    }
};
const createInterdepartmentRequest = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const adminUserId = getLoggedInUserId(req);
        if (!adminUserId) {
            return res.status(401).json({
                success: false,
                message: "Admin account not found.",
            });
        }
        const adminDepartmentIds = await getUserDepartmentIds(connection, adminUserId, getLoggedInDepartmentId(req));
        const projectId = Number(req.body.project_id || 0);
        const requestedDepartmentId = Number(req.body.requested_department_id ||
            req.body.department_id ||
            0);
        const requestedDivisionId = Number(req.body.requested_division_id ||
            req.body.division_id ||
            0);
        const workDescription = String(req.body.work_description ||
            req.body.work_required ||
            "").trim();
        const requestedStartDate = formatDateOnly(req.body.requested_start_date ||
            req.body.start_date);
        const requestedEndDate = formatDateOnly(req.body.requested_end_date ||
            req.body.end_date ||
            req.body.due_date);
        if (!projectId || !requestedDepartmentId || !requestedDivisionId) {
            return res.status(400).json({
                success: false,
                message: "Project, requested department and requested division are required.",
            });
        }
        if (!workDescription) {
            return res.status(400).json({
                success: false,
                message: "Work required is mandatory.",
            });
        }
        if (!requestedStartDate || !requestedEndDate) {
            return res.status(400).json({
                success: false,
                message: "Requested start date and end date are required.",
            });
        }
        if (requestedStartDate > requestedEndDate) {
            return res.status(400).json({
                success: false,
                message: "Requested start date cannot be after requested end date.",
            });
        }
        if (adminDepartmentIds.includes(requestedDepartmentId)) {
            return res.status(400).json({
                success: false,
                message: "This department is already assigned to you. Use normal project assignment instead.",
            });
        }
        const [projectRows] = await connection.query(`SELECT p.project_id, p.project_title, p.project_description, p.created_by_user_id, p.department_id, DATE_FORMAT( p.start_date, '%Y-%m-%d' ) AS start_date, DATE_FORMAT( p.due_date, '%Y-%m-%d' ) AS due_date, d.department_name AS requesting_department_name FROM projects p LEFT JOIN departments d ON d.department_id = p.department_id WHERE p.project_id = ? LIMIT 1`, [projectId]);
        if (!projectRows.length) {
            return res.status(404).json({
                success: false,
                message: "Project not found.",
            });
        }
        const project = projectRows[0];
        if (!canAdminManageProjectRow(project, adminUserId, adminDepartmentIds)) {
            return res.status(403).json({
                success: false,
                message: "You are not allowed to request work for this project.",
            });
        }
        if (project.start_date &&
            requestedStartDate < project.start_date) {
            return res.status(400).json({
                success: false,
                message: `Requested start date cannot be before Project start date (${project.start_date}).`,
            });
        }
        if (project.due_date &&
            requestedEndDate > project.due_date) {
            return res.status(400).json({
                success: false,
                message: `Requested end date cannot exceed Project deadline (${project.due_date}).`,
            });
        }
        const [departmentRows] = await connection.query(`SELECT department_id, department_name FROM departments WHERE department_id = ? LIMIT 1`, [requestedDepartmentId]);
        if (!departmentRows.length) {
            return res.status(404).json({
                success: false,
                message: "Requested department not found.",
            });
        }
        const requestedDivision = await resolveProjectDivision(connection, requestedDivisionId, "");
        if (!requestedDivision) {
            return res.status(404).json({
                success: false,
                message: "Requested division not found or inactive.",
            });
        }
        const requestedDepartment = departmentRows[0];
        const [adminRows] = await connection.query(
  `SELECT DISTINCT
    u.user_id,
    u.full_name,
    u.email
   FROM users u
   INNER JOIN roles r
     ON r.role_id = u.role_id
   LEFT JOIN user_departments ud
     ON ud.user_id = u.user_id
   WHERE
     LOWER(COALESCE(r.role_name, '')) IN ('admin', 'administrator')
     AND LOWER(COALESCE(u.status, 'active')) = 'active'
     AND (
       u.department_id = ?
       OR ud.department_id = ?
     )`,
  [requestedDepartmentId, requestedDepartmentId]
);
       if (!adminRows.length) {
  console.warn(
    `Interdepartment request: no active Admin currently mapped to department ${requestedDepartmentId}. Request will still be created.`
  );
} 
        const [pendingRows] = await connection.query(`SELECT request_id FROM interdepartment_project_requests WHERE project_id = ? AND requested_department_id = ? AND requested_division_id = ? AND LOWER(COALESCE(status, 'pending')) = 'pending' LIMIT 1`, [
            projectId,
            requestedDepartmentId,
            requestedDivisionId,
        ]);
        if (pendingRows.length) {
            return res.status(409).json({
                success: false,
                message: "A pending Interdepartment Work Request already exists for this department and division.",
            });
        }
        await connection.beginTransaction();
        const [result] = await connection.query(`INSERT INTO interdepartment_project_requests ( project_id, requested_by_admin_id, requesting_department_id, requested_department_id, requested_division_id, work_description, requested_start_date, requested_end_date, status, created_at, updated_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW() )`, [
            projectId,
            adminUserId,
            project.department_id,
            requestedDepartmentId,
            requestedDivisionId,
            workDescription,
            requestedStartDate,
            requestedEndDate,
        ]);
        const requestId = Number(result.insertId);
      for (const departmentAdmin of adminRows) {
  try {
    await createRmsNotification(connection, {
      receiverUserId: departmentAdmin.user_id,
      actorUserId: adminUserId,
      eventKey: `interdepartment_request_${requestId}_${departmentAdmin.user_id}`,
      projectId,
      referenceType: "interdepartment_project_request",
      referenceId: requestId,
      notificationType: "interdepartment_request",
      priority: "high",
      title: "Interdepartment Work Request",
      message: `${
        req.user?.full_name ||
        req.user?.name ||
        "Admin"
      } requested ${requestedDepartment.department_name} / ${
        requestedDivision.division_name
      } support for "${project.project_title}".`,
      targetUrl: "/admin/projects",
    });
  } catch (notificationError) {
    console.error(
      `Interdepartment RMS notification failed for Admin ${departmentAdmin.user_id}:`,
      notificationError
    );
  }
}
        await connection.commit();
        const adminEmails = [
            ...new Set(adminRows
                .map((admin) => String(admin.email || "").trim())
                .filter(Boolean)),
        ];
        if (adminEmails.length) {
            try {
                await sendMail({
                    to: adminEmails,
                    replyTo: req.user?.email || undefined,
                    subject: `Interdepartment Work Request: ${project.project_title}`,
                    text: `
A new Interdepartment Work Request has been received.

Project: ${project.project_title}
Requesting Department: ${project.requesting_department_name || "-"}
Requested Department: ${requestedDepartment.department_name}
Requested Division: ${requestedDivision.division_name}
Requested By: ${req.user?.full_name || req.user?.name || "Admin"}

Project Description:
${project.project_description || "-"}

Work Required:
${workDescription}

Requested Timeline:
${requestedStartDate} to ${requestedEndDate}

Please login to Valencia RMS and open Projects to review the request.

Regards,
Valencia RMS
`,
                });
            }
            catch (emailError) {
                console.error("Interdepartment request email error:", emailError);
            }
        }
        return res.status(201).json({
            success: true,
            message: "Interdepartment Work Request sent successfully.",
            request_id: requestId,
            project_id: projectId,
            requested_department_id: requestedDepartmentId,
            requested_division_id: requestedDivisionId,
        });
    }
    catch (error) {
        try {
            await connection.rollback();
        }
        catch { }
        console.error("Create Interdepartment request error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to send Interdepartment Work Request.",
            error: error.message,
            sqlMessage: error.sqlMessage || null,
        });
    }
    finally {
        connection.release();
    }
};
const getInterdepartmentRequestEmployees = async (req, res) => {
    try {
        const adminUserId = getLoggedInUserId(req);
        if (!adminUserId) {
            return res.status(401).json({
                success: false,
                message: "Admin account not found.",
            });
        }
        const departmentIds = await getUserDepartmentIds(db, adminUserId, getLoggedInDepartmentId(req));
        const requestId = Number(req.params.requestId || 0);
        if (!requestId) {
            return res.status(400).json({
                success: false,
                message: "Request ID is required.",
            });
        }
        const [requestRows] = await db.query(`SELECT ipr.request_id, ipr.project_id, ipr.requested_department_id, ipr.requested_division_id, ipr.work_description, DATE_FORMAT( ipr.requested_start_date, '%Y-%m-%d' ) AS requested_start_date, DATE_FORMAT( ipr.requested_end_date, '%Y-%m-%d' ) AS requested_end_date, ipr.status, p.project_title, p.project_description, d.department_name AS requested_department_name, division_master.division_name AS requested_division_name FROM interdepartment_project_requests ipr INNER JOIN projects p ON p.project_id = ipr.project_id LEFT JOIN departments d ON d.department_id = ipr.requested_department_id LEFT JOIN divisions division_master ON division_master.division_id = ipr.requested_division_id WHERE ipr.request_id = ? LIMIT 1`, [requestId]);
        if (!requestRows.length) {
            return res.status(404).json({
                success: false,
                message: "Interdepartment request not found.",
            });
        }
        const request = requestRows[0];
        if (!departmentIds.includes(Number(request.requested_department_id))) {
            return res.status(403).json({
                success: false,
                message: "This request does not belong to one of your departments.",
            });
        }
        const [employees] = await db.query(`SELECT DISTINCT u.user_id, u.full_name, u.email, u.employee_code, u.designation, u.department_id, d.department_name, r.role_name FROM users u INNER JOIN roles r ON r.role_id = u.role_id LEFT JOIN departments d ON d.department_id = u.department_id LEFT JOIN user_departments ud ON ud.user_id = u.user_id WHERE LOWER(COALESCE(u.status, 'active')) = 'active' AND LOWER(COALESCE(r.role_name, '')) IN ( 'employee', 'administrator', 'admin' ) AND ( u.department_id = ? OR ud.department_id = ? ) ORDER BY u.full_name ASC`, [
            request.requested_department_id,
            request.requested_department_id,
        ]);
        return res.status(200).json({
            success: true,
            request,
            employees,
        });
    }
    catch (error) {
        console.error("Get Interdepartment employees error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch department employees.",
            error: error.message,
            sqlMessage: error.sqlMessage || null,
        });
    }
};
const reviewInterdepartmentRequest = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const adminUserId = getLoggedInUserId(req);
        if (!adminUserId) {
            return res.status(401).json({
                success: false,
                message: "Admin account not found.",
            });
        }
        const departmentIds = await getUserDepartmentIds(connection, adminUserId, getLoggedInDepartmentId(req));
        const requestId = Number(req.params.requestId || 0);
        const action = String(req.body.action || "")
            .trim()
            .toLowerCase();
        const reviewNote = String(req.body.review_note ||
            req.body.reason ||
            req.body.remark ||
            "").trim();
        if (!requestId) {
            return res.status(400).json({
                success: false,
                message: "Request ID is required.",
            });
        }
        if (!["approve", "reject"].includes(action)) {
            return res.status(400).json({
                success: false,
                message: "Action must be approve or reject.",
            });
        }
        await connection.beginTransaction();
        const [requestRows] = await connection.query(`SELECT ipr.*, p.project_title, p.project_description, DATE_FORMAT( p.start_date, '%Y-%m-%d' ) AS project_start_date, DATE_FORMAT( p.due_date, '%Y-%m-%d' ) AS project_due_date, requester.full_name AS requested_by_name, requester.email AS requested_by_email, requested_department.department_name AS requested_department_name, requested_division.division_name AS requested_division_name FROM interdepartment_project_requests ipr INNER JOIN projects p ON p.project_id = ipr.project_id LEFT JOIN users requester ON requester.user_id = ipr.requested_by_admin_id LEFT JOIN departments requested_department ON requested_department.department_id = ipr.requested_department_id LEFT JOIN divisions requested_division ON requested_division.division_id = ipr.requested_division_id WHERE ipr.request_id = ? FOR UPDATE`, [requestId]);
        if (!requestRows.length) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Interdepartment request not found.",
            });
        }
        const request = requestRows[0];
        if (!departmentIds.includes(Number(request.requested_department_id))) {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message: "This request does not belong to one of your departments.",
            });
        }
        if (String(request.status || "").toLowerCase() !== "pending") {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message: "This request has already been reviewed.",
            });
        }
        if (action === "reject") {
            if (!reviewNote) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: "Rejection reason is required.",
                });
            }
            await connection.query(`UPDATE interdepartment_project_requests SET status = 'rejected', reviewed_by_admin_id = ?, review_note = ?, reviewed_at = NOW(), updated_at = NOW() WHERE request_id = ?`, [
                adminUserId,
                reviewNote,
                requestId,
            ]);
            await createRmsNotification(connection, {
                receiverUserId: request.requested_by_admin_id,
                actorUserId: adminUserId,
                eventKey: `interdepartment_rejected_${requestId}`,
                projectId: request.project_id,
                referenceType: "interdepartment_project_request",
                referenceId: requestId,
                notificationType: "interdepartment_request_rejected",
                priority: "high",
                title: "Interdepartment Request Rejected",
                message: `${request.requested_department_name ||
                    "Requested department"} rejected the request for "${request.project_title}".`,
                targetUrl: "/admin/projects",
            });
            await connection.commit();
            if (request.requested_by_email) {
                try {
                    await sendMail({
                        to: request.requested_by_email,
                        replyTo: req.user?.email || undefined,
                        subject: `Interdepartment Request Rejected: ${request.project_title}`,
                        text: `
The Interdepartment Work Request for "${request.project_title}" has been rejected.

Department:
${request.requested_department_name || "-"}

Division:
${request.requested_division_name || "-"}

Reason:
${reviewNote}

Reviewed By:
${req.user?.full_name || req.user?.name || "Admin"}

Please login to Valencia RMS for details.

Regards,
Valencia RMS
`,
                    });
                }
                catch (emailError) {
                    console.error("Interdepartment rejection email error:", emailError);
                }
            }
            return res.status(200).json({
                success: true,
                message: "Interdepartment request rejected.",
                request_id: requestId,
            });
        }
        const employeeIds = normalizeIdArray(req.body.employee_ids ||
            req.body.assignee_ids);
        const approvedStartDate = formatDateOnly(req.body.approved_start_date ||
            req.body.start_date);
        const approvedEndDate = formatDateOnly(req.body.approved_end_date ||
            req.body.end_date ||
            req.body.due_date);
        if (!employeeIds.length) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Select at least one employee.",
            });
        }
        if (!approvedStartDate || !approvedEndDate) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Approved start date and end date are required.",
            });
        }
        if (approvedStartDate > approvedEndDate) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Approved start date cannot be after approved end date.",
            });
        }
        if (request.project_start_date &&
            approvedStartDate < request.project_start_date) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `Approved start date cannot be before Project start date (${request.project_start_date}).`,
            });
        }
        if (request.project_due_date &&
            approvedEndDate > request.project_due_date) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `Approved end date cannot exceed Project deadline (${request.project_due_date}).`,
            });
        }
        const validEmployees = await getValidAssigneesForDepartments(connection, employeeIds, [Number(request.requested_department_id)]);
        const validEmployeeSet = new Set(validEmployees.map(Number));
        const invalidEmployees = employeeIds.filter((employeeId) => !validEmployeeSet.has(Number(employeeId)));
        if (invalidEmployees.length) {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message: "One or more selected employees do not belong to the requested department.",
            });
        }
        for (const employeeId of employeeIds) {
            await connection.query(`INSERT INTO interdepartment_project_assignments ( request_id, project_id, employee_id, assigned_by_admin_id, start_date, due_date, assignment_status, created_at, updated_at ) VALUES ( ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW() ) ON DUPLICATE KEY UPDATE assigned_by_admin_id = VALUES(assigned_by_admin_id), start_date = VALUES(start_date), due_date = VALUES(due_date), assignment_status = 'active', updated_at = NOW()`, [
                requestId,
                request.project_id,
                employeeId,
                adminUserId,
                approvedStartDate,
                approvedEndDate,
            ]);
            const [existingAssignment] = await connection.query(`SELECT assignment_id FROM project_assignments WHERE project_id = ? AND employee_id = ? LIMIT 1`, [
                request.project_id,
                employeeId,
            ]);
            if (existingAssignment.length) {
                await connection.query(`UPDATE project_assignments SET assigned_by_user_id = ?, assignment_status = 'assigned', assigned_at = NOW() WHERE project_id = ? AND employee_id = ?`, [
                    adminUserId,
                    request.project_id,
                    employeeId,
                ]);
            }
            else {
                await connection.query(`INSERT INTO project_assignments ( project_id, employee_id, assigned_by_user_id, assignment_status, employee_progress, assigned_at ) VALUES ( ?, ?, ?, 'assigned', 0, NOW() )`, [
                    request.project_id,
                    employeeId,
                    adminUserId,
                ]);
            }
        }
        /*
        Approval does not create a special task.
        The requesting Admin assigns the normal Main Task
        through the existing project task flow.
        */
        await connection.query(`UPDATE interdepartment_project_requests SET status = 'approved', reviewed_by_admin_id = ?, review_note = ?, approved_start_date = ?, approved_end_date = ?, reviewed_at = NOW(), updated_at = NOW() WHERE request_id = ?`, [
            adminUserId,
            reviewNote || null,
            approvedStartDate,
            approvedEndDate,
            requestId,
        ]);
        await createRmsNotification(connection, {
            receiverUserId: request.requested_by_admin_id,
            actorUserId: adminUserId,
            eventKey: `interdepartment_approved_${requestId}`,
            projectId: request.project_id,
            referenceType: "interdepartment_project_request",
            referenceId: requestId,
            notificationType: "interdepartment_request_approved",
            priority: "high",
            title: "Interdepartment Request Approved",
            message: `${request.requested_department_name ||
                "Requested department"} approved the request for "${request.project_title}".`,
            targetUrl: "/admin/projects",
        });
        await connection.commit();
        if (request.requested_by_email) {
            try {
                await sendMail({
                    to: request.requested_by_email,
                    replyTo: req.user?.email || undefined,
                    subject: `Interdepartment Request Approved: ${request.project_title}`,
                    text: `
The Interdepartment Work Request for "${request.project_title}" has been approved.

Department:
${request.requested_department_name || "-"}

Division:
${request.requested_division_name || "-"}

Approved Timeline:
${approvedStartDate} to ${approvedEndDate}

Employees Assigned:
${employeeIds.length}

Review Note:
${reviewNote || "-"}

Approved By:
${req.user?.full_name || req.user?.name || "Admin"}

The approved employees are now available inside this Project.
You can assign the relevant Main Tasks through the normal Valencia RMS task flow.

Regards,
Valencia RMS
`,
                });
            }
            catch (emailError) {
                console.error("Interdepartment approval email error:", emailError);
            }
        }
        return res.status(200).json({
            success: true,
            message: "Interdepartment request approved and employees added to the project.",
            request_id: requestId,
            project_id: Number(request.project_id),
            employee_ids: employeeIds,
            approved_start_date: approvedStartDate,
            approved_end_date: approvedEndDate,
        });
    }
    catch (error) {
        try {
            await connection.rollback();
        }
        catch { }
        console.error("Review Interdepartment request error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to review Interdepartment Work Request.",
            error: error.message,
            sqlMessage: error.sqlMessage || null,
        });
    }
    finally {
        connection.release();
    }
};
/*
========================================================
EXPORT PROJECT CSV
========================================================
*/
const exportAdminProjectsCsv = async (req, res) => {
    try {
        const [projects] = await db.query(`SELECT p.project_title, p.project_description, p.division, p.status, p.priority, DATE_FORMAT( p.start_date, '%Y-%m-%d' ) AS start_date, DATE_FORMAT( p.due_date, '%Y-%m-%d' ) AS due_date, creator.full_name AS created_by FROM projects p LEFT JOIN users creator ON creator.user_id = p.created_by_user_id ORDER BY p.project_id DESC`);
        const headers = [
            "project_title",
            "project_description",
            "division",
            "status",
            "priority",
            "start_date",
            "due_date",
            "created_by",
        ];
        const csv = [
            headers.join(","),
            ...projects.map((project) => headers
                .map((header) => `"${String(project[header] || "").replace(/"/g, '""')}"`)
                .join(",")),
        ].join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=admin-projects.csv");
        return res.send(csv);
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to export projects.",
            error: error.message,
        });
    }
};
/*
========================================================
EXPORTS / COMPATIBILITY ALIASES
========================================================
*/
module.exports = {
    getInterdepartmentDepartments,
    getInterdepartmentRequests,
    createInterdepartmentRequest,
    getInterdepartmentRequestEmployees,
    reviewInterdepartmentRequest,
    getAdminProjects,
    getProjectDivisions,
    exportAdminProjectsCsv,
    getDepartmentProjects: getAdminProjects,
    getDepartmentProjectsForAdmin: getAdminProjects,
    getProjects: getAdminProjects,
    getAllProjects: getAdminProjects,
    createAdminProject,
    createProject: createAdminProject,
    assignProject: createAdminProject,
    addProject: createAdminProject,
    updateAdminProject,
    updateProject: updateAdminProject,
    updateProjectDetails: updateAdminProject,
    editProject: updateAdminProject,
    deleteAdminProject,
    deleteProject: deleteAdminProject,
    removeProject: deleteAdminProject,
    getAssignableUsersForAdminProjects,
    getAssignableUsers: getAssignableUsersForAdminProjects,
    getAdminProjectUsers: getAssignableUsersForAdminProjects,
    getProjectUsers: getAssignableUsersForAdminProjects,
    getUsersForProjects: getAssignableUsersForAdminProjects,
    createMainTask,
    addMainTask: createMainTask,
    createProjectTask: createMainTask,
    addProjectTask: createMainTask,
    createAdminProjectTask: createMainTask,
    updateMainTask,
    updateProjectTask: updateMainTask,
    updateAdminProjectTask: updateMainTask,
    editMainTask: updateMainTask,
};
