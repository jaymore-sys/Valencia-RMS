// All stylesheets, loaded eagerly in the ORIGINAL cascade order.
// Several layouts reuse the same global class names (e.g. .admin-sidebar) with !important, so the
// order decides which rule wins. Page JS is lazy-loaded (App.jsx) but CSS must not be, or the
// winner changes depending on which role's chunk loads first (administrator layout broke).
import "./layouts/Administratorlayout.css";
import "./pages/administrator/administratorOverview.css";
import "./pages/administrator/administratorProjects.css";
import "./pages/administrator/administratorTasks.css";
import "./layouts/adminCalendar.css";
import "./pages/administrator/administratorCalendar.css";
import "./pages/administrator/administratorReports.css";
import "./pages/administrator/administratorProfile.css";
import "./pages/administrator/administratorUsers.css";
import "./pages/administrator/administratorAttendance.css";
import "./layouts/Employeelayout.css";
import "./layouts/employeeProfile.css";
import "./layouts/hrAttendance.css";
import "./layouts/Adminlayout.css";
import "./layouts/Superadminlayout.css";
import "./pages/superadmin/superadminOverview.css";
import "./pages/superadmin/superadminUsers.css";
import "./pages/superadmin/superadminTasks.css";
import "./pages/superadmin/superadminProjects.css";
import "./pages/superadmin/superadminFieldVisits.css";
import "./pages/superadmin/superadminCalendar.css";
import "./pages/shared/RMSChat.css";
import "./layouts/administratorMobile.css";
import "./layouts/mobileCommon.css";
