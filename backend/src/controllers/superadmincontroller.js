const db = require("../config/db");

const { sendMail } =
  require("../utils/emailservice");

const getLeaveLabel = (type) => {
  if (type === "sick") {
    return "Sick Leave";
  }

  if (type === "casual") {
    return "Casual Leave";
  }

  if (type === "mandatory") {
    return "Privileged Leave";
  }

  if (type === "festival") {
    return "Festival Leave";
  }

  if (type === "unpaid") {
    return "Unpaid Leave";
  }

  return type || "Leave";
};

const {
  buildLeaveBalances,
} = require("../utils/leavepolicy");
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

const getFieldVisitReviewer = async (req) => {
  const userId = getLoggedInUserId(req);

  if (!userId) {
    return {
      error: {
        status: 401,
        message: "Unauthorized.",
      },
    };
  }

  const [rows] = await db.query(
    `
      SELECT
        u.user_id,
        u.full_name,
        u.email,
        u.status,
        r.role_name

      FROM users u

      LEFT JOIN roles r
        ON r.role_id = u.role_id

      WHERE u.user_id = ?

      LIMIT 1
    `,
    [userId]
  );

  if (!rows.length) {
    return {
      error: {
        status: 404,
        message: "Reviewer account not found.",
      },
    };
  }

  const reviewer = rows[0];

  const roleName = String(
    reviewer.role_name || ""
  )
    .trim()
    .toLowerCase();

    const reviewerEmail = String(
  reviewer.email || ""
)
  .trim()
  .toLowerCase();

const isSuperadmin =
  roleName === "superadmin";

const isPremal =
  roleName === "admin" &&
  reviewerEmail ===
    "premal.mehta@valencianutrition.com";


  if (!isSuperadmin && !isPremal) {
    return {
      error: {
        status: 403,
        message:
          "Only Superadmin or Premal Mehta can review Admin field visits.",
      },
    };
  }

  return {
    reviewer,
  };
};

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


const attachFieldVisitStops =
async (visits) => {

  if (
    !Array.isArray(visits) ||
    !visits.length
  ) {
    return [];
  }

  const visitIds =
    visits
      .map(
        (visit) =>
          Number(
            visit.visit_id
          )
      )
      .filter(Boolean);

  if (!visitIds.length) {
    return visits;
  }

  const [stopRows] =
    await db.query(
      `
        SELECT
          stop_id,
          visit_id,
          sequence_no,
          location,
          visit_time,
          description,
          created_at,
          updated_at

        FROM field_visit_stops

        WHERE visit_id IN (?)

        ORDER BY
          visit_id ASC,
          sequence_no ASC,
          stop_id ASC
      `,
      [visitIds]
    );

  const stopMap =
    new Map();

  stopRows.forEach(
    (stop) => {

      const visitId =
        Number(
          stop.visit_id
        );

      if (
        !stopMap.has(
          visitId
        )
      ) {
        stopMap.set(
          visitId,
          []
        );
      }

      stopMap
        .get(visitId)
        .push(stop);
    }
  );

  return visits.map(
    (visit) => {

      const visitId =
        Number(
          visit.visit_id
        );

      const savedStops =
        stopMap.get(
          visitId
        ) || [];

      /*
        OLD DATA SAFETY

        Old Admin Field Visits may not have
        rows in field_visit_stops.

        Keep them visible using the existing
        location/comment as Stop 1.
      */
      const legacyStops =
        visit.location ||
        visit.comment
          ? [
              {
                stop_id:
                  null,

                visit_id:
                  visit.visit_id,

                sequence_no:
                  1,

                location:
                  visit.location ||
                  "",

                visit_time:
                  null,

                description:
                  visit.comment ||
                  "",

                is_legacy:
                  true,
              },
            ]
          : [];

      return {
        ...visit,

        visit_stops:
          savedStops.length
            ? savedStops
            : legacyStops,
      };
    }
  );
};

/* =========================================================
   FIELD VISITS
========================================================= */


const getSuperadminFieldVisits =
async (
  req,
  res
) => {

  try {

    const {
      reviewer,
      error,
    } =
      await getFieldVisitReviewer(
        req
      );


    if (error) {

      return res
        .status(
          error.status
        )
        .json({

          success: false,

          message:
            error.message,

        });

    }


    const [visits] =
      await db.query(
        `
          SELECT

            fv.visit_id,
            fv.employee_id,

            u.full_name,
            u.email,
            u.employee_code,

            d.department_name,

            fv.visit_type,

            DATE_FORMAT(
              fv.visit_date,
              '%Y-%m-%d'
            ) AS visit_date,

            fv.duration_type,
            fv.half_day_session,

            fv.location,
            fv.comment,

            fv.conclusion,
            fv.remark,

            fv.status,
            fv.review_remark,

            fv.reviewed_by,

            DATE_FORMAT(
              fv.reviewed_at,
              '%Y-%m-%d %H:%i:%s'
            ) AS reviewed_at,

            field_reviewer.full_name
              AS reviewed_by_name,

            fv.created_at,
            fv.updated_at

          FROM employee_field_visits fv

          INNER JOIN users u
            ON fv.employee_id =
               u.user_id

          INNER JOIN roles r
            ON r.role_id =
               u.role_id

          LEFT JOIN departments d
            ON u.department_id =
               d.department_id

          LEFT JOIN users
            field_reviewer

            ON
              field_reviewer.user_id =
              fv.reviewed_by

          WHERE

            LOWER(
              COALESCE(
                r.role_name,
                ''
              )
            ) = 'admin'

          ORDER BY
            fv.created_at DESC
        `
      );


    const visitsWithStops =
      await attachFieldVisitStops(
        visits
      );


    return res.json({

      success: true,

      summary: {

        total:
          visitsWithStops.length,

        approved:
          visitsWithStops.filter(
            (visit) =>
              String(
                visit.status || ""
              )
                .trim()
                .toLowerCase() ===
              "approved"
          ).length,

        pending:
          visitsWithStops.filter(
            (visit) =>
              String(
                visit.status || ""
              )
                .trim()
                .toLowerCase() ===
              "pending"
          ).length,

        rejected:
          visitsWithStops.filter(
            (visit) =>
              String(
                visit.status || ""
              )
                .trim()
                .toLowerCase() ===
              "rejected"
          ).length,

        employees:
          new Set(
            visitsWithStops.map(
              (visit) =>
                visit.employee_id
            )
          ).size,

      },

      visits:
        visitsWithStops,

    });


  } catch (error) {

    console.error(
      "Superadmin field visits error:",
      error
    );


    return res
      .status(500)
      .json({

        success: false,

        message:
          "Failed to fetch field visits",

      });

  }

};


