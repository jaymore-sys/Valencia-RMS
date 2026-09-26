import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  ClipboardList,
  Download,
  FolderKanban,
  LayoutDashboard,
  RefreshCw,
  Users,
} from "lucide-react";

import api from "../../api/axios";

/* =========================================================
   HELPERS
========================================================= */

const getCurrentIndiaMonth = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const values = {};

  parts.forEach((part) => {
    values[part.type] = part.value;
  });

  return `${values.year}-${values.month}`;
};

const formatDuration = (seconds) => {
  const total = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  return hours > 0
    ? `${hours}h ${minutes}m`
    : `${minutes}m`;
};

const formatMonth = (value) => {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return value || "-";
  }

  const [year, month] = value
    .split("-")
    .map(Number);

  return new Date(
    Date.UTC(year, month - 1, 1)
  ).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

const getDateKey = (value) => {
  if (!value) return "";

  const text = String(value);

  const match = text.match(
    /^(\d{4}-\d{2}-\d{2})/
  );

  if (match) {
    return match[1];
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
};

const formatDate = (value) => {
  const key = getDateKey(value);

  if (!key) return "-";

  const [year, month, day] = key
    .split("-")
    .map(Number);

  return new Date(
    Date.UTC(year, month - 1, day)
  ).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

const normalizeStatus = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");

const formatStatus = (value) => {
  const status = normalizeStatus(value);

  if (!status) return "-";

  return status
    .split("_")
    .filter(Boolean)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
};

const getDivisionName = (item) =>
  item?.division_name ||
  item?.division ||
  "Unassigned";

const getDivisionKey = (item) =>
  String(
    item?.division_id ??
      item?.division_name ??
      item?.division ??
      "unassigned"
  );

const isOngoing = (
  status,
  currentlyRunning = false
) => {
  if (currentlyRunning) return true;

  return [
    "in_progress",
    "ongoing",
  ].includes(normalizeStatus(status));
};

const csvEscape = (value) => {
  const text = String(value ?? "");

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n")
  ) {
    return `"${text.replaceAll(
      '"',
      '""'
    )}"`;
  }

  return text;
};

const downloadCsv = (
  filename,
  rows
) => {
  const csv = rows
    .map((row) =>
      row.map(csvEscape).join(",")
    )
    .join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url =
    window.URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.URL.revokeObjectURL(url);
};

/* =========================================================
   REPORT PAGE
========================================================= */

const AdminReports = () => {
  const currentMonth =
    getCurrentIndiaMonth();

  const [scope, setScope] =
    useState("department");

  const [view, setView] =
    useState("summary");

  const [periodType, setPeriodType] =
    useState("month");

  const [
    selectedMonth,
    setSelectedMonth,
  ] = useState(currentMonth);

  const [
    selectedDivision,
    setSelectedDivision,
  ] = useState("all");

  const [
    selectedEmployee,
    setSelectedEmployee,
  ] = useState("all");

  const [
    selectedStatus,
    setSelectedStatus,
  ] = useState("all");

  const [
    departmentUsers,
    setDepartmentUsers,
  ] = useState([]);

  const [
    departmentSummaries,
    setDepartmentSummaries,
  ] = useState([]);

  const [
    departmentMonths,
    setDepartmentMonths,
  ] = useState([currentMonth]);

  const [
    divisionReport,
    setDivisionReport,
  ] = useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  /* =======================================================
     MY EMPLOYEES
     Department access controls WHO the Admin can see.
     Once employee is visible, show ALL their Division work.
  ======================================================= */

  const fetchDepartmentReport =
    async () => {
      try {
        setLoading(true);
        setError("");

        const response =
          await api.get(
            "/admin/users"
          );

        const users =
          response?.data?.users || [];

        setDepartmentUsers(users);

        if (!users.length) {
          setDepartmentSummaries([]);
          setDepartmentMonths([
            currentMonth,
          ]);

          return;
        }

        const params =
          periodType === "all"
            ? {
                period: "all",
              }
            : {
                month:
                  selectedMonth,
              };

        const results =
          await Promise.all(
            users.map(
              async (user) => {
                const userId =
                  user.user_id ||
                  user.id;

                if (!userId) {
                  return null;
                }

                try {
                  const result =
                    await api.get(
                      `/admin/users/${userId}/time-summary`,
                      {
                        params,
                      }
                    );

                  return {
                    user,
                    summary:
                      result.data ||
                      {},
                  };
                } catch (
                  requestError
                ) {
                  console.error(
                    `Failed report for user ${userId}`,
                    requestError
                  );

                  return {
                    user,
                    summary: null,
                  };
                }
              }
            )
          );

        const validResults =
          results.filter(Boolean);

        setDepartmentSummaries(
          validResults
        );

        const monthSet =
          new Set([
            currentMonth,
          ]);

        validResults.forEach(
          ({ summary }) => {
            (
              summary?.available_months ||
              []
            ).forEach(
              (month) => {
                if (month) {
                  monthSet.add(
                    month
                  );
                }
              }
            );
          }
        );

        setDepartmentMonths(
          Array.from(monthSet).sort(
            (a, b) =>
              String(
                b
              ).localeCompare(
                String(a)
              )
          )
        );
      } catch (
        requestError
      ) {
        console.error(
          "Department report error:",
          requestError
        );

        setError(
          requestError?.response
            ?.data?.message ||
            requestError?.response
              ?.data?.error ||
            "Failed to load employee report."
        );
      } finally {
        setLoading(false);
      }
    };

  /* =======================================================
     MY DIVISIONS
     ONLY admin_divisions controls access.
  ======================================================= */

  const fetchDivisionReport =
    async () => {
      try {
        setLoading(true);
        setError("");

        // Critical:
        // remove old VNL/POS/etc data
        // before loading new Division access.
        setDivisionReport(null);

        const params =
          periodType === "all"
            ? {
                period: "all",
              }
            : {
                month:
                  selectedMonth,
              };

        if (
          selectedDivision !==
          "all"
        ) {
          params.division_id =
            Number(
              selectedDivision
            );
        }

        const response =
          await api.get(
            "/admin/division-report",
            {
              params,
            }
          );

        setDivisionReport(
          response.data || null
        );
      } catch (
        requestError
      ) {
        console.error(
          "Division report error:",
          requestError
        );

        setDivisionReport(null);

        /*
          If Administrator changed:
          VNL -> ADV
          while Reports still held old VNL selection,
          reset automatically.
        */
        if (
          requestError?.response
            ?.status === 403 &&
          selectedDivision !==
            "all"
        ) {
          setSelectedDivision(
            "all"
          );

          return;
        }

        setError(
          requestError?.response
            ?.data?.message ||
            requestError?.response
              ?.data?.error ||
            "Failed to load Division report."
        );
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    if (
      scope !== "department"
    ) {
      return;
    }

    fetchDepartmentReport();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scope,
    periodType,
    selectedMonth,
  ]);

  useEffect(() => {
    if (
      scope !== "division"
    ) {
      return;
    }

    fetchDivisionReport();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scope,
    periodType,
    selectedMonth,
    selectedDivision,
  ]);

  /* =======================================================
     DEPARTMENT MAIN TASK DATA
  ======================================================= */

  const departmentMainRows =
    useMemo(() => {
      const rows = [];

      departmentSummaries.forEach(
        ({
          user,
          summary,
        }) => {
          if (!summary) return;

          const employee =
            summary.employee ||
            user ||
            {};

          (
            summary.projects ||
            []
          ).forEach(
            (project) => {
              (
                project.tasks ||
                []
              ).forEach(
                (task) => {
                  (
                    task.sessions ||
                    []
                  ).forEach(
                    (session) => {
                      rows.push({
                        employee_id:
                          employee.user_id ||
                          user.user_id ||
                          user.id,

                        employee_code:
                          employee.employee_code ||
                          user.employee_code ||
                          "",

                        employee_name:
                          employee.full_name ||
                          user.full_name ||
                          "-",

                        department_name:
                          user.department_names ||
                          employee.department_name ||
                          user.department_name ||
                          "-",

                        division_id:
                          project.division_id ??
                          null,

                        division:
                          project.division ||
                          "Unassigned",

                        project_id:
                          project.project_id ??
                          null,

                        project_title:
                          project.project_title ||
                          "No Project",

                        task_id:
                          task.task_id,

                        task_title:
                          task.task_title ||
                          "Untitled Task",

                        task_status:
                          task.status ||
                          "",

                        currently_running:
                          Boolean(
                            session.currently_running ||
                              task.currently_running ||
                              !session.ended_at
                          ),

                        session_id:
                          session.session_id,

                        started_at:
                          session.started_at,

                        ended_at:
                          session.ended_at,

                        total_seconds:
                          Number(
                            session.seconds_worked ||
                              0
                          ),
                      });
                    }
                  );
                }
              );
            }
          );
        }
      );

      return rows;
    }, [
      departmentSummaries,
    ]);

  /* =======================================================
     DEPARTMENT MINI TASK DATA
     Backend already returns reviewed official Mini Tasks.
  ======================================================= */

  const departmentMiniRows =
    useMemo(() => {
      const rows = [];

      departmentSummaries.forEach(
        ({
          user,
          summary,
        }) => {
          if (!summary) return;

          const employee =
            summary.employee ||
            user ||
            {};

          (
            summary.mini_tasks ||
            []
          ).forEach((task) => {
            rows.push({
              employee_id:
                employee.user_id ||
                user.user_id ||
                user.id,

              employee_code:
                employee.employee_code ||
                user.employee_code ||
                "",

              employee_name:
                employee.full_name ||
                user.full_name ||
                "-",

              department_name:
                user.department_names ||
                employee.department_name ||
                user.department_name ||
                "-",

              mini_task_id:
                task.mini_task_id,

              mini_task_title:
                task.mini_task_title ||
                "Mini Task",

              division_id:
                task.division_id ??
                null,

              division:
                task.division ||
                "Unassigned",

              start_date:
                task.start_date,

              end_date:
                task.end_date,

              start_time:
                task.start_time,

              end_time:
                task.end_time,

              status:
                task.status,

              total_seconds:
                Number(
                  task.total_seconds ||
                    0
                ),
            });
          });
        }
      );

      return rows;
    }, [
      departmentSummaries,
    ]);

  /* =======================================================
     DIVISION OPTIONS FOR MY EMPLOYEES
     These are Divisions where employees actually worked.
  ======================================================= */

  const employeeDivisionOptions =
    useMemo(() => {
      const map =
        new Map();

      [
        ...departmentMainRows,
        ...departmentMiniRows,
      ].forEach((row) => {
        const key =
          getDivisionKey(
            row
          );

        if (!map.has(key)) {
          map.set(key, {
            id: key,
            name:
              getDivisionName(
                row
              ),
          });
        }
      });

      return Array.from(
        map.values()
      ).sort((a, b) =>
        a.name.localeCompare(
          b.name
        )
      );
    }, [
      departmentMainRows,
      departmentMiniRows,
    ]);

  /* =======================================================
     ASSIGNED DIVISIONS
     This comes ONLY from admin_divisions via backend.
  ======================================================= */

  const assignedDivisionOptions =
    useMemo(
      () =>
        divisionReport
          ?.assigned_divisions ||
        [],
      [divisionReport]
    );

  /*
    Defensive frontend permission layer.

    Backend is already authoritative,
    but frontend also refuses to display
    work from any other Division.
  */
  const allowedDivisionIds =
    useMemo(
      () =>
        new Set(
          (
            divisionReport
              ?.selected_division_ids ||
            []
          ).map(Number)
        ),
      [divisionReport]
    );

  /* =======================================================
     ACTIVE MAIN TASK DATA
  ======================================================= */

  const mainRows =
    useMemo(() => {
      if (
        scope ===
        "department"
      ) {
        return departmentMainRows;
      }

      return (
        divisionReport
          ?.main_sessions ||
        []
      )
        .filter((row) =>
          allowedDivisionIds.has(
            Number(
              row.division_id
            )
          )
        )
        .map((row) => ({
          ...row,

          currently_running:
            !row.ended_at,

          total_seconds:
            Number(
              row.total_seconds ||
                0
            ),
        }));
    }, [
      scope,
      departmentMainRows,
      divisionReport,
      allowedDivisionIds,
    ]);

  /* =======================================================
     ACTIVE MINI TASK DATA
  ======================================================= */

  const miniRows =
    useMemo(() => {
      if (
        scope ===
        "department"
      ) {
        return departmentMiniRows;
      }

      return (
        divisionReport
          ?.mini_tasks ||
        []
      )
        .filter((row) =>
          allowedDivisionIds.has(
            Number(
              row.division_id
            )
          )
        )
        .map((row) => ({
          ...row,

          total_seconds:
            Number(
              row.total_seconds ||
                0
            ),
        }));
    }, [
      scope,
      departmentMiniRows,
      divisionReport,
      allowedDivisionIds,
    ]);

  /* =======================================================
     EMPLOYEE / CONTRIBUTOR OPTIONS
  ======================================================= */

  const employeeOptions =
    useMemo(() => {
      const map =
        new Map();

      if (
        scope ===
        "department"
      ) {
        departmentUsers.forEach(
          (user) => {
            const id =
              String(
                user.user_id ||
                  user.id ||
                  ""
              );

            if (
              !id ||
              map.has(id)
            ) {
              return;
            }

            map.set(id, {
              id,

              name:
                user.full_name ||
                user.name ||
                "-",

              code:
                user.employee_code ||
                "",
            });
          }
        );
      } else {
        [
          ...mainRows,
          ...miniRows,
        ].forEach((row) => {
          const id =
            String(
              row.employee_id ||
                ""
            );

          if (
            !id ||
            map.has(id)
          ) {
            return;
          }

          map.set(id, {
            id,

            name:
              row.employee_name ||
              "-",

            code:
              row.employee_code ||
              "",
          });
        });
      }

      return Array.from(
        map.values()
      ).sort((a, b) =>
        a.name.localeCompare(
          b.name
        )
      );
    }, [
      scope,
      departmentUsers,
      mainRows,
      miniRows,
    ]);

  /* =======================================================
     FILTERS
  ======================================================= */

  const filteredMainRows =
    useMemo(
      () =>
        mainRows.filter(
          (row) => {
            const employeeMatch =
              selectedEmployee ===
                "all" ||
              String(
                row.employee_id
              ) ===
                String(
                  selectedEmployee
                );

            const divisionMatch =
              selectedDivision ===
                "all" ||
              getDivisionKey(
                row
              ) ===
                String(
                  selectedDivision
                );

            return (
              employeeMatch &&
              divisionMatch
            );
          }
        ),
      [
        mainRows,
        selectedEmployee,
        selectedDivision,
      ]
    );

  const filteredMiniRows =
    useMemo(
      () =>
        miniRows.filter(
          (row) => {
            const employeeMatch =
              selectedEmployee ===
                "all" ||
              String(
                row.employee_id
              ) ===
                String(
                  selectedEmployee
                );

            const divisionMatch =
              selectedDivision ===
                "all" ||
              getDivisionKey(
                row
              ) ===
                String(
                  selectedDivision
                );

            return (
              employeeMatch &&
              divisionMatch
            );
          }
        ),
      [
        miniRows,
        selectedEmployee,
        selectedDivision,
      ]
    );

  /* =======================================================
     TOTALS
  ======================================================= */

  const totals =
    useMemo(() => {
      const main =
        filteredMainRows.reduce(
          (sum, row) =>
            sum +
            Number(
              row.total_seconds ||
                0
            ),
          0
        );

      const mini =
        filteredMiniRows.reduce(
          (sum, row) =>
            sum +
            Number(
              row.total_seconds ||
                0
            ),
          0
        );

      const contributors =
        new Set();

      [
        ...filteredMainRows,
        ...filteredMiniRows,
      ].forEach((row) => {
        if (
          Number(
            row.total_seconds ||
              0
          ) > 0 &&
          row.employee_id
        ) {
          contributors.add(
            String(
              row.employee_id
            )
          );
        }
      });

      return {
        main,
        mini,
        total:
          main + mini,
        contributors:
          contributors.size,
      };
    }, [
      filteredMainRows,
      filteredMiniRows,
    ]);

  /* =======================================================
     EMPLOYEE / CONTRIBUTOR SUMMARY
  ======================================================= */

  const employeeSummaryRows =
    useMemo(() => {
      const map =
        new Map();

      /*
        My Employees:
        always start with every employee
        in Admin's managed Departments.

        This keeps 0m employees visible.
      */
      if (
        scope ===
        "department"
      ) {
        departmentUsers.forEach(
          (user) => {
            const id =
              String(
                user.user_id ||
                  user.id ||
                  ""
              );

            if (
              !id ||
              map.has(id)
            ) {
              return;
            }

            if (
              selectedEmployee !==
                "all" &&
              id !==
                String(
                  selectedEmployee
                )
            ) {
              return;
            }

            map.set(id, {
              employee_id:
                user.user_id ||
                user.id,

              employee_code:
                user.employee_code ||
                "",

              employee_name:
                user.full_name ||
                user.name ||
                "-",

              department_name:
                user.department_names ||
                user.department_name ||
                "-",

              main_seconds: 0,

              mini_seconds: 0,

              total_seconds: 0,

              divisions:
                new Map(),
            });
          }
        );
      }

      const ensureEmployee =
        (row) => {
          const key =
            String(
              row.employee_id ||
                row.employee_code ||
                row.employee_name
            );

          if (
            !map.has(key)
          ) {
            map.set(key, {
              employee_id:
                row.employee_id,

              employee_code:
                row.employee_code ||
                "",

              employee_name:
                row.employee_name ||
                "-",

              department_name:
                row.department_name ||
                "-",

              main_seconds: 0,

              mini_seconds: 0,

              total_seconds: 0,

              divisions:
                new Map(),
            });
          }

          return map.get(
            key
          );
        };

      const addDivision = (
        employee,
        row,
        seconds
      ) => {
        const key =
          getDivisionKey(
            row
          );

        const division =
          employee.divisions.get(
            key
          ) || {
            name:
              getDivisionName(
                row
              ),

            main_seconds: 0,

            mini_seconds: 0,

            total_seconds: 0,
          };

        division.total_seconds +=
          seconds;

        employee.divisions.set(
          key,
          division
        );

        return division;
      };

      filteredMainRows.forEach(
        (row) => {
          const employee =
            ensureEmployee(
              row
            );

          const seconds =
            Number(
              row.total_seconds ||
                0
            );

          employee.main_seconds +=
            seconds;

          employee.total_seconds +=
            seconds;

          const division =
            addDivision(
              employee,
              row,
              seconds
            );

          division.main_seconds +=
            seconds;
        }
      );

      filteredMiniRows.forEach(
        (row) => {
          const employee =
            ensureEmployee(
              row
            );

          const seconds =
            Number(
              row.total_seconds ||
                0
            );

          employee.mini_seconds +=
            seconds;

          employee.total_seconds +=
            seconds;

          const division =
            addDivision(
              employee,
              row,
              seconds
            );

          division.mini_seconds +=
            seconds;
        }
      );

      return Array.from(
        map.values()
      )
        .map(
          (employee) => ({
            ...employee,

            divisions:
              Array.from(
                employee.divisions.values()
              ),
          })
        )
        .sort(
          (a, b) =>
            b.total_seconds -
            a.total_seconds
        );
    }, [
      scope,
      departmentUsers,
      selectedEmployee,
      filteredMainRows,
      filteredMiniRows,
    ]);

  /* =======================================================
     DIVISION SUMMARY
  ======================================================= */

  const divisionSummaryRows =
    useMemo(() => {
      const map =
        new Map();

      /*
        My Divisions should show assigned
        Division even when its total is 0.
      */
      if (
        scope ===
        "division"
      ) {
        const divisions =
          selectedDivision ===
          "all"
            ? assignedDivisionOptions
            : assignedDivisionOptions.filter(
                (division) =>
                  String(
                    division.division_id
                  ) ===
                  String(
                    selectedDivision
                  )
              );

        divisions.forEach(
          (division) => {
            const key =
              String(
                division.division_id
              );

            map.set(key, {
              division:
                division.division_name,

              main_seconds: 0,

              mini_seconds: 0,

              total_seconds: 0,

              contributors:
                new Set(),
            });
          }
        );
      }

      const ensureDivision =
        (row) => {
          const key =
            getDivisionKey(
              row
            );

          if (
            !map.has(key)
          ) {
            map.set(key, {
              division:
                getDivisionName(
                  row
                ),

              main_seconds: 0,

              mini_seconds: 0,

              total_seconds: 0,

              contributors:
                new Set(),
            });
          }

          return map.get(
            key
          );
        };

      filteredMainRows.forEach(
        (row) => {
          const division =
            ensureDivision(
              row
            );

          const seconds =
            Number(
              row.total_seconds ||
                0
            );

          division.main_seconds +=
            seconds;

          division.total_seconds +=
            seconds;

          if (
            row.employee_id
          ) {
            division.contributors.add(
              String(
                row.employee_id
              )
            );
          }
        }
      );

      filteredMiniRows.forEach(
        (row) => {
          const division =
            ensureDivision(
              row
            );

          const seconds =
            Number(
              row.total_seconds ||
                0
            );

          division.mini_seconds +=
            seconds;

          division.total_seconds +=
            seconds;

          if (
            row.employee_id
          ) {
            division.contributors.add(
              String(
                row.employee_id
              )
            );
          }
        }
      );

      return Array.from(
        map.values()
      )
        .map(
          (division) => ({
            ...division,

            contributor_count:
              division.contributors.size,
          })
        )
        .sort(
          (a, b) =>
            b.total_seconds -
            a.total_seconds
        );
    }, [
      scope,
      selectedDivision,
      assignedDivisionOptions,
      filteredMainRows,
      filteredMiniRows,
    ]);

  /* =======================================================
     DATE-WISE
  ======================================================= */

  const dateRows =
    useMemo(() => {
      const rows = [];

      filteredMainRows.forEach(
        (row) => {
          rows.push({
            id:
              `main-${row.session_id}`,

            date:
              getDateKey(
                row.started_at
              ),

            employee_name:
              row.employee_name,

            employee_code:
              row.employee_code,

            department_name:
              row.department_name,

            work_type:
              "Main Task",

            work_name:
              row.task_title,

            project:
              row.project_title,

            division:
              getDivisionName(
                row
              ),

            status:
              row.task_status,

            ongoing:
              isOngoing(
                row.task_status,
                row.currently_running
              ),

            seconds:
              Number(
                row.total_seconds ||
                  0
              ),
          });
        }
      );

      filteredMiniRows.forEach(
        (row) => {
          rows.push({
            id:
              `mini-${row.mini_task_id}-${row.employee_id}`,

            date:
              getDateKey(
                row.start_date
              ),

            employee_name:
              row.employee_name,

            employee_code:
              row.employee_code,

            department_name:
              row.department_name,

            work_type:
              "Mini Task",

            work_name:
              row.mini_task_title,

            project: "-",

            division:
              getDivisionName(
                row
              ),

            status:
              row.status,

            ongoing: false,

            seconds:
              Number(
                row.total_seconds ||
                  0
              ),
          });
        }
      );

      return rows.sort(
        (a, b) =>
          String(
            b.date
          ).localeCompare(
            String(a.date)
          )
      );
    }, [
      filteredMainRows,
      filteredMiniRows,
    ]);

  /* =======================================================
     PROJECT-WISE
  ======================================================= */

  const projectRows =
    useMemo(() => {
      const map =
        new Map();

      filteredMainRows.forEach(
        (row) => {
          const key =
            String(
              row.project_id ??
                row.project_title
            );

          if (
            !map.has(key)
          ) {
            map.set(key, {
              project_id:
                row.project_id,

              project_title:
                row.project_title ||
                "No Project",

              division:
                getDivisionName(
                  row
                ),

              total_seconds: 0,

              contributors:
                new Map(),

              tasks:
                new Map(),

              ongoing: false,
            });
          }

          const project =
            map.get(key);

          project.total_seconds +=
            Number(
              row.total_seconds ||
                0
            );

          project.contributors.set(
            String(
              row.employee_id
            ),
            row.employee_name ||
              "-"
          );

          if (
            !project.tasks.has(
              String(
                row.task_id
              )
            )
          ) {
            project.tasks.set(
              String(
                row.task_id
              ),
              {
                status:
                  row.task_status,
              }
            );
          }

          if (
            isOngoing(
              row.task_status,
              row.currently_running
            )
          ) {
            project.ongoing =
              true;
          }
        }
      );

      let rows =
        Array.from(
          map.values()
        ).map((project) => ({
          ...project,

          contributor_names:
            Array.from(
              project.contributors.values()
            ),

          task_count:
            project.tasks.size,

          task_statuses:
            Array.from(
              project.tasks.values()
            ).map(
              (task) =>
                task.status
            ),
        }));

      if (
        selectedStatus !==
        "all"
      ) {
        rows =
          rows.filter(
            (project) => {
              if (
                selectedStatus ===
                "ongoing"
              ) {
                return project.ongoing;
              }

              return project.task_statuses.some(
                (status) =>
                  normalizeStatus(
                    status
                  ) ===
                  selectedStatus
              );
            }
          );
      }

      return rows.sort(
        (a, b) =>
          b.total_seconds -
          a.total_seconds
      );
    }, [
      filteredMainRows,
      selectedStatus,
    ]);

  /* =======================================================
     MAIN TASK-WISE
  ======================================================= */

  const mainTaskRows =
    useMemo(() => {
      const map =
        new Map();

      filteredMainRows.forEach(
        (row) => {
          const key =
            `${row.project_id}-${row.task_id}`;

          if (
            !map.has(key)
          ) {
            map.set(key, {
              task_id:
                row.task_id,

              task_title:
                row.task_title ||
                "Untitled Task",

              project_title:
                row.project_title ||
                "No Project",

              division:
                getDivisionName(
                  row
                ),

              status:
                row.task_status ||
                "",

              ongoing: false,

              total_seconds: 0,

              sessions: 0,

              contributors:
                new Map(),
            });
          }

          const task =
            map.get(key);

          task.total_seconds +=
            Number(
              row.total_seconds ||
                0
            );

          task.sessions += 1;

          task.contributors.set(
            String(
              row.employee_id
            ),
            row.employee_name ||
              "-"
          );

          if (
            isOngoing(
              row.task_status,
              row.currently_running
            )
          ) {
            task.ongoing =
              true;
          }
        }
      );

      let rows =
        Array.from(
          map.values()
        ).map((task) => ({
          ...task,

          contributor_names:
            Array.from(
              task.contributors.values()
            ),
        }));

      if (
        selectedStatus !==
        "all"
      ) {
        rows =
          rows.filter(
            (task) => {
              if (
                selectedStatus ===
                "ongoing"
              ) {
                return task.ongoing;
              }

              return (
                normalizeStatus(
                  task.status
                ) ===
                selectedStatus
              );
            }
          );
      }

      return rows.sort(
        (a, b) =>
          b.total_seconds -
          a.total_seconds
      );
    }, [
      filteredMainRows,
      selectedStatus,
    ]);

  /* =======================================================
     FILTER OPTIONS
  ======================================================= */

  const availableMonths =
    scope === "department"
      ? departmentMonths
      : divisionReport
          ?.available_months ||
        [currentMonth];

  const visibleDivisionOptions =
    scope === "department"
      ? employeeDivisionOptions
      : assignedDivisionOptions.map(
          (division) => ({
            id:
              String(
                division.division_id
              ),

            name:
              division.division_name,
          })
        );

  /* =======================================================
     SCOPE SWITCH
  ======================================================= */

  const changeScope = (
    nextScope
  ) => {
    setScope(nextScope);

    setSelectedDivision(
      "all"
    );

    setSelectedEmployee(
      "all"
    );

    setSelectedStatus(
      "all"
    );

    if (
      nextScope ===
      "division"
    ) {
      setDivisionReport(
        null
      );
    }
  };

  /* =======================================================
     EXPORT
  ======================================================= */

  const exportReport = () => {
    const periodLabel =
      periodType === "all"
        ? "all-time"
        : selectedMonth;

    if (
      view === "summary"
    ) {
      downloadCsv(
        `admin-summary-${periodLabel}.csv`,
        [
          [
            "Employee Code",
            "Employee",
            "Department",
            "Main Task Time",
            "Reviewed Mini Task Time",
            "Official Total Time",
            "Division Breakdown",
          ],

          ...employeeSummaryRows.map(
            (row) => [
              row.employee_code,
              row.employee_name,
              row.department_name,

              formatDuration(
                row.main_seconds
              ),

              formatDuration(
                row.mini_seconds
              ),

              formatDuration(
                row.total_seconds
              ),

              row.divisions
                .map(
                  (division) =>
                    `${division.name} - ${formatDuration(
                      division.total_seconds
                    )}`
                )
                .join(" | "),
            ]
          ),
        ]
      );

      return;
    }

    if (
      view === "date"
    ) {
      downloadCsv(
        `admin-date-wise-${periodLabel}.csv`,
        [
          [
            "Date",
            "Employee",
            "Employee Code",
            "Department",
            "Type",
            "Project",
            "Task",
            "Division",
            "Status",
            "Official Time",
          ],

          ...dateRows.map(
            (row) => [
              row.date,
              row.employee_name,
              row.employee_code,
              row.department_name,
              row.work_type,
              row.project,
              row.work_name,
              row.division,

              row.ongoing
                ? "Ongoing"
                : formatStatus(
                    row.status
                  ),

              formatDuration(
                row.seconds
              ),
            ]
          ),
        ]
      );

      return;
    }

    if (
      view === "project"
    ) {
      downloadCsv(
        `admin-project-wise-${periodLabel}.csv`,
        [
          [
            "Project",
            "Division",
            "Contributors",
            "Main Tasks",
            "Ongoing",
            "Official Main Task Time",
          ],

          ...projectRows.map(
            (row) => [
              row.project_title,
              row.division,

              row.contributor_names.join(
                " | "
              ),

              row.task_count,

              row.ongoing
                ? "Yes"
                : "No",

              formatDuration(
                row.total_seconds
              ),
            ]
          ),
        ]
      );

      return;
    }

    downloadCsv(
      `admin-main-task-wise-${periodLabel}.csv`,
      [
        [
          "Main Task",
          "Project",
          "Division",
          "Contributors",
          "Status",
          "Sessions",
          "Official Time",
        ],

        ...mainTaskRows.map(
          (row) => [
            row.task_title,
            row.project_title,
            row.division,

            row.contributor_names.join(
              " | "
            ),

            row.ongoing
              ? "Ongoing"
              : formatStatus(
                  row.status
                ),

            row.sessions,

            formatDuration(
              row.total_seconds
            ),
          ]
        ),
      ]
    );
  };

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div style={styles.page}>
      <div
        style={styles.header}
      >
        <div>
          <h1
            style={
              styles.title
            }
          >
            Reports
          </h1>

          <p
            style={
              styles.subtitle
            }
          >
            Official Main Task
            and reviewed Mini
            Task work reports.
          </p>
        </div>

        <div
          style={
            styles.headerActions
          }
        >
          <button
            type="button"
            style={
              styles.secondaryButton
            }
            onClick={
              scope ===
              "department"
                ? fetchDepartmentReport
                : fetchDivisionReport
            }
            disabled={loading}
          >
            <RefreshCw
              size={16}
            />

            Refresh
          </button>

          <button
            type="button"
            style={
              styles.primaryButton
            }
            onClick={
              exportReport
            }
            disabled={loading}
          >
            <Download
              size={16}
            />

            Export
          </button>
        </div>
      </div>

      <div
        style={
          styles.scopeSwitch
        }
      >
        <button
          type="button"
          onClick={() =>
            changeScope(
              "department"
            )
          }
          style={{
            ...styles.scopeButton,

            ...(scope ===
            "department"
              ? styles.scopeButtonActive
              : {}),
          }}
        >
          <Users
            size={17}
          />

          My Employees
        </button>

        <button
          type="button"
          onClick={() =>
            changeScope(
              "division"
            )
          }
          style={{
            ...styles.scopeButton,

            ...(scope ===
            "division"
              ? styles.scopeButtonActive
              : {}),
          }}
        >
          <Building2
            size={17}
          />

          My Divisions
        </button>
      </div>

      <div
        style={styles.filters}
      >
        <Filter label="Period">
          <select
            value={
              periodType
            }
            onChange={(
              event
            ) =>
              setPeriodType(
                event.target
                  .value
              )
            }
            style={
              styles.select
            }
          >
            <option value="month">
              Month
            </option>

            <option value="all">
              All Time
            </option>
          </select>
        </Filter>

        {periodType ===
          "month" && (
          <Filter label="Month">
            <select
              value={
                selectedMonth
              }
              onChange={(
                event
              ) =>
                setSelectedMonth(
                  event.target
                    .value
                )
              }
              style={
                styles.select
              }
            >
              {availableMonths.map(
                (month) => (
                  <option
                    key={
                      month
                    }
                    value={
                      month
                    }
                  >
                    {formatMonth(
                      month
                    )}
                  </option>
                )
              )}
            </select>
          </Filter>
        )}

        <Filter label="Division">
          <select
            value={
              selectedDivision
            }
            onChange={(
              event
            ) =>
              setSelectedDivision(
                event.target
                  .value
              )
            }
            style={
              styles.select
            }
            disabled={
              scope ===
                "division" &&
              assignedDivisionOptions.length ===
                0
            }
          >
            {scope ===
              "division" &&
            assignedDivisionOptions.length ===
              0 ? (
              <option value="all">
                No Divisions
                Assigned
              </option>
            ) : (
              <>
                <option value="all">
                  {scope ===
                  "department"
                    ? "All Divisions"
                    : "All My Divisions"}
                </option>

                {visibleDivisionOptions.map(
                  (
                    division
                  ) => (
                    <option
                      key={
                        division.id
                      }
                      value={
                        division.id
                      }
                    >
                      {
                        division.name
                      }
                    </option>
                  )
                )}
              </>
            )}
          </select>
        </Filter>

        <Filter
          label={
            scope ===
            "department"
              ? "Employee"
              : "Contributor"
          }
        >
          <select
            value={
              selectedEmployee
            }
            onChange={(
              event
            ) =>
              setSelectedEmployee(
                event.target
                  .value
              )
            }
            style={
              styles.select
            }
          >
            <option value="all">
              {scope ===
              "department"
                ? "All Employees"
                : "All Contributors"}
            </option>

            {employeeOptions.map(
              (employee) => (
                <option
                  key={
                    employee.id
                  }
                  value={
                    employee.id
                  }
                >
                  {
                    employee.name
                  }

                  {employee.code
                    ? ` (${employee.code})`
                    : ""}
                </option>
              )
            )}
          </select>
        </Filter>

        {(view ===
          "project" ||
          view ===
            "mainTask") && (
          <Filter label="Status">
            <select
              value={
                selectedStatus
              }
              onChange={(
                event
              ) =>
                setSelectedStatus(
                  event.target
                    .value
                )
              }
              style={
                styles.select
              }
            >
              <option value="all">
                All
              </option>

              <option value="ongoing">
                Ongoing
              </option>

              <option value="to_do">
                To Do
              </option>

              <option value="in_progress">
                In Progress
              </option>

              <option value="under_review">
                Under Review
              </option>

              <option value="done">
                Done
              </option>

              <option value="on_hold">
                On Hold
              </option>

              <option value="rejected">
                Rejected
              </option>
            </select>
          </Filter>
        )}
      </div>

      <div
        style={
          styles.viewTabs
        }
      >
        <Tab
          active={
            view ===
            "summary"
          }
          icon={
            <LayoutDashboard
              size={16}
            />
          }
          label="Summary"
          onClick={() => {
            setView(
              "summary"
            );

            setSelectedStatus(
              "all"
            );
          }}
        />

        <Tab
          active={
            view === "date"
          }
          icon={
            <CalendarDays
              size={16}
            />
          }
          label="Date-wise"
          onClick={() => {
            setView("date");

            setSelectedStatus(
              "all"
            );
          }}
        />

        <Tab
          active={
            view ===
            "project"
          }
          icon={
            <FolderKanban
              size={16}
            />
          }
          label="Project-wise"
          onClick={() =>
            setView(
              "project"
            )
          }
        />

        <Tab
          active={
            view ===
            "mainTask"
          }
          icon={
            <ClipboardList
              size={16}
            />
          }
          label="Main Task-wise"
          onClick={() =>
            setView(
              "mainTask"
            )
          }
        />
      </div>

      {error && (
        <div
          style={
            styles.error
          }
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          style={
            styles.loading
          }
        >
          Loading report...
        </div>
      ) : (
        <>
          <div
            style={
              styles.stats
            }
          >
            <StatCard
              label={
                scope ===
                "department"
                  ? "Employees"
                  : "Contributors"
              }
              value={
                scope ===
                "department"
                  ? selectedEmployee ===
                    "all"
                    ? departmentUsers.length
                    : employeeSummaryRows.length
                  : totals.contributors
              }
            />

            <StatCard
              label="Main Task Time"
              value={formatDuration(
                totals.main
              )}
            />

            <StatCard
              label="Reviewed Mini Task"
              value={formatDuration(
                totals.mini
              )}
            />

            <StatCard
              label="Official Total"
              value={formatDuration(
                totals.total
              )}
              strong
            />
          </div>

          {view ===
            "summary" && (
            <SummaryView
              scope={
                scope
              }
              employeeRows={
                employeeSummaryRows
              }
              divisionRows={
                divisionSummaryRows
              }
            />
          )}

          {view ===
            "date" && (
            <DateView
              rows={
                dateRows
              }
            />
          )}

          {view ===
            "project" && (
            <ProjectView
              rows={
                projectRows
              }
            />
          )}

          {view ===
            "mainTask" && (
            <MainTaskView
              rows={
                mainTaskRows
              }
            />
          )}
        </>
      )}
    </div>
  );
};

