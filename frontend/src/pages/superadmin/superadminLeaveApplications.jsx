import {
  useEffect,
  useState,
} from "react";

import {
  Eye,
  Check,
  XCircle,
  X,
} from "lucide-react";

import api from "../../api/axios";


export default function SuperadminLeaveApplications(){

const [rows,setRows] = useState([]);

const [loading,setLoading] = useState(true);

const [selected,setSelected] = useState(null);

const [confirmation,setConfirmation] = useState(null);

const [remark,setRemark] = useState("");

const [summary,setSummary] = useState({
total:0,
pending:0,
approved:0,
rejected:0
});


const load = async()=>{

try{

const response =
await api.get("/superadmin/leaves");


const applications =
response.data?.applications || [];


setRows(applications);


setSummary({

total:applications.length,

pending:
applications.filter(
x=>x.status==="pending"
).length,

approved:
applications.filter(
x=>x.status==="approved"
).length,

rejected:
applications.filter(
x=>x.status==="rejected"
).length

});


}
catch(error){

console.error(
"Leave fetch error",
error
);

}

finally{

setLoading(false);

}

};



useEffect(()=>{

load();

},[]);



const formatDate=(date)=>{

if(!date)
return "-";


const d =
new Date(date);


return `${String(
d.getDate()
).padStart(2,"0")}-${String(
d.getMonth()+1
).padStart(2,"0")}-${d.getFullYear()}`;

};



const leaveLabel=(type)=>{

const data={

sick:"Sick Leave",

casual:"Casual Leave",

mandatory:"Privileged Leave",

festival:"Holiday Leave"

};


return data[type] || type;

};



const statusStyle=(status)=>{

if(status==="approved")

return {

background:"#dcfce7",
color:"#166534"

};


if(status==="rejected")

return {

background:"#fee2e2",
color:"#991b1b"

};


return {

background:"#fef3c7",
color:"#92400e"

};

};





const updateLeave = async(status)=>{

try{


await api.patch(

`/superadmin/leaves/${selected.leave_id}/status`,

{

status,

review_remark:remark

}

);


setConfirmation(null);

setSelected(null);

setRemark("");

load();


}
catch(error){

console.error(error);

}

};




return (

<div style={styles.page}>


<h1 style={styles.title}>
Leave Applications
</h1>


<p style={styles.subtitle}>
All employee leave requests
</p>



<div style={styles.cards}>


{
Object.entries(summary)
.map(([key,value])=>(

<div style={styles.card}
key={key}>

<strong>
{value}
</strong>

<span>
{
key
.charAt(0)
.toUpperCase()
+
key.slice(1)
}
</span>

</div>

))
}


</div>




<div style={styles.tableBox}>


{
loading ?

<p>
Loading...
</p>


:

<table style={styles.table}>


<thead>

<tr>

{
[
"Employee",
"Department",
"Leave Type",
"From",
"To",
"Days",
"Status",
"Action"

].map(
h=>(

<th key={h}
style={styles.th}>

{h}

</th>

)
)

}

</tr>


</thead>



<tbody>


{
rows.map(
(row)=>(


<tr key={row.leave_id}>


<td style={styles.td}>
{row.employee_name}
</td>


<td style={styles.td}>
{row.department_name}
</td>


<td style={styles.td}>
{leaveLabel(
row.leave_type
)}
</td>


<td style={styles.td}>
{formatDate(
row.start_date
)}
</td>


<td style={styles.td}>
{formatDate(
row.end_date
)}
</td>


<td style={styles.td}>
{row.total_days}
</td>


<td style={styles.td}>


<span
style={{
...styles.badge,
...statusStyle(
row.status
)
}}
>

{row.status}

</span>


</td>



<td style={styles.td}>


<button

style={styles.view}

onClick={()=>setSelected(row)}

>

<Eye size={16}/>

View

</button>


</td>



</tr>


)

)

}


</tbody>


</table>


}


</div>





{
selected &&

<div style={styles.overlay}>


<div style={styles.modal}>


<button

style={styles.close}

onClick={()=>
setSelected(null)
}

>

<X/>

</button>



<h2>

Leave Application

</h2>



<p>
<b>Employee:</b>
{" "}
{selected.employee_name}
</p>


<p>
<b>Department:</b>
{" "}
{selected.department_name}
</p>


<p>
<b>Leave:</b>
{" "}
{leaveLabel(
selected.leave_type
)}
</p>


<p>
<b>Date:</b>
{" "}
{formatDate(
selected.start_date
)}
</p>


<p>
<b>Reason:</b>
{" "}
{selected.reason || "-"}
</p>



<textarea

style={styles.textarea}

placeholder="Admin Remark"

value={remark}

onChange={
e=>setRemark(
e.target.value
)
}

/>



<div style={styles.actions}>


<button

style={styles.reject}

onClick={()=>
setConfirmation("rejected")
}

>

<XCircle size={16}/>

Reject

</button>



<button

style={styles.approve}

onClick={()=>
setConfirmation("approved")
}

>

<Check size={16}/>

Approve

</button>


</div>


</div>


</div>

}




{
confirmation &&

<div style={styles.overlay}>


<div style={styles.confirm}>


<h3>

{
confirmation==="approved"
?
"Approve Leave?"
:
"Reject Leave?"
}

</h3>



<p>
Are you sure?
</p>



<div style={styles.actions}>


<button

style={styles.cancel}

onClick={()=>
setConfirmation(null)
}

>

Cancel

</button>


<button

style={
confirmation==="approved"
?
styles.approve
:
styles.reject
}

onClick={()=>
updateLeave(
confirmation
)
}

>

Yes

</button>


</div>


</div>


</div>

}



</div>

);

}



