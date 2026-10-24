"use strict";
// Valencia RMS Field Visit stop reports and private document handling.
// FIELD_VISIT_UPLOAD_DIR must be an absolute, persistent directory OUTSIDE the app checkout.
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const multer = require("multer");
const db = require("../config/db");
const authMiddleware = require("../middleware/authmiddleware");
const router = express.Router();
router.use(authMiddleware);

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ACTIVE_PER_STOP = 5;
const allowed = new Map([
  [".pdf", "application/pdf"], [".png", "image/png"],
  [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
]);

function safeRoot() {
  const setting = String(process.env.FIELD_VISIT_UPLOAD_DIR || "").trim();
  if (!setting || !path.isAbsolute(setting)) return null;
  const root = path.resolve(setting);
  const working = path.resolve(process.cwd());
  const repositoryRoot = path.basename(working).toLowerCase() === "backend" ? path.dirname(working) : working;
  // Never store uploaded documents within the application code/deployment.
  if (root === repositoryRoot || root.startsWith(repositoryRoot + path.sep)) return null;
  try {
    const realRoot = fs.realpathSync(root);
    const realRepo = fs.realpathSync(repositoryRoot);
    if (realRoot === realRepo || realRoot.startsWith(realRepo + path.sep)) return null;
  } catch (_) { /* Missing storage path will be created on first upload. */ }
  return root;
}

function locationFor(root, key) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid stored object key");
  return path.join(root, "files", key.slice(0, 2), key);
}
function tempFor(root, key) {
  return path.join(root, "incoming", key);
}
function errorResponse(res, err) {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({success:false, message:err.code === "LIMIT_FILE_SIZE" ? "The document must be 10 MB or smaller." : ("Invalid upload: " + err.code)});
  }
  console.error("Field visit document operation failed:", err);
  return res.status(500).json({success:false,message:"Could not process the Field Visit document."});
}
async function accessForStop(req, stopId) {
  if (!Number.isSafeInteger(stopId) || stopId < 1) return null;
  const [rows] = await db.query(`SELECT s.stop_id, s.visit_id, s.location, s.description, s.conclusion, s.remark,
      v.employee_id, v.status, u.department_id AS owner_department
    FROM field_visit_stops s
    JOIN employee_field_visits v ON v.visit_id = s.visit_id
    JOIN users u ON u.user_id = v.employee_id
    WHERE s.stop_id = ? LIMIT 1`, [stopId]);
  if (!rows.length) return null;
  const stop = rows[0];
  const role = String(req.user?.role_name || "").toLowerCase();
  const owner = Number(stop.employee_id) === Number(req.user?.user_id);
  const reviewer = role === "superadmin" || ((role === "admin" || role === "administrator") &&
    Number(req.user.department_id) > 0 && Number(stop.owner_department) === Number(req.user.department_id));
  if (!owner && !reviewer) return {forbidden:true};
  return {...stop, canModify:owner};
}
async function accessForVisit(req, visitId) {
  const [rows] = await db.query("SELECT visit_id, employee_id FROM employee_field_visits WHERE visit_id = ? LIMIT 1",[visitId]);
  if (!rows.length) return null;
  return {owner:Number(rows[0].employee_id) === Number(req.user?.user_id)};
}