/* =========================================================
   SUPERADMIN - REVIEW ADMIN FIELD VISIT
========================================================= */

const reviewSuperadminFieldVisit =
async (
  req,
  res
) => {

  try {

    const {
      reviewer,
      error,
    } =
      await getFieldVisitReviewer(
        req
      );


    if (error) {

      return res
        .status(
          error.status
        )
        .json({

          success: false,

          message:
            error.message,

        });

    }


    const reviewerId =
      Number(
        reviewer.user_id
      );


    const visitId =
      Number(
        req.params.visitId
      );


    if (!visitId) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "Invalid field visit.",

        });

    }


    const status =
      String(
        req.body?.status ||
          ""
      )
        .toLowerCase()
        .trim();


    const reviewRemark =
      String(
        req.body
          ?.review_remark ||
          req.body?.remark ||
          ""
      ).trim();


    if (
      ![
        "approved",
        "rejected",
      ].includes(
        status
      )
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "Status must be approved or rejected.",

        });

    }


    /*
      EXISTING SECURITY RULE

      This queue may review only Field Visits
      created by users whose current role
      is Admin.
    */

    const [visitRows] =
      await db.query(
        `
          SELECT

            fv.visit_id,
            fv.employee_id,
            fv.status,

            u.full_name,
            u.email,

            r.role_name

          FROM employee_field_visits fv

          INNER JOIN users u
            ON u.user_id =
               fv.employee_id

          INNER JOIN roles r
            ON r.role_id =
               u.role_id

          WHERE
            fv.visit_id = ?

            AND

            LOWER(
              COALESCE(
                r.role_name,
                ''
              )
            ) = 'admin'

          LIMIT 1
        `,
        [
          visitId,
        ]
      );


    if (!visitRows.length) {

      return res
        .status(404)
        .json({

          success: false,

          message:
            "Admin field visit not found.",

        });

    }


    const currentVisit =
      visitRows[0];


    if (
      String(
        currentVisit.status ||
          ""
      )
        .toLowerCase()
        .trim() !==
      "pending"
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "Only pending Admin field visits can be reviewed.",

        });

    }


    await db.query(
      `
        UPDATE employee_field_visits

        SET

          status = ?,

          reviewed_by = ?,

          reviewed_at =
            NOW(),

          review_remark = ?,

          updated_at =
            NOW()

        WHERE
          visit_id = ?
      `,
      [
        status,

        reviewerId,

        reviewRemark ||
          null,

        visitId,
      ]
    );


    const [updatedRows] =
      await db.query(
        `
          SELECT

            fv.visit_id,
            fv.employee_id,

            u.full_name,
            u.email,
            u.employee_code,

            d.department_name,

            fv.visit_type,

            DATE_FORMAT(
              fv.visit_date,
              '%Y-%m-%d'
            ) AS visit_date,

            fv.duration_type,
            fv.half_day_session,

            fv.location,
            fv.comment,

            fv.conclusion,
            fv.remark,

            fv.status,
            fv.review_remark,

            DATE_FORMAT(
              fv.reviewed_at,
              '%Y-%m-%d %H:%i:%s'
            ) AS reviewed_at,

            field_reviewer.full_name
              AS reviewed_by_name

          FROM employee_field_visits fv

          INNER JOIN users u
            ON u.user_id =
               fv.employee_id

          LEFT JOIN departments d
            ON d.department_id =
               u.department_id

          LEFT JOIN users
            field_reviewer

            ON
              field_reviewer.user_id =
              fv.reviewed_by

          WHERE
            fv.visit_id = ?

          LIMIT 1
        `,
        [
          visitId,
        ]
      );


    const updatedVisits =
      await attachFieldVisitStops(
        updatedRows
      );


    return res.json({

      success: true,

      message:
        status ===
          "approved"
          ? "Admin field visit approved successfully."
          : "Admin field visit rejected successfully.",

      visit:
        updatedVisits[0] ||
        null,

    });


  } catch (error) {

    console.error(
      "Superadmin review field visit error:",
      error
    );


    return res
      .status(500)
      .json({

        success: false,

        message:
          "Failed to review Admin field visit.",

        error:
          error.message,

        sqlMessage:
          error.sqlMessage ||
          null,

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

 assignee_name:
   task.primary_assignee_name ||
   assignees[0]?.full_name ||
   null,

 assignee_email:
   task.primary_assignee_email ||
   assignees[0]?.email ||
   null,

 assignee_employee_code:
   task.primary_assignee_employee_code ||
   assignees[0]?.employee_code ||
   null,

 assignees,


 assigned_user_ids:

 assignees
 .map(a=>a.user_id)
 .join(", "),


 assigned_names:

 assignees
 .map(a=>a.full_name)
 .join(", "),


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


 d.department_name,
 COALESCE(
  (
    SELECT GROUP_CONCAT(
      DISTINCT es.skill_name
      ORDER BY es.skill_name
      SEPARATOR ', '
    )
    FROM employee_skills es
    WHERE es.user_id = u.user_id
  ),
  ''
) AS skills,


 COUNT(DISTINCT t.task_id)
 AS total_tasks,


 COUNT(DISTINCT p.project_id)
 AS total_projects,


 COALESCE(
  ROUND(AVG(t.progress)),
  0
 )
 AS average_task_progress,


 SUM(
 CASE
 WHEN t.status IN(
  'not_started',
  'todo'
 )
 THEN 1
 ELSE 0
 END
 )
 AS todo_tasks,


 SUM(
 CASE
 WHEN t.status IN(
  'in_progress',
  'ongoing'
 )
 THEN 1
 ELSE 0
 END
 )
 AS in_progress_tasks,


 SUM(
 CASE
 WHEN t.status IN(
  'under_review'
 )
 THEN 1
 ELSE 0
 END
 )
 AS under_review_tasks,


 SUM(
 CASE
 WHEN t.status IN(
  'rejected'
 )
 THEN 1
 ELSE 0
 END
 )
 AS rejected_tasks,


 SUM(
 CASE
 WHEN t.status IN(
  'blocked',
  'on_hold'
 )
 THEN 1
 ELSE 0
 END
 )
 AS blocked_tasks


 FROM users u


 JOIN roles r

 ON r.role_id =
 u.role_id


 LEFT JOIN departments d

 ON d.department_id =
 u.department_id


 LEFT JOIN tasks t

 ON (
  t.assigned_to_user_id =
  u.user_id
 )


 LEFT JOIN projects p

 ON (
  p.created_by_user_id =
  u.user_id
 )


 WHERE
 u.status!='deleted'


 GROUP BY

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
        total_users: users.length
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
const getSuperadminUserById = async (req, res) => {
  try {
    const userId = Number(req.params.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    const users = await getAllUsersBase();

    const user = users.find(
      (item) => Number(item.user_id) === userId
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error(
      "SUPERADMIN USER DETAILS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
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


const getSuperadminLeaves = async (
  req,
  res
) => {
  try {
    const [applications] =
      await db.query(
        `
        SELECT
          la.leave_id,
          la.employee_id,
          la.leave_type,

          DATE_FORMAT(
            la.start_date,
            '%Y-%m-%d'
          ) AS start_date,

          DATE_FORMAT(
            la.end_date,
            '%Y-%m-%d'
          ) AS end_date,

          la.total_days,
          la.duration_type,
          la.half_day_session,
          la.reason,
la.status,
la.review_remark,
la.reviewed_by,

la.escalated_for_approval,
la.escalated_by,
la.escalation_remark,

DATE_FORMAT(
  la.escalated_at,
  '%Y-%m-%d %H:%i:%s'
) AS escalated_at,

          DATE_FORMAT(
            la.applied_at,
            '%Y-%m-%d %H:%i:%s'
          ) AS applied_at,

          DATE_FORMAT(
            la.reviewed_at,
            '%Y-%m-%d %H:%i:%s'
          ) AS reviewed_at,

          u.full_name
            AS employee_name,

          u.employee_code,

          u.email
            AS employee_email,

          u.designation,
          u.department_id,

          d.department_name,

          r.role_name
            AS applicant_role,

          (
  SELECT GROUP_CONCAT(
    DISTINCT admin_user.full_name
    ORDER BY admin_user.full_name ASC
    SEPARATOR ', '
  )

  FROM users admin_user

  INNER JOIN roles admin_role
    ON admin_role.role_id = admin_user.role_id

  LEFT JOIN user_departments admin_ud
    ON admin_ud.user_id = admin_user.user_id

  WHERE
    LOWER(
      TRIM(
        COALESCE(
          admin_role.role_name,
          ''
        )
      )
    ) = 'admin'

    AND LOWER(
      COALESCE(
        admin_user.status,
        'active'
      )
    ) <> 'deleted'

    AND (
      /* Admin primary department matches employee primary department */
      admin_user.department_id = u.department_id

      OR

      /* Admin mapped department matches employee primary department */
      admin_ud.department_id = u.department_id

      OR

      /* Admin primary department matches any employee mapped department */
      admin_user.department_id IN (
        SELECT employee_ud.department_id
        FROM user_departments employee_ud
        WHERE employee_ud.user_id = u.user_id
      )

      OR

      /* Admin mapped department matches any employee mapped department */
      admin_ud.department_id IN (
        SELECT employee_ud.department_id
        FROM user_departments employee_ud
        WHERE employee_ud.user_id = u.user_id
      )
    )

) AS admin_name, 


          reviewer.full_name
            AS reviewed_by_name,

          reviewer.email
  AS reviewed_by_email,

escalator.full_name
  AS escalated_by_name,

escalator.email
  AS escalated_by_email

        FROM leave_applications la

        LEFT JOIN users u
          ON u.user_id =
             la.employee_id

        LEFT JOIN roles r
          ON r.role_id =
             u.role_id

        LEFT JOIN departments d
          ON d.department_id =
             u.department_id

        LEFT JOIN users reviewer
          ON reviewer.user_id =
             la.reviewed_by


        LEFT JOIN users escalator
          ON escalator.user_id =
             la.escalated_by

        ORDER BY
          CASE
            WHEN la.status = 'pending'
            THEN 1

            WHEN la.status = 'approved'
            THEN 2

            WHEN la.status = 'rejected'
            THEN 3

            ELSE 4
          END,

          la.applied_at DESC,
          la.leave_id DESC
        `
      );

    const normalized =
      applications.map(
        (application) => ({
          ...application,

          total_days:
            Number(
              application.total_days ||
                0
            ),

          applicant_role:
            String(
              application.applicant_role ||
                ""
            )
              .trim()
              .toLowerCase(),

         can_superadmin_review:
  [
    "employee",
    "admin",
    "administrator",
  ].includes(
    String(
      application.applicant_role ||
        ""
    )
      .trim()
      .toLowerCase()
  ),
        })
      );

    const summary = {
      total:
        normalized.length,

      pending:
        normalized.filter(
          (item) =>
            String(
              item.status || ""
            ).toLowerCase() ===
            "pending"
        ).length,

      approved:
        normalized.filter(
          (item) =>
            String(
              item.status || ""
            ).toLowerCase() ===
            "approved"
        ).length,

      rejected:
        normalized.filter(
          (item) =>
            String(
              item.status || ""
            ).toLowerCase() ===
            "rejected"
        ).length,
    };

    return res.json({
      success: true,
      summary,
      applications:
        normalized,
    });
  } catch (error) {
    console.error(
      "SUPERADMIN LEAVES ERROR:",
      error
    );

    return res
      .status(500)
      .json({
        success: false,

        message:
          "Failed to fetch leave applications.",

        error:
          error.message,

        sqlMessage:
          error.sqlMessage ||
          null,
      });
  }
};

const reviewSuperadminLeave = async (
  req,
  res
) => {
  let connection;

  try {
    const reviewerId =
      getLoggedInUserId(req);

    if (!reviewerId) {
      return res
        .status(401)
        .json({
          success: false,
          message:
            "Unauthorized. Superadmin user not found in token.",
        });
    }

    const leaveId =
      Number(
        req.params.leaveId
      );

    if (
      !Number.isInteger(
        leaveId
      ) ||
      leaveId <= 0
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Invalid leave application ID.",
        });
    }

    let status =
      String(
        req.body?.status ||
          req.body?.action ||
          ""
      )
        .trim()
        .toLowerCase();

    const reviewRemark =
      String(
        req.body
          ?.review_remark ||
          req.body?.remark ||
          ""
      ).trim();

    if (
      status === "approve"
    ) {
      status =
        "approved";
    }

    if (
      status === "reject"
    ) {
      status =
        "rejected";
    }

    if (
      ![
        "approved",
        "rejected",
      ].includes(status)
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Status must be approved or rejected.",
        });
    }

    if (
      status ===
        "rejected" &&
      !reviewRemark
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Please enter a reason before rejecting the leave application.",
        });
    }

    connection =
      await db.getConnection();

    await connection
      .beginTransaction();

    /*
    =====================================================
    GET APPLICATION

    Critical security condition:
    applicant must currently have role = admin.
    =====================================================
    */

    const [leaveRows] =
      await connection.query(
        `
        SELECT
          la.leave_id,
          la.employee_id,
          la.leave_type,
          la.total_days,
          la.reason,
la.status,
la.escalated_for_approval,
la.duration_type,
la.half_day_session,

          DATE_FORMAT(
            la.start_date,
            '%Y-%m-%d'
          ) AS start_date,

          DATE_FORMAT(
            la.end_date,
            '%Y-%m-%d'
          ) AS end_date,

          u.full_name
            AS employee_name,

          u.email
            AS employee_email,

          u.employee_code,
          u.designation,
          u.department_id,

          d.department_name,

          r.role_name
            AS applicant_role

        FROM leave_applications la

        INNER JOIN users u
          ON u.user_id =
             la.employee_id

        INNER JOIN roles r
          ON r.role_id =
             u.role_id

        LEFT JOIN departments d
          ON d.department_id =
             u.department_id

        WHERE
  la.leave_id = ?

  AND LOWER(
    TRIM(
      COALESCE(
        r.role_name,
        ''
      )
    )
  ) IN (
    'employee',
    'admin',
    'administrator'
  )
        LIMIT 1

        FOR UPDATE
        `,
        [leaveId]
      );

    if (
      !leaveRows.length
    ) {
      await connection
        .rollback();

      return res
        .status(404)
        .json({
          success: false,

         message:
  "Leave application not found or this application cannot be reviewed by Superadmin.",
        });
    }

    const leave =
      leaveRows[0];

    if (
      String(
        leave.status || ""
      )
        .trim()
        .toLowerCase() !==
      "pending"
    ) {
      await connection
        .rollback();

      return res
        .status(400)
        .json({
          success: false,

          message:
            `This leave application is already ${leave.status}.`,
        });
    }

    let remainingBalance =
      null;

    /*
    =====================================================
    VALIDATE ADMIN LEAVE BALANCE BEFORE APPROVAL
    =====================================================
    */

    if (
  status === "approved" &&
  leave.leave_type !== "unpaid"
) {
      const leaveYear =
        Number(
          String(
            leave.start_date ||
              ""
          ).slice(
            0,
            4
          )
        );

      const balances =
        await buildLeaveBalances(
          connection,
          leave.employee_id,
          leaveYear,
          {
            excludeLeaveId:
              leaveId,
          }
        );

      const selectedBalance =
        balances[
          leave.leave_type
        ];

      if (
  !selectedBalance
) {
  await connection
    .rollback();

  return res
    .status(400)
    .json({
      success: false,

      message:
        "Cannot approve. Leave balance information is not available for this leave type.",
    });
}

      const available =
        Number(
          selectedBalance
            .available ||
            0
        );

      const requestedDays =
        Number(
          leave.total_days ||
            0
        );

      if (
        requestedDays >
        available
      ) {
        await connection
          .rollback();

        return res
          .status(400)
          .json({
            success: false,

            message:
              `Cannot approve. Admin only has ${available} day(s) available for this leave type.`,
          });
      }

      remainingBalance =
        available -
        requestedDays;
    }

    /*
    =====================================================
    UPDATE APPLICATION
    =====================================================
    */

    await connection.query(
      `
      UPDATE leave_applications

      SET
        status = ?,
        review_remark = ?,
        reviewed_by = ?,
        reviewed_at = NOW()

      WHERE
        leave_id = ?
      `,
      [
        status,
        reviewRemark ||
          null,
        reviewerId,
        leaveId,
      ]
    );

    await connection
  .commit();

/*
=====================================================
FINAL LEAVE RESULT EMAIL
=====================================================
*/

let emailResult = {
  sent: false,
  skipped: false,
};

try {
  const [reviewerRows] =
    await db.query(
      `
      SELECT
        full_name,
        email
      FROM users
      WHERE user_id = ?
      LIMIT 1
      `,
      [reviewerId]
    );

  const reviewer =
    reviewerRows[0] || {};

  const reviewerName =
    reviewer.full_name ||
    "Manish Turakhia";




  const leaveLabel =
    getLeaveLabel(
      leave.leave_type
    );

  const finalStatusLabel =
    status === "approved"
      ? "APPROVED"
      : "REJECTED";

  const emailSubject =
    status === "approved"
      ? `Leave Approved - ${leave.employee_name} | Reviewed by ${reviewerName}`
      : `Leave Rejected - ${leave.employee_name} | Reviewed by ${reviewerName}`;

  const text = `
Dear Team,

The following leave request has been ${status} by ${reviewerName}.

Employee: ${leave.employee_name || "-"}
Employee Email: ${leave.employee_email || "-"}
Department: ${leave.department_name || "-"}

Leave Type: ${leaveLabel}
From Date: ${leave.start_date || "-"}
To Date: ${leave.end_date || "-"}
Total Days: ${leave.total_days || "-"}

Final Status: ${finalStatusLabel}
Reviewed By: ${reviewerName}
Review Remark: ${reviewRemark || "-"}

This is the final decision on the leave request.

Regards,
Valencia RMS
`;

  const html = `
    <div style="
      font-family:Arial,sans-serif;
      line-height:1.6;
      color:#111827;
      max-width:700px;
    ">

      <h2 style="
        margin-bottom:8px;
        color:${
          status === "approved"
            ? "#16a34a"
            : "#dc2626"
        };
      ">
        Leave ${status === "approved"
          ? "Approved"
          : "Rejected"}
      </h2>

      <p>
        Dear Team,
      </p>

      <p>
        The following leave request has been
        <strong>
          ${status}
        </strong>
        by
        <strong>
          ${reviewerName}
        </strong>.
      </p>

      <table style="
        width:100%;
        border-collapse:collapse;
        margin:18px 0;
      ">

        <tr>
          <td style="
            border:1px solid #dddddd;
            padding:8px;
          ">
            <strong>Employee</strong>
          </td>

          <td style="
            border:1px solid #dddddd;
            padding:8px;
          ">
            ${leave.employee_name || "-"}
          </td>
        </tr>

        <tr>
          <td style="
            border:1px solid #dddddd;
            padding:8px;
          ">
            <strong>Department</strong>
          </td>

          <td style="
            border:1px solid #dddddd;
            padding:8px;
          ">
            ${leave.department_name || "-"}
          </td>
        </tr>

        <tr>
          <td style="
            border:1px solid #dddddd;
            padding:8px;
          ">
            <strong>Leave Type</strong>
          </td>

          <td style="
            border:1px solid #dddddd;
            padding:8px;
          ">
            ${leaveLabel}
          </td>
        </tr>

        <tr>
          <td style="
            border:1px solid #dddddd;
            padding:8px;
          ">
            <strong>From</strong>
          </td>

          <td style="
            border:1px solid #dddddd;
            padding:8px;
          ">
            ${leave.start_date || "-"}
          </td>
        </tr>

        <tr>
          <td style="
            border:1px solid #dddddd;
            padding:8px;
          ">
            <strong>To</strong>
          </td>

          <td style="
            border:1px solid #dddddd;
            padding:8px;
          ">
            ${leave.end_date || "-"}
          </td>
        </tr>

        <tr>
          <td style="
            border:1px solid #dddddd;
            padding:8px;
          ">
            <strong>Total Days</strong>
          </td>

          <td style="
            border:1px solid #dddddd;
            padding:8px;
          ">
            ${leave.total_days || "-"}
          </td>
        </tr>

        <tr>
          <td style="
            border:1px solid #dddddd;
            padding:8px;
          ">
            <strong>Final Status</strong>
          </td>

          <td style="
            border:1px solid #dddddd;
            padding:8px;
            font-weight:bold;
          ">
            ${finalStatusLabel}
          </td>
        </tr>

        <tr>
          <td style="
            border:1px solid #dddddd;
            padding:8px;
          ">
            <strong>Reviewed By</strong>
          </td>

          <td style="
            border:1px solid #dddddd;
            padding:8px;
          ">
            ${reviewerName}
          </td>
        </tr>

        <tr>
          <td style="
            border:1px solid #dddddd;
            padding:8px;
          ">
            <strong>
              ${
                status === "rejected"
                  ? "Reason for Rejection"
                  : "Review Remark"
              }
            </strong>
          </td>

          <td style="
            border:1px solid #dddddd;
            padding:8px;
          ">
            ${reviewRemark || "-"}
          </td>
        </tr>

      </table>

      <p>
        This is the final decision on the
        leave request.
      </p>

      <p>
        Regards,<br />
        Valencia RMS
      </p>

    </div>
  `;

 const mailResponse =
  await sendMail({
    to: [
      leave.employee_email,
    ],

    subject:
      emailSubject,

    text,

    html,
  });

  emailResult = {
    sent:
      !mailResponse?.skipped,

    skipped:
      Boolean(
        mailResponse?.skipped
      ),

    messageId:
      mailResponse?.messageId ||
      null,

    recipients: [
  leave.employee_email,
],

cc: [],
  };
} catch (emailError) {
  console.error(
    "Final leave result email failed:",
    emailError
  );

  emailResult = {
    sent: false,
    skipped: false,
    error:
      emailError.message,
  };
}

return res.json({
      success: true,

      message:
        status === "approved"
          ? "Leave approved successfully."
          : "Leave rejected successfully.",

      leave_id: leaveId,

      status,

      review_remark: reviewRemark,

      remaining_balance:
    remainingBalance,

    email:
    emailResult,
    });
  } catch (error) {
    if (connection) {
      try {
        await connection
          .rollback();
      } catch {
        // Ignore rollback error.
      }
    }

    console.error(
      "SUPERADMIN REVIEW ADMIN LEAVE ERROR:",
      error
    );

    return res
      .status(500)
      .json({
        success: false,

        message:
         "Failed to review leave application.",

        error:
          error.message,

        sqlMessage:
          error.sqlMessage ||
          null,
      });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
/* =========================================================
   PROJECT CONTEXT / ASSIGN / ASSIGNEES / MAIN TASKS / DELETE
   (restored; the routes were mounted but these handlers had been removed)
========================================================= */
const getSuperadminProjectContext =
  async (req, res) => {
    try {
      const projectId =
        Number(
          req.params.projectId
        );

      const loggedInUserId =
        getLoggedInUserId(req);

      if (!projectId) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid project ID.",
          });
      }

      const projects =
        await getAllProjects();

      const project =
        projects.find(
          (item) =>
            Number(
              item.project_id
            ) === projectId
        );

      if (!project) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Project not found.",
          });
      }

      const allUsers =
        await getAllUsersBase();

      const assignedIds =
        normalizeIdArray(
          project.assigned_user_ids
        );

      const assignees =
        allUsers.filter(
          (user) =>
            assignedIds.includes(
              Number(
                user.user_id
              )
            )
        );

      const allTasks =
        await getAllMainTasks();

      const tasks =
        allTasks.filter(
          (task) =>
            Number(
              task.project_id
            ) === projectId
        );

      return res.json({
        success: true,

        project,

        assignees,

        tasks,

        can_delete:
          Number(
            project.created_by_user_id
          ) ===
          Number(
            loggedInUserId
          ),
      });
    } catch (error) {
      console.error(
        "Superadmin project context error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to load complete project details.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    }
  };

/* =========================================================
   CREATE + ASSIGN PROJECT
========================================================= */

const createSuperadminProject =
  async (req, res) => {
    const connection =
      await db.getConnection();

    try {
      const superadminUserId =
        getLoggedInUserId(req);

      const projectTitle =
        String(
          req.body.project_title ||
            req.body.title ||
            ""
        ).trim();

      const projectDescription =
        String(
          req.body.project_description ||
            req.body.description ||
            ""
        ).trim();

      const departmentId =
        Number(
          req.body.department_id ||
            0
        );

      const division =
        String(
          req.body.division ||
            ""
        ).trim();

      const priority =
        String(
          req.body.priority ||
            "medium"
        ).toLowerCase();

      const startDate =
        formatDateOnly(
          req.body.start_date ||
            req.body.startDate
        );

      const dueDate =
        formatDateOnly(
          req.body.due_date ||
            req.body.end_date ||
            req.body.endDate
        );

      const assigneeIds =
        normalizeIdArray(
          req.body.assignee_ids ||
            req.body.assignees ||
            req.body.project_assignees
        );

      if (!superadminUserId) {
        return res
          .status(401)
          .json({
            success: false,

            message:
              "Unable to identify logged-in Superadmin.",
          });
      }

      if (!projectTitle) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Project title is required.",
          });
      }

      if (!departmentId) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Department is required.",
          });
      }

      if (
        !PROJECT_DIVISIONS.includes(
          division
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Please select a valid division.",
          });
      }

      if (
        !startDate ||
        !dueDate
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Project start date and due date are required.",
          });
      }

      if (
        startDate > dueDate
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Project due date cannot be before the start date.",
          });
      }

      if (
        !assigneeIds.length
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Select at least one project assignee.",
          });
      }

      const [departmentRows] =
        await connection.query(
          `
          SELECT
            department_id

          FROM departments

          WHERE
            department_id = ?

          LIMIT 1
          `,
          [departmentId]
        );

      if (
        !departmentRows.length
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Selected department does not exist.",
          });
      }

      await validateAssignableUsers(
        connection,
        assigneeIds
      );

      await connection.beginTransaction();

      const [result] =
        await connection.query(
          `
          INSERT INTO projects (
            created_by_user_id,
            department_id,
            division,
            project_title,
            project_description,
            priority,
            status,
            start_date,
            due_date,
            overall_progress,
            created_at,
            updated_at
          )

          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            'not_started',
            ?,
            ?,
            0,
            NOW(),
            NOW()
          )
          `,
          [
            superadminUserId,

            departmentId,

            division,

            projectTitle,

            projectDescription ||
              null,

            [
              "low",
              "medium",
              "high",
              "urgent",
            ].includes(priority)
              ? priority
              : "medium",

            startDate,

            dueDate,
          ]
        );

      const projectId =
        Number(
          result.insertId
        );

      await syncProjectAssignments(
        connection,
        projectId,
        assigneeIds,
        superadminUserId
      );

      await connection.commit();

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Project assigned successfully.",

          project_id:
            projectId,

          assignee_ids:
            assigneeIds,
        });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {}

      console.error(
        "Create Superadmin project error:",
        error
      );

      return res
        .status(
          error.statusCode ||
            500
        )
        .json({
          success: false,

          message:
            error.statusCode &&
            error.message
              ? error.message
              : "Failed to create project.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    } finally {
      connection.release();
    }
  };

