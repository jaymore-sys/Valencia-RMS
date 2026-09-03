const express = require("express");

const authMiddleware = require("../middleware/authmiddleware");

const {
  requireRole,
} = require("../middleware/rolemiddleware");


const {

  getSuperadminFieldVisits,
  getSuperadminLeaves,
  getSuperadminProjects,
  getSuperadminTasks,
  getSuperadminUsers,
  getSuperadminProjectOptions,
  getSuperadminOverview

} = require("../controllers/superadmincontroller");



const {
  getSuperadminAttendance
} = require("../controllers/superadminattendancecontroller");



const {

  getSuperadminCalendar,
  getSuperadminMeetingEmployees,
  createSuperadminMeeting,
  updateSuperadminMeeting,
  cancelSuperadminMeeting

} = require("../controllers/superadmincalendarcontroller");



const router = express.Router();



const superadminOnly = [
  authMiddleware,
  requireRole("superadmin")
];





/*
=========================
OVERVIEW
=========================
*/

router.get(
  "/overview",
  ...superadminOnly,
  getSuperadminOverview
);





/*
=========================
PROJECTS
=========================
*/


router.get(
  "/projects",
  ...superadminOnly,
  getSuperadminProjects
);



router.get(
  "/project-options",
  ...superadminOnly,
  getSuperadminProjectOptions
);






/*
=========================
TASKS
=========================
*/


router.get(
  "/tasks",
  ...superadminOnly,
  getSuperadminTasks
);






/*
=========================
USERS
=========================
*/


router.get(
  "/users",
  ...superadminOnly,
  getSuperadminUsers
);






/*
=========================
ATTENDANCE
=========================
*/


router.get(
  "/attendance",
  ...superadminOnly,
  getSuperadminAttendance
);






/*
=========================
CALENDAR
=========================
*/


router.get(
  "/calendar",
  ...superadminOnly,
  getSuperadminCalendar
);


router.get(
  "/calendar/employees",
  ...superadminOnly,
  getSuperadminMeetingEmployees
);



router.post(
  "/calendar/meetings",
  ...superadminOnly,
  createSuperadminMeeting
);



router.put(
  "/calendar/meetings/:meetingId",
  ...superadminOnly,
  updateSuperadminMeeting
);



router.patch(
  "/calendar/meetings/:meetingId/cancel",
  ...superadminOnly,
  cancelSuperadminMeeting
);






router.get("/leaves", ...superadminOnly, getSuperadminLeaves);


/*
=========================
FIELD VISITS
=========================
*/


router.get(
  "/field-visits",
  ...superadminOnly,
  getSuperadminFieldVisits
);



module.exports = router;