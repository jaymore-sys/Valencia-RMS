import { lazy, Suspense } from "react";
import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import LoginPage from "./pages/LoginPage";
const LeaveReview = lazy(() => import("./pages/LeaveReview"));


/* ================= ADMINISTRATOR ================= */

const AdministratorLayout = lazy(() => import("./layouts/Administratorlayout"));

const AdministratorOverview = lazy(() => import("./pages/administrator/administratorOverview"));
const AdministratorProjects = lazy(() => import("./pages/administrator/administratorProjects"));
const AdministratorTasks = lazy(() => import("./pages/administrator/administratorTasks"));
const AdministratorCalendar = lazy(() => import("./pages/administrator/administratorCalendar"));
const AdministratorReports = lazy(() => import("./pages/administrator/administratorReports"));
const AdministratorProfile = lazy(() => import("./pages/administrator/administratorProfile"));
const AdministratorUsers = lazy(() => import("./pages/administrator/administratorUsers"));
const AdministratorAttendance = lazy(() => import("./pages/administrator/administratorAttendance"));
const AdministratorLeaveApplications = lazy(() => import("./pages/administrator/administratorLeaveApplications"));


/* ================= EMPLOYEE ================= */

const EmployeeLayout = lazy(() => import("./layouts/Employeelayout"));

const EmployeeOverview = lazy(() => import("./pages/employee/employeeOverview"));
const EmployeeProjects = lazy(() => import("./pages/employee/employeeProjects"));
const EmployeeTasks = lazy(() => import("./pages/employee/employeeTasks"));
const EmployeeCalendar = lazy(() => import("./pages/employee/employeeCalendar"));
const EmployeeProfile = lazy(() => import("./pages/employee/employeeProfile"));
const EmployeeAttendance = lazy(() => import("./pages/employee/employeeAttendance"));
const EmployeeLeaveApplications = lazy(() => import("./pages/employee/employeeLeaveApplications"));
const EmployeeFieldVisits = lazy(() => import("./pages/employee/employeeFieldVisits"));
const HrAttendance = lazy(() => import("./pages/employee/hrAttendance"));


/* ================= ADMIN ================= */

const AdminLayout = lazy(() => import("./layouts/Adminlayout"));

const AdminOverview = lazy(() => import("./pages/admin/adminOverview"));
const AdminProjects = lazy(() => import("./pages/admin/adminProjects"));
const AdminTasks = lazy(() => import("./pages/admin/adminTasks"));
const AdminCalendar = lazy(() => import("./pages/admin/adminCalendar"));
const AdminReports = lazy(() => import("./pages/admin/adminReports"));
const AdminProfile = lazy(() => import("./pages/admin/adminProfile"));
const AdminUsers = lazy(() => import("./pages/admin/adminUsers"));
const AdminAttendance = lazy(() => import("./pages/admin/adminAttendance"));
const AdminLeaveApplications = lazy(() => import("./pages/admin/adminLeaveApplications"));
const AdminFieldVisits = lazy(() => import("./pages/admin/adminFieldVisits"));


/* ================= SUPERADMIN ================= */

const SuperadminLayout = lazy(() => import("./layouts/Superadminlayout"));

const SuperadminOverview = lazy(() => import("./pages/superadmin/superadminOverview"));
const SuperadminUsers = lazy(() => import("./pages/superadmin/superadminUsers"));
const SuperadminTasks = lazy(() => import("./pages/superadmin/superadminTasks"));
const SuperadminProjects = lazy(() => import("./pages/superadmin/superadminProjects"));
const SuperadminFieldVisits = lazy(() => import("./pages/superadmin/superadminFieldVisits"));
const SuperadminCalendar = lazy(() => import("./pages/superadmin/superadminCalendar"));
const SuperadminAttendance = lazy(() => import("./pages/superadmin/superadminAttendance"));
const SuperadminLeaveApplications = lazy(() => import("./pages/superadmin/superadminLeaveApplications"));
const SuperadminProfile = lazy(() => import("./pages/superadmin/superadminProfile"));


