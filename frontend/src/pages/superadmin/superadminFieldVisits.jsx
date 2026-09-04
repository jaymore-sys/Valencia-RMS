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
    reviewingId,
    setReviewingId
  ] = useState(null);


  const [
    search,
    setSearch
  ] = useState("");


  const [
    status,
    setStatus
  ] = useState("all");


  const [
    message,
    setMessage
  ] = useState("");


  const [
    errorMessage,
    setErrorMessage
  ] = useState("");



  /* =========================================================
     FETCH FIELD VISITS
  ========================================================= */


  const fetchVisits = async()=>{

    try{

      setLoading(true);

      setErrorMessage("");


      const response =
        await api.get(
          "/superadmin/field-visits"
        );


      setVisits(
        response.data?.visits || []
      );


      setSummary(
        response.data?.summary || {
          total:0,
          employees:0,
          approved:0,
          pending:0,
          rejected:0
        }
      );


    }
    catch(error){

      console.error(
        "Superadmin field visits error:",
        error
      );


      setErrorMessage(
        error?.response?.data?.message ||
        "Failed to load Admin field visits."
      );

    }
    finally{

      setLoading(false);

    }

  };



  useEffect(()=>{

    fetchVisits();

  },[]);



  /* =========================================================
     APPROVE / REJECT FIELD VISIT
  ========================================================= */


  const reviewVisit = async(
    visit,
    nextStatus
  )=>{

    if(!visit?.visit_id){
      return;
    }


    const isApprove =
      nextStatus === "approved";


    const confirmed =
      window.confirm(
        isApprove
        ?
        `Approve field visit request from ${
          visit.full_name || "this Admin"
        }?`
        :
        `Reject field visit request from ${
          visit.full_name || "this Admin"
        }?`
      );


    if(!confirmed){
      return;
    }


    try{

      setReviewingId(
        visit.visit_id
      );


      setMessage("");

      setErrorMessage("");


      const response =
        await api.patch(
          `/superadmin/field-visits/${visit.visit_id}/review`,
          {
            status:nextStatus
          }
        );


      setMessage(
        response.data?.message ||
        (
          isApprove
          ?
          "Admin field visit approved successfully."
          :
          "Admin field visit rejected successfully."
        )
      );


      await fetchVisits();


    }
    catch(error){

      console.error(
        "Superadmin review field visit error:",
        error
      );


      setErrorMessage(
        error?.response?.data?.message ||
        "Failed to review Admin field visit."
      );

    }
    finally{

      setReviewingId(null);

    }

  };



  /* =========================================================
     FILTER FIELD VISITS
  ========================================================= */


  const filteredVisits =
    useMemo(()=>{


      const searchValue =
        search
        .toLowerCase()
        .trim();


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
            !searchValue
            ||
            searchText.includes(
              searchValue
            );



          const visitStatus =
            String(
              visit.status || ""
            )
            .toLowerCase()
            .trim();



          const matchesStatus =
            status==="all"
            ||
            visitStatus===status;



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


      {/* =====================================================
          HEADER
      ===================================================== */}


      <div className="sa-field-header">


        <div>

          <h1>
            Field Visits
          </h1>


          <p>
            Review and manage field visit requests submitted by Admin users.
          </p>


        </div>



        <button
          type="button"
          className="sa-field-refresh"
          onClick={fetchVisits}
          disabled={loading}
        >

          <RefreshCw size={17}/>

          Refresh

        </button>


      </div>



      {/* =====================================================
          SUCCESS MESSAGE
      ===================================================== */}


      {
        message
        ?

        (

          <div
            className="sa-field-alert success"
          >

            {message}

          </div>

        )

        :

        null
      }



      {/* =====================================================
          ERROR MESSAGE
      ===================================================== */}


      {
        errorMessage
        ?

        (

          <div
            className="sa-field-alert error"
          >

            {errorMessage}

          </div>

        )

        :

        null
      }



      {/* =====================================================
          SUMMARY CARDS
      ===================================================== */}


      <div className="sa-field-summary">



        {/* TOTAL VISITS */}


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





        {/* ADMINS */}


        <div className="sa-field-card">

          <div className="sa-field-icon purple">

            <Users size={22}/>

          </div>


          <div>

            <p>
              Admins
            </p>

            <h2>
              {summary.employees || 0}
            </h2>

          </div>

        </div>





        {/* APPROVED */}


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





        {/* PENDING */}


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



      {/* =====================================================
          FILTER AREA
      ===================================================== */}


      <div className="sa-field-filter-box">



        {/* SEARCH */}


        <div className="sa-field-search">


          <Search size={18}/>


          <input

            type="text"

            placeholder="Search admin, department, location..."

            value={search}

            onChange={(event)=>
              setSearch(
                event.target.value
              )
            }

          />


        </div>



        {/* STATUS FILTER */}


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



      {/* =====================================================
          TABLE
      ===================================================== */}


      <div className="sa-field-table-card">


      {
        loading

        ?

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
                    Admin
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


                  <th>
                    Action
                  </th>


                </tr>


              </thead>



              <tbody>


              {
                filteredVisits.map(
                  (visit)=>{


                    const visitStatus =
                      String(
                        visit.status || ""
                      )
                      .toLowerCase()
                      .trim();



                    const isPending =
                      visitStatus ===
                      "pending";



                    const isReviewing =
                      Number(
                        reviewingId
                      )
                      ===
                      Number(
                        visit.visit_id
                      );



                    return (

                      <tr
                        key={
                          visit.visit_id
                        }
                      >



                        {/* ADMIN */}


                        <td>

                          <div className="sa-field-employee">

                            <strong>

                              {
                                visit.full_name ||
                                "-"
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



                        {/* DEPARTMENT */}


                        <td>

                          {
                            visit.department_name ||
                            "-"
                          }

                        </td>



                        {/* VISIT TYPE */}


                        <td>


                          <div
                            className="sa-field-visit-type"
                          >


                            <strong>

                              {
                                visit.visit_type ||
                                "-"
                              }

                            </strong>


                            <small>

                              {
                                visit.start_time ||
                                "-"
                              }

                              {" - "}

                              {
                                visit.end_time ||
                                "-"
                              }

                            </small>


                          </div>


                        </td>



                        {/* DATE */}


                        <td>

                          {
                            visit.visit_date ||
                            "-"
                          }

                        </td>



                        {/* LOCATION */}


                        <td>

                          {
                            visit.location ||
                            "-"
                          }

                        </td>



                        {/* COMMENT */}


                        <td>


                          <div
                            className="sa-field-comment"
                          >

                            {
                              visit.comment ||
                              "-"
                            }

                          </div>


                        </td>



                        {/* STATUS */}


                        <td>


                          <span

                            className={
                              `sa-field-status ${
                                visitStatus
                              }`
                            }

                          >

                            {
                              visitStatus ||
                              "-"
                            }

                          </span>


                        </td>



                        {/* ACTION */}


                        <td>


                          {
                            isPending

                            ?

                            (

                              <div
                                className="sa-field-actions"
                              >



                                {/* APPROVE */}


                                <button

                                  type="button"

                                  className="
                                    sa-field-action
                                    approve
                                  "

                                  disabled={
                                    isReviewing
                                  }

                                  onClick={() =>
                                    reviewVisit(
                                      visit,
                                      "approved"
                                    )
                                  }

                                >


                                  <CheckCircle
                                    size={15}
                                  />


                                  {
                                    isReviewing
                                    ?
                                    "Processing..."
                                    :
                                    "Approve"
                                  }


                                </button>



                                {/* REJECT */}


                                <button

                                  type="button"

                                  className="
                                    sa-field-action
                                    reject
                                  "

                                  disabled={
                                    isReviewing
                                  }

                                  onClick={() =>
                                    reviewVisit(
                                      visit,
                                      "rejected"
                                    )
                                  }

                                >


                                  <XCircle
                                    size={15}
                                  />


                                  Reject


                                </button>


                              </div>

                            )

                            :

                            (

                              <span
                                className="
                                  sa-field-reviewed-text
                                "
                              >

                                Reviewed

                              </span>

                            )
                          }


                        </td>



                      </tr>


                    );


                  }
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