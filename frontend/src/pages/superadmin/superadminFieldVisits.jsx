import React, {
 useEffect,
 useMemo,
 useState
} from "react";

import api from "../../api/axios";


const SuperadminFieldVisits =()=>{


const [visits,setVisits]=useState([]);

const [summary,setSummary]=useState({});

const [loading,setLoading]=useState(true);

const [search,setSearch]=useState("");

const [status,setStatus]=useState("all");



const fetchVisits=async()=>{

try{

setLoading(true);


const res =
 await api.get(
 "/superadmin/field-visits"
 );


setVisits(
 res.data?.visits || []
);


setSummary(
 res.data?.summary || {}
);


}
catch(err){

console.error(
 "Field visits error",
 err
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


return visits.filter(v=>{


const text =
[
v.full_name,
v.department_name,
v.location,
v.visit_type,
v.comment
]
.join(" ")
.toLowerCase();


return (

text.includes(
search.toLowerCase()
)

&&

(
status==="all"
||
v.status===status
)

);


});


},[
visits,
search,
status
]);



return (

<div style={styles.page}>


<div style={styles.header}>

<div>

<h1>
Field Visits
</h1>

<p>
View all employee field visits across all departments.
</p>

</div>


<button
style={styles.button}
onClick={fetchVisits}
>
Refresh
</button>


</div>



<div style={styles.cards}>


<Card
title="Total Visits"
value={summary.total}
/>

<Card
title="Employees"
value={summary.employees}
/>


<Card
title="Approved"
value={summary.approved}
/>


<Card
title="Pending"
value={summary.pending}
/>


<Card
title="Rejected"
value={summary.rejected}
/>



</div>



<div style={styles.filters}>


<input

placeholder="Search employee, department, location..."

value={search}

onChange={
e=>setSearch(e.target.value)
}

/>


<select

value={status}

onChange={
e=>setStatus(e.target.value)
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




<div style={styles.tableBox}>


{
loading ?

<p>
Loading...
</p>


:

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
Visit
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
filteredVisits.map(v=>(


<tr key={v.visit_id}>


<td>

<strong>
{v.full_name}
</strong>

<br/>

{v.employee_code}

</td>


<td>
{v.department_name || "-"}
</td>


<td>

{v.visit_type}

<br/>

{v.start_time}
-
{v.end_time}

</td>



<td>
{v.visit_date}
</td>


<td>
{v.location}
</td>


<td>
{v.comment}
</td>



<td>

<span
style={{
...styles.badge,

background:
v.status==="approved"
?
"#dcfce7"
:
v.status==="rejected"
?
"#fee2e2"
:
"#fef3c7"
}}
>

{v.status}

</span>


</td>



</tr>


))

}


</tbody>


</table>


}


</div>


</div>


);


};



const Card=({title,value})=>(

<div style={styles.card}>

<p>
{title}
</p>

<h2>
{value || 0}
</h2>

</div>

);



const styles={

page:{
padding:"25px",
background:"#fff",
borderRadius:"25px"
},


header:{
display:"flex",
justifyContent:"space-between",
alignItems:"center"
},


button:{
background:"#ff5733",
color:"#fff",
border:"none",
padding:"12px 22px",
borderRadius:"12px",
fontWeight:800
},


cards:{
display:"grid",
gridTemplateColumns:
"repeat(5,1fr)",
gap:"15px",
margin:"25px 0"
},


card:{
background:"#f8fafc",
padding:"20px",
borderRadius:"18px"
},


filters:{
display:"flex",
gap:"15px",
marginBottom:"20px"
},


tableBox:{
overflowX:"auto"
},


table:{
width:"100%",
borderCollapse:"collapse"
},


badge:{
padding:"7px 12px",
borderRadius:"20px",
fontWeight:800
}

};


export default SuperadminFieldVisits;