/* ================= SHARED ================= */

const VendorManagement = lazy(() => import("./pages/shared/VendorManagement"));
const RMSChat = lazy(() => import("./pages/shared/RMSChat"));


/* ========================================================
   AUTH HELPERS
======================================================== */

const getStoredUser = () => {
  try {
    return JSON.parse(
      sessionStorage.getItem("user") ||
      localStorage.getItem("user") ||
      "{}"
    );
  } catch {
    return {};
  }
};



/* ========================================================
   FIELD VISIT REVIEW REDIRECT
======================================================== */

function FieldVisitReviewRedirect() {
  const token =
    window.location.pathname.split(
      "/field-visit-review/"
    )[1];

  const target =
    `/admin/field-visits?fieldVisitToken=${token}`;

  const authToken =
    sessionStorage.getItem("token") ||
    localStorage.getItem("token");

  if (!authToken) {
    localStorage.setItem(
      "redirectAfterLogin",
      target
    );

    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  window.history.replaceState(
    {},
    "",
    target
  );

  return (
    <Navigate
      to={target}
      replace
    />
  );
}



/* ========================================================
   DEFAULT ROUTE BY ROLE
======================================================== */

const getDefaultRouteByRole = (
  roleName
) => {
  if (
    roleName ===
    "administrator"
  ) {
    return "/administrator/overview";
  }

  if (
    roleName ===
    "superadmin"
  ) {
    return "/superadmin/overview";
  }

  if (
    roleName === "admin"
  ) {
    return "/admin/overview";
  }

  if (
    roleName ===
    "employee"
  ) {
    return "/employee/overview";
  }

  return "/login";
};



/* ========================================================
   PROTECTED ROUTE
======================================================== */

const ProtectedRoute = ({
  children,
  allowedRoles,
}) => {
  const token =
    sessionStorage.getItem(
      "token"
    ) ||
    localStorage.getItem(
      "token"
    );

  const user =
    getStoredUser();

  if (
    !token ||
    !user?.role_name
  ) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  if (
    allowedRoles?.length &&
    !allowedRoles.includes(
      user.role_name
    )
  ) {
    return (
      <Navigate
        to={getDefaultRouteByRole(
          user.role_name
        )}
        replace
      />
    );
  }

  return children;
};



/* ========================================================
   HR PROTECTED ROUTE
======================================================== */

const HR_EMAILS = [
  "rathika.haleangadi@valencianutrition.com",
];

const HrProtectedRoute = ({
  children,
}) => {
  const user =
    getStoredUser();

  const email =
    String(
      user?.email || ""
    )
      .trim()
      .toLowerCase();

  if (
    !HR_EMAILS.includes(
      email
    )
  ) {
    return (
      <Navigate
        to="/employee/overview"
        replace
      />
    );
  }

  return children;
};



/* ========================================================
   LEAVE REVIEWER PROTECTED ROUTE
======================================================== */

const LEAVE_REVIEWER_EMAILS = [
  "manish@valencianutrition.com",
  "premal.mehta@valencianutrition.com",
  "rathika.haleangadi@valencianutrition.com",
];

const LeaveReviewerProtectedRoute = ({
  children,
}) => {
  const token =
    sessionStorage.getItem("token") ||
    localStorage.getItem("token");

  const user =
    getStoredUser();

  const roleName =
    String(
      user?.role_name || ""
    )
      .trim()
      .toLowerCase();

  const email =
    String(
      user?.email || ""
    )
      .trim()
      .toLowerCase();

  if (!token) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  const allowed =
    roleName === "admin" ||
    LEAVE_REVIEWER_EMAILS.includes(
      email
    );

  if (!allowed) {
    return (
      <Navigate
        to={getDefaultRouteByRole(
          roleName
        )}
        replace
      />
    );
  }

  return children;
};



/* ========================================================
   LEAVE APPROVALS REDIRECT
======================================================== */

const LeaveApprovalsRedirect = () => {
  const user =
    getStoredUser();

  const roleName =
    String(
      user?.role_name || ""
    )
      .trim()
      .toLowerCase();

  const queryString =
    window.location.search || "";

  /*
    Department Admin:
    Open the existing Admin Leave page
    inside the normal AdminLayout.
  */
  if (
    roleName === "admin"
  ) {
    return (
      <Navigate
        to={
          `/admin/leave-applications${queryString}`
        }
        replace
      />
    );
  }

  /*
    Premal / Rathika special access:
    Keep existing special reviewer page.
  */
  return (
    <LeaveReviewerProtectedRoute>
      <AdminLeaveApplications />
    </LeaveReviewerProtectedRoute>
  );
};



/* ========================================================
   APP
======================================================== */

const App = () => {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
    <Routes>


      {/* ===================================================
          LOGIN
      =================================================== */}

      <Route
        path="/"
        element={
          <Navigate
            to="/login"
            replace
          />
        }
      />

      <Route
        path="/login"
        element={
          <LoginPage />
        }
      />



      {/* ===================================================
          ADMINISTRATOR
      =================================================== */}

      <Route
        path="/administrator"
        element={
          <ProtectedRoute
            allowedRoles={[
              "administrator",
            ]}
          >
            <AdministratorLayout />
          </ProtectedRoute>
        }
      >

        <Route
          index
          element={
            <Navigate
              to="/administrator/overview"
              replace
            />
          }
        />


        <Route
          path="overview"
          element={
            <AdministratorOverview />
          }
        />
<Route path="chat" element={<RMSChat />} />



        <Route
          path="projects"
          element={
            <AdministratorProjects />
          }
        />


        <Route
          path="tasks"
          element={
            <AdministratorTasks />
          }
        />


        {/* VENDOR MANAGEMENT */}

        <Route
          path="vendors"
          element={
            <VendorManagement />
          }
        />


        <Route
          path="calendar"
          element={
            <AdministratorCalendar />
          }
        />


        <Route
          path="leave-applications"
          element={
            <AdministratorLeaveApplications />
          }
        />


        <Route
          path="reports"
          element={
            <AdministratorReports />
          }
        />


        <Route
          path="profile"
          element={
            <AdministratorProfile />
          }
        />


        <Route
          path="users"
          element={
            <AdministratorUsers />
          }
        />


        <Route
          path="attendance"
          element={
            <AdministratorAttendance />
          }
        />

      </Route>



      {/* ===================================================
          EMPLOYEE
      =================================================== */}

      <Route
        path="/employee"
        element={
          <ProtectedRoute
            allowedRoles={[
              "employee",
            ]}
          >
            <EmployeeLayout />
          </ProtectedRoute>
        }
      >

        <Route
          index
          element={
            <Navigate
              to="/employee/overview"
              replace
            />
          }
        />


        <Route
          path="overview"
          element={
            <EmployeeOverview />
          }
        />

        <Route
          path="chat"
          element={<RMSChat />}
        />


        <Route
          path="projects"
          element={
            <EmployeeProjects />
          }
        />


        <Route
          path="tasks"
          element={
            <EmployeeTasks />
          }
        />


        {/* VENDOR MANAGEMENT */}

        <Route
          path="vendors"
          element={
            <VendorManagement />
          }
        />


        <Route
          path="calendar"
          element={
            <EmployeeCalendar />
          }
        />


        <Route
          path="profile"
          element={
            <EmployeeProfile />
          }
        />


        <Route
          path="attendance"
          element={
            <EmployeeAttendance />
          }
        />


        <Route
          path="field-visits"
          element={
            <EmployeeFieldVisits />
          }
        />


        <Route
          path="hr-attendance"
          element={
            <HrProtectedRoute>
              <HrAttendance />
            </HrProtectedRoute>
          }
        />


        <Route
          path="leave-applications"
          element={
            <EmployeeLeaveApplications />
          }
        />

      </Route>



      {/* ===================================================
          ADMIN
      =================================================== */}

      <Route
        path="/admin"
        element={
          <ProtectedRoute
            allowedRoles={[
              "admin",
            ]}
          >
            <AdminLayout />
          </ProtectedRoute>
        }
      >

        <Route
          index
          element={
            <Navigate
              to="/admin/overview"
              replace
            />
          }
        />


        <Route
          path="overview"
          element={
            <AdminOverview />
          }
        />
<Route path="chat" element={<RMSChat />} />



        <Route
          path="projects"
          element={
            <AdminProjects />
          }
        />


        <Route
          path="tasks"
          element={
            <AdminTasks />
          }
        />


        {/* VENDOR MANAGEMENT */}

        <Route
          path="vendors"
          element={
            <VendorManagement />
          }
        />


        <Route
          path="calendar"
          element={
            <AdminCalendar />
          }
        />


        <Route
          path="reports"
          element={
            <AdminReports />
          }
        />


        <Route
          path="profile"
          element={
            <AdminProfile />
          }
        />


        <Route
          path="users"
          element={
            <AdminUsers />
          }
        />


        <Route
          path="attendance"
          element={
            <AdminAttendance />
          }
        />


        <Route
          path="field-visits"
          element={
            <AdminFieldVisits />
          }
        />


        <Route
          path="leave-applications"
          element={
            <AdminLeaveApplications />
          }
        />

      </Route>



      {/* ===================================================
          SUPERADMIN
      =================================================== */}

      <Route
        path="/superadmin"
        element={
          <ProtectedRoute
            allowedRoles={[
              "superadmin",
            ]}
          >
            <SuperadminLayout />
          </ProtectedRoute>
        }
      >

        {/* DEFAULT */}

        <Route
          index
          element={
            <Navigate
              to="/superadmin/overview"
              replace
            />
          }
        />


        {/* OVERVIEW */}

        <Route
          path="overview"
          element={
            <SuperadminOverview />
          }
        />
<Route path="chat" element={<RMSChat />} />



        {/* PROJECTS */}

        <Route
          path="projects"
          element={
            <SuperadminProjects />
          }
        />


        {/* TASKS */}

        <Route
          path="tasks"
          element={
            <SuperadminTasks />
          }
        />


        {/* USERS */}

        <Route
          path="users"
          element={
            <SuperadminUsers />
          }
        />


        {/* VENDOR MANAGEMENT */}

        <Route
          path="vendors"
          element={
            <VendorManagement />
          }
        />


        {/* CALENDAR */}

        <Route
          path="calendar"
          element={
            <SuperadminCalendar />
          }
        />


        {/* ATTENDANCE */}

        <Route
          path="attendance"
          element={
            <SuperadminAttendance />
          }
        />


        {/* LEAVE APPLICATIONS */}

        <Route
          path="leave-applications"
          element={
            <SuperadminLeaveApplications />
          }
        />


        {/* FIELD VISITS */}

        <Route
          path="field-visits"
          element={
            <SuperadminFieldVisits />
          }
        />


        <Route
          path="profile"
          element={
            <SuperadminProfile />
          }
        />

      </Route>



      {/* ===================================================
          SPECIAL REVIEW LINKS
      =================================================== */}

      <Route
        path="/field-visit-review/:token"
        element={
          <FieldVisitReviewRedirect />
        }
      />


      <Route
        path="/leave-review/:token"
        element={
          <LeaveReview />
        }
      />


      <Route
        path="/leave-approvals"
        element={
          <LeaveApprovalsRedirect />
        }
      />



      {/* ===================================================
          FALLBACK
      =================================================== */}

      <Route
        path="*"
        element={
          <Navigate
            to={getDefaultRouteByRole(
              getStoredUser()
                ?.role_name
            )}
            replace
          />
        }
      />


    </Routes>
    </Suspense>
  );
};


export default App;