/* =========================================================
   SUMMARY
========================================================= */

const SummaryView = ({
  scope,
  employeeRows,
  divisionRows,
}) => (
  <>
    <Card
      title={
        scope ===
        "department"
          ? "Employee Summary"
          : "Contributor Summary"
      }
      subtitle={
        scope ===
        "department"
          ? "Where your Department employees spent their official time."
          : "Who contributed official time to your assigned Divisions."
      }
    >
      <Table>
        <thead>
          <tr>
            <Th>
              {scope ===
              "department"
                ? "Employee"
                : "Contributor"}
            </Th>

            <Th>
              Department
            </Th>

            <Th>Main</Th>

            <Th>Mini</Th>

            <Th>Total</Th>

            <Th>
              Division-wise
            </Th>
          </tr>
        </thead>

        <tbody>
          {employeeRows.length ? (
            employeeRows.map(
              (row) => (
                <tr
                  key={
                    row.employee_id ||
                    row.employee_code
                  }
                >
                  <Td>
                    <strong>
                      {
                        row.employee_name
                      }
                    </strong>

                    <Small>
                      {row.employee_code ||
                        "-"}
                    </Small>
                  </Td>

                  <Td>
                    {
                      row.department_name
                    }
                  </Td>

                  <Td>
                    {formatDuration(
                      row.main_seconds
                    )}
                  </Td>

                  <Td>
                    {formatDuration(
                      row.mini_seconds
                    )}
                  </Td>

                  <Td strong>
                    {formatDuration(
                      row.total_seconds
                    )}
                  </Td>

                  <Td>
                    <div
                      style={
                        styles.chips
                      }
                    >
                      {row.divisions
                        .length ? (
                        row.divisions.map(
                          (
                            division,
                            index
                          ) => (
                            <span
                              key={`${division.name}-${index}`}
                              style={
                                styles.chip
                              }
                            >
                              {
                                division.name
                              }{" "}
                              ·{" "}
                              {formatDuration(
                                division.total_seconds
                              )}
                            </span>
                          )
                        )
                      ) : (
                        <span
                          style={
                            styles.muted
                          }
                        >
                          -
                        </span>
                      )}
                    </div>
                  </Td>
                </tr>
              )
            )
          ) : (
            <EmptyRow
              columns={6}
            />
          )}
        </tbody>
      </Table>
    </Card>

    <Card
      title="Division Summary"
      subtitle={
        scope ===
        "department"
          ? "How your Department manpower was distributed across Divisions."
          : "Official time consumed by your assigned Divisions."
      }
    >
      <Table>
        <thead>
          <tr>
            <Th>Division</Th>

            <Th>
              Contributors
            </Th>

            <Th>Main</Th>

            <Th>Mini</Th>

            <Th>Total</Th>
          </tr>
        </thead>

        <tbody>
          {divisionRows.length ? (
            divisionRows.map(
              (
                row,
                index
              ) => (
                <tr
                  key={`${row.division}-${index}`}
                >
                  <Td strong>
                    {
                      row.division
                    }
                  </Td>

                  <Td>
                    {
                      row.contributor_count
                    }
                  </Td>

                  <Td>
                    {formatDuration(
                      row.main_seconds
                    )}
                  </Td>

                  <Td>
                    {formatDuration(
                      row.mini_seconds
                    )}
                  </Td>

                  <Td strong>
                    {formatDuration(
                      row.total_seconds
                    )}
                  </Td>
                </tr>
              )
            )
          ) : (
            <EmptyRow
              columns={5}
            />
          )}
        </tbody>
      </Table>
    </Card>
  </>
);

