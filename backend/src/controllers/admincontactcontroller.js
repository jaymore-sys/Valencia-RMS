const db=require('../config/db');
const id=req=>Number(req.user?.user_id||req.user?.id||req.user?.userId||req.user?.uid||0);
const teamCondition=`
 EXISTS (SELECT 1 FROM roles ar WHERE ar.role_id=a.role_id AND LOWER(ar.role_name)='admin')
 AND EXISTS (SELECT 1 FROM roles er WHERE er.role_id=u.role_id AND LOWER(er.role_name)='employee')
 AND EXISTS (SELECT 1 FROM departments d WHERE
 (d.department_id=a.department_id OR EXISTS(SELECT 1 FROM user_departments ad WHERE ad.user_id=a.user_id AND ad.department_id=d.department_id))
 AND (d.department_id=u.department_id OR EXISTS(SELECT 1 FROM user_departments ed WHERE ed.user_id=u.user_id AND ed.department_id=d.department_id)))`;
async function save(req,res,self){
 try{
 const actor=id(req),target=self?actor:Number(req.params.userId);
 if(!Number.isSafeInteger(actor)||actor<=0||!Number.isSafeInteger(target)||target<=0)return res.status(400).json({message:'Invalid account'});
 const body=req.body||{};
 if(Object.keys(body).some(k=>!['full_name','phone'].includes(k))||typeof body.full_name!=='string'||typeof body.phone!=='string')return res.status(400).json({message:'Only full name and phone may be edited'});
 const name=body.full_name.trim(),phone=body.phone.trim();
 if(!name||name.length>100||phone.length>20||(phone&&!/^[+0-9 ()-]+$/.test(phone)))return res.status(400).json({message:'Invalid name or phone'});
 const condition=self?"u.user_id=a.user_id AND EXISTS(SELECT 1 FROM roles r WHERE r.role_id=a.role_id AND LOWER(r.role_name)='admin')":teamCondition;
 const [rows]=await db.query('SELECT u.user_id FROM users u JOIN users a ON a.user_id=? WHERE u.user_id=? AND '+condition,[actor,target]);
 if(!rows.length)return res.status(403).json({message:'Profile editing is not permitted for this account'});
 await db.query('UPDATE users u JOIN users a ON a.user_id=? SET u.full_name=?,u.phone=? WHERE u.user_id=? AND '+condition,[actor,name,phone,target]);
 res.json({message:'Profile saved',full_name:name,phone});
 }catch(error){console.error('Contact update:',error);res.status(500).json({message:'Could not save profile'});}
}
module.exports={saveOwn:(req,res)=>save(req,res,true),saveEmployee:(req,res)=>save(req,res,false)};
