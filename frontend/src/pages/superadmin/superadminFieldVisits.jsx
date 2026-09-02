import React, {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  Search,
  RefreshCw,
  MapPin,
  Users,
  CheckCircle,
  Clock,
  XCircle
} from "lucide-react";

import api from "../../api/axios";

import "./superadminFieldVisits.css";


const SuperadminFieldVisits = () => {


  const [
    visits,
    setVisits
  ] = useState([]);


  const [
    summary,
    setSummary
  ] = useState({
    total:0,
    employees:0,
    approved:0,
    pending:0,
    rejected:0
  });


  const [
    loading,
    setLoading
  ] = useState(true);


  const [
    search,
    setSearch
  ] = useState("");


  const [
    status,
    setStatus
  ] = useState("all");



  const fetchVisits = async()=>{

    try{

      setLoading(true);


      const response =
        await api.get(
          "/superadmin/field-visits"
        );


      setVisits(
        response.data?.visits || []
      );


      setSummary(
        response.data?.summary || {}
      );


    }
    catch(error){

      console.error(
        "Superadmin field visits error:",
        error
      );

    }
    finally{

      setLoading(false);

    }

  };



  useEffect(()=>{

    fetchVisits();

  },[]);




  const filteredVisits =
    useMemo(()=>{


      return visits.filter(
        (visit)=>{


          const searchText =
          [
            visit.full_name,
            visit.employee_code,
            visit.department_name,
            visit.location,
            visit.visit_type,
            visit.comment
          ]
          .join(" ")
          .toLowerCase();



          const matchesSearch =
            searchText.includes(
              search.toLowerCase()
            );



          const matchesStatus =
            status==="all"
            ||
            visit.status===status;



          return (
            matchesSearch &&
            matchesStatus
          );


        }
      );


    },[
      visits,
      search,
      status
    ]);



  return (

    <div className="sa-field-page">


      {/* HEADER */}

      <div className="sa-field-header">


        <div>

          <h1>
            Field Visits
          </h1>


          <p>
            View all employee field visits across all departments.
          </p>


        </div>



        <button
          className="sa-field-refresh"
          onClick={fetchVisits}
        >

          <RefreshCw size={17}/>

          Refresh

        </button>


      </div>
            {/* SUMMARY CARDS */}

      <div className="sa-field-summary">


        <div className="sa-field-card">

          <div className="sa-field-icon blue">
            <MapPin size={22}/>
          </div>

          <div>

            <p>
              Total Visits
            </p>

            <h2>
              {summary.total || 0}
            </h2>

          </div>

        </div>




        <div className="sa-field-card">

          <div className="sa-field-icon purple">
            <Users size={22}/>
          </div>

          <div>

            <p>
              Employees
            </p>

            <h2>
              {summary.employees || 0}
            </h2>

          </div>

        </div>





        <div className="sa-field-card">

          <div className="sa-field-icon green">
            <CheckCircle size={22}/>
          </div>

          <div>

            <p>
              Approved
            </p>

            <h2>
              {summary.approved || 0}
            </h2>

          </div>

        </div>





        <div className="sa-field-card">

          <div className="sa-field-icon orange">
            <Clock size={22}/>
          </div>

          <div>

            <p>
              Pending
            </p>

            <h2>
              {summary.pending || 0}
            </h2>

          </div>

        </div>




      </div>





      {/* FILTER AREA */}


      <div className="sa-field-filter-box">


        <div className="sa-field-search">


          <Search size={18}/>


          <input

            type="text"

            placeholder="Search employee, department, location..."

            value={search}

            onChange={(event)=>
              setSearch(
                event.target.value
              )
            }

          />


        </div>





        <select

          value={status}

          onChange={(event)=>
            setStatus(
              event.target.value
            )
          }

        >

          <option value="all">
            All Status
          </option>


          <option value="approved">
            Approved
          </option>


          <option value="pending">
            Pending
          </option>


          <option value="rejected">
            Rejected
          </option>


        </select>


      </div>





      {/* TABLE */}


      <div className="sa-field-table-card">


      {
        loading ?

        (

          <div className="sa-field-loading">

            Loading field visits...

          </div>

        )


        :

        filteredVisits.length===0

        ?

        (

          <div className="sa-field-empty">


            <MapPin size={42}/>


            <h3>
              No Field Visits Found
            </h3>


            <p>
              No field visits match your current filters.
            </p>


          </div>


        )


        :

        (

          <div className="sa-field-table-wrapper">


            <table>


              <thead>


                <tr>


                  <th>
                    Employee
                  </th>


                  <th>
                    Department
                  </th>


                  <th>
                    Visit Type
                  </th>


                  <th>
                    Date
                  </th>


                  <th>
                    Location
                  </th>


                  <th>
                    Comment
                  </th>


                  <th>
                    Status
                  </th>


                </tr>


              </thead>
                            <tbody>


              {
                filteredVisits.map(
                  (visit)=>(


                    <tr
                      key={
                        visit.visit_id
                      }
                    >


                      <td>

                        <div className="sa-field-employee">

                          <strong>
                            {
                              visit.full_name
                            }
                          </strong>


                          <span>
                            {
                              visit.employee_code ||
                              "-"
                            }
                          </span>


                        </div>

                      </td>





                      <td>

                        {
                          visit.department_name ||
                          "-"
                        }

                      </td>





                      <td>

                        <strong>
                          {
                            visit.visit_type
                          }
                        </strong>


                        <small>

                          {
                            visit.start_time
                          }

                          {" - "}

                          {
                            visit.end_time
                          }

                        </small>


                      </td>





                      <td>

                        {
                          visit.visit_date
                        }

                      </td>





                      <td>

                        {
                          visit.location ||
                          "-"
                        }

                      </td>





                      <td>

                        {
                          visit.comment ||
                          "-"
                        }

                      </td>





                      <td>


                        <span

                          className={
                            `sa-field-status ${
                               visit.status
                            }`
                          }

                        >

                          {
                            visit.status
                          }


                        </span>


                      </td>



                    </tr>


                  )
                )
              }


              </tbody>


            </table>


          </div>

        )

      }


      </div>



    </div>


  );


};


export default SuperadminFieldVisits;