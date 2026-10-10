import React, {

  useEffect,

  useMemo,

  useState,

} from "react";



import api from "../../api/axios";



const getInitials = (

  name

) => {

  const clean =

    String(

      name || "User"

    ).trim();



  return (

    clean

      .split(" ")

      .filter(Boolean)

      .map(

        (part) =>

          part[0]

      )

      .join("")

      .slice(0, 2)

      .toUpperCase() ||

    "U"

  );

};



const getStatusBadgeStyle = (

  status

) => {

  const value =

    String(

      status || ""

    ).toLowerCase();



  if (

    value === "present"

  ) {

    return {

      ...styles.statusBadge,

      ...styles.presentBadge,

    };

  }



  if (

    value === "absent"

  ) {

    return {

      ...styles.statusBadge,

      ...styles.absentBadge,

    };

  }



  if (

    value === "late"

  ) {

    return {

      ...styles.statusBadge,

      ...styles.lateBadge,

    };

  }



  if (

    value === "leave"

  ) {

    return {

      ...styles.statusBadge,

      ...styles.leaveBadge,

    };

  }



  return styles.statusBadge;

};



const SummaryBox = ({

  label,

  value,

  compact = false,

}) => (

  <div

    style={

      compact

        ? styles.compactSummaryBox

        : styles.summaryBox

    }

  >

    <span

      style={

        compact

          ? styles.compactSummaryLabel

          : styles.summaryLabel

      }

    >

      {label}

    </span>



    <strong

      style={

        compact

          ? styles.compactSummaryValue

          : styles.summaryValue

      }

    >

      {value ?? 0}

    </strong>

  </div>

);



