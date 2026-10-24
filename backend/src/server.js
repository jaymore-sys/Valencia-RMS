const express = require("express");
const cors = require("cors");
require("dotenv").config();

const db = require("./config/db");

const authRoutes = require("./routes/authroutes");
const notificationRoutes = require("./routes/notificationroutes");



const administratorRoutes = require("./routes/administratorroutes");
const adminRoutes = require("./routes/adminroutes");
const administratorLeaveRoutes = require(
  "./routes/administratorleaveroutes"
);
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
const hrAttendanceRoutes =
  require("./routes/hrattendanceroutes");
const superadminRoutes = require("./routes/superadminroutes");


const employeeMiniTaskRoutes = require("./routes/employeeminitaskroutes");
const adminMiniTaskRoutes = require("./routes/adminminitaskroutes");

const employeeProjectRoutes = require("./routes/employeeprojectroutes");

const adminReviewRoutes = require("./routes/adminreviewroutes");

const calendarRoutes = require("./routes/calendarroutes");
const leaveReviewRoutes = require("./routes/leavereviewroutes");
const fieldVisitReviewRoutes = require("./routes/fieldvisitreviewroutes");

const chatRoutes = require("./routes/chatroutes");
const fieldVisitLocationsRoutes = require("./routes/fieldvisitlocationsroutes");

const {
  startDeadlineEmailJob
} = require("./jobs/deadlineemailjob");

const {
  startMiniTaskTimerJob
} = require("./jobs/minitasktimerjob");



if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is not set. Refusing to start.");
  process.exit(1);
}

const {
  securityHeaders,
  requestLogger,
  hideInternalErrors,
  rateLimit,
  errorHandler,
} = require("./middleware/hardening");

const app = express();

app.disable("x-powered-by");
// Hostinger terminates TLS in a proxy; needed for the real client IP.
app.set("trust proxy", 1);
app.use(requestLogger);
app.use(securityHeaders);
app.use(hideInternalErrors);



/*
=================================================
CORS
=================================================
*/


const allowedOrigins = [
  "https://myvol.in",
  "https://www.myvol.in",

  "http://localhost:5173",
  "http://localhost:5174",

  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];




const corsOptions = {

  origin:function(origin,callback){


    if(!origin){

      return callback(null,true);

    }


if (allowedOrigins.includes(origin)) {
  return callback(null, true);
}

return callback(new Error("Not allowed by CORS"));


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

app.use(
  express.json({ limit: "1mb" })
);

// Login brute-force protection. Keyed on IP + email so a shared proxy IP
// cannot lock out the whole company; a looser per-IP cap stops password spraying.
const loginMessage = "Too many login attempts. Please try again in 15 minutes.";

app.use(
  "/api/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: loginMessage,
    key: (req) =>
      `${req.ip}|${String(req.body?.email || "").toLowerCase().trim()}`,
  }),
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: loginMessage,
  })
);

app.use(
  "/api/administrator-leaves",
  administratorLeaveRoutes
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





app.get("/api/db-test", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ success: true });
  } catch (error) {
    console.error("DB health check failed:", error.message);
    res.status(503).json({ success: false });
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
  "/api/hr-attendance",
  hrAttendanceRoutes
);


app.use(
"/api/employee-leaves",
employeeLeaveRoutes
);

app.use(
"/api/leave-review",
leaveReviewRoutes
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

app.use(
  "/api/notifications",
  notificationRoutes
);

app.use("/api/field-visit-locations", fieldVisitLocationsRoutes);

// Valencia RMS Text Chat
// Remains disabled until CHAT_ENABLED=true
app.use(
  "/api/chat",
  chatRoutes
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


app.use(errorHandler);

const PORT =
process.env.PORT || 5000;

const server = app.listen(

PORT,

"0.0.0.0",

()=>{


console.log(
`Server running on port ${PORT}`
);


startDeadlineEmailJob();
startMiniTaskTimerJob();


}

);

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

const shutdown = (signal) => {
  console.log(`${signal} received, shutting down.`);

  server.close(async () => {
    try {
      await db.end();
    } catch (error) {
      console.error("DB pool close failed:", error.message);
    }
    process.exit(0);
  });

  // Force exit if connections hang.
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