// Atomic post-submission updates across all locations, preserving IDs and approval state.
router.patch("/visits/:visitId/report",async(req,res)=>{
  const visitId=Number(req.params.visitId);
  if(!Number.isSafeInteger(visitId)||visitId<1 || !req.body ||
     Object.keys(req.body).some(k=>k!=="visit_stops") || !Array.isArray(req.body.visit_stops))
    return res.status(400).json({success:false,message:"Only visit location reports can be edited."});
  let connection;
  try {
    const own=await accessForVisit(req,visitId);
    if(!own)return res.status(404).json({success:false,message:"Visit not found."});
    if(!own.owner)return res.status(403).json({success:false,message:"Only the submitter can edit this report."});
    connection=await db.getConnection();await connection.beginTransaction();
    const [oldRows]=await connection.query(`SELECT s.stop_id,s.sequence_no,s.description,s.conclusion,s.remark,v.status
       FROM field_visit_stops s JOIN employee_field_visits v ON v.visit_id=s.visit_id
       WHERE s.visit_id=? ORDER BY s.sequence_no,s.stop_id FOR UPDATE`,[visitId]);
    const provided=req.body.visit_stops;
    if(!oldRows.length||provided.length!==oldRows.length){await connection.rollback();return res.status(400).json({success:false,message:"All existing locations must be included. Locations are locked."});}
    let changed=0;
    for(let i=0;i<oldRows.length;i++){
      const old=oldRows[i], row=provided[i];
      if(!row || Object.keys(row).some(k=>!["stop_id","description","conclusion","remark"].includes(k)) || Number(row.stop_id)!==Number(old.stop_id)){
        await connection.rollback();return res.status(400).json({success:false,message:"Locations and other visit details cannot be changed."});
      }
      for(const key of ["description","conclusion","remark"]){
        if(typeof row[key]!=="string"||row[key].length>30000){await connection.rollback();return res.status(400).json({success:false,message:`Invalid ${key}.`});}
      }
      const desc=row.description.trim(),conc=row.conclusion.trim(),remark=row.remark.trim();
      if(!desc){await connection.rollback();return res.status(400).json({success:false,message:"Every location needs a description."});}
      if(desc===String(old.description||"") && conc===String(old.conclusion||"") && remark===String(old.remark||""))continue;
      changed++;
      await connection.query(`UPDATE field_visit_stops SET description=?,conclusion=?,remark=?,
         needs_review=IF(?='approved',1,needs_review),updated_at=NOW() WHERE stop_id=?`,
         [desc,conc||null,remark||null,old.status,old.stop_id]);
      await connection.query(`INSERT INTO field_visit_stop_edit_history
        (visit_id,stop_id,edited_by,visit_status,old_description,new_description,old_conclusion,new_conclusion,old_remark,new_remark)
        VALUES(?,?,?,?,?,?,?,?,?,?)`,[visitId,old.stop_id,req.user.user_id,old.status,old.description,desc,old.conclusion,conc,old.remark,remark]);
    }
    const first=provided[0];
    await connection.query(`UPDATE employee_field_visits SET comment=?,conclusion=?,remark=?,updated_at=NOW() WHERE visit_id=?`,
      [first.description.trim(),first.conclusion.trim()||null,first.remark.trim()||null,visitId]);
    await connection.commit();
    return res.json({success:true,message:changed ? "Location reports updated; original visit details and approval status retained." : "No changes needed.",updated:changed});
  }catch(err){if(connection)await connection.rollback().catch(()=>{});return errorResponse(res,err);}
  finally{if(connection)connection.release();}
});