/* =========================================================
   DATE-WISE
========================================================= */

const DateView = ({
  rows,
}) => (
  <Card
    title="Date-wise Work"
    subtitle="Main Task sessions and reviewed Mini Tasks."
  >
    <Table>
      <thead>
        <tr>
          <Th>Date</Th>

          <Th>
            Employee
          </Th>

          <Th>Work</Th>

          <Th>Project</Th>

          <Th>Division</Th>

          <Th>Status</Th>

          <Th>
            Official Time
          </Th>
        </tr>
      </thead>

      <tbody>
        {rows.length ? (
          rows.map(
            (row) => (
              <tr
                key={row.id}
              >
                <Td>
                  {formatDate(
                    row.date
                  )}
                </Td>

                <Td>
                  <strong>
                    {
                      row.employee_name
                    }
                  </strong>

                  <Small>
                    {row.employee_code ||
                      row.department_name}
                  </Small>
                </Td>

                <Td>
                  <strong>
                    {
                      row.work_name
                    }
                  </strong>

                  <Small>
                    {
                      row.work_type
                    }
                  </Small>
                </Td>

                <Td>
                  {
                    row.project
                  }
                </Td>

                <Td>
                  {
                    row.division
                  }
                </Td>

                <Td>
                  <Status
                    status={
                      row.status
                    }
                    ongoing={
                      row.ongoing
                    }
                  />
                </Td>

                <Td strong>
                  {formatDuration(
                    row.seconds
                  )}
                </Td>
              </tr>
            )
          )
        ) : (
          <EmptyRow
            columns={7}
          />
        )}
      </tbody>
    </Table>
  </Card>
);