const styles={


page:{
padding:"24px"
},


title:{
fontSize:"34px",
fontWeight:900
},


subtitle:{
color:"#64748b"
},


cards:{
display:"grid",
gridTemplateColumns:"repeat(4,1fr)",
gap:"16px",
margin:"25px 0"
},


card:{
background:"#fff",
padding:"20px",
borderRadius:"18px",
border:"1px solid #ddd",
display:"flex",
flexDirection:"column"
},


tableBox:{
background:"#fff",
padding:"20px",
borderRadius:"20px"
},


table:{
width:"100%",
borderCollapse:"collapse"
},


th:{
padding:"14px",
background:"#f8fafc",
textAlign:"left"
},


td:{
padding:"14px",
borderBottom:"1px solid #eee"
},


badge:{
padding:"6px 12px",
borderRadius:"999px",
fontWeight:800
},


view:{
background:"#111827",
color:"#fff",
border:0,
padding:"8px 12px",
borderRadius:"10px",
display:"flex",
gap:"5px"
},


overlay:{
position:"fixed",
inset:0,
background:"rgba(0,0,0,.5)",
display:"flex",
alignItems:"center",
justifyContent:"center",
zIndex:9999
},


modal:{
background:"#fff",
width:"450px",
padding:"25px",
borderRadius:"20px",
position:"relative"
},


confirm:{
background:"#fff",
padding:"25px",
borderRadius:"20px"
},


close:{
position:"absolute",
right:15,
top:15
},


textarea:{
width:"100%",
height:"90px",
marginTop:"15px"
},


actions:{
display:"flex",
justifyContent:"flex-end",
gap:"10px",
marginTop:"20px"
},


approve:{
background:"#16a34a",
color:"#fff",
border:0,
padding:"10px 18px",
borderRadius:"10px"
},


reject:{
background:"#dc2626",
color:"#fff",
border:0,
padding:"10px 18px",
borderRadius:"10px"
},


cancel:{
background:"#fff",
border:"1px solid #ddd",
padding:"10px 18px",
borderRadius:"10px"
}


};