// Restrict edits to ONLY Description / Conclusion / Remark. All other details stay locked.
router.patch("/visits/:visitId/stops/:stopId", async (req,res) => {
  const visitId = Number(req.params.visitId), stopId = Number(req.params.stopId);
  if (!Number.isSafeInteger(visitId) || !Number.isSafeInteger(stopId)) return res.status(400).json({success:false,message:"Invalid visit or location."});
  const keys = Object.keys(req.body || {});
  if (!keys.length || keys.some(k=>!["description","conclusion","remark"].includes(k)))
    return res.status(400).json({success:false,message:"Only description, conclusion and remark can be edited."});
  const values = {};
  for (const key of ["description","conclusion","remark"]) {
    if (Object.prototype.hasOwnProperty.call(req.body,key)) {
      if (typeof req.body[key] !== "string" || req.body[key].length > 30000)
        return res.status(400).json({success:false,message:`Invalid ${key}.`});
      values[key] = req.body[key].trim();
    }
  }
  let connection;
  try {
    const visit = await accessForVisit(req, visitId);
    if (!visit) return res.status(404).json({success:false,message:"Visit not found."});
    if (!visit.owner) return res.status(403).json({success:false,message:"Only the person who submitted this visit can edit its report."});
    connection = await db.getConnection(); await connection.beginTransaction();
    const [rows] = await connection.query(`SELECT s.stop_id,s.visit_id,s.sequence_no,s.description,s.conclusion,s.remark,v.status
        FROM field_visit_stops s JOIN employee_field_visits v ON s.visit_id=v.visit_id
        WHERE s.stop_id=? AND s.visit_id=? FOR UPDATE`, [stopId,visitId]);
    if (!rows.length) {await connection.rollback();return res.status(404).json({success:false,message:"Visit location not found."});}
    const old=rows[0];
    const next={description:values.description??old.description??"",conclusion:values.conclusion??old.conclusion??"",remark:values.remark??old.remark??""};
    if (!next.description.trim()) {await connection.rollback();return res.status(400).json({success:false,message:"Description cannot be blank."});}
    if (Object.keys(next).every(k=>next[k]===String(old[k]??""))) {await connection.rollback();return res.json({success:true,message:"No changes needed."});}
    await connection.query(`UPDATE field_visit_stops SET description=?,conclusion=?,remark=?,
        needs_review=IF(?='approved',1,needs_review),updated_at=NOW() WHERE stop_id=?`,
        [next.description,next.conclusion||null,next.remark||null,old.status,stopId]);
    await connection.query(`INSERT INTO field_visit_stop_edit_history
      (visit_id,stop_id,edited_by,visit_status,old_description,new_description,old_conclusion,new_conclusion,old_remark,new_remark)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,[visitId,stopId,req.user.user_id,old.status,old.description,next.description,old.conclusion,next.conclusion,old.remark,next.remark]);
    // Mirror first stop in legacy columns for attendance and existing email summaries.
    if (Number(old.sequence_no)===1) await connection.query(`UPDATE employee_field_visits SET comment=?,conclusion=?,remark=?,updated_at=NOW() WHERE visit_id=?`,
      [next.description,next.conclusion||null,next.remark||null,visitId]);
    await connection.commit();
    return res.json({success:true,message:"Location details saved.",needs_review:old.status==="approved"});
  } catch(err) {if(connection) await connection.rollback().catch(()=>{});return errorResponse(res,err);}
  finally {if(connection) connection.release();}
});

const storage = multer.diskStorage({
  destination:(req,file,cb)=>{
    const root=safeRoot();if(!root)return cb(new Error("STORAGE_NOT_CONFIGURED"));
    fs.mkdir(path.join(root,"incoming"),{recursive:true,mode:0o700},err=>cb(err,path.join(root,"incoming")));
  },
  filename:(req,file,cb)=>cb(null,crypto.randomUUID()),
});
const upload = multer({storage,limits:{fileSize:MAX_BYTES,files:1,fields:0,parts:4},fileFilter:(req,file,cb)=>{
  const ext=path.extname(file.originalname||"").toLowerCase();
  if(!allowed.has(ext))return cb(new Error("FILE_TYPE_NOT_ALLOWED"));
  cb(null,true);
}}).single("file");
function uploadMiddleware(req,res,next){
  if (!safeRoot()) return res.status(503).json({success:false,message:"Private document storage is not configured. Contact RMS IT."});
  upload(req,res,err=>{
    if (!err) return next();
    if (err instanceof multer.MulterError) return errorResponse(res,err);
    if(err.message==="FILE_TYPE_NOT_ALLOWED") return res.status(400).json({success:false,message:"Upload PDF, JPG, PNG, DOCX or XLSX documents only."});
    return errorResponse(res,err);
  });
}
async function matchesSignature(filePath, ext) {
  const fh=await fsp.open(filePath,"r");
  try {
    const buf=Buffer.alloc(16);const {bytesRead}=await fh.read(buf,0,16,0);
    const b=buf.subarray(0,bytesRead);
    if(ext===".pdf") return b.subarray(0,5).toString()==="%PDF-";
    if(ext===".png") return b.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex"));
    if(ext===".jpg"||ext===".jpeg") return b.subarray(0,3).equals(Buffer.from("ffd8ff","hex"));
    if(ext===".docx"||ext===".xlsx") return b.subarray(0,4).equals(Buffer.from("504b0304","hex"));
    return false;
  } finally {await fh.close();}
}
const presentDoc = row=>({document_id:row.document_id,original_name:row.original_name,file_size:row.file_size,
  uploaded_by:row.uploaded_by,created_at:row.created_at});

router.get("/stops/:stopId/documents",async(req,res)=>{
  try{
    const access=await accessForStop(req,Number(req.params.stopId));
    if(!access)return res.status(404).json({success:false,message:"Location not found."});
    if(access.forbidden)return res.status(403).json({success:false,message:"Access denied."});
    const [rows]=await db.query(`SELECT document_id,original_name,file_size,uploaded_by,created_at
      FROM field_visit_stop_documents WHERE stop_id=? AND deleted_at IS NULL ORDER BY created_at DESC,document_id DESC`,[access.stop_id]);
    return res.json({success:true,documents:rows.map(presentDoc),can_modify:access.canModify,storage_enabled:!!safeRoot()});
  }catch(err){return errorResponse(res,err);}
});
router.post("/stops/:stopId/documents",async(req,res,next)=>{
  try {
    const access=await accessForStop(req,Number(req.params.stopId));
    if(!access)return res.status(404).json({success:false,message:"Location not found."});
    if(!access.canModify)return res.status(403).json({success:false,message:"Only the visit submitter can upload documents."});
    req.visitStopAccess=access;return next();
  }catch(err){return errorResponse(res,err);}
},uploadMiddleware,async(req,res)=>{
  const root=safeRoot();let moved=null;
  try {
    if(!req.file)return res.status(400).json({success:false,message:"Select a document."});
    const ext=path.extname(req.file.originalname).toLowerCase();
    if(!(await matchesSignature(req.file.path,ext)))return res.status(400).json({success:false,message:"The file content does not match its extension."});
    const [counts]=await db.query(`SELECT COUNT(*) AS total FROM field_visit_stop_documents
      WHERE stop_id=? AND deleted_at IS NULL`,[req.visitStopAccess.stop_id]);
    if(Number(counts[0].total)>=MAX_ACTIVE_PER_STOP)return res.status(409).json({success:false,message:"Maximum 5 active documents per location. Remove one first."});
    const [historyCount]=await db.query("SELECT COUNT(*) AS total FROM field_visit_stop_documents WHERE stop_id=?",[req.visitStopAccess.stop_id]);
    if(Number(historyCount[0].total)>=25)return res.status(409).json({success:false,message:"This location reached its 25-document lifetime storage limit. Contact RMS IT to archive old versions."});
    const key=crypto.randomUUID();moved=locationFor(root,key);
    await fsp.mkdir(path.dirname(moved),{recursive:true,mode:0o700});
    await fsp.rename(req.file.path,moved);
    const hash=crypto.createHash("sha256");
    await new Promise((resolve,reject)=>{const stream=fs.createReadStream(moved);stream.on("data",chunk=>hash.update(chunk));stream.on("end",resolve);stream.on("error",reject);});
    const filename=path.basename(String(req.file.originalname).replace(/[\r\n]/g," ")).slice(0,255);
    const [result]=await db.query(`INSERT INTO field_visit_stop_documents
      (visit_id,stop_id,original_name,storage_key,mime_type,file_size,sha256,uploaded_by)
      VALUES (?,?,?,?,?,?,?,?)`,[req.visitStopAccess.visit_id,req.visitStopAccess.stop_id,filename,key,allowed.get(ext),req.file.size,hash.digest("hex"),req.user.user_id]);
    if(String(req.visitStopAccess.status).toLowerCase()==="approved") await db.query("UPDATE field_visit_stops SET needs_review=1 WHERE stop_id=?",[req.visitStopAccess.stop_id]);
    return res.status(201).json({success:true,message:"Document saved.",document_id:result.insertId});
  }catch(err){if(moved)await fsp.unlink(moved).catch(()=>{});return errorResponse(res,err);}
  finally{if(req.file?.path)await fsp.unlink(req.file.path).catch(()=>{});}
});
// Atomic replacement: retain old version for recovery, even when 5 active files exist.
router.post("/documents/:documentId/replace",async(req,res,next)=>{
  try{
    const id=Number(req.params.documentId);
    if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({success:false,message:"Invalid document."});
    const [rows]=await db.query("SELECT * FROM field_visit_stop_documents WHERE document_id=? AND deleted_at IS NULL LIMIT 1",[id]);
    if(!rows.length)return res.status(404).json({success:false,message:"Document not found."});
    const access=await accessForStop(req,Number(rows[0].stop_id));
    if(!access||!access.canModify)return res.status(403).json({success:false,message:"Only the submitter can replace this document."});
    req.visitStopAccess=access;req.replaceDocument=rows[0];return next();
  }catch(err){return errorResponse(res,err);}
},uploadMiddleware,async(req,res)=>{
  const root=safeRoot();let moved=null,connection;
  try{
    if(!req.file)return res.status(400).json({success:false,message:"Select a replacement file."});
    const ext=path.extname(req.file.originalname).toLowerCase();
    if(!(await matchesSignature(req.file.path,ext)))return res.status(400).json({success:false,message:"File content does not match extension."});
    const key=crypto.randomUUID();moved=locationFor(root,key);
    await fsp.mkdir(path.dirname(moved),{recursive:true,mode:0o700});await fsp.rename(req.file.path,moved);
    const hash=crypto.createHash("sha256");
    await new Promise((resolve,reject)=>{const stream=fs.createReadStream(moved);stream.on("data",chunk=>hash.update(chunk));stream.on("end",resolve);stream.on("error",reject);});
    connection=await db.getConnection();await connection.beginTransaction();
    const [oldRows]=await connection.query("SELECT * FROM field_visit_stop_documents WHERE document_id=? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",[req.replaceDocument.document_id]);
    if(!oldRows.length){await connection.rollback();return res.status(409).json({success:false,message:"This document was already changed. Refresh the list."});}
    const [count]=await connection.query("SELECT COUNT(*) AS total FROM field_visit_stop_documents WHERE stop_id=?",[req.visitStopAccess.stop_id]);
    if(Number(count[0].total)>=25){await connection.rollback();return res.status(409).json({success:false,message:"Storage history limit reached. Contact RMS IT."});}
    const filename=path.basename(String(req.file.originalname).replace(/[\r\n]/g," ")).slice(0,255);
    await connection.query("UPDATE field_visit_stop_documents SET deleted_at=NOW(),deleted_by=? WHERE document_id=?",[req.user.user_id,req.replaceDocument.document_id]);
    await connection.query(`INSERT INTO field_visit_stop_documents
     (visit_id,stop_id,original_name,storage_key,mime_type,file_size,sha256,uploaded_by,replaces_document_id)
     VALUES (?,?,?,?,?,?,?,?,?)`,[req.visitStopAccess.visit_id,req.visitStopAccess.stop_id,filename,key,allowed.get(ext),req.file.size,hash.digest("hex"),req.user.user_id,req.replaceDocument.document_id]);
    if(String(req.visitStopAccess.status).toLowerCase()==="approved") await connection.query("UPDATE field_visit_stops SET needs_review=1 WHERE stop_id=?",[req.visitStopAccess.stop_id]);
    await connection.commit();return res.json({success:true,message:"Document replaced. Previous version retained."});
  }catch(err){if(connection)await connection.rollback().catch(()=>{});if(moved)await fsp.unlink(moved).catch(()=>{});return errorResponse(res,err);}
  finally{if(connection)connection.release();if(req.file?.path)await fsp.unlink(req.file.path).catch(()=>{});}
});

router.get("/documents/:documentId/download",async(req,res)=>{
  try{
    const id=Number(req.params.documentId);if(!Number.isSafeInteger(id))return res.status(400).json({success:false,message:"Invalid document."});
    const [rows]=await db.query(`SELECT * FROM field_visit_stop_documents WHERE document_id=? AND deleted_at IS NULL LIMIT 1`,[id]);
    if(!rows.length)return res.status(404).json({success:false,message:"Document not found."});
    const doc=rows[0],access=await accessForStop(req,Number(doc.stop_id));
    if(!access||access.forbidden)return res.status(403).json({success:false,message:"Access denied."});
    const root=safeRoot();if(!root)return res.status(503).json({success:false,message:"Private document storage is not configured."});
    const file=locationFor(root,doc.storage_key);
    const stat=await fsp.stat(file).catch(()=>null);
    if(!stat||!stat.isFile())return res.status(404).json({success:false,message:"Stored document is unavailable. Contact RMS IT."});
    res.setHeader("Content-Type",doc.mime_type || "application/octet-stream");
    res.setHeader("Content-Length",stat.size);
    res.setHeader("Cache-Control","private, no-store");
    res.setHeader("Content-Disposition",`attachment; filename="field-visit-document-${id}${path.extname(doc.original_name)}"`);
    return fs.createReadStream(file).on("error",err=>{console.error("Document stream error",err);res.destroy(err);}).pipe(res);
  }catch(err){return errorResponse(res,err);}
});
router.delete("/documents/:documentId",async(req,res)=>{
  try{
    const id=Number(req.params.documentId);if(!Number.isSafeInteger(id))return res.status(400).json({success:false,message:"Invalid document."});
    const [rows]=await db.query(`SELECT * FROM field_visit_stop_documents WHERE document_id=? AND deleted_at IS NULL LIMIT 1`,[id]);
    if(!rows.length)return res.status(404).json({success:false,message:"Document not found."});
    const access=await accessForStop(req,Number(rows[0].stop_id));
    if(!access||!access.canModify)return res.status(403).json({success:false,message:"Only the submitter can delete this document."});
    await db.query(`UPDATE field_visit_stop_documents SET deleted_at=NOW(),deleted_by=? WHERE document_id=? AND deleted_at IS NULL`,[req.user.user_id,id]);
    if(String(access.status).toLowerCase()==="approved") await db.query("UPDATE field_visit_stops SET needs_review=1 WHERE stop_id=?",[access.stop_id]);
    return res.json({success:true,message:"Document removed from the visit. File retained for recovery under company policy."});
  }catch(err){return errorResponse(res,err);}
});
module.exports=router;
