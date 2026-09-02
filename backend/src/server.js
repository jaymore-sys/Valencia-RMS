const express = require("express");
const cors = require("cors");
require("dotenv").config();

const db = require("./config/db");

const authRoutes = require("./routes/authroutes");

const administratorRoutes = require("./routes/administratorroutes");
const adminRoutes = require("./routes/adminroutes");

const adminProjectRoutes = require("./routes/adminprojectroutes");
const administratorProjectRoutes = require("./routes/administratorprojectroutes");

const adminOverviewRoutes = require("./routes/adminoverviewroutes");
const adminProfileRoutes = require("./routes/adminprofileroutes");

const adminTaskRoutes = require("./routes/admintaskroutes");
const adminAttendanceRoutes = require("./routes/adminattendanceroutes");
const adminLeaveRoutes = require("./routes/adminleaveroutes");


const employeeOverviewRoutes = require("./routes/employeeoverviewroutes");
const employeeTaskRoutes = require("./routes/employeetaskroutes");
const employeeProfileRoutes = require("./routes/employeeprofileroutes");
const employeeAttendanceRoutes = require("./routes/employeeattendanceroutes");
const employeeLeaveRoutes = require("./routes/employeeleaveroutes");


const superadminRoutes = require("./routes/superadminroutes");


const employeeMiniTaskRoutes = require("./routes/employeeminitaskroutes");
const adminMiniTaskRoutes = require("./routes/adminminitaskroutes");

const employeeProjectRoutes = require("./routes/employeeprojectroutes");

const adminReviewRoutes = require("./routes/adminreviewroutes");

const calendarRoutes = require("./routes/calendarroutes");


const {
  startDeadlineEmailJob
} = require("./jobs/deadlineemailjob");



const app = express();



/*
=================================================
CORS
=================================================
*/


const allowedOrigins = [

  "https://myvol.in",

  "https://www.myvol.in",

  "http://localhost:5173",

  "http://localhost:5174"

];



const corsOptions = {

  origin:function(origin,callback){


    console.log(
      "REQUEST ORIGIN:",
      origin
    );


    if(!origin){

      return callback(null,true);

    }


    if(
      allowedOrigins.includes(origin)
    ){

      return callback(null,true);

    }


    return callback(null,true);


  },


  credentials:true,


  methods:[

    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS"

  ],


  allowedHeaders:[

    "Content-Type",
    "Authorization",
    "Accept",
    "Origin"

  ],


  optionsSuccessStatus:200

};



app.use(
  cors(corsOptions)
);

app.options(
  "*",
  cors(corsOptions)
);


app.use(
  express.json()
);





/*
=================================================
HEALTH
=================================================
*/


app.get("/",(req,res)=>{

  res.json({

    message:
    "Valencia RMS Backend Running"

  });

});



app.get("/api/health",(req,res)=>{


  res.json({

    success:true,

    service:
    "valencia-rms-backend"

  });


});





app.get(
"/api/db-test",
async(req,res)=>{


try{


const [rows]=await db.query(

"SELECT DATABASE() AS database_name"

);



res.json({

success:true,

database:
rows[0].database_name

});


}

catch(error){


res.status(500).json({

success:false,

message:error.message

});


}


});







/*
=================================================
ROUTES
=================================================
*/


app.use(
"/api/auth",
authRoutes
);



app.use(
"/api/administrator",
administratorRoutes
);



app.use(
"/api/admin",
adminRoutes
);



app.use(
"/api/admin-projects",
adminProjectRoutes
);



app.use(
"/api/administrator-projects",
administratorProjectRoutes
);



app.use(
"/api/admin-overview",
adminOverviewRoutes
);



app.use(
"/api/admin-profile",
adminProfileRoutes
);



app.use(
"/api/admin-tasks",
adminTaskRoutes
);



app.use(
"/api/admin-attendance",
adminAttendanceRoutes
);



app.use(
"/api/admin-leaves",
adminLeaveRoutes
);





app.use(
"/api/employee-overview",
employeeOverviewRoutes
);



app.use(
"/api/employee-tasks",
employeeTaskRoutes
);



app.use(
"/api/employee-profile",
employeeProfileRoutes
);



app.use(
"/api/employee-attendance",
employeeAttendanceRoutes
);



app.use(
"/api/employee-leaves",
employeeLeaveRoutes
);





/*
=================================================
SUPERADMIN
=================================================
*/


app.use(
"/api/superadmin",
superadminRoutes
);





app.use(
"/api/employee-mini-tasks",
employeeMiniTaskRoutes
);



app.use(
"/api/admin-mini-tasks",
adminMiniTaskRoutes
);



app.use(
"/api/employee-projects",
employeeProjectRoutes
);



app.use(
"/api/admin-review",
adminReviewRoutes
);



app.use(
"/api/calendar",
calendarRoutes
);







/*
=================================================
404
=================================================
*/


app.use(
(req,res)=>{


res.status(404).json({

success:false,

message:
"API route not found",

path:req.originalUrl

});


}

);








/*
=================================================
SERVER
=================================================
*/


const PORT =
process.env.PORT || 5000;



app.listen(

PORT,

"0.0.0.0",

()=>{


console.log(
`Server running on port ${PORT}`
);


startDeadlineEmailJob();


}

);