/* =========================================================
   PROJECT-WISE
========================================================= */

const ProjectView = ({
  rows,
}) => (
  <Card
    title="Project-wise Work"
    subtitle="Project totals contain Main Task time only. Mini Tasks remain Division work."
  >
    <Table>
      <thead>
        <tr>
          <Th>Project</Th>

          <Th>Division</Th>

          <Th>
            Contributors
          </Th>

          <Th>
            Main Tasks
          </Th>

          <Th>Status</Th>

          <Th>
            Official Main Time
          </Th>
        </tr>
      </thead>

      <tbody>
        {rows.length ? (
          rows.map(
            (row) => (
              <tr
                key={
                  row.project_id ||
                  row.project_title
                }
              >
                <Td strong>
                  {
                    row.project_title
                  }
                </Td>

                <Td>
                  {
                    row.division
                  }
                </Td>

                <Td>
                  {row.contributor_names.join(
                    ", "
                  ) || "-"}
                </Td>

                <Td>
                  {
                    row.task_count
                  }
                </Td>

                <Td>
                  {row.ongoing ? (
                    <Status
                      ongoing
                    />
                  ) : (
                    <span
                      style={
                        styles.muted
                      }
                    >
                      No active
                      task
                    </span>
                  )}
                </Td>

                <Td strong>
                  {formatDuration(
                    row.total_seconds
                  )}
                </Td>
              </tr>
            )
          )
        ) : (
          <EmptyRow
            columns={6}
          />
        )}
      </tbody>
    </Table>
  </Card>
);

