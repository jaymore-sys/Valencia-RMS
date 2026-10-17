import { useState, lazy, Suspense } from "react";
import MobileNavControls from "../components/MobileNavControls";
import {
  useMobileShell,
  useTableLabels,
  useHideDuplicateTitle,
} from "../hooks/useMobileShell";

import {
  NavLink,
  Outlet,
  useNavigate, useLocation } from "react-router-dom";

import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FolderKanban,
  MessageCircle,
  LogOut,
  Users,
  MapPin,
    ClipboardCheck,
  UserRound,
  Building2,
} from "lucide-react";

import vnlLogo from "../assets/VNL_logo.webp";

import "./Superadminlayout.css";



import { CHAT_UI_ENABLED } from "../config/chatRelease";

const ChatNotifications = lazy(() => import("../components/ChatNotifications"));

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

// Shown in the phone top bar (hidden on desktop, see mobileCommon.css).
const PAGE_TITLES = {
  overview: "Overview",
  projects: "Projects",
  tasks: "Tasks",
  users: "Users",
  calendar: "Calendar",
  attendance: "Attendance",
  "leave-applications": "Leave Applications",
  "field-visits": "Field Visits",
  profile: "Profile",
};

const SuperadminLayout = () => {
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname.split("/")[2]] || "";
  useHideDuplicateTitle(".sa-main", pageTitle);


  const navigate = useNavigate();

  const user = getUser();


  const [
    sidebarCollapsed,
    setSidebarCollapsed
  ] = useState(false);

  const { isNarrow, mobileNavOpen, setMobileNavOpen } = useMobileShell();
  const collapsed = sidebarCollapsed && !isNarrow;
  useTableLabels(".sa-main");




  /* =======================================================
     LOGOUT
  ======================================================= */


  const logout = () => {

    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");

    localStorage.removeItem("token");
    localStorage.removeItem("user");


    navigate(
      "/login",
      {
        replace:true
      }
    );

  };




  /* =======================================================
     INITIALS
  ======================================================= */


  const initials =

    user?.full_name

      ?.split(" ")

      .filter(Boolean)

      .map(
        part => part[0]
      )

      .join("")

      .slice(0,2)

      .toUpperCase()

      ||

      "SA";





  return (

    <div

      className={
        `sa-shell rms-mobile ${collapsed ? "sa-sidebar-collapsed" : ""} ${mobileNavOpen ? "mobile-nav-open" : ""}`
      }

    >



      {/* SIDEBAR */}

      <MobileNavControls
        onOpen={() => setMobileNavOpen(true)}
        onClose={() => setMobileNavOpen(false)}
      />

      <div className="rms-page-title">
        {pageTitle}
      </div>

      <aside className="sa-sidebar">


        {/* COLLAPSE BUTTON */}

        <button

          type="button"

          className="sa-sidebar-toggle"

          onClick={() =>
            setSidebarCollapsed(
              previous => !previous
            )
          }

        >

          {
            sidebarCollapsed

            ?

            <ChevronRight size={18}/>

            :

            <ChevronLeft size={18}/>

          }

        </button>




        {/* LOGO */}

        <div className="sa-logo-wrap">

          <img

            src={vnlLogo}

            alt="Valencia Nutrition"

            className="sa-logo-img"

          />

        </div>

     





        {/* NAVIGATION */}

        <nav className="sa-nav">


          <NavLink
            to="/superadmin/overview"
            title="Overview"
          >

            <BarChart3/>

            <span>
              Overview
            </span>

          </NavLink>




          {CHAT_UI_ENABLED && (
          <NavLink to="/superadmin/chat" title="Chat">
            <MessageCircle/>
            <span>Chat</span>
          </NavLink>
          )}

          <NavLink
            to="/superadmin/projects"
            title="Projects"
          >

            <FolderKanban/>

            <span>
              Projects
            </span>

          </NavLink>





          <NavLink
            to="/superadmin/tasks"
            title="Tasks"
          >

            <ClipboardList/>

            <span>
              Tasks
            </span>

          </NavLink>





          <NavLink
            to="/superadmin/users"
            title="Users"
          >

            <Users/>

            <span>
              Users
            </span>

          </NavLink>
{/*
          <NavLink
  to="/superadmin/vendors"
  title="Vendor Management"
>
  <Building2/>

  <span>
    Vendor Management
  </span>
</NavLink>

*/}



          <NavLink
            to="/superadmin/calendar"
            title="Calendar"
          >

            <CalendarDays/>

            <span>
              Calendar
            </span>

          </NavLink>





          <NavLink
            to="/superadmin/attendance"
            title="Attendance"
          >

            <CalendarCheck/>

            <span>
              Attendance
            </span>

          </NavLink>





          {/* FIELD VISITS */}

          <NavLink
            to="/superadmin/leave-applications"
            title="Leave Applications"
          >
            <ClipboardCheck/>
            <span>Leave Applications</span>
          </NavLink>


          <NavLink
            to="/superadmin/field-visits"
            title="Field Visits"
          >

            <MapPin/>

            <span>
              Field Visits
            </span>

          </NavLink>

          <NavLink
  to="/superadmin/profile"
  title="Profile"
>
  <UserRound />

  <span>
    Profile
  </span>
</NavLink>




        </nav>







        {/* BOTTOM */}

        <div className="sa-sidebar-bottom">


          <div className="sa-user-card">


            <div className="sa-user-avatar">

              {initials}

            </div>



            <div className="sa-user-info">


              <strong>

                {
                  user?.full_name ||
                  "Superadmin"
                }

              </strong>


              <p>

                {
                  user?.email ||
                  "-"
                }

              </p>


              <span>

                {
                  user?.role_name ||
                  "superadmin"
                }

              </span>


            </div>


          </div>






          <button

            type="button"

            className="sa-logout-btn"

            onClick={logout}

          >

            <LogOut size={18}/>


            <span>
              Logout
            </span>


          </button>



        </div>



      </aside>







      {/* MAIN CONTENT */}

      <main className="sa-main">

        <Outlet/>
        {CHAT_UI_ENABLED && (
          <Suspense fallback={null}>
            <ChatNotifications role="superadmin" />
          </Suspense>
        )}

      </main>



    </div>

  );

};



export default SuperadminLayout;