const SuperadminAttendance =

  () => {

    const [

      activeTab,

      setActiveTab,

    ] =

      useState(

        "myAttendance"

      );



    const [

      myAttendance,

      setMyAttendance,

    ] = useState(null);



    const [

      employees,

      setEmployees,

    ] = useState([]);



    const [

      totals,

      setTotals,

    ] = useState({});



    const [

      dateRange,

      setDateRange,

    ] = useState(null);



    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [detailMonth, setDetailMonth] = useState("all");

    const [

      search,

      setSearch,

    ] = useState("");



    const [

      department,

      setDepartment,

    ] = useState("all");



    const [

      loading,

      setLoading,

    ] = useState(true);



    const [

      error,

      setError,

    ] = useState("");



    const fetchAttendance =

      async () => {

        try {

          setLoading(true);



          setError("");



          const response =

            await api.get(

              "/superadmin/attendance"

            );



          setMyAttendance(

            response.data

              ?.my_attendance ||

              null

          );



          setEmployees(

            response.data

              ?.employee_summary ||

              []

          );



          setTotals(

            response.data

              ?.organization_totals ||

              {}

          );



          setDateRange(

            response.data

              ?.date_range ||

              null

          );

        } catch (err) {

          console.error(

            "Super Admin attendance:",

            err

          );



          setError(

            err?.response?.data

              ?.sqlMessage ||

              err?.response?.data

                ?.error ||

              err?.response?.data

                ?.message ||

              "Failed to fetch attendance."

          );

        } finally {

          setLoading(false);

        }

      };



    useEffect(() => {

      fetchAttendance();

    }, []);



    const departments =

      useMemo(() => {

        return Array.from(

          new Set(

            employees

              .map(

                (employee) =>

                  employee.department_name

              )

              .filter(Boolean)

          )

        ).sort();

      }, [employees]);



    const filteredEmployees =

      useMemo(() => {

        const term =

          search

            .trim()

            .toLowerCase();



        return employees.filter(

          (employee) => {

            const matchesDepartment =

              department ===

                "all" ||

              employee.department_name ===

                department;



            const matchesSearch =

              !term ||

              [

                employee.full_name,

                employee.email,

                employee.employee_code,

                employee.designation,

                employee.department_name,

                employee.role_name,

              ]

                .filter(Boolean)

                .join(" ")

                .toLowerCase()

                .includes(term);



            return (

              matchesDepartment &&

              matchesSearch

            );

          }

        );

      }, [

        employees,

        search,

        department,

      ]);



    // Employee daily records already come from /superadmin/attendance.
    // Do not recalculate or alter backend attendance classifications.
    const employeeRecords = Array.isArray(selectedEmployee?.records)
      ? selectedEmployee.records
      : [];
    const employeeMonths = Array.from(new Set(employeeRecords
      .map((record) => String(record.attendance_date || "").slice(0, 7))
      .filter((value) => /^\d{4}-\d{2}$/.test(value)))).sort().reverse();
    const detailRecords = employeeRecords.filter((record) =>
      detailMonth === "all" || String(record.attendance_date || "").slice(0, 7) === detailMonth
    ).sort((a, b) => String(b.attendance_date || "").localeCompare(String(a.attendance_date || "")));
    const detailCounts = {
      total: detailRecords.length,
      present: detailRecords.filter(r => String(r.status || "").toLowerCase() === "present").length,
      absent: detailRecords.filter(r => String(r.status || "").toLowerCase() === "absent").length,
      late: detailRecords.filter(r => String(r.status || "").toLowerCase() === "late").length,
      leave: detailRecords.filter(r => String(r.status || "").toLowerCase() === "leave").length,
      halfDay: detailRecords.filter(r => ["half day", "half_day", "half-day"].includes(String(r.status || "").toLowerCase())).length,
    };

    const myRecords =

      Array.isArray(

        myAttendance?.records

      )

        ? myAttendance.records

        : [];



    return (

      <div style={styles.page}>

        <div style={styles.header}>

          <div>

            <h1 style={styles.pageTitle}>

              Attendance

            </h1>



            <p style={styles.pageSubtitle}>

              Organization-wide

              attendance across all

              departments.

            </p>

          </div>



          <button

            type="button"

            style={styles.refreshButton}

            onClick={

              fetchAttendance

            }

          >

            Refresh

          </button>

        </div>



        {error && (

          <div

            style={

              styles.errorBox

            }

          >

            {error}

          </div>

        )}



        <section

          style={

            styles.tabBlock

          }

        >

          <button

            type="button"

            style={

              activeTab ===

              "myAttendance"

                ? styles.activeTabButton

                : styles.tabButton

            }

            onClick={() =>

              setActiveTab(

                "myAttendance"

              )

            }

          >

            My Attendance

          </button>



          <button

            type="button"

            style={

              activeTab ===

              "organization"

                ? styles.activeTabButton

                : styles.tabButton

            }

            onClick={() =>

              setActiveTab(

                "organization"

              )

            }

          >

            Organization Summary

          </button>

        </section>



        {activeTab ===

          "myAttendance" && (

          <section

            style={

              styles.contentBlock

            }

          >

            <div

              style={

                styles.myAttendanceHeader

              }

            >

              <div

                style={

                  styles.myAvatar

                }

              >

                {getInitials(

                  myAttendance?.full_name

                )}

              </div>



              <div>

                <p

                  style={

                    styles.smallLabel

                  }

                >

                  My Attendance

                </p>



                <h2

                  style={

                    styles.myName

                  }

                >

                  {myAttendance?.full_name ||

                    "-"}

                </h2>



                <p

                  style={

                    styles.myEmail

                  }

                >

                  {myAttendance?.email ||

                    "-"}

                </p>



                <span

                  style={

                    styles.departmentBadge

                  }

                >

                  {myAttendance?.department_name ||

                    "Super Admin"}

                </span>

              </div>

            </div>



            <div

              style={

                styles.myStatsGrid

              }

            >

              <SummaryBox

                label="Working Days"

                value={

                  myAttendance?.total

                }

              />



              <SummaryBox

                label="Present"

                value={

                  myAttendance?.present

                }

              />



              <SummaryBox

                label="Absent"

                value={

                  myAttendance?.absent

                }

              />



              <SummaryBox

                label="Late"

                value={

                  myAttendance?.late

                }

              />



              <SummaryBox

                label="Leave"

                value={

                  myAttendance?.leave

                }

              />

            </div>



            <h2

              style={

                styles.sectionTitle

              }

            >

              My Attendance Records

            </h2>



            <p

              style={

                styles.sectionSubtitle

              }

            >

              {dateRange?.note ||

                "Sundays are excluded."}

            </p>



            <div

              style={

                styles.tableBlock

              }

            >

              {loading ? (

                <div

                  style={

                    styles.emptyBox

                  }

                >

                  Loading...

                </div>

              ) : myRecords.length ===

                0 ? (

                <div

                  style={

                    styles.emptyBox

                  }

                >

                  No attendance

                  records found.

                </div>

              ) : (

                <table

                  style={

                    styles.table

                  }

                >

                  <thead>

                    <tr>

                      <th

                        style={

                          styles.th

                        }

                      >

                        Date

                      </th>



                      <th

                        style={

                          styles.th

                        }

                      >

                        Status

                      </th>



                      <th

                        style={

                          styles.th

                        }

                      >

                        Check In

                      </th>



                      <th

                        style={

                          styles.th

                        }

                      >

                        Check Out

                      </th>



                      <th

                        style={

                          styles.th

                        }

                      >

                        Working Hours

                      </th>



                      <th

                        style={

                          styles.th

                        }

                      >

                        Remarks

                      </th>

                    </tr>

                  </thead>



                  <tbody>

                    {myRecords.map(

                      (

                        record,

                        index

                      ) => (

                        <tr

                          key={

                            record.attendance_id ||

                            `${record.attendance_date}-${index}`

                          }

                        >

                          <td

                            style={

                              styles.td

                            }

                          >

                            {

                              record.attendance_date

                            }

                          </td>



                          <td

                            style={

                              styles.td

                            }

                          >

                            <span

                              style={getStatusBadgeStyle(

                                record.status

                              )}

                            >

                              {

                                record.status

                              }

                            </span>

                          </td>



                          <td

                            style={

                              styles.td

                            }

                          >

                            {

                              record.check_in_time

                            }

                          </td>



                          <td

                            style={

                              styles.td

                            }

                          >

                            {

                              record.check_out_time

                            }

                          </td>



                          <td

                            style={

                              styles.td

                            }

                          >

                            {

                              record.working_hours

                            }

                          </td>



                          <td

                            style={

                              styles.td

                            }

                          >

                            {

                              record.remarks

                            }

                          </td>

                        </tr>

                      )

                    )}

                  </tbody>

                </table>

              )}

            </div>

          </section>

        )}



        {activeTab ===

          "organization" && (

          <section

            style={

              styles.contentBlock

            }

          >

            <div

              style={

                styles.summaryHeader

              }

            >

              <div>

                <h2

                  style={

                    styles.sectionTitle

                  }

                >

                  All Organization

                  Users

                </h2>



                <p

                  style={

                    styles.sectionSubtitle

                  }

                >

                  Every department

                  visible to Super

                  Admin.

                </p>

              </div>



              <div

                style={

                  styles.totalBadge

                }

              >

                Total:{" "}

                {

                  filteredEmployees.length

                }

              </div>

            </div>



            <div

              style={

                styles.organizationStats

              }

            >

              <SummaryBox

                label="People"

                value={

                  totals.people

                }

              />



              <SummaryBox

                label="Present"

                value={

                  totals.present

                }

              />



              <SummaryBox

                label="Absent"

                value={

                  totals.absent

                }

              />



              <SummaryBox

                label="Late"

                value={

                  totals.late

                }

              />



              <SummaryBox

                label="Leave"

                value={

                  totals.leave

                }

              />

            </div>



            <div

              style={

                styles.filters

              }

            >

              <input

                style={

                  styles.searchInput

                }

                value={search}

                onChange={(

                  event

                ) =>

                  setSearch(

                    event.target

                      .value

                  )

                }

                placeholder="Search employee, email, code, designation..."

              />



              <select

                style={

                  styles.select

                }

                value={

                  department

                }

                onChange={(

                  event

                ) =>

                  setDepartment(

                    event.target

                      .value

                  )

                }

              >

                <option value="all">

                  All Departments

                </option>



                {departments.map(

                  (item) => (

                    <option

                      key={

                        item

                      }

                      value={

                        item

                      }

                    >

                      {item}

                    </option>

                  )

                )}

              </select>

            </div>



            {loading ? (

              <div

                style={

                  styles.emptyBox

                }

              >

                Loading organization

                attendance...

              </div>

            ) : (

              <div

                style={

                  styles.employeeGrid

                }

              >

                {filteredEmployees.map(

                  (

                    employee

                  ) => (

                    <div
                      style={{...styles.employeeCard, cursor: "pointer", transition: "box-shadow .18s ease"}}
                      key={employee.user_id}
                      role="button"
                      tabIndex={0}
                      aria-label={`View attendance for ${employee.full_name || "employee"}`}
                      onClick={() => { setSelectedEmployee(employee); setDetailMonth("all"); }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedEmployee(employee);
                          setDetailMonth("all");
                        }
                      }}
                    >

                      <div

                        style={

                          styles.employeeTop

                        }

                      >

                        <div

                          style={

                            styles.employeeAvatar

                          }

                        >

                          {getInitials(

                            employee.full_name

                          )}

                        </div>



                        <div

                          style={{

                            minWidth: 0,

                          }}

                        >

                          <h3

                            style={

                              styles.employeeName

                            }

                          >

                            {employee.full_name ||

                              "-"}

                          </h3>



                          <p

                            style={

                              styles.employeeEmail

                            }

                          >

                            {employee.email ||

                              "-"}

                          </p>



                          <span

                            style={

                              styles.departmentBadge

                            }

                          >

                            {employee.department_name ||

                              "No Department"}

                          </span>

                        </div>

                      </div>



                      <div

                        style={

                          styles.employeeStatsGrid

                        }

                      >

                        <SummaryBox

                          compact

                          label="Working Days"

                          value={

                            employee.total

                          }

                        />



                        <SummaryBox

                          compact

                          label="Present"

                          value={

                            employee.present

                          }

                        />



                        <SummaryBox

                          compact

                          label="Absent"

                          value={

                            employee.absent

                          }

                        />



                        <SummaryBox

                          compact

                          label="Late"

                          value={

                            employee.late

                          }

                        />



                        <SummaryBox

                          compact

                          label="Leave"

                          value={

                            employee.leave

                          }

                        />

                      </div>



                      <div

                        style={

                          styles.employeeBottom

                        }

                      >

                        Latest Attendance:{" "}

                        <strong>

                          {employee.latest_attendance_date ||

                            "-"}

                        </strong>

                      </div>

                    </div>

                  )

                )}

              </div>

            )}

          </section>

        )}

        {selectedEmployee && (
          <div
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelectedEmployee(null);
            }}
            style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(15,23,42,.58)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label={`Attendance details for ${selectedEmployee.full_name || "employee"}`}
              style={{width:"min(1020px,96vw)",maxHeight:"92vh",display:"flex",flexDirection:"column",background:"white",borderRadius:18,boxShadow:"0 24px 80px rgba(15,23,42,.28)",overflow:"hidden"}}
            >
              <header style={{padding:"20px 24px",borderBottom:"1px solid #e5e7eb",display:"flex",justifyContent:"space-between",gap:16,alignItems:"center"}}>
                <div>
                  <h2 style={{margin:0,fontSize:22,color:"#111827"}}>{selectedEmployee.full_name || "Employee"} — Attendance</h2>
                  <p style={{margin:"5px 0 0",fontSize:13,color:"#64748b"}}>{selectedEmployee.department_name || "No Department"} · {selectedEmployee.email || ""}</p>
                </div>
                <button type="button" onClick={() => setSelectedEmployee(null)} aria-label="Close attendance details" style={{padding:"9px 13px",borderRadius:10,border:"1px solid #dbe1e8",background:"#f8fafc",fontWeight:750,cursor:"pointer"}}>Close ✕</button>
              </header>
              <div style={{padding:"20px 24px",overflowY:"auto",minHeight:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:16}}>
                  <div style={{fontWeight:800,color:"#17233a"}}>Day-wise Attendance · {detailRecords.length} records</div>
                  <label style={{fontWeight:750,fontSize:13,color:"#334155",display:"flex",alignItems:"center",gap:8}}>
                    Month
                    <select value={detailMonth} onChange={(event) => setDetailMonth(event.target.value)} style={{padding:"10px 12px",border:"1px solid #cbd5e1",borderRadius:10,background:"#fff",minWidth:160}}>
                      <option value="all">All Records</option>
                      {employeeMonths.map(month => <option key={month} value={month}>{new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", {month:"long",year:"numeric"})}</option>)}
                    </select>
                  </label>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:9,marginBottom:18}}>
                  {[
                    ["Days",detailCounts.total], ["Present",detailCounts.present], ["Absent",detailCounts.absent],
                    ["Late",detailCounts.late], ["Half Day",detailCounts.halfDay], ["Leave",detailCounts.leave]
                  ].map(([label,value]) => <div key={label} style={{background:"#f8fafc",border:"1px solid #e5e7eb",borderRadius:12,padding:"11px 13px"}}><div style={{fontSize:11,fontWeight:800,color:"#64748b"}}>{label}</div><strong style={{fontSize:22,color:"#111827"}}>{value}</strong></div>)}
                </div>
                <div style={{overflowX:"auto",border:"1px solid #e5e7eb",borderRadius:12}}>
                  <table style={{...styles.table,minWidth:740}}>
                    <thead><tr>{["Date","Status","Check In","Check Out","Working Hours","Remarks"].map(label => <th key={label} style={styles.th}>{label}</th>)}</tr></thead>
                    <tbody>{detailRecords.length ? detailRecords.map((record,index) => <tr key={record.attendance_id || `${record.attendance_date}-${index}`}>
                      <td style={styles.td}>{record.attendance_date || "-"}</td>
                      <td style={styles.td}><span style={getStatusBadgeStyle(record.status)}>{record.status || "-"}</span></td>
                      <td style={styles.td}>{record.check_in_time || "-"}</td>
                      <td style={styles.td}>{record.check_out_time || "-"}</td>
                      <td style={styles.td}>{record.working_hours || "-"}</td>
                      <td style={{...styles.td,whiteSpace:"normal",fontWeight:500}}>{record.remarks || "-"}</td>
                    </tr>) : <tr><td style={{...styles.td,textAlign:"center",color:"#64748b"}} colSpan={6}>No attendance records for this period.</td></tr>}</tbody>
                  </table>
                </div>
                <p style={{fontSize:12,color:"#64748b",marginBottom:0}}>Read-only records from the existing Superadmin attendance API. Attendance status and calculations are unchanged.</p>
              </div>
            </section>
          </div>
        )}
      </div>

    );

  };



