import React, { useEffect, useState } from "react";
import api from "../api/axios";

// Render only for an open visit, not for every table row (avoids needless API requests).
export default function FieldVisitDocuments({stopId,canEdit=false}){
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(false);
  const [working,setWorking]=useState(false);
  const [message,setMessage]=useState("");
  const [enabled,setEnabled]=useState(true);
  const [pendingDelete,setPendingDelete]=useState(null);
  const load=async()=>{
    if(!stopId)return;
    setLoading(true);
    try{
      const {data}=await api.get(`/field-visit-locations/stops/${stopId}/documents`);
      setRows(data.documents||[]);setEnabled(data.storage_enabled!==false);setMessage("");
    }catch(e){setMessage(e.response?.data?.message||"Unable to load documents.");}
    finally{setLoading(false);}
  };
  useEffect(()=>{load();},[stopId]);
  const uploadFile=async(file,replaceId=null)=>{
    if(!file)return;
    if(file.size>10*1024*1024){setMessage("Each document must be 10 MB or smaller.");return;}
    setWorking(true);setMessage("");
    try{
      const data=new FormData();data.append("file",file);
      if(replaceId!=null){
        await api.post(`/field-visit-locations/documents/${replaceId}/replace`,data);
      } else {
        await api.post(`/field-visit-locations/stops/${stopId}/documents`,data);
      }
      await load();setMessage(replaceId==null?"Document uploaded.":"Document replaced. Previous version retained for recovery.");
    }catch(e){setMessage(e.response?.data?.message||"Upload failed. Existing files were not removed.");await load();}
    finally{setWorking(false);}
  };
  useEffect(()=>{
    if(!pendingDelete)return;
    const onKeyDown=(event)=>{if(event.key==="Escape"&&!working)setPendingDelete(null);};
    document.addEventListener("keydown",onKeyDown);
    return ()=>document.removeEventListener("keydown",onKeyDown);
  },[pendingDelete,working]);
  const removeFile=async(id)=>{
    setWorking(true);setMessage("");
    try{
      await api.delete(`/field-visit-locations/documents/${id}`);
      setPendingDelete(null);
      await load();setMessage("Document removed. Recovery copy retained.");
    }
    catch(e){setMessage(e.response?.data?.message||"Unable to remove document.");}
    finally{setWorking(false);}
  };
  const downloadFile=async(row)=>{
    try{
      const r=await api.get(`/field-visit-locations/documents/${row.document_id}/download`,{responseType:"blob"});
      const blobUrl=window.URL.createObjectURL(new Blob([r.data]));
      const a=document.createElement("a");a.href=blobUrl;a.download=row.original_name;a.style.display="none";
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>window.URL.revokeObjectURL(blobUrl),1500);
    }catch(e){setMessage("Document download failed.");}
  };
  const button={border:"1px solid #dce2ea",borderRadius:7,padding:"6px 9px",background:"#fff",fontWeight:700,cursor:"pointer",color:"#334155",fontSize:12};
  return <div style={{border:"1px solid #e4e8ef",borderRadius:10,padding:12,background:"#fafbfc",marginTop:10}}>
    <div style={{fontWeight:800,fontSize:13,marginBottom:8}}>Documents <span style={{fontWeight:400,color:"#64748b"}}>(optional · up to 10 MB each · max 5)</span></div>
    {loading?<div style={{color:"#64748b",fontSize:12}}>Loading documents...</div>:rows.length===0?<div style={{fontSize:12,color:"#64748b"}}>No documents attached.</div>:
      rows.map(row=><div key={row.document_id} style={{display:"flex",gap:8,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",padding:"8px 0",borderBottom:"1px solid #e4e8ef"}}>
        <span style={{fontSize:12,wordBreak:"break-word",flex:1,minWidth:90}}>{row.original_name} · {(Number(row.file_size)/1048576).toFixed(2)} MB</span>
        <button type="button" style={button} onClick={()=>downloadFile(row)}>Download</button>
        {canEdit && enabled && <>
          <label style={{...button,opacity:working?.55:1}}>
            Replace<input type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx" disabled={working} style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];e.target.value="";uploadFile(f,row.document_id);}}/>
          </label>
          <button type="button" style={{...button,color:"#b42318"}} disabled={working} onClick={()=>setPendingDelete({document_id:row.document_id,original_name:row.original_name})}>Delete</button>
        </>}
      </div>)}
    {canEdit&&enabled&&rows.length<5&&<label style={{display:"inline-block",marginTop:10,border:"1px dashed #d3543c",borderRadius:8,padding:"8px 11px",fontWeight:800,color:"#ce5039",cursor:working?"wait":"pointer",fontSize:12}}>
      + Add Document<input type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx" disabled={working} style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];e.target.value="";uploadFile(f);}}/>
    </label>}
    {canEdit&&!enabled&&<div style={{fontSize:12,color:"#9a3412",marginTop:6}}>Uploads disabled until RMS IT configures a persistent private storage directory.</div>}
    {message&&<div role="status" style={{fontSize:12,color:"#92400e",marginTop:7}}>{message}</div>}
    {pendingDelete&&(
      <div
        role="presentation"
        onMouseDown={(event)=>{if(event.target===event.currentTarget&&!working)setPendingDelete(null);}}
        style={{position:"fixed",inset:0,zIndex:999999,background:"rgba(15,23,42,.58)",display:"flex",justifyContent:"center",alignItems:"center",padding:16,boxSizing:"border-box"}}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`fv-delete-title-${stopId}`}
          aria-describedby={`fv-delete-description-${stopId}`}
          style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:440,boxShadow:"0 24px 64px rgba(15,23,42,.22)",padding:24,boxSizing:"border-box",color:"#1e293b"}}
        >
          <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:12}}>
            <div aria-hidden="true" style={{width:42,height:42,borderRadius:12,background:"#fff1ed",color:"#d9482d",fontWeight:900,fontSize:21,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>!</div>
            <h3 id={`fv-delete-title-${stopId}`} style={{fontSize:19,fontWeight:800,margin:0}}>Remove document?</h3>
          </div>
          <p id={`fv-delete-description-${stopId}`} style={{fontSize:14,lineHeight:1.6,color:"#64748b",margin:"0 0 8px"}}>
            This will remove the document from this Field Visit. A recovery copy is retained.
          </p>
          <p style={{fontSize:13,fontWeight:750,overflowWrap:"anywhere",margin:"0 0 20px"}}>{pendingDelete.original_name}</p>
          <div style={{display:"flex",justifyContent:"flex-end",gap:10,flexWrap:"wrap"}}>
            <button type="button" autoFocus disabled={working} onClick={()=>setPendingDelete(null)} style={{...button,padding:"11px 17px",fontSize:13,borderRadius:10}}>Cancel</button>
            <button type="button" disabled={working} onClick={()=>removeFile(pendingDelete.document_id)} style={{...button,border:"1px solid #d9482d",background:"#d9482d",color:"#fff",padding:"11px 17px",fontSize:13,borderRadius:10,opacity:working?.6:1}}>
              {working?"Removing...":"Remove Document"}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>;
}
