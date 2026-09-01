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


  {/* FIELD VISITS */}

  <Route
    path="field-visits"
    element={
      <SuperadminFieldVisits />
    }
  />


</Route>
export default App;