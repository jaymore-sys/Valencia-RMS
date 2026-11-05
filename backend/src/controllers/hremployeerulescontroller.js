// Copy to backend/src/controllers/hremployeerulescontroller.js
const db = require('../config/db');
const authorized = req => String(req.user?.email||'').trim().toLowerCase() === 'rathika.haleangadi@valencianutrition.com';
const fail = (res, message, code=400) => res.status(code).json({success:false,message});
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value||'')) && !Number.isNaN(Date.parse(value+'T00:00:00Z'));
const time = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''));
exports.list = async (req,res) => {
  if(!authorized(req)) return fail(res,'Forbidden',403);
  try {
    const [rules] = await db.query(`SELECT r.*,DATE_FORMAT(r.effective_from,'%Y-%m-%d') start_date,
      DATE_FORMAT(r.effective_to,'%Y-%m-%d') end_date,u.full_name employee_name,
      creator.full_name created_by_name FROM hr_employee_attendance_rules r
      JOIN users u ON u.user_id=r.employee_id
      LEFT JOIN users creator ON creator.user_id=r.created_by
      ORDER BY r.is_active DESC,r.id DESC LIMIT 500`);
    return res.json({success:true,rules});
  }catch(e){console.error('HR rules read',e);return fail(res,'Unable to load HR rules',500)}
};
exports.create = async (req,res) => {
  if(!authorized(req)) return fail(res,'Forbidden',403);
  const b=req.body||{}, employeeId=Number(b.employee_id),actor=Number(req.user?.user_id);
  const kind=String(b.rule_type||''), start=String(b.effective_from||''),end=String(b.effective_to||'');
  const reason=String(b.reason||'').trim(),grace=Number(b.grace_minutes||0);
  if(!Number.isInteger(employeeId)||employeeId<1||!Number.isInteger(actor)||actor<1)return fail(res,'Invalid employee or HR user');
  if(!['late_exempt','part_time','wfh'].includes(kind))return fail(res,'Choose a valid rule');
  if(!date(start)||!date(end)||end<start)return fail(res,'Choose a valid date range');
  if(!reason||reason.length>500)return fail(res,'HR reason is required (up to 500 characters)');
  if(!Number.isInteger(grace)||grace<0||grace>180)return fail(res,'Invalid grace period');
  const shiftStart=kind==='part_time'?String(b.shift_start||''):null;
  const shiftEnd=kind==='part_time'?String(b.shift_end||''):null;
  if(kind==='part_time'&&(!time(shiftStart)||!time(shiftEnd)||shiftEnd<=shiftStart))return fail(res,'Valid same-day shift start and end required');
  let conn;
  try{
    conn=await db.getConnection();await conn.beginTransaction();
    const [users]=await conn.query("SELECT user_id FROM users WHERE user_id=? AND LOWER(COALESCE(status,'active'))='active' FOR UPDATE",[employeeId]);
    if(!users.length){await conn.rollback();return fail(res,'Employee not active',404)}
    const [overlap]=await conn.query(`SELECT id FROM hr_employee_attendance_rules WHERE employee_id=? AND rule_type=?
      AND is_active=1 AND effective_from<=? AND effective_to>=? FOR UPDATE`,[employeeId,kind,end,start]);
    if(overlap.length){await conn.rollback();return fail(res,'An active rule of this type overlaps these dates. Deactivate it before creating a replacement.',409)}
    const [r]=await conn.query(`INSERT INTO hr_employee_attendance_rules
      (employee_id,rule_type,effective_from,effective_to,shift_start,shift_end,grace_minutes,reason,created_by)
      VALUES (?,?,?,?,?,?,?,?,?)`,[employeeId,kind,start,end,shiftStart,shiftEnd,grace,reason,actor]);
    await conn.commit();return res.status(201).json({success:true,id:r.insertId});
  }catch(e){if(conn)await conn.rollback();console.error('HR rules create',e);return fail(res,'Unable to save rule',500)}
  finally{if(conn)conn.release()}
};
exports.deactivate = async (req,res) => {
  if(!authorized(req))return fail(res,'Forbidden',403);
  const id=Number(req.params.id),actor=Number(req.user?.user_id);
  if(!Number.isInteger(id)||id<1)return fail(res,'Invalid rule ID');
  try{const [r]=await db.query(`UPDATE hr_employee_attendance_rules
    SET is_active=0,deactivated_by=?,deactivated_at=NOW() WHERE id=? AND is_active=1`,[actor,id]);
    return r.affectedRows?res.json({success:true}):fail(res,'Rule already inactive or missing',404)
  }catch(e){console.error('HR rules deactivate',e);return fail(res,'Unable to deactivate rule',500)}
};