/* =========================================================
   MAIN TASK-WISE
========================================================= */

const MainTaskView = ({
  rows,
}) => (
  <Card
    title="Main Task-wise Work"
    subtitle="Official time calculated from Main Task work sessions."
  >
    <Table>
      <thead>
        <tr>
          <Th>
            Main Task
          </Th>

          <Th>Project</Th>

          <Th>Division</Th>

          <Th>
            Contributors
          </Th>

          <Th>Status</Th>

          <Th>Sessions</Th>

          <Th>
            Official Time
          </Th>
        </tr>
      </thead>

      <tbody>
        {rows.length ? (
          rows.map(
            (row) => (
              <tr
                key={`${row.project_title}-${row.task_id}`}
              >
                <Td strong>
                  {
                    row.task_title
                  }
                </Td>

                <Td>
                  {
                    row.project_title
                  }
                </Td>

                <Td>
                  {
                    row.division
                  }
                </Td>

                <Td>
                  {row.contributor_names.join(
                    ", "
                  ) || "-"}
                </Td>

                <Td>
                  <Status
                    status={
                      row.status
                    }
                    ongoing={
                      row.ongoing
                    }
                  />
                </Td>

                <Td>
                  {
                    row.sessions
                  }
                </Td>

                <Td strong>
                  {formatDuration(
                    row.total_seconds
                  )}
                </Td>
              </tr>
            )
          )
        ) : (
          <EmptyRow
            columns={7}
          />
        )}
      </tbody>
    </Table>
  </Card>
);

