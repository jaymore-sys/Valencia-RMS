const db = require("../config/db");

const mainTaskCondition = `(t.parent_task_id IS NULL OR t.parent_task_id = 0)`;

const PROJECT_DIVISIONS = [
  "POS",
  "NutraCare",
  "ADV",
  "Cans",
  "PET",
  "Crunzo",
  "Healthybites",
];


/* =========================================================
   HELPERS
========================================================= */


const getLoggedInUserId = (req) =>
  Number(
    req.user?.user_id ||
      req.user?.id ||
      req.userId ||
      0
  );


const formatDateOnly = (value) => {
  if (!value) return null;

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
};


const normalizeIdArray = (value) => {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  return [
    ...new Set(
      source
        .map((item) =>
          Number(
            item?.user_id ??
            item?.employee_id ??
            item
          )
        )
        .filter(
          (item) =>
            Number.isInteger(item) &&
            item > 0
        )
    ),
  ];
};


const normalizeStatus = (
  status,
  progress = 0
) => {

  const value = String(status || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");


  if (
    [
      "done",
      "completed",
      "complete",
    ].includes(value)
  ) {
    return "completed";
  }


  if (
    [
      "ongoing",
      "in_progress",
      "progress",
    ].includes(value)
  ) {
    return "in_progress";
  }


  if (
    [
      "under_review",
      "review",
      "pending_review",
    ].includes(value)
  ) {
    return "under_review";
  }


  if (
    [
      "rejected",
      "reject",
    ].includes(value)
  ) {
    return "rejected";
  }


  if (
    [
      "blocked",
      "on_hold",
      "hold",
    ].includes(value)
  ) {
    return "on_hold";
  }


  if (
    [
      "cancelled",
      "canceled",
    ].includes(value)
  ) {
    return "cancelled";
  }


  if (Number(progress) >= 100) {
    return "completed";
  }


  if (Number(progress) > 0) {
    return "in_progress";
  }


  return "not_started";
};



const combineCsvValues = (
  ...values
) => {

  const output = [];

  values.forEach((value)=>{

    String(value || "")
      .split(",")
      .map((item)=>item.trim())
      .filter(Boolean)
      .forEach((item)=>{

        if(!output.includes(item)){
          output.push(item);
        }

      });

  });


  return output.join(", ");
};




/* =========================================================
   FIELD VISITS
========================================================= */


const getSuperadminFieldVisits = async (
  req,
  res
) => {

  try {

    const [visits] = await db.query(
      `
      SELECT
        fv.visit_id,
        fv.employee_id,

        u.full_name,
        u.email,
        u.employee_code,

        d.department_name,

        fv.visit_type,
        fv.visit_date,
        fv.start_time,
        fv.end_time,
        fv.location,
        fv.comment,

        fv.status,
        fv.review_remark,

        fv.created_at,
        fv.updated_at

      FROM employee_field_visits fv

      INNER JOIN users u
        ON fv.employee_id = u.user_id

      LEFT JOIN departments d
        ON u.department_id = d.department_id

      ORDER BY fv.created_at DESC
      `
    );


    res.json({

      success:true,

      summary:{
        total:visits.length,

        approved:
          visits.filter(
            v=>v.status==="approved"
          ).length,

        pending:
          visits.filter(
            v=>v.status==="pending"
          ).length,

        rejected:
          visits.filter(
            v=>v.status==="rejected"
          ).length,

        employees:
          new Set(
            visits.map(
              v=>v.employee_id
            )
          ).size
      },


      visits

    });


  } catch(error){

    console.error(
      "Superadmin field visits error:",
      error
    );


    res.status(500).json({

      success:false,

      message:
        "Failed to fetch field visits"

    });

  }

};




/* =========================================================
   PROJECT ASSIGNMENT USER COLUMN
========================================================= */


const getProjectAssignmentUserColumn =
async()=>{

  try{

    const [columns] =
      await db.query(
        "SHOW COLUMNS FROM project_assignments"
      );


    const columnNames =
      columns.map(
        c=>c.Field
      );


    const possibleColumns=[
      "employee_id",
      "assigned_to_user_id",
      "user_id",
      "assigned_user_id",
    ];


    return possibleColumns.find(
      c=>columnNames.includes(c)
    ) || null;


  }catch(error){

    return null;

  }

};
/* =========================================================
   VALIDATE ASSIGNABLE USERS
========================================================= */

const validateAssignableUsers =
async (
  connection,
  userIds
)=>{

  if(!userIds.length){
    return [];
  }


  const [rows] =
    await connection.query(
      `
      SELECT
        u.user_id,
        u.full_name,
        u.email,
        u.employee_code,
        u.designation,
        u.department_id,
        u.status,

        d.department_name,

        r.role_name

      FROM users u

      LEFT JOIN departments d
        ON d.department_id =
           u.department_id

      LEFT JOIN roles r
        ON r.role_id =
           u.role_id

      WHERE
        u.user_id IN (?)

        AND LOWER(
          COALESCE(
            u.status,
            'active'
          )
        )='active'

        AND LOWER(
          COALESCE(
            r.role_name,
            ''
          )
        ) IN(
          'employee',
          'admin',
          'administrator'
        )
      `,
      [userIds]
    );


  const validIds =
    new Set(
      rows.map(
        row=>Number(row.user_id)
      )
    );


  const invalidIds =
    userIds.filter(
      id=>!validIds.has(
        Number(id)
      )
    );


  if(invalidIds.length){

    const error =
      new Error(
        "One or more selected users are invalid, inactive or cannot receive projects."
      );

    error.statusCode=400;

    throw error;

  }


  return rows;

};




/* =========================================================
   PROJECT ASSIGNMENTS
========================================================= */


const syncProjectAssignments =
async(
 connection,
 projectId,
 employeeIds,
 assignedByUserId
)=>{


 const [existingRows] =
 await connection.query(
 `
 SELECT
  employee_id,
  COALESCE(
    employee_progress,
    0
  ) AS employee_progress

 FROM project_assignments

 WHERE project_id=?
 `,
 [projectId]
 );


 const progressMap =
 new Map(
  existingRows.map(
    row=>[
      Number(row.employee_id),
      Number(row.employee_progress || 0)
    ]
  )
 );


 await connection.query(
 `
 DELETE FROM project_assignments

 WHERE project_id=?
 `,
 [projectId]
 );


 for(
   const employeeId of employeeIds
 ){

  await connection.query(
   `
   INSERT INTO project_assignments(

    project_id,
    employee_id,
    assigned_by_user_id,
    assignment_status,
    employee_progress,
    assigned_at

   )

   VALUES(
    ?,
    ?,
    ?,
    'assigned',
    ?,
    NOW()
   )
   `,
   [
    projectId,
    employeeId,
    assignedByUserId || null,
    progressMap.get(
      Number(employeeId)
    ) || 0
   ]
  );

 }

};





/* =========================================================
   MAIN TASK ASSIGNMENTS
========================================================= */


const syncMainTaskAssignments =
async(
 connection,
 taskId,
 employeeIds,
 assignedByUserId
)=>{


 await connection.query(
 `
 DELETE FROM task_assignments

 WHERE task_id=?
 `,
 [taskId]
 );


 for(
  const employeeId of employeeIds
 ){

  await connection.query(
  `
  INSERT INTO task_assignments(

    task_id,
    employee_id,
    assigned_by_user_id,
    assigned_at

  )

  VALUES(
    ?,
    ?,
    ?,
    NOW()
  )
  `,
  [
    taskId,
    employeeId,
    assignedByUserId || null
  ]
  );

 }


 await connection.query(
 `
 UPDATE tasks

 SET assigned_to_user_id=?

 WHERE task_id=?
 `,
 [
   employeeIds[0] || null,
   taskId
 ]
 );


};






/* =========================================================
   SUBTASK ATTACH + PROGRESS
========================================================= */


const attachSubtasksAndProgress =
async(tasks)=>{


 if(!tasks.length){
  return [];
 }


 const taskIds =
 tasks.map(
  task=>task.task_id
 );


 const [subtasks] =
 await db.query(
 `
 SELECT

 task_id,
 project_id,
 parent_task_id,

 task_title,
 task_description,

 status,

 COALESCE(
  progress,
  0
 ) AS progress,


 COALESCE(
  is_checked,
  0
 ) AS is_checked,


 DATE_FORMAT(
  start_date,
  '%Y-%m-%d'
 ) AS start_date,


 DATE_FORMAT(
  due_date,
  '%Y-%m-%d'
 ) AS due_date


 FROM tasks


 WHERE parent_task_id IN(?)


 ORDER BY
 created_at ASC,
 task_id ASC

 `,
 [taskIds]
 );



 return tasks.map(task=>{


 const taskSubtasks =
 subtasks.filter(
  sub =>
   Number(sub.parent_task_id)
   ===
   Number(task.task_id)
 );


 const totalSubtasks =
 taskSubtasks.length;


 const completedSubtasks =
 taskSubtasks.filter(sub=>{


 return (

 Number(sub.is_checked)===1

 ||

 [
  "completed",
  "done",
  "complete"
 ]
 .includes(
  String(sub.status||"")
  .toLowerCase()
 )

 ||

 Number(sub.progress||0)>=100

 );


 }).length;



 let computedProgress =
 Number(
  task.progress || 0
 );


 let computedStatus =
 normalizeStatus(
  task.status,
  computedProgress
 );



 if(totalSubtasks>0){


 computedProgress =
 Math.round(
  (
   completedSubtasks /
   totalSubtasks
  )*100
 );


 computedStatus =
 completedSubtasks===0
 ?
 "not_started"
 :
 completedSubtasks <
 totalSubtasks
 ?
 "in_progress"
 :
 "completed";


 }



 return{

  ...task,

  progress:
   computedProgress,


  computed_progress:
   computedProgress,


  status_group:
   computedStatus,


  total_subtasks:
   totalSubtasks,


  completed_subtasks:
   completedSubtasks,


  pending_subtasks:
   totalSubtasks -
   completedSubtasks,


  subtasks:
   taskSubtasks

 };


 });


};
/* =========================================================
   ALL MAIN TASKS
========================================================= */

const getAllMainTasks =
async()=>{

 const [tasks] =
 await db.query(
 `
 SELECT

 t.task_id,
 t.project_id,

 t.assigned_to_user_id,
 t.created_by_user_id,

 t.task_title,
 t.task_description,

 t.task_type,
 t.priority,
 t.status,


 COALESCE(
  t.progress,
  0
 ) AS progress,


 DATE_FORMAT(
  t.start_date,
  '%Y-%m-%d'
 ) AS start_date,


 DATE_FORMAT(
  t.due_date,
  '%Y-%m-%d'
 ) AS due_date,


 DATE_FORMAT(
  t.created_at,
  '%Y-%m-%d %H:%i'
 ) AS created_at,


 p.project_title,
 p.project_description,


 p.department_id
 AS project_department_id,


 p.division
 AS project_division,


 p.status
 AS project_status,


 COALESCE(
  p.overall_progress,
  0
 ) AS project_progress,


 primary_assignee.full_name
 AS primary_assignee_name,


 primary_assignee.email
 AS primary_assignee_email,


 primary_assignee.employee_code
 AS primary_assignee_employee_code,


 primary_assignee.designation
 AS primary_assignee_designation,


 creator.full_name
 AS assigned_by_name,


 creator.email
 AS assigned_by_email,


 creator.designation
 AS assigned_by_designation,


 d.department_name


 FROM tasks t


 LEFT JOIN projects p

 ON p.project_id =
 t.project_id



 LEFT JOIN users primary_assignee

 ON primary_assignee.user_id =
 t.assigned_to_user_id



 LEFT JOIN users creator

 ON creator.user_id =
 t.created_by_user_id



 LEFT JOIN departments d

 ON d.department_id =
 p.department_id



 WHERE ${mainTaskCondition}



 ORDER BY

 t.created_at DESC

 `
 );


 if(!tasks.length){
  return [];
 }



 const taskIds =
 tasks.map(
  t=>t.task_id
 );



 let assignmentRows=[];


 try{


 const [rows] =
 await db.query(
 `
 SELECT

 ta.task_id,

 ta.employee_id,


 u.full_name,

 u.email,

 u.employee_code,

 u.designation,


 d.department_name,


 r.role_name



 FROM task_assignments ta


 INNER JOIN users u

 ON u.user_id =
 ta.employee_id



 LEFT JOIN departments d

 ON d.department_id =
 u.department_id



 LEFT JOIN roles r

 ON r.role_id =
 u.role_id



 WHERE ta.task_id IN(?)


 ORDER BY
 u.full_name ASC

 `,
 [taskIds]
 );


 assignmentRows=rows;


 }catch(error){

 assignmentRows=[];

 }




 const assignmentMap =
 new Map();



 assignmentRows.forEach(row=>{


 const id =
 Number(row.task_id);



 if(!assignmentMap.has(id)){

  assignmentMap.set(
   id,
   []
  );

 }



 assignmentMap.get(id).push({

  user_id:
   row.employee_id,


  employee_id:
   row.employee_id,


  full_name:
   row.full_name,


  email:
   row.email,


  employee_code:
   row.employee_code,


  designation:
   row.designation,


  department_name:
   row.department_name,


  role_name:
   row.role_name


 });


 });




 const enriched =
 tasks.map(task=>{


 let assignees =
 assignmentMap.get(
  Number(task.task_id)
 )
 || [];



 if(
  !assignees.length &&
  task.assigned_to_user_id
 ){

 assignees=[{

 user_id:
 task.assigned_to_user_id,


 employee_id:
 task.assigned_to_user_id,


 full_name:
 task.primary_assignee_name,


 email:
 task.primary_assignee_email,


 employee_code:
 task.primary_assignee_employee_code,


 designation:
 task.primary_assignee_designation

 }];

 }



 return{

 ...task,


 assignees,


 assigned_user_ids:

 assignees
 .map(a=>a.user_id)
 .join(", "),


 assigned_names:

 assignees
 .map(a=>a.full_name)
 .join(", "),


 assignee_name:
 assignees[0]?.full_name ||
 task.primary_assignee_name ||
 "-",


 assignee_email:
 assignees[0]?.email ||
 task.primary_assignee_email ||
 "-",


 assigned_emails:

 assignees
 .map(a=>a.email)
 .join(", ")


 };


 });



 return attachSubtasksAndProgress(
  enriched
 );


};
/* =========================================================
   ALL PROJECTS
========================================================= */


const getAllProjects =
async()=>{


 const assignmentUserColumn =
 await getProjectAssignmentUserColumn();



 const assignmentJoin =
 assignmentUserColumn
 ?
 `
 LEFT JOIN project_assignments pa

 ON pa.project_id =
 p.project_id


 AND COALESCE(
 pa.assignment_status,
 'assigned'
 ) <> 'removed'



 LEFT JOIN users assigned_project_user

 ON assigned_project_user.user_id =
 pa.${assignmentUserColumn}

 `
 :
 "";



 const assignmentSelect =
 assignmentUserColumn
 ?
 `
 GROUP_CONCAT(
 DISTINCT
 assigned_project_user.user_id
 SEPARATOR ', '
 )
 AS project_assigned_user_ids,


 GROUP_CONCAT(
 DISTINCT
 assigned_project_user.full_name
 SEPARATOR ', '
 )
 AS project_assigned_names,


 GROUP_CONCAT(
 DISTINCT
 assigned_project_user.email
 SEPARATOR ', '
 )
 AS project_assigned_emails,

 `
 :
 `
 NULL AS project_assigned_user_ids,

 NULL AS project_assigned_names,

 NULL AS project_assigned_emails,

 `;



 const [rows] =
 await db.query(
 `
 SELECT


 p.project_id,

 p.created_by_user_id,

 p.department_id,

 p.division,


 p.project_title,

 p.project_description,


 p.priority,

 p.status,


 p.rejection_remark,


 COALESCE(
 p.overall_progress,
 0
 )
 AS overall_progress,



 DATE_FORMAT(
 p.start_date,
 '%Y-%m-%d'
 )
 AS start_date,


 DATE_FORMAT(
 p.due_date,
 '%Y-%m-%d'
 )
 AS due_date,



 d.department_name,



 creator.full_name
 AS created_by_name,


 creator.email
 AS created_by_email,



 ${assignmentSelect}




 GROUP_CONCAT(
 DISTINCT
 task_user.user_id
 SEPARATOR ', '
 )
 AS task_assigned_user_ids,



 GROUP_CONCAT(
 DISTINCT
 task_user.full_name
 SEPARATOR ', '
 )
 AS task_assigned_names,



 GROUP_CONCAT(
 DISTINCT
 task_user.email
 SEPARATOR ', '
 )
 AS task_assigned_emails,



 COUNT(
 DISTINCT
 t.task_id
 )
 AS total_tasks,



 COUNT(
 DISTINCT

 CASE

 WHEN t.status IN(
 'completed',
 'done'
 )

 THEN t.task_id

 END

 )
 AS completed_tasks,



 COUNT(
 DISTINCT

 CASE

 WHEN t.status IN(
 'in_progress',
 'ongoing'
 )

 THEN t.task_id

 END

 )
 AS in_progress_tasks,



 COUNT(
 DISTINCT

 CASE

 WHEN t.status IS NULL

 OR t.status IN(
 'not_started',
 'todo'
 )

 THEN t.task_id

 END

 )
 AS todo_tasks



 FROM projects p



 LEFT JOIN departments d

 ON d.department_id =
 p.department_id



 LEFT JOIN users creator

 ON creator.user_id =
 p.created_by_user_id



 ${assignmentJoin}




 LEFT JOIN tasks t

 ON t.project_id =
 p.project_id


 AND (
 t.parent_task_id IS NULL

 OR t.parent_task_id = 0
 )



 LEFT JOIN users task_user

 ON task_user.user_id =
 t.assigned_to_user_id



 GROUP BY


 p.project_id,

 p.created_by_user_id,

 p.department_id,

 p.division,


 p.project_title,

 p.project_description,


 p.priority,

 p.status,


 p.rejection_remark,


 p.overall_progress,


 p.start_date,

 p.due_date,


 d.department_name,


 creator.full_name,

 creator.email



 ORDER BY

 p.created_at DESC


 `
 );



 return rows.map(project=>{


 const assignedUserIds =
 combineCsvValues(

 project.project_assigned_user_ids,

 project.task_assigned_user_ids

 );



 const assignedNames =
 combineCsvValues(

 project.project_assigned_names,

 project.task_assigned_names

 );



 const assignedEmails =
 combineCsvValues(

 project.project_assigned_emails,

 project.task_assigned_emails

 );



 return {


 ...project,


 assigned_user_ids:
 assignedUserIds,


 assigned_names:
 assignedNames,


 assigned_emails:
 assignedEmails



 };


 });



};





/* =========================================================
   ALL USERS
========================================================= */


const getAllUsersBase =
async()=>{


 const [users] =
 await db.query(
 `
 SELECT


 u.user_id,

 u.employee_code,

 u.full_name,

 u.email,

 u.phone,

 u.designation,

 u.status,


 u.department_id,

 u.role_id,


 r.role_name,


 d.department_name



 FROM users u



 JOIN roles r

 ON r.role_id =
 u.role_id



 LEFT JOIN departments d

 ON d.department_id =
 u.department_id



 WHERE
 u.status!='deleted'



 ORDER BY
 u.full_name ASC


 `
 );


 return users;


};





/* =========================================================
   ATTENDANCE SUMMARY
========================================================= */


const getAttendanceSummaryMap =
async()=>{


 const [rows] =
 await db.query(
 `
 SELECT


 employee_id
 AS user_id,


 COUNT(*)
 AS total_days,



 SUM(

 CASE

 WHEN LOWER(status)='present'

 THEN 1

 ELSE 0

 END

 )
 AS present_days



 FROM attendance



 GROUP BY employee_id


 `
 );



 const map=new Map();



 rows.forEach(row=>{


 const total =
 Number(
 row.total_days || 0
 );



 const present =
 Number(
 row.present_days || 0
 );



 map.set(

 Number(row.user_id),

 {

 total_days:total,


 present_days:present,


 attendance_percentage:

 total>0

 ?

 Math.round(
 (
 present /
 total
 )
 *
 100
 )

 :

 0


 }

 );


 });



 return map;


};



const getSuperadminOverview = async (req, res) => {
  try {

    const [
      projects,
      tasks,
      users
    ] = await Promise.all([
      getAllProjects(),
      getAllMainTasks(),
      getAllUsersBase()
    ]);

    res.json({
      success: true,

      summary: {
        total_projects: projects.length,
        total_tasks: tasks.length,
        total_users: users.length,
        active_tasks: tasks.filter(
          task => [
            "in_progress",
            "under_review"
          ].includes(
            String(task.status_group || "").toLowerCase()
          )
        ).length,
        pending_tasks: tasks.filter(
          task =>
            String(task.status_group || "").toLowerCase() !== "completed"
        ).length
      },

      // Frontend compatibility
      stats: {
        total_projects: projects.length,
        total_tasks: tasks.length,
        total_users: users.length,
        active_tasks: tasks.filter(
          task => [
            "in_progress",
            "under_review"
          ].includes(
            String(task.status_group || "").toLowerCase()
          )
        ).length,
        pending_tasks: tasks.filter(
          task =>
            String(task.status_group || "").toLowerCase() !== "completed"
        ).length
      },

      projects,
      tasks,
      users

    });

  } catch(error) {

    console.error(
      "SUPERADMIN OVERVIEW ERROR:",
      error
    );

    res.status(500).json({
      success:false,
      message:error.message
    });

  }
};



/* =========================================================
   API RESPONSE HANDLERS
========================================================= */

const getSuperadminProjects = async(req,res)=>{
  try{
    const projects = await getAllProjects();
    res.json({
      success:true,
      projects
    });
  }catch(error){
    console.error("SUPERADMIN PROJECTS ERROR:", error);
    res.status(500).json({
      success:false,
      message:error.message
    });
  }
};


const getSuperadminTasks = async(req,res)=>{
  try{
    const tasks = await getAllMainTasks();
    res.json({
      success:true,
      tasks
    });
  }catch(error){
    console.error("SUPERADMIN TASKS ERROR:", error);
    res.status(500).json({
      success:false,
      message:error.message
    });
  }
};


const getSuperadminUsers = async(req,res)=>{
  try{
    const users = await getAllUsersBase();
    res.json({
      success:true,
      users
    });
  }catch(error){
    console.error("SUPERADMIN USERS ERROR:", error);
    res.status(500).json({
      success:false,
      message:error.message
    });
  }
};

const getSuperadminProjectOptions = async(req,res)=>{

try{


res.json({

success:true,

departments:[],

employees:[]

});


}
catch(error){

console.log(
"PROJECT OPTIONS ERROR:",
error
);


res.status(500).json({

success:false,

message:error.message

});


}

};

module.exports = {

  getSuperadminFieldVisits,

  getAllProjects,
  getAllMainTasks,
  getAllUsersBase,

  getSuperadminProjects,
  getSuperadminTasks,
  getSuperadminUsers,

  getSuperadminProjectOptions,

  getSuperadminOverview

};