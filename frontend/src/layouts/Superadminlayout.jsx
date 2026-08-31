import { useState } from "react";

import {
  NavLink,
  Outlet,
  useNavigate,
} from "react-router-dom";

import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FolderKanban,
  LogOut,
  Users,
} from "lucide-react";

import vnlLogo from "../assets/VNL_logo.webp";

import "./Superadminlayout.css";

/* =========================================================
   GET LOGGED-IN SUPERADMIN
========================================================= */

const getUser = () => {
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

/* =========================================================
   COMPONENT
========================================================= */

const SuperadminLayout = () => {
  const navigate = useNavigate();

  const user = getUser();

  const [
    sidebarCollapsed,
    setSidebarCollapsed,
  ] = useState(false);

  /* =======================================================
     LOGOUT
  ======================================================= */

  const logout = () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");

    localStorage.removeItem("token");
    localStorage.removeItem("user");

    navigate("/login", {
      replace: true,
    });
  };

  /* =======================================================
     USER INITIALS
  ======================================================= */

  const initials =
    user?.full_name
      ?.split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "SA";

  /* =======================================================
     JSX
  ======================================================= */

  return (
    <div
      className={`sa-shell ${
        sidebarCollapsed
          ? "sa-sidebar-collapsed"
          : ""
      }`}
    >
      {/* ===================================================
          SIDEBAR
      =================================================== */}

      <aside className="sa-sidebar">
        {/* =================================================
            COLLAPSE / EXPAND
        ================================================= */}

        <button
          type="button"
          className="sa-sidebar-toggle"
          onClick={() =>
            setSidebarCollapsed(
              (previous) => !previous
            )
          }
          title={
            sidebarCollapsed
              ? "Expand sidebar"
              : "Collapse sidebar"
          }
          aria-label={
            sidebarCollapsed
              ? "Expand sidebar"
              : "Collapse sidebar"
          }
        >
          {sidebarCollapsed ? (
            <ChevronRight size={18} />
          ) : (
            <ChevronLeft size={18} />
          )}
        </button>

        {/* =================================================
            LOGO
        ================================================= */}

        <div className="sa-logo-wrap">
          <img
            src={vnlLogo}
            alt="Valencia Nutrition"
            className="sa-logo-img"
          />
        </div>

        {/* =================================================
            NAVIGATION
        ================================================= */}

        <nav className="sa-nav">
          {/* OVERVIEW */}

          <NavLink
            to="/superadmin/overview"
            title="Overview"
          >
            <BarChart3 />

            <span>
              Overview
            </span>
          </NavLink>

          {/* PROJECTS */}

          <NavLink
            to="/superadmin/projects"
            title="Projects"
          >
            <FolderKanban />

            <span>
              Projects
            </span>
          </NavLink>

          {/* TASKS */}

          <NavLink
            to="/superadmin/tasks"
            title="Tasks"
          >
            <ClipboardList />

            <span>
              Tasks
            </span>
          </NavLink>

          {/* USERS */}

          <NavLink
            to="/superadmin/users"
            title="Users"
          >
            <Users />

            <span>
              Users
            </span>
          </NavLink>

          {/* =================================================
              CALENDAR - NEW
          ================================================= */}

          <NavLink
            to="/superadmin/calendar"
            title="Calendar"
          >
            <CalendarDays />

            <span>
              Calendar
            </span>
          </NavLink>

          {/* =================================================
              ATTENDANCE - NEW
          ================================================= */}

          <NavLink
            to="/superadmin/attendance"
            title="Attendance"
          >
            <CalendarCheck />

            <span>
              Attendance
            </span>
          </NavLink>
        </nav>

        {/* =================================================
            SIDEBAR BOTTOM
        ================================================= */}

        <div className="sa-sidebar-bottom">
          {/* USER CARD */}

          <div className="sa-user-card">
            <div className="sa-user-avatar">
              {initials}
            </div>

            <div className="sa-user-info">
              <strong>
                {user?.full_name ||
                  "Superadmin"}
              </strong>

              <p>
                {user?.email || "-"}
              </p>

              <span>
                {user?.role_name ||
                  "superadmin"}
              </span>
            </div>
          </div>

          {/* LOGOUT */}

          <button
            type="button"
            className="sa-logout-btn"
            onClick={logout}
          >
            <LogOut size={18} />

            <span>
              Logout
            </span>
          </button>
        </div>
      </aside>

      {/* ===================================================
          MAIN PAGE AREA
      =================================================== */}

      <main className="sa-main">
        <Outlet />
      </main>
    </div>
  );
};

export default SuperadminLayout;