/* =========================================================
   COMPONENTS
========================================================= */

const Filter = ({
  label,
  children,
}) => (
  <div
    style={styles.filter}
  >
    <label
      style={styles.label}
    >
      {label}
    </label>

    {children}
  </div>
);

const Tab = ({
  active,
  icon,
  label,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      ...styles.tab,

      ...(active
        ? styles.tabActive
        : {}),
    }}
  >
    {icon}

    {label}
  </button>
);

const StatCard = ({
  label,
  value,
  strong,
}) => (
  <div
    style={{
      ...styles.statCard,

      ...(strong
        ? styles.statCardStrong
        : {}),
    }}
  >
    <span
      style={
        styles.statLabel
      }
    >
      {label}
    </span>

    <strong
      style={
        styles.statValue
      }
    >
      {value}
    </strong>
  </div>
);

const Card = ({
  title,
  subtitle,
  children,
}) => (
  <section
    style={styles.card}
  >
    <div
      style={
        styles.cardHeader
      }
    >
      <h2
        style={
          styles.cardTitle
        }
      >
        {title}
      </h2>

      <p
        style={
          styles.cardSubtitle
        }
      >
        {subtitle}
      </p>
    </div>

    {children}
  </section>
);

const Table = ({
  children,
}) => (
  <div
    style={
      styles.tableWrap
    }
  >
    <table
      style={styles.table}
    >
      {children}
    </table>
  </div>
);

