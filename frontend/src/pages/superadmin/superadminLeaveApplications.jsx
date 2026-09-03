import {useEffect,useState} from "react";
import api from "../../api/axios";

export default function SuperadminLeaveApplications(){
 const [rows,setRows]=useState([]); const [loading,setLoading]=useState(true);
 const load=async()=>{try{const r=await api.get("/superadmin/leaves");setRows(r.data?.applications||[])}catch(e){console.error(e)}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);
 return <div style={{padding:24}}><h1 style={{fontSize:32,fontWeight:900}}>Leave Applications</h1><p>All employee leave requests</p>{loading?<p>Loading...</p>:<table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["Employee","Department","Type","From","To","Days","Status"].map(x=><th style={{padding:12,textAlign:"left"}}>{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.leave_id}>{[r.employee_name,r.department_name,r.leave_type,r.start_date,r.end_date,r.total_days,r.status].map(x=><td style={{padding:12,borderBottom:"1px solid #ddd"}}>{x||"-"}</td>)}</tr>)}</tbody></table>}</div>
}