const styles = {

  page: {

    width: "100%",

    padding:

      "18px 20px 32px",

    boxSizing:

      "border-box",

  },



  header: {

    display: "flex",

    justifyContent:

      "space-between",

    alignItems:

      "center",

    marginBottom:

      "22px",

  },



  pageTitle: {

    margin: 0,

    fontSize:

      "38px",

    color:

      "#111827",

    fontWeight: 900,

  },



  pageSubtitle: {

    margin:

      "7px 0 0",

    color:

      "#64748b",

    fontWeight: 700,

  },



  refreshButton: {

    border: 0,

    background:

      "#ff5733",

    color:

      "#fff",

    borderRadius:

      "14px",

    padding:

      "13px 23px",

    fontWeight: 900,

    cursor:

      "pointer",

  },



  errorBox: {

    background:

      "#fff1f2",

    border:

      "1px solid #fecdd3",

    color:

      "#b91c1c",

    padding:

      "15px",

    borderRadius:

      "16px",

    marginBottom:

      "18px",

  },



  tabBlock: {

    display: "flex",

    gap: "12px",

    marginBottom:

      "22px",

  },



  tabButton: {

    border:

      "1px solid #d5dae2",

    background:

      "transparent",

    borderRadius:

      "14px",

    padding:

      "13px 23px",

    fontWeight: 900,

    cursor:

      "pointer",

  },



  activeTabButton: {

    border:

      "1px solid #ff5733",

    background:

      "#ff5733",

    color:

      "#fff",

    borderRadius:

      "14px",

    padding:

      "13px 23px",

    fontWeight: 900,

    cursor:

      "pointer",

  },



  contentBlock: {

    background:

      "#fff",

    borderRadius:

      "25px",

    padding:

      "30px",

    boxShadow:

      "0 16px 40px rgba(15,23,42,.06)",

  },



  myAttendanceHeader: {

    display: "grid",

    gridTemplateColumns:

      "90px 1fr",

    gap: "20px",

    alignItems:

      "center",

    marginBottom:

      "25px",

  },



  myAvatar: {

    width: "90px",

    height: "90px",

    borderRadius:

      "22px",

    background:

      "#ff5733",

    color:

      "#fff",

    display: "grid",

    placeItems:

      "center",

    fontSize:

      "30px",

    fontWeight: 900,

  },



  smallLabel: {

    color:

      "#ff5733",

    fontWeight: 900,

    margin:

      "0 0 6px",

  },



  myName: {

    margin: 0,

    fontSize:

      "30px",

  },



  myEmail: {

    color:

      "#64748b",

    fontWeight: 800,

  },



  departmentBadge: {

    display:

      "inline-flex",

    background:

      "#fff1ed",

    color:

      "#ff5733",

    borderRadius:

      "999px",

    padding:

      "7px 12px",

    fontSize:

      "12px",

    fontWeight: 900,

  },



  myStatsGrid: {

    display: "grid",

    gridTemplateColumns:

      "repeat(5, minmax(0, 1fr))",

    gap: "12px",

    marginBottom:

      "28px",

  },



  organizationStats: {

    display: "grid",

    gridTemplateColumns:

      "repeat(5, minmax(0, 1fr))",

    gap: "12px",

    margin:

      "22px 0",

  },



  summaryBox: {

    background:

      "#f8fafc",

    border:

      "1px solid #e5e7eb",

    borderRadius:

      "16px",

    padding:

      "17px",

  },



  summaryLabel: {

    display:

      "block",

    color:

      "#64748b",

    fontSize:

      "12px",

    fontWeight: 900,

    marginBottom:

      "8px",

  },



  summaryValue: {

    fontSize:

      "26px",

    color:

      "#111827",

  },



  compactSummaryBox: {

    background:

      "#f8fafc",

    border:

      "1px solid #e5e7eb",

    borderRadius:

      "13px",

    padding:

      "11px",

  },



  compactSummaryLabel: {

    display:

      "block",

    color:

      "#64748b",

    fontSize:

      "10px",

    fontWeight: 900,

    marginBottom:

      "7px",

  },



  compactSummaryValue: {

    fontSize:

      "20px",

  },



  sectionTitle: {

    margin: 0,

    fontSize:

      "27px",

    color:

      "#111827",

  },



  sectionSubtitle: {

    margin:

      "7px 0 20px",

    color:

      "#64748b",

  },



  tableBlock: {

    overflowX:

      "auto",

  },



  table: {

    width: "100%",

    borderCollapse:

      "collapse",

  },



  th: {

    textAlign:

      "left",

    background:

      "#f8fafc",

    padding:

      "14px",

    color:

      "#64748b",

  },



  td: {

    padding:

      "14px",

    borderTop:

      "1px solid #edf0f3",

    fontWeight: 700,

  },



  statusBadge: {

    padding:

      "6px 10px",

    borderRadius:

      "999px",

    fontWeight: 900,

  },



  presentBadge: {

    background:

      "#dcfce7",

    color:

      "#15803d",

  },



  absentBadge: {

    background:

      "#fee2e2",

    color:

      "#b91c1c",

  },



  lateBadge: {

    background:

      "#fef3c7",

    color:

      "#b45309",

  },



  leaveBadge: {

    background:

      "#e0f2fe",

    color:

      "#0369a1",

  },



  summaryHeader: {

    display: "flex",

    justifyContent:

      "space-between",

    alignItems:

      "center",

  },



  totalBadge: {

    background:

      "#111827",

    color:

      "#fff",

    borderRadius:

      "999px",

    padding:

      "10px 17px",

    fontWeight: 900,

  },



  filters: {

    display: "grid",

    gridTemplateColumns:

      "1fr 250px",

    gap: "14px",

    marginBottom:

      "22px",

  },



  searchInput: {

    minHeight:

      "50px",

    border:

      "1px solid #d5dae2",

    borderRadius:

      "14px",

    padding:

      "0 16px",

    fontWeight: 700,

  },



  select: {

    border:

      "1px solid #d5dae2",

    borderRadius:

      "14px",

    padding:

      "0 14px",

    fontWeight: 800,

  },



  employeeGrid: {

    display: "grid",

    gridTemplateColumns:

      "repeat(2, minmax(0, 1fr))",

    gap: "18px",

  },



  employeeCard: {

    border:

      "1px solid #e5e7eb",

    borderRadius:

      "20px",

    padding:

      "20px",

  },



  employeeTop: {

    display: "grid",

    gridTemplateColumns:

      "58px minmax(0, 1fr)",

    gap: "14px",

    alignItems:

      "center",

    marginBottom:

      "18px",

  },



  employeeAvatar: {

    width: "58px",

    height: "58px",

    borderRadius:

      "15px",

    background:

      "#111827",

    color:

      "#fff",

    display: "grid",

    placeItems:

      "center",

    fontWeight: 900,

  },



  employeeName: {

    margin:

      "0 0 5px",

    fontSize:

      "20px",

    whiteSpace:

      "nowrap",

    overflow:

      "hidden",

    textOverflow:

      "ellipsis",

  },



  employeeEmail: {

    margin:

      "0 0 7px",

    color:

      "#64748b",

    whiteSpace:

      "nowrap",

    overflow:

      "hidden",

    textOverflow:

      "ellipsis",

  },



  employeeStatsGrid: {

    display: "grid",

    gridTemplateColumns:

      "repeat(5, minmax(0,1fr))",

    gap: "8px",

  },



  employeeBottom: {

    marginTop:

      "14px",

    color:

      "#64748b",

  },



  emptyBox: {

    padding:

      "25px",

    border:

      "1px dashed #cbd5e1",

    borderRadius:

      "15px",

    textAlign:

      "center",

    color:

      "#64748b",

  },

};



export default SuperadminAttendance;