const Th = ({
  children,
}) => (
  <th style={styles.th}>
    {children}
  </th>
);

const Td = ({
  children,
  strong,
}) => (
  <td
    style={{
      ...styles.td,

      ...(strong
        ? styles.tdStrong
        : {}),
    }}
  >
    {children}
  </td>
);

const Small = ({
  children,
}) => (
  <div
    style={styles.muted}
  >
    {children}
  </div>
);

const EmptyRow = ({
  columns,
}) => (
  <tr>
    <td
      colSpan={columns}
      style={styles.empty}
    >
      No work found for
      the selected filters.
    </td>
  </tr>
);

const Status = ({
  status,
  ongoing,
}) => {
  const normalized =
    ongoing
      ? "ongoing"
      : normalizeStatus(
          status
        );

  const text =
    ongoing
      ? "Ongoing"
      : formatStatus(
          status
        );

  return (
    <span
      style={{
        ...styles.status,

        ...(normalized ===
        "done"
          ? styles.statusDone
          : {}),

        ...(normalized ===
          "ongoing" ||
        normalized ===
          "in_progress"
          ? styles.statusOngoing
          : {}),

        ...(normalized ===
        "on_hold"
          ? styles.statusHold
          : {}),

        ...(normalized ===
        "rejected"
          ? styles.statusRejected
          : {}),
      }}
    >
      {text}
    </span>
  );
};

