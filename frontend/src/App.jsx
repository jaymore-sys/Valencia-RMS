import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import LoginPage from "./pages/LoginPage";

import LeaveReview from "./pages/LeaveReview";

/* ================= ADMINISTRATOR ================= */

import AdministratorLayout from "./layouts/Administratorlayout";

import AdministratorOverview from "./pages/administrator/administratorOverview";

import AdministratorProjects from "./pages/administrator/administratorProjects";

import AdministratorTasks from "./pages/administrator/administratorTasks";

import AdministratorCalendar from "./pages/administrator/administratorCalendar";

import AdministratorReports from "./pages/administrator/administratorReports";

import AdministratorProfile from "./pages/administrator/administratorProfile";

import AdministratorUsers from "./pages/administrator/administratorUsers";

import AdministratorAttendance from "./pages/administrator/administratorAttendance";

import AdministratorLeaveApplications from "./pages/administrator/administratorLeaveApplications";

/* ================= EMPLOYEE ================= */

import EmployeeLayout from "./layouts/Employeelayout";

import EmployeeOverview from "./pages/employee/employeeOverview";

import EmployeeProjects from "./pages/employee/employeeProjects";

import EmployeeTasks from "./pages/employee/employeeTasks";

import EmployeeCalendar from "./pages/employee/employeeCalendar";

import EmployeeProfile from "./pages/employee/employeeProfile";

import EmployeeAttendance from "./pages/employee/employeeAttendance";

import EmployeeLeaveApplications from "./pages/employee/employeeLeaveApplications";
import HrAttendance from "./pages/employee/hrAttendance";
/* ================= ADMIN ================= */

import AdminLayout from "./layouts/Adminlayout";

import AdminOverview from "./pages/admin/adminOverview";

import AdminProjects from "./pages/admin/adminProjects";

import AdminTasks from "./pages/admin/adminTasks";

import AdminCalendar from "./pages/admin/adminCalendar";

import AdminProfile from "./pages/admin/adminProfile";

import AdminUsers from "./pages/admin/adminUsers";

import AdminAttendance from "./pages/admin/adminAttendance";

import AdminLeaveApplications from "./pages/admin/adminLeaveApplications";

/* ================= SUPERADMIN ================= */

import SuperadminLayout from "./layouts/Superadminlayout";

import SuperadminOverview from "./pages/superadmin/superadminOverview";

import SuperadminUsers from "./pages/superadmin/superadminUsers";

import SuperadminTasks from "./pages/superadmin/superadminTasks";

import SuperadminProjects from "./pages/superadmin/superadminProjects";

import SuperadminFieldVisits from "./pages/superadmin/superadminFieldVisits";

/* NEW SUPERADMIN PAGES */

import SuperadminCalendar from "./pages/superadmin/superadminCalendar";

import SuperadminAttendance from "./pages/superadmin/superadminAttendance";
import SuperadminLeaveApplications from "./pages/superadmin/superadminLeaveApplications";

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
   DEFAULT ROUTE BY ROLE
======================================================== */


function FieldVisitReviewRedirect() {
  const token = window.location.pathname.split("/field-visit-review/")[1];

  const target = `/admin/attendance?tab=fieldVisits&fieldVisitToken=${token}`;

  const authToken =
    sessionStorage.getItem("token") ||
    localStorage.getItem("token");

  if (!authToken) {
    localStorage.setItem("redirectAfterLogin", target);
    return <Navigate to="/login" replace />;
  }

  window.history.replaceState({}, "", target);
  return <Navigate to={target} replace />;
}

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

  const user = getStoredUser();

  const roleName = String(
    user?.role_name || ""
  )
    .trim()
    .toLowerCase();

  const email = String(
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
    LEAVE_REVIEWER_EMAILS.includes(email);

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
   APP
======================================================== */
const LeaveApprovalsRedirect = () => {
  const user = getStoredUser();

  const roleName = String(
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
  if (roleName === "admin") {
    return (
      <Navigate
        to={`/admin/leave-applications${queryString}`}
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

const App = () => {
  return (
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
        element={<LoginPage />}
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

        <Route
          path="calendar"
          element={
            <AdminCalendar />
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

      </Route>


      <Route
        path="/field-visit-review/:token"
        element={<FieldVisitReviewRedirect />}
      />

      <Route
        path="/leave-review/:token"
        element={<LeaveReview />}
      />
      <Route
  path="/leave-approvals"
  element={<LeaveApprovalsRedirect />}
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
  );
};

export default App;