/* =========================================================
   UPDATE PROJECT ASSIGNEES
========================================================= */

const updateSuperadminProjectAssignees =
  async (req, res) => {
    const connection =
      await db.getConnection();

    try {
      const superadminUserId =
        getLoggedInUserId(req);

      const projectId =
        Number(
          req.params.projectId ||
            0
        );

      const assigneeIds =
        normalizeIdArray(
          req.body.assignee_ids ||
            req.body.assignees
        );

      if (!projectId) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid project ID.",
          });
      }

      if (
        !assigneeIds.length
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Project must have at least one assignee.",
          });
      }

      const [projectRows] =
        await connection.query(
          `
          SELECT
            project_id

          FROM projects

          WHERE
            project_id = ?

          LIMIT 1
          `,
          [projectId]
        );

      if (
        !projectRows.length
      ) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Project not found.",
          });
      }

      await validateAssignableUsers(
        connection,
        assigneeIds
      );

      await connection.beginTransaction();

      await syncProjectAssignments(
        connection,
        projectId,
        assigneeIds,
        superadminUserId
      );

      await connection.query(
        `
        UPDATE projects

        SET
          updated_at = NOW()

        WHERE
          project_id = ?
        `,
        [projectId]
      );

      await connection.commit();

      return res.json({
        success: true,

        message:
          "Project assignees updated successfully.",

        project_id:
          projectId,

        assignee_ids:
          assigneeIds,
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {}

      console.error(
        "Update Superadmin project assignees error:",
        error
      );

      return res
        .status(
          error.statusCode ||
            500
        )
        .json({
          success: false,

          message:
            error.statusCode &&
            error.message
              ? error.message
              : "Failed to update project assignees.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    } finally {
      connection.release();
    }
  };

/* =========================================================
   CREATE MAIN TASK
========================================================= */

const createSuperadminMainTask =
  async (req, res) => {
    const connection =
      await db.getConnection();

    try {
      const superadminUserId =
        getLoggedInUserId(req);

      const projectId =
        Number(
          req.params.projectId ||
            req.body.project_id ||
            0
        );

      const taskTitle =
        String(
          req.body.task_title ||
            req.body.title ||
            ""
        ).trim();

      const taskDescription =
        String(
          req.body.task_description ||
            req.body.description ||
            ""
        ).trim();

      const priority =
        String(
          req.body.priority ||
            "medium"
        ).toLowerCase();

      const assigneeIds =
        normalizeIdArray(
          req.body.assignee_ids ||
            req.body.assignees ||
            req.body.assigned_to_user_ids
        );

      const requestedStartDate =
        formatDateOnly(
          req.body.start_date ||
            req.body.startDate
        );

      const requestedDueDate =
        formatDateOnly(
          req.body.due_date ||
            req.body.end_date ||
            req.body.endDate ||
            req.body.deadline
        );

      if (!superadminUserId) {
        return res
          .status(401)
          .json({
            success: false,

            message:
              "Unable to identify logged-in Superadmin.",
          });
      }

      if (!projectId) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Project ID is required.",
          });
      }

      if (!taskTitle) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Main Task title is required.",
          });
      }

      if (
        !assigneeIds.length
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Select at least one Main Task assignee.",
          });
      }

      const [projectRows] =
        await connection.query(
          `
          SELECT
            project_id,
            project_title,

            DATE_FORMAT(
              start_date,
              '%Y-%m-%d'
            ) AS start_date,

            DATE_FORMAT(
              due_date,
              '%Y-%m-%d'
            ) AS due_date

          FROM projects

          WHERE
            project_id = ?

          LIMIT 1
          `,
          [projectId]
        );

      if (
        !projectRows.length
      ) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Project not found.",
          });
      }

      const project =
        projectRows[0];

      const taskStartDate =
        requestedStartDate ||
        project.start_date;

      const taskDueDate =
        requestedDueDate ||
        project.due_date;

      if (
        !taskStartDate ||
        !taskDueDate
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Main Task start date and due date are required.",
          });
      }

      if (
        taskStartDate >
        taskDueDate
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Main Task due date cannot be before its start date.",
          });
      }

      if (
        project.start_date &&
        taskStartDate <
          project.start_date
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              `Main Task start date cannot be before Project start date (${project.start_date}).`,
          });
      }

      if (
        project.due_date &&
        taskDueDate >
          project.due_date
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              `Main Task deadline cannot exceed Project deadline (${project.due_date}).`,
          });
      }

      /*
      Main Task assignees must
      already belong to Project.
      */

      const [assignedRows] =
        await connection.query(
          `
          SELECT
            employee_id

          FROM project_assignments

          WHERE
            project_id = ?

            AND employee_id
              IN (?)

            AND COALESCE(
              assignment_status,
              'assigned'
            ) <> 'removed'
          `,
          [
            projectId,
            assigneeIds,
          ]
        );

      const allowedIds =
        new Set(
          assignedRows.map(
            (row) =>
              Number(
                row.employee_id
              )
          )
        );

      const invalidIds =
        assigneeIds.filter(
          (id) =>
            !allowedIds.has(
              Number(id)
            )
        );

      if (
        invalidIds.length
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Main Task can only be assigned to users already assigned to this project.",
          });
      }

      await connection.beginTransaction();

      const primaryEmployeeId =
        assigneeIds[0];

      const [taskResult] =
        await connection.query(
          `
          INSERT INTO tasks (
            project_id,
            parent_task_id,
            created_by_user_id,
            assigned_to_user_id,
            task_title,
            task_description,
            task_type,
            status,
            priority,
            progress,
            is_checked,
            start_date,
            due_date,
            review_status,
            created_at,
            updated_at
          )

          VALUES (
            ?,
            NULL,
            ?,
            ?,
            ?,
            ?,
            'main',
            'not_started',
            ?,
            0,
            0,
            ?,
            ?,
            'none',
            NOW(),
            NOW()
          )
          `,
          [
            projectId,

            superadminUserId,

            primaryEmployeeId,

            taskTitle,

            taskDescription,

            [
              "low",
              "medium",
              "high",
              "urgent",
            ].includes(
              priority
            )
              ? priority
              : "medium",

            taskStartDate,

            taskDueDate,
          ]
        );

      const taskId =
        Number(
          taskResult.insertId
        );

      await syncMainTaskAssignments(
        connection,
        taskId,
        assigneeIds,
        superadminUserId
      );

      await connection.commit();

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Main Task assigned successfully.",

          task_id:
            taskId,

          task_ids: [
            taskId,
          ],

          assignee_ids:
            assigneeIds,

          start_date:
            taskStartDate,

          due_date:
            taskDueDate,
        });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {}

      console.error(
        "Create Superadmin Main Task error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to assign Main Task.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    } finally {
      connection.release();
    }
  };