/* =========================================================
   STYLES
========================================================= */

const styles = {
  page: {
    width: "100%",
    padding:
      "4px 0 32px",
  },

  header: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "flex-start",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom:
      "18px",
  },

  title: {
    margin: 0,
    fontSize: "28px",
    fontWeight: 800,
    color: "#0f172a",
  },

  subtitle: {
    margin:
      "6px 0 0",
    fontSize: "14px",
    color: "#64748b",
  },

  headerActions: {
    display: "flex",
    gap: "10px",
  },

  primaryButton: {
    height: "40px",
    padding:
      "0 14px",
    border: "none",
    borderRadius:
      "10px",
    background:
      "#0f172a",
    color: "#fff",
    fontWeight: 700,
    display: "flex",
    alignItems:
      "center",
    gap: "7px",
    cursor: "pointer",
  },

  secondaryButton: {
    height: "40px",
    padding:
      "0 14px",
    border:
      "1px solid #dbe2ea",
    borderRadius:
      "10px",
    background: "#fff",
    color: "#334155",
    fontWeight: 700,
    display: "flex",
    alignItems:
      "center",
    gap: "7px",
    cursor: "pointer",
  },

  scopeSwitch: {
    display: "flex",
    width:
      "fit-content",
    padding: "5px",
    gap: "5px",
    borderRadius:
      "12px",
    background:
      "#f1f5f9",
    marginBottom:
      "14px",
  },

  scopeButton: {
    minHeight: "40px",
    padding:
      "0 14px",
    border: "none",
    borderRadius:
      "9px",
    background:
      "transparent",
    color: "#64748b",
    fontWeight: 700,
    display: "flex",
    alignItems:
      "center",
    gap: "7px",
    cursor: "pointer",
  },

  scopeButtonActive: {
    background: "#fff",
    color: "#0f172a",
    boxShadow:
      "0 1px 3px rgba(15,23,42,0.08)",
  },

  filters: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems:
      "flex-end",
    padding: "14px",
    marginBottom:
      "14px",
    border:
      "1px solid #e2e8f0",
    borderRadius:
      "14px",
    background: "#fff",
  },

  filter: {
    minWidth:
      "165px",
    display: "flex",
    flexDirection:
      "column",
    gap: "6px",
  },

  label: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#475569",
  },

  select: {
    width: "100%",
    height: "40px",
    padding:
      "0 10px",
    border:
      "1px solid #dbe2ea",
    borderRadius:
      "9px",
    background: "#fff",
    color: "#0f172a",
    outline: "none",
  },

  viewTabs: {
    display: "flex",
    gap: "6px",
    overflowX: "auto",
    marginBottom:
      "14px",
  },

  tab: {
    height: "38px",
    padding:
      "0 12px",
    border:
      "1px solid #e2e8f0",
    borderRadius:
      "9px",
    background: "#fff",
    color: "#64748b",
    fontWeight: 700,
    display: "flex",
    alignItems:
      "center",
    gap: "6px",
    whiteSpace:
      "nowrap",
    cursor: "pointer",
  },

  tabActive: {
    background:
      "#f8fafc",
    borderColor:
      "#94a3b8",
    color: "#0f172a",
  },

  stats: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "10px",
    marginBottom:
      "14px",
  },

  statCard: {
    padding:
      "15px 16px",
    border:
      "1px solid #e2e8f0",
    borderRadius:
      "13px",
    background: "#fff",
    display: "flex",
    flexDirection:
      "column",
    gap: "7px",
  },

  statCardStrong: {
    background:
      "#f8fafc",
    borderColor:
      "#cbd5e1",
  },

  statLabel: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#64748b",
  },

  statValue: {
    fontSize: "21px",
    fontWeight: 800,
    color: "#0f172a",
  },

  card: {
    marginBottom:
      "14px",
    border:
      "1px solid #e2e8f0",
    borderRadius:
      "14px",
    background: "#fff",
    overflow: "hidden",
  },

  cardHeader: {
    padding:
      "15px 17px",
    borderBottom:
      "1px solid #edf2f7",
  },

  cardTitle: {
    margin: 0,
    fontSize: "16px",
    fontWeight: 800,
    color: "#0f172a",
  },

  cardSubtitle: {
    margin:
      "5px 0 0",
    fontSize: "12px",
    color: "#64748b",
  },

  tableWrap: {
    width: "100%",
    overflowX: "auto",
  },

  table: {
    width: "100%",
    minWidth:
      "800px",
    borderCollapse:
      "collapse",
  },

  th: {
    padding:
      "11px 15px",
    borderBottom:
      "1px solid #e2e8f0",
    background:
      "#f8fafc",
    color: "#64748b",
    fontSize: "11px",
    fontWeight: 800,
    textAlign: "left",
    textTransform:
      "uppercase",
    whiteSpace:
      "nowrap",
  },

  td: {
    padding:
      "13px 15px",
    borderBottom:
      "1px solid #f1f5f9",
    color: "#334155",
    fontSize: "13px",
    verticalAlign:
      "top",
  },

  tdStrong: {
    color: "#0f172a",
    fontWeight: 700,
  },

  muted: {
    marginTop: "3px",
    color: "#94a3b8",
    fontSize: "11px",
  },

  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: "5px",
  },

  chip: {
    padding:
      "4px 8px",
    borderRadius:
      "999px",
    background:
      "#f1f5f9",
    color: "#475569",
    fontSize: "11px",
    fontWeight: 700,
    whiteSpace:
      "nowrap",
  },

  status: {
    display:
      "inline-flex",
    padding:
      "4px 8px",
    borderRadius:
      "999px",
    background:
      "#f1f5f9",
    color: "#475569",
    fontSize: "11px",
    fontWeight: 700,
  },

  statusOngoing: {
    background:
      "#eff6ff",
    color: "#1d4ed8",
  },

  statusDone: {
    background:
      "#f0fdf4",
    color: "#15803d",
  },

  statusHold: {
    background:
      "#fff7ed",
    color: "#c2410c",
  },

  statusRejected: {
    background:
      "#fef2f2",
    color: "#b91c1c",
  },

  loading: {
    padding: "40px",
    border:
      "1px solid #e2e8f0",
    borderRadius:
      "14px",
    background: "#fff",
    color: "#64748b",
    textAlign:
      "center",
  },

  error: {
    padding:
      "11px 14px",
    marginBottom:
      "14px",
    border:
      "1px solid #fecaca",
    borderRadius:
      "10px",
    background:
      "#fef2f2",
    color: "#b91c1c",
    fontSize: "13px",
  },

  empty: {
    padding:
      "30px 16px",
    color: "#94a3b8",
    fontSize: "13px",
    textAlign:
      "center",
  },
};

export default AdminReports;