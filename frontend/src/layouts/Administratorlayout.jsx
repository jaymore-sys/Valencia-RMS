import { useState, useEffect, lazy, Suspense } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  FolderKanban,
  MessageCircle,
  LogOut,
  User, 
  Users,
  Building2,
  Menu,
} from "lucide-react";

import valenciaLogo from "../assets/VNL_logo.webp";
import "./Administratorlayout.css";

import { CHAT_UI_ENABLED } from "../config/chatRelease";

const ChatNotifications = lazy(() => import("../components/ChatNotifications"));

const getStoredUser = () => {
  try {
    return JSON.parse(
      sessionStorage.getItem("user") || localStorage.getItem("user") || "{}"
    );
  } catch {
    return {};
  }
};

const AdministratorLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Narrow screens (<= 900px): sidebar becomes a slide-out drawer.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(
    () => window.matchMedia("(max-width: 900px)").matches
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const onChange = (event) => setIsNarrow(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  // Close the drawer after navigating.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Copy each column header onto its cells (data-label) so tables can render as
  // labelled cards on phones (see administratorMobile.css). Attributes only.
  useEffect(() => {
    const main = document.querySelector(".admin-main");
    if (!main) return undefined;

    let frame = 0;

    const label = () => {
      frame = 0;

      main.querySelectorAll("table").forEach((table) => {
        const heads = [...table.querySelectorAll("thead th")].map((th) =>
          th.textContent.trim()
        );

        if (!heads.length) return;

        table.querySelectorAll("tbody tr").forEach((row) => {
          [...row.children].forEach((cell, index) => {
            if (cell.colSpan > 1 || !heads[index]) return;
            if (cell.dataset.label !== heads[index]) {
              cell.dataset.label = heads[index];
            }
          });
        });
      });
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(label);
    };

    label();

    const observer = new MutationObserver(schedule);
    observer.observe(main, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // The icon-only collapsed state is a desktop feature.
  const collapsed = sidebarCollapsed && !isNarrow;

  const user = getStoredUser();

  const logout = () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");

    localStorage.removeItem("token");
    localStorage.removeItem("user");

    navigate("/login", { replace: true });
  };


  const initials =
    user?.full_name
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "JM";


  return (
    <div
      className={`admin-dashboard-shell administrator-shell ${
        collapsed ? "sidebar-collapsed" : ""
      } ${mobileNavOpen ? "mobile-nav-open" : ""}`}
    >

      <button
        type="button"
        className="administrator-menu-btn"
        aria-label="Open menu"
        onClick={() => setMobileNavOpen(true)}
      >
        <Menu size={22} />
      </button>

      <div
        className="administrator-nav-backdrop"
        onClick={() => setMobileNavOpen(false)}
        aria-hidden="true"
      />

      <aside className="admin-sidebar">


        <button
          type="button"
          className="admin-sidebar-toggle"
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
            <ChevronRight size={22} />
          ) : (
            <ChevronLeft size={22} />
          )}

        </button>



        <div className="admin-brand">

          <img
            src={valenciaLogo}
            alt="Valencia Nutrition"
            className="admin-brand-logo-img"
          />

        </div>



        <nav className="admin-nav">


          <NavLink
            to="/administrator/overview"
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
            title="Overview"
          >

            <BarChart3 size={20} />

            <span>
              Overview
            </span>

          </NavLink>




          {CHAT_UI_ENABLED && (
          <NavLink
            to="/administrator/chat"
            className={({ isActive }) => isActive ? "active" : ""}
            title="Chat"
          >
            <MessageCircle size={20} />
            <span>Chat</span>
          </NavLink>
          )}

          <NavLink
            to="/administrator/projects"
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
            title="Projects"
          >

            <FolderKanban size={20} />

            <span>
              Projects
            </span>

          </NavLink>




          <NavLink
            to="/administrator/tasks"
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
            title="Tasks"
          >

            <ClipboardList size={20} />

            <span>
              Tasks
            </span>

          </NavLink>
          <NavLink 
  to="/administrator/vendors" 
  className={({ isActive }) => 
    isActive ? "active" : "" 
  } 
  title="Vendor Management" 
> 
  <Building2 size={20} /> 

  <span> 
    Vendor Management 
  </span> 
</NavLink>


          <NavLink
            to="/administrator/calendar"
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
            title="Calendar"
          >

            <CalendarDays size={20} />

            <span>
              Calendar
            </span>

          </NavLink>





          <NavLink
            to="/administrator/leave-applications"
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
            title="Leave Applications"
          >

            <CalendarDays size={20} />

            <span>
              Leave Applications
            </span>

          </NavLink>





          <NavLink
            to="/administrator/attendance"
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
            title="Attendance"
          >

            <CalendarCheck size={20} />

            <span>
              Attendance
            </span>

          </NavLink>





          <NavLink
            to="/administrator/reports"
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
            title="Reports"
          >

            <FileText size={20} />

            <span>
              Reports
            </span>

          </NavLink>





          <NavLink
            to="/administrator/profile"
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
            title="Profile"
          >

            <User size={20} />

            <span>
              Profile
            </span>

          </NavLink>





          <NavLink
            to="/administrator/users"
            className={({ isActive }) =>
              isActive ? "active" : ""
            }
            title="Users"
          >

            <Users size={20} />

            <span>
              Users
            </span>

          </NavLink>


        </nav>




        <div className="admin-sidebar-bottom">


          <div className="admin-user-card">


            <div className="admin-user-avatar">
              {initials}
            </div>



            <div className="admin-user-info">

              <strong>
                {user?.full_name || "Administrator"}
              </strong>

              <p>
                {user?.email || "-"}
              </p>

              <span>
                {user?.role_name || "administrator"}
              </span>

            </div>


          </div>





          <button
            type="button"
            className="admin-logout-btn"
            onClick={logout}
            title="Logout"
          >

            <LogOut size={18} />

            <span>
              Logout
            </span>


          </button>


        </div>


      </aside>




      <main className="admin-main">
  <Outlet />
</main>

{CHAT_UI_ENABLED && (
  <Suspense fallback={null}>
    <ChatNotifications role="administrator" />
  </Suspense>
)}


    </div>
  );
};


export default AdministratorLayout;