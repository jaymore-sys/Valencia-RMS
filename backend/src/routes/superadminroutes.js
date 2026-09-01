const express = require("express");

const authMiddleware = require(
  "../middleware/authmiddleware"
);

const {
  requireRole,
} = require(
  "../middleware/rolemiddleware"
);



/*
=========================================================
CONTROLLERS
=========================================================
*/

const {

  getSuperadminFieldVisits,

  getAllProjects,

  getAllMainTasks,

  getAllUsersBase,

  getSuperadminProjectOptions


} = require(
  "../controllers/superadmincontroller"
);



const {

  getSuperadminAttendance

} = require(
  "../controllers/superadminattendancecontroller"
);



const {

  getSuperadminCalendar,

  getSuperadminMeetingEmployees,

  createSuperadminMeeting,

  updateSuperadminMeeting,

  cancelSuperadminMeeting


} = require(
  "../controllers/superadmincalendarcontroller"
);



const router = express.Router();



const superadminOnly = [

  authMiddleware,

  requireRole("superadmin")

];





/*
=========================================================
OVERVIEW
=========================================================
*/

router.get(

  "/overview",

  ...superadminOnly,

  async(req,res)=>{

    try{

      res.json({

        success:true,

        data:{

          message:
          "Superadmin overview working"

        }

      });


    }
    catch(error){

      res.status(500).json({

        success:false,

        message:error.message

      });

    }

  }

);







/*
=========================================================
PROJECTS
=========================================================
*/


router.get(

  "/projects",

  ...superadminOnly,

  async(req,res)=>{


    try{


      const projects =
        await getAllProjects();



      res.json({

        success:true,

        projects

      });


    }

    catch(error){


      console.log(
        "PROJECT ERROR:",
        error
      );


      res.status(500).json({

        success:false,

        message:error.message

      });


    }


  }

);







/*
=========================================================
PROJECT OPTIONS
=========================================================
*/


router.get(

  "/project-options",

  ...superadminOnly,

  async(req,res)=>{


    try{


      const options =
        await getSuperadminProjectOptions();



      res.json({

        success:true,

        ...options

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


  }

);









/*
=========================================================
TASKS
=========================================================
*/


router.get(

  "/tasks",

  ...superadminOnly,

  async(req,res)=>{


    try{


      const tasks =
        await getAllMainTasks();



      res.json({

        success:true,

        tasks

      });


    }

    catch(error){


      res.status(500).json({

        success:false,

        message:error.message

      });


    }


  }

);









/*
=========================================================
USERS
=========================================================
*/


router.get(

  "/users",

  ...superadminOnly,

  async(req,res)=>{


    try{


      const users =
        await getAllUsersBase();



      res.json({

        success:true,

        users

      });


    }

    catch(error){


      res.status(500).json({

        success:false,

        message:error.message

      });


    }


  }

);









/*
=========================================================
ATTENDANCE
=========================================================
*/


router.get(

  "/attendance",

  ...superadminOnly,

  getSuperadminAttendance

);









/*
=========================================================
CALENDAR
=========================================================
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









/*
=========================================================
FIELD VISITS
=========================================================
*/


router.get(

  "/field-visits",

  ...superadminOnly,

  getSuperadminFieldVisits

);







module.exports = router;