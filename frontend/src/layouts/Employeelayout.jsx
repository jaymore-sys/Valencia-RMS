import { useState, lazy, Suspense } from "react";
import MobileNavControls from "../components/MobileNavControls";
import { useMobileShell, useTableLabels } from "../hooks/useMobileShell";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
   FolderKanban,
  LogOut,
  MapPin,
 User,
UsersRound,
Building2,
MessageCircle,
} from "lucide-react";

import "./Employeelayout.css";
import VNLLogo from "../assets/VNL_logo.webp";

import { CHAT_UI_ENABLED } from "../config/chatRelease";

const ChatNotifications = lazy(() => import("../components/ChatNotifications"));

const EmployeeLayout = () => {
  const navigate = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { isNarrow, mobileNavOpen, setMobileNavOpen } = useMobileShell();
  const collapsed = sidebarCollapsed && !isNarrow;
  useTableLabels(".employee-main");

  const user = JSON.parse(
    sessionStorage.getItem("user") || "{}"
  );

  const HR_EMAILS = [
  "rathika.haleangadi@valencianutrition.com",
];

const isHR = HR_EMAILS.includes(
  String(user?.email || "")
    .trim()
    .toLowerCase()
);

  const logout = () => {
  sessionStorage.clear();
  localStorage.clear();

  navigate("/login", { replace: true });
};

  const initials =
    user?.full_name
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "E";

  return (
    <div
      className={`employee-dashboard-shell rms-mobile ${
        collapsed ? "sidebar-collapsed" : ""
      } ${mobileNavOpen ? "mobile-nav-open" : ""}`}
    >
      {/* ================= SIDEBAR ================= */}
      <MobileNavControls
        onOpen={() => setMobileNavOpen(true)}
        onClose={() => setMobileNavOpen(false)}
      />

      <aside className="employee-sidebar">
        <button
          type="button"
          className="employee-sidebar-toggle"
          onClick={() =>
            setSidebarCollapsed((previous) => !previous)
          }
          title={
            sidebarCollapsed
              ? "Expand sidebar"
              : "Collapse sidebar"
          }
        >
          {sidebarCollapsed ? (
            <ChevronRight size={20} />
          ) : (
            <ChevronLeft size={20} />
          )}
        </button>

        <div className="employee-brand employee-logo-only">
          <img
            src={VNLLogo}
            alt="Valencia Nutrition"
            className="employee-sidebar-logo-img"
          />
        </div>

        <nav className="employee-nav">
          <NavLink
            to="/employee/overview"
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
            title="Overview"
          >
            <BarChart3 size={20} />
            <span>Overview</span>
          </NavLink>

{CHAT_UI_ENABLED && (
          <NavLink
            to="/employee/chat"
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
            title="Chat"
          >
            <MessageCircle size={20} />
            <span>Chat</span>
          </NavLink>
          )}

          <NavLink
            to="/employee/projects"
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
            title="Projects"
          >
            <FolderKanban size={20} />
            <span>Projects</span>
          </NavLink>

          <NavLink
            to="/employee/tasks"
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
            title="Tasks"
          >
            <ClipboardList size={20} />
            <span>Tasks</span>
          </NavLink>

          

          <NavLink
  to="/employee/calendar"
  className={({ isActive }) =>
    isActive ? "active" : ""
  }
  title="Calendar"
>
  <CalendarDays size={20} />
  <span>Calendar</span>
</NavLink>

          <NavLink
            to="/employee/profile"
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
            title="Profile"
          >
            <User size={20} />
            <span>Profile</span>
          </NavLink>

          <NavLink
            to="/employee/attendance"
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
            title="Attendance"
          >
            <CalendarCheck size={20} />
            <span>Attendance</span>
          </NavLink>

          <NavLink
  to="/employee/field-visits"
  className={({ isActive }) =>
    isActive ? "active" : ""
  }
  title="Field Visits"
>
  <MapPin size={20} />
  <span>Field Visits</span>
</NavLink>

          {isHR && (
  <NavLink
    to="/employee/hr-attendance"
    className={({ isActive }) =>
      isActive ? "active" : ""
    }
    title="HR Attendance"
  >
    <UsersRound size={20} />
    <span>HR Attendance</span>
  </NavLink>
)}

          <NavLink
            to="/employee/leave-applications"
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
            title="Leave Applications"
          >
            <CalendarDays size={20} />
            <span>Leave Applications</span>
          </NavLink>
          {/*
           <NavLink 
  to="/employee/vendors" 
  className={({ isActive }) => 
    isActive ? "active" : "" 
  } 
  title="Vendor Management" 
> 
  <Building2 size={20} /> 
  <span>Vendor Management</span> 
</NavLink>
*/}
        </nav>

        

        {/* ================= USER / LOGOUT ================= */}
        <div className="employee-sidebar-bottom">
          <div className="employee-user-card">
            <div className="employee-user-avatar">
              {initials}
            </div>

            <div className="employee-user-info">
              <strong>
                {user?.full_name || "Employee"}
              </strong>

              <p>{user?.email || "-"}</p>

              <span>
                {user?.role_name || "employee"}
              </span>
            </div>
          </div>

          <button
  type="button"
  className="employee-logout-btn"
  onClick={logout}
>
  <LogOut size={18} />
  <span>Logout</span>
</button>
        </div>
      </aside>

      {/* ================= MAIN CONTENT ================= */}
      <main className="employee-main">
  <Outlet />
  {CHAT_UI_ENABLED && (
    <Suspense fallback={null}>
      <ChatNotifications role="employee" />
    </Suspense>
  )}
</main>

      {/* ================= LOGOUT CONFIRMATION ================= */}
      
    </div>
  );
};

export default EmployeeLayout;