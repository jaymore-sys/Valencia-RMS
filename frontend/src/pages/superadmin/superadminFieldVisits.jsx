import React, { useEffect, useMemo, useState } from "react";

import { Search, RefreshCw, MapPin, Users, CheckCircle, Clock, XCircle } from "lucide-react";

import api from "../../api/axios";

import "./superadminFieldVisits.css";



const roleOf = (v) => String(v.applicant_role || "").trim().toLowerCase();

const statusOf = (v) => String(v.status || "").trim().toLowerCase();

const dateOf = (v) => String(v || "").slice(0, 10);

const durationLabel = (v) => v.duration_type === "half_day"

  ? `Half Day${v.half_day_session === "first_half" ? " - First Half" : v.half_day_session === "second_half" ? " - Second Half" : ""}`

  : v.duration_type === "full_day" ? "Full Day" : "-";

const stopsOf = (v) => Array.isArray(v.visit_stops) && v.visit_stops.length

  ? v.visit_stops : [{location: v.location, description: v.comment}];

const preview = (value, limit = 80) => {

  const text = String(value || "-").replace(/\s+/g, " ").trim();

  return text.length > limit ? `${text.slice(0,limit)}…` : text;

};

const viewerStyle = {position:"fixed",inset:0,zIndex:9999,background:"rgba(15,23,42,.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:18};

const modalStyle = {width:"min(800px,95vw)",maxHeight:"min(90vh,900px)",overflow:"hidden",background:"#fff",borderRadius:20,padding:0,boxShadow:"0 30px 90px rgba(15,23,42,.28)",display:"flex",flexDirection:"column"};

const detailLabel = {fontSize:11,fontWeight:800,color:"#75839a",letterSpacing:".07em",textTransform:"uppercase",marginBottom:6};

const detailValue = {fontSize:14,fontWeight:650,color:"#17233a",lineHeight:1.5};

const detailSection = {border:"1px solid #e6eaf1",background:"#f8fafc",borderRadius:12,padding:"16px 18px"};

const modalButton = {display:"inline-flex",alignItems:"center",justifyContent:"center",gap:7,borderRadius:9,padding:"10px 16px",fontWeight:750,fontSize:13,cursor:"pointer",fontFamily:"inherit"};



export default function SuperadminFieldVisits() {

  const [visits,setVisits] = useState([]);

  const [tab,setTab] = useState("admin");

  const [search,setSearch] = useState("");

  const [status,setStatus] = useState("all");

  const [loading,setLoading] = useState(true);

  const [busy,setBusy] = useState(null);

  const [message,setMessage] = useState("");

  const [errorMessage,setErrorMessage] = useState("");

  const [detailVisit,setDetailVisit] = useState(null);

  const [reviewDialog,setReviewDialog] = useState(null);

  const [reviewRemark,setReviewRemark] = useState("");

  const [canReviewEmployee,setCanReviewEmployee] = useState(false);

  const fetchVisits = async () => {

    try {

      setLoading(true);setErrorMessage("");

      const response = await api.get("/superadmin/field-visits");

      setVisits(Array.isArray(response.data?.visits) ? response.data.visits : []);

      setCanReviewEmployee(response.data?.can_review_employee === true);

    } catch(e) {setErrorMessage(e?.response?.data?.message || "Failed to load field visits.");}

    finally {setLoading(false);}

  };

  useEffect(()=>{fetchVisits();},[]);

  const currentRole = (()=>{try {const user=JSON.parse(sessionStorage.getItem("user")||localStorage.getItem("user")||"{}");return String(user.role_name||user.role||"").toLowerCase();}catch{return "";}})();

  // A Superadmin always sees approval controls; the API enforces permissions, not the UI.

  const mayReview = v => roleOf(v) === "admin" || canReviewEmployee || currentRole === "superadmin";

  const tabVisits = useMemo(()=>visits.filter(v=>tab === "admin" ? roleOf(v) === "admin" : roleOf(v) === "employee"),[visits,tab]);

  const summary = useMemo(()=>({total:tabVisits.length,employees:new Set(tabVisits.map(v=>v.employee_id)).size,approved:tabVisits.filter(v=>statusOf(v)==="approved").length,pending:tabVisits.filter(v=>statusOf(v)==="pending").length}),[tabVisits]);

  const filteredVisits=useMemo(()=>tabVisits.filter(v=>{

    const searchable=[v.full_name,v.employee_code,v.department_name,v.location,v.visit_type,v.comment,v.conclusion,v.remark,v.review_remark,...stopsOf(v).flatMap(s=>[s.location,s.description])].join(" ").toLowerCase();

    return (!search.trim()||searchable.includes(search.trim().toLowerCase()))&&(status==="all"||statusOf(v)===status);

  }),[tabVisits,search,status]);

  const submitDecision=async(visit,nextStatus,remark="")=>{

    if(!visit?.visit_id||busy!==null||statusOf(visit)!=="pending")return;

    if(nextStatus!=="approved"&&!remark.trim()){setErrorMessage("A remark is required.");return;}

    try {

      setBusy(visit.visit_id);setErrorMessage("");setMessage("");

      const response=await api.patch(`/superadmin/field-visits/${visit.visit_id}/review`,{status:nextStatus,review_remark:remark.trim()});

      setReviewDialog(null);setReviewRemark("");setDetailVisit(null);

      await fetchVisits();setMessage(response.data?.message||"Field visit updated.");

    }catch(e){setErrorMessage(e?.response?.data?.message||"Failed to update field visit.");}

    finally{setBusy(null);}

  };

  const requestAction=(v,nextStatus)=>{

    if(nextStatus==="approved") {if(window.confirm(`Approve the field visit submitted by ${v.full_name||"this user"}?`)) submitDecision(v,"approved");return;}

    setReviewDialog({visit:v,status:nextStatus});setReviewRemark("");setErrorMessage("");

  };

  const closeOnBackdrop=e=>{if(e.target===e.currentTarget && busy===null){setDetailVisit(null);setReviewDialog(null);}};

  return <div className="sa-field-page">

    <div className="sa-field-header"><div><h1>Field Visits</h1><p>Review and manage field visits across all departments.</p></div><button type="button" className="sa-field-refresh" onClick={fetchVisits} disabled={loading}><RefreshCw size={17}/> Refresh</button></div>

    {message&&<div className="sa-field-alert success">{message}</div>}{errorMessage&&<div className="sa-field-alert error">{errorMessage}</div>}

    <div role="tablist" aria-label="Field visit owner" style={{display:"flex",gap:8,margin:"20px 0",flexWrap:"wrap"}}>

      {[{id:"admin",label:"Admin Field Visits"},{id:"employee",label:"Employee Field Visits"}].map(t=><button key={t.id} role="tab" aria-selected={tab===t.id} type="button" onClick={()=>{setTab(t.id);setStatus("all");setSearch("");}} style={{padding:"12px 18px",borderRadius:10,border:"1px solid #e2e8f0",fontWeight:700,cursor:"pointer",background:tab===t.id?"#ff5838":"#fff",color:tab===t.id?"#fff":"#24324b"}}>{t.label}</button>)}

    </div>

    <div className="sa-field-summary">

      <div className="sa-field-card"><div className="sa-field-icon blue"><MapPin size={22}/></div><div><p>Total Visits</p><h2>{summary.total}</h2></div></div>

      <div className="sa-field-card"><div className="sa-field-icon purple"><Users size={22}/></div><div><p>{tab==="admin"?"Admins":"Employees"}</p><h2>{summary.employees}</h2></div></div>

      <div className="sa-field-card"><div className="sa-field-icon green"><CheckCircle size={22}/></div><div><p>Approved</p><h2>{summary.approved}</h2></div></div>

      <div className="sa-field-card"><div className="sa-field-icon orange"><Clock size={22}/></div><div><p>Pending</p><h2>{summary.pending}</h2></div></div>

    </div>

    <div className="sa-field-filter-box"><div className="sa-field-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, department, location..."/></div><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All Status</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="changes_requested">Changes Requested</option></select></div>

    <div className="sa-field-table-card">{loading?<div className="sa-field-loading">Loading field visits...</div>:!filteredVisits.length?<div className="sa-field-empty"><MapPin size={42}/><h3>No Field Visits Found</h3><p>No visits match your filters.</p></div>:<div className="sa-field-table-wrapper"><table><thead><tr><th>{tab==="admin"?"Admin":"Employee"}</th><th>Department</th><th>Visit Type</th><th>Date</th><th>Location</th><th>Description / Conclusion</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredVisits.map(v=>{

      const pending=statusOf(v)==="pending", allowed=mayReview(v), isBusy=busy===v.visit_id;

      return <tr key={v.visit_id}>

        <td><div className="sa-field-employee"><strong>{v.full_name||"-"}</strong><span>{v.employee_code||"-"}</span></div></td>

        <td>{v.department_name||"-"}</td><td><div className="sa-field-visit-type"><strong>{v.visit_type||"-"}</strong><small>{durationLabel(v)}</small></div></td>

        <td>{dateOf(v.visit_date)||"-"}{v.end_date&&dateOf(v.end_date)!==dateOf(v.visit_date)?` – ${dateOf(v.end_date)}`:""}</td>

        <td><button type="button" onClick={()=>setDetailVisit(v)} title="Open full visit details" style={{border:0,background:"transparent",color:"#334155",textAlign:"left",cursor:"pointer",maxWidth:170,fontWeight:700}}>{preview(stopsOf(v).map(s=>s.location).join(", "),48)} <span style={{fontSize:11,textDecoration:"underline",color:"#e65332"}}>View</span></button></td>

        <td><button type="button" onClick={()=>setDetailVisit(v)} title="Open full visit details" style={{border:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#334155",maxWidth:235,lineHeight:1.5}}><strong>Description:</strong> {preview(stopsOf(v)[0]?.description||v.comment,90)}<div><strong>Conclusion:</strong> {preview(v.conclusion,45)}</div><span style={{textDecoration:"underline",color:"#e65332",fontSize:11}}>View full details</span></button></td>

        <td><span className={`sa-field-status ${statusOf(v)}`}>{statusOf(v)==="changes_requested"?"Changes Requested":v.status||"-"}</span></td>

        <td>{pending&&allowed?<div className="sa-field-actions" style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-start",minWidth:155}}><div style={{display:"flex",gap:5}}><button type="button" className="sa-field-action approve" disabled={busy!==null} onClick={()=>requestAction(v,"approved")}><CheckCircle size={14}/>{isBusy?"Saving...":"Approve"}</button><button type="button" className="sa-field-action reject" disabled={busy!==null} onClick={()=>requestAction(v,"rejected")}><XCircle size={14}/>Reject</button></div><button type="button" disabled={busy!==null} style={{fontSize:12,border:0,background:"transparent",textDecoration:"underline",color:"#9a5300",padding:"2px 4px",cursor:"pointer"}} onClick={()=>requestAction(v,"changes_requested")}>Review / Request changes</button></div>:<span className="sa-field-reviewed-text">{pending?"Awaiting authorized reviewer":statusOf(v)==="changes_requested"?"Review sent — awaiting resubmission":`${v.status||"Reviewed"}${v.reviewed_by_name?` by ${v.reviewed_by_name}`:""}`}</span>}</td>

      </tr>;

    })}</tbody></table></div>}</div>

    {detailVisit&&<div role="presentation" style={viewerStyle} onMouseDown={closeOnBackdrop}>

      <div role="dialog" aria-modal="true" aria-label="Full field visit details" style={modalStyle}>

        <div style={{padding:"22px 26px 20px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,borderBottom:"1px solid #e8edf4"}}>

          <div>

            <div style={{color:"#f05a3c",fontSize:11,fontWeight:800,letterSpacing:".09em",marginBottom:5}}>FIELD VISIT REPORT</div>

            <h2 style={{margin:0,fontSize:23,fontWeight:850,color:"#121d32",letterSpacing:"-.5px"}}>Field Visit Details</h2>

            <p style={{margin:"6px 0 0",color:"#748198",fontSize:12}}>Visit #{detailVisit.visit_id} · Complete visit information</p>

          </div>

          <button type="button" aria-label="Close visit details" onClick={()=>setDetailVisit(null)} style={{...modalButton,padding:"8px 11px",border:"1px solid #e3e8ef",background:"#f8fafc",color:"#52617a"}}>✕</button>

        </div>

        <div style={{padding:"22px 26px",overflowY:"auto",minHeight:0,flex:1}}>

          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:18}}>

            <div style={{display:"flex",alignItems:"center",gap:10}}>

              <div style={{width:40,height:40,borderRadius:12,background:"#fff0ec",color:"#f05a3c",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800}}>{String(detailVisit.full_name||"?").split(/\s+/).slice(0,2).map(n=>n[0]||"").join("").toUpperCase()}</div>

              <div><div style={{fontWeight:800,fontSize:15,color:"#17233a"}}>{detailVisit.full_name||"-"}</div><div style={{fontSize:12,color:"#748198"}}>{detailVisit.department_name||"-"} · Submitted by</div></div>

            </div>

            <span className={`sa-field-status ${statusOf(detailVisit)}`} style={{fontSize:12}}>{statusOf(detailVisit)==="changes_requested"?"Changes Requested":detailVisit.status||"-"}</span>

          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:22}}>

            <div style={detailSection}><div style={detailLabel}>Visit Type</div><div style={detailValue}>{detailVisit.visit_type||"-"}</div></div>

            <div style={detailSection}><div style={detailLabel}>Duration</div><div style={detailValue}>{durationLabel(detailVisit)}</div></div>

            <div style={detailSection}><div style={detailLabel}>Visit Date</div><div style={detailValue}>{dateOf(detailVisit.visit_date)}{detailVisit.end_date&&dateOf(detailVisit.end_date)!==dateOf(detailVisit.visit_date)?` – ${dateOf(detailVisit.end_date)}`:""}</div></div>

          </div>

          <h3 style={{fontSize:15,fontWeight:800,color:"#17233a",margin:"0 0 12px"}}>Locations & Visit Description</h3>

          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:22}}>

            {stopsOf(detailVisit).map((stop,i)=><div key={stop.stop_id||i} style={{...detailSection,background:"#fff",padding:"17px 18px"}}>

              <div style={{display:"flex",gap:9,alignItems:"center",marginBottom:12}}>

                <div style={{background:"#fff0ec",color:"#e85235",fontWeight:800,fontSize:11,borderRadius:7,padding:"5px 8px",whiteSpace:"nowrap"}}>STOP {i+1}</div>

                <div style={{fontWeight:800,color:"#1e2a40",fontSize:14,overflowWrap:"anywhere"}}>{stop.location||"-"}</div>

                {stop.visit_time&&<span style={{fontSize:12,color:"#7c899c",marginLeft:"auto",whiteSpace:"nowrap"}}>{String(stop.visit_time).slice(0,5)}</span>}

              </div>

              <div style={detailLabel}>Description / Purpose</div>

              <div style={{fontSize:13.5,color:"#415068",lineHeight:1.8,whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{stop.description||"-"}</div>

            </div>)}

          </div>

          <div style={{display:"grid",gap:10}}>

            <div style={detailSection}><div style={detailLabel}>Conclusion</div><div style={{...detailValue,fontWeight:450,whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{detailVisit.conclusion||"-"}</div></div>

            <div style={detailSection}><div style={detailLabel}>Remark / Follow-up</div><div style={{...detailValue,fontWeight:450,whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{detailVisit.remark||"-"}</div></div>

            {detailVisit.review_remark&&<div style={{...detailSection,border:"1px solid #f5dfba",background:"#fff9ef"}}><div style={{...detailLabel,color:"#b67622"}}>Review Remark</div><div style={{...detailValue,fontWeight:500,whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{detailVisit.review_remark}</div></div>}

          </div>

        </div>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",padding:"16px 26px",borderTop:"1px solid #e8edf4",background:"#fff"}}>

          <span style={{fontSize:12,color:"#8a95a8"}}>{statusOf(detailVisit)==="pending"?"Awaiting decision":"Visit details"}</span>

          <div style={{display:"flex",gap:9,flexWrap:"wrap",alignItems:"center"}}>

            <button type="button" onClick={()=>setDetailVisit(null)} style={{...modalButton,border:"1px solid #dce3eb",background:"#fff",color:"#334155"}}>Close</button>

            {statusOf(detailVisit)==="pending"&&mayReview(detailVisit)&&<>

              <button type="button" disabled={busy!==null} onClick={()=>requestAction(detailVisit,"changes_requested")} style={{...modalButton,border:"1px solid #f0c788",color:"#995b12",background:"#fff9ed"}}>Review</button>

              <button type="button" disabled={busy!==null} onClick={()=>requestAction(detailVisit,"rejected")} style={{...modalButton,border:"1px solid #f1c6c9",background:"#fff1f2",color:"#c43746"}}><XCircle size={15}/> Reject</button>

              <button type="button" disabled={busy!==null} onClick={()=>requestAction(detailVisit,"approved")} style={{...modalButton,border:"1px solid #14824e",background:"#168653",color:"#fff"}}><CheckCircle size={15}/> Approve</button>

            </>}

          </div>

        </div>

      </div>

    </div>}

    {reviewDialog && (() => {
      const requestingChanges = reviewDialog.status === "changes_requested";
      const dialogTitle = requestingChanges ? "Review Field Visit" : "Reject Field Visit";
      const accent = requestingChanges ? "#c77119" : "#dc3545";
      const remarkId = "sa-field-decision-remark";
      return (
        <div
          role="presentation"
          style={{ ...viewerStyle, zIndex: 10000, background: "rgba(11, 20, 39, .68)" }}
          onMouseDown={closeOnBackdrop}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sa-field-decision-title"
            style={{
              ...modalStyle,
              width: "min(510px, 94vw)",
              maxHeight: "min(90vh, 720px)",
              border: "1px solid #e6eaf1",
              boxShadow: "0 28px 90px rgba(9, 19, 37, .30)",
            }}
          >
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "flex-start",
              gap: 16, padding: "23px 26px 20px", borderBottom: "1px solid #edf0f5",
            }}>
              <div>
                <div style={{ color: accent, fontSize: 11, fontWeight: 800, letterSpacing: ".075em", marginBottom: 7 }}>
                  {requestingChanges ? "REQUEST CORRECTIONS" : "REJECTION CONFIRMATION"}
                </div>
                <h2 id="sa-field-decision-title" style={{ margin: 0, color: "#17233a", fontSize: 22, fontWeight: 800, letterSpacing: "-.4px" }}>
                  {dialogTitle}
                </h2>
              </div>
              <button type="button" aria-label="Close dialog" disabled={busy !== null} onClick={() => setReviewDialog(null)}
                style={{ ...modalButton, padding: "7px 11px", border: "1px solid #e1e7ef", background: "#f8fafc", color: "#65738a" }}>
                ✕
              </button>
            </div>

            <div style={{ padding: "22px 26px 25px", overflowY: "auto", minHeight: 0 }}>
              <p style={{ margin: "0 0 19px", color: "#64748b", lineHeight: 1.65, fontSize: 13.5 }}>
                {requestingChanges
                  ? "Specify the corrections required. The applicant can update the visit and resubmit it, but the original dates remain locked."
                  : "Please provide a reason for rejecting this field visit. The reason will be recorded with the decision."}
              </p>
              <label htmlFor={remarkId} style={{ display: "block", fontSize: 13, fontWeight: 750, color: "#233149", marginBottom: 9 }}>
                {requestingChanges ? "Review Remark" : "Rejection Reason"} <span style={{ color: accent }}>*</span>
              </label>
              <textarea
                id={remarkId}
                autoFocus
                required
                value={reviewRemark}
                onChange={e => setReviewRemark(e.target.value)}
                rows={5}
                placeholder={requestingChanges ? "Describe what needs to be corrected..." : "Enter the reason for rejection..."}
                style={{
                  boxSizing: "border-box", display: "block", width: "100%", minHeight: 135,
                  padding: "13px 15px", resize: "vertical", border: "1px solid #ced7e3",
                  borderRadius: 11, background: "#fff", color: "#1f2937", fontSize: 13.5,
                  lineHeight: 1.65, fontFamily: "inherit", outlineColor: "#ff7354",
                }}
              />
              <p style={{ margin: "9px 0 0", color: "#8793a5", fontSize: 11.5 }}>
                * Required before submitting your decision
              </p>
            </div>

            <div style={{
              display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 10,
              padding: "16px 26px 20px", borderTop: "1px solid #edf0f5", background: "#fbfcfe",
            }}>
              <button type="button" disabled={busy !== null} onClick={() => setReviewDialog(null)}
                style={{ ...modalButton, background: "#fff", border: "1px solid #dce3eb", color: "#334155" }}>
                Cancel
              </button>
              <button
                type="button"
                disabled={busy !== null || !reviewRemark.trim()}
                onClick={() => submitDecision(reviewDialog.visit, reviewDialog.status, reviewRemark)}
                style={{
                  ...modalButton, border: "1px solid transparent", color: "#fff",
                  background: requestingChanges ? "#d87823" : "#e33d4f",
                  opacity: busy !== null || !reviewRemark.trim() ? .55 : 1,
                  cursor: busy !== null || !reviewRemark.trim() ? "not-allowed" : "pointer",
                }}
              >
                {busy !== null ? "Sending..." : requestingChanges ? "Send for Review" : "Reject Visit"}
              </button>
            </div>
          </div>
        </div>
      );
    })()}

  </div>;

}