/* =========================================================
   DELETE PROJECT

   SUPERADMIN CAN DELETE ONLY
   PROJECTS CREATED BY THAT SUPERADMIN.
========================================================= */

const deleteOwnSuperadminProject =
  async (req, res) => {
    const connection =
      await db.getConnection();

    try {
      const superadminUserId =
        getLoggedInUserId(req);

      const projectId =
        Number(
          req.params.projectId ||
            req.params.id ||
            0
        );

      if (!projectId) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Project ID is required.",
          });
      }

      const [projectRows] =
        await connection.query(
          `
          SELECT
            project_id,
            created_by_user_id,
            project_title

          FROM projects

          WHERE
            project_id = ?

          LIMIT 1
          `,
          [projectId]
        );

      if (
        !projectRows.length
      ) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Project not found.",
          });
      }

      const project =
        projectRows[0];

      if (
        Number(
          project.created_by_user_id
        ) !==
        Number(
          superadminUserId
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You can only delete projects created by you. Projects created by other users cannot be deleted.",
          });
      }

      await connection.beginTransaction();

      /*
      Remove task assignment rows first.
      */

      await connection.query(
        `
        DELETE ta

        FROM task_assignments ta

        INNER JOIN tasks t
          ON t.task_id =
             ta.task_id

        WHERE
          t.project_id = ?
        `,
        [projectId]
      );

      /*
      Remove subtasks.
      */

      await connection.query(
        `
        DELETE FROM tasks

        WHERE
          project_id = ?

          AND parent_task_id
            IS NOT NULL

          AND parent_task_id
            <> 0
        `,
        [projectId]
      );

      /*
      Remove Main Tasks.
      */

      await connection.query(
        `
        DELETE FROM tasks

        WHERE project_id = ?
        `,
        [projectId]
      );

      /*
      Remove project assignments.
      */

      await connection.query(
        `
        DELETE FROM project_assignments

        WHERE project_id = ?
        `,
        [projectId]
      );

      /*
      Delete project only if owned
      by current Superadmin.
      */

      const [deleteResult] =
        await connection.query(
          `
          DELETE FROM projects

          WHERE
            project_id = ?

            AND created_by_user_id = ?
          `,
          [
            projectId,
            superadminUserId,
          ]
        );

      if (
        !deleteResult.affectedRows
      ) {
        throw new Error(
          "Project deletion did not affect any project row."
        );
      }

      await connection.commit();

      return res.json({
        success: true,

        message:
          "Project deleted successfully.",

        project_id:
          projectId,
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {}

      console.error(
        "Delete Superadmin project error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Failed to delete project.",

          error:
            error.message,

          sqlMessage:
            error.sqlMessage ||
            null,
        });
    } finally {
      connection.release();
    }
  };

/* =========================================================
   OVERVIEW: NEEDS ATTENTION + MOST ACTIVE USERS
========================================================= */

const OPEN_TASK_FILTER = `
  (t.parent_task_id IS NULL OR t.parent_task_id = 0)
  AND LOWER(COALESCE(t.status, '')) NOT IN
    ('completed', 'done', 'complete', 'cancelled', 'rejected')
`;

const getSuperadminAttention = async (req, res) => {
  try {
    const [
      [escalatedLeaves],
      [[pendingLeaves]],
      [[pendingVisits]],
      [overdueTasks],
      [[overdueTaskCount]],
      [[overdueProjectCount]],
      [lateEmployees],
      [mostActive],
    ] = await Promise.all([
      db.query(
        `
        SELECT
          la.leave_id,
          la.leave_type,
          DATE_FORMAT(la.start_date, '%Y-%m-%d') AS start_date,
          DATE_FORMAT(la.end_date, '%Y-%m-%d') AS end_date,
          la.total_days,
          la.escalation_remark,
          u.full_name AS employee_name,
          u.employee_code,
          esc.full_name AS escalated_by_name
        FROM leave_applications la
        JOIN users u ON u.user_id = la.employee_id
        LEFT JOIN users esc ON esc.user_id = la.escalated_by
        WHERE la.escalated_for_approval = 1
          AND LOWER(la.status) = 'pending'
        ORDER BY la.escalated_at DESC, la.leave_id DESC
        LIMIT 8
        `
      ),
      db.query(
        `SELECT COUNT(*) AS total FROM leave_applications WHERE LOWER(status) = 'pending'`
      ),
      db.query(
        `SELECT COUNT(*) AS total FROM employee_field_visits WHERE LOWER(status) = 'pending'`
      ),
      db.query(
        `
        SELECT
          t.task_id,
          t.task_title,
          DATE_FORMAT(t.due_date, '%Y-%m-%d') AS due_date,
          u.full_name AS assigned_name,
          p.project_title
        FROM tasks t
        LEFT JOIN users u ON u.user_id = t.assigned_to_user_id
        LEFT JOIN projects p ON p.project_id = t.project_id
        WHERE ${OPEN_TASK_FILTER}
          AND t.due_date IS NOT NULL
          AND t.due_date < CURDATE()
        ORDER BY t.due_date ASC
        LIMIT 6
        `
      ),
      db.query(
        `
        SELECT COUNT(*) AS total
        FROM tasks t
        WHERE ${OPEN_TASK_FILTER}
          AND t.due_date IS NOT NULL
          AND t.due_date < CURDATE()
        `
      ),
      db.query(
        `
        SELECT COUNT(*) AS total
        FROM projects p
        WHERE p.due_date IS NOT NULL
          AND p.due_date < CURDATE()
          AND LOWER(COALESCE(p.status, '')) NOT IN
            ('completed', 'done', 'complete', 'cancelled', 'rejected', 'on_hold')
        `
      ),
      db.query(
        `
        SELECT
          u.user_id,
          u.full_name,
          u.employee_code,
          d.department_name,
          COUNT(*) AS late_days
        FROM attendance a
        JOIN users u ON u.user_id = a.employee_id
        LEFT JOIN departments d ON d.department_id = u.department_id
        WHERE a.attendance_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          AND (
            LOWER(COALESCE(a.status, '')) = 'late'
            OR (
              LOWER(COALESCE(a.status, '')) = 'present'
              AND a.check_in_time IS NOT NULL
              AND a.check_in_time > '11:00:00'
            )
          )
          AND LOWER(COALESCE(u.status, 'active')) = 'active'
        GROUP BY u.user_id, u.full_name, u.employee_code, d.department_name
        ORDER BY late_days DESC, u.full_name ASC
        LIMIT 5
        `
      ),
      db.query(
        `
        SELECT
          u.user_id,
          u.full_name,
          u.employee_code,
          d.department_name,
          COALESCE(ws.minutes, 0) + COALESCE(mt.minutes, 0) AS tracked_minutes,
          COALESCE(tc.completed, 0) AS completed_tasks,
          COALESCE(att.present_days, 0) AS present_days
        FROM users u
        JOIN roles r ON r.role_id = u.role_id
        LEFT JOIN departments d ON d.department_id = u.department_id
        LEFT JOIN (
          SELECT employee_id,
                 SUM(TIMESTAMPDIFF(MINUTE, started_at, COALESCE(ended_at, NOW()))) AS minutes
          FROM task_work_sessions
          WHERE started_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          GROUP BY employee_id
        ) ws ON ws.employee_id = u.user_id
        LEFT JOIN (
          SELECT employee_id, SUM(COALESCE(total_minutes, 0)) AS minutes
          FROM mini_tasks
          WHERE COALESCE(task_date, DATE(created_at)) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          GROUP BY employee_id
        ) mt ON mt.employee_id = u.user_id
        LEFT JOIN (
          SELECT assigned_to_user_id AS user_id, COUNT(*) AS completed
          FROM tasks
          WHERE completed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          GROUP BY assigned_to_user_id
        ) tc ON tc.user_id = u.user_id
        LEFT JOIN (
          SELECT employee_id, COUNT(*) AS present_days
          FROM attendance
          WHERE attendance_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            AND LOWER(COALESCE(status, '')) IN ('present', 'late', 'half_day')
          GROUP BY employee_id
        ) att ON att.employee_id = u.user_id
        WHERE LOWER(COALESCE(u.status, 'active')) = 'active'
          AND LOWER(r.role_name) IN ('employee', 'admin')
          AND (
            COALESCE(ws.minutes, 0) + COALESCE(mt.minutes, 0) > 0
            OR COALESCE(tc.completed, 0) > 0
          )
        ORDER BY tracked_minutes DESC, completed_tasks DESC, present_days DESC
        LIMIT 5
        `
      ),
    ]);

    res.json({
      success: true,
      attention: {
        pending_leaves: Number(pendingLeaves.total) || 0,
        escalated_leaves: escalatedLeaves,
        pending_field_visits: Number(pendingVisits.total) || 0,
        overdue_tasks: {
          count: Number(overdueTaskCount.total) || 0,
          items: overdueTasks,
        },
        overdue_projects: Number(overdueProjectCount.total) || 0,
        late_employees: lateEmployees,
      },
      most_active: mostActive,
    });
  } catch (error) {
    console.error("SUPERADMIN ATTENTION ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load attention items.",
    });
  }
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  getSuperadminFieldVisits,
  reviewSuperadminFieldVisit,

  getAllProjects,
  getAllMainTasks,
  getAllUsersBase,

  getSuperadminProjects,
  getSuperadminTasks,
  getSuperadminUsers,

  getSuperadminProjectOptions,
  getSuperadminProjectContext,
  createSuperadminProject,
  updateSuperadminProjectAssignees,
  createSuperadminMainTask,
  deleteOwnSuperadminProject,

   getSuperadminOverview,
  getSuperadminAttention,
  getSuperadminLeaves,
  reviewSuperadminLeave,
  getSuperadminUserById

};