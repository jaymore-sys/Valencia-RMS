'use strict';
const CAP=9, START='2026-09-01';
const num=v=>Number(v||0);
const round=v=>Math.round(v*100)/100;
const yearOf=s=>Number(String(s).slice(0,4));
function allocation(row) {
  const days=Number(row.total_days), start=String(row.start_date), end=String(row.end_date);
  if(!Number.isFinite(days)||days<0||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start) throw new Error('Invalid privileged leave record: '+(row.leave_id||'new'));
  const a=yearOf(start), b=yearOf(end);
  if(a===b) return [{year:a,days}];
  const counts=new Map(), calendarCounts=new Map(); let sum=0, calendarSum=0;
  const d=new Date(start+'T00:00:00Z'), stop=new Date(end+'T00:00:00Z');
  if(!Number.isFinite(+d)||!Number.isFinite(+stop)||b-a>10) throw new Error('Invalid cross-year privileged leave date range');
  for(;d<=stop;d.setUTCDate(d.getUTCDate()+1)){const y=d.getUTCFullYear();calendarCounts.set(y,(calendarCounts.get(y)||0)+1);calendarSum++;if(d.getUTCDay()!==0){counts.set(y,(counts.get(y)||0)+1);sum++;}}
  if(calendarSum===days)return [...calendarCounts].map(([year,days])=>({year,days}));
  if(sum!==days) throw new Error('Cross-year privileged leave days require reconciliation: '+(row.leave_id||'new'));
  return [...counts].map(([year,days])=>({year,days}));
}
function accrued(y,today){
  const cy=yearOf(today), month=Number(today.slice(5,7)), day=Number(today.slice(8,10));
  if(y<2026||y>cy)return 0;
  const first=y===2026?9:1;
  const last=y<cy?12:(today<'2026-12-01'?11:month-(day<new Date(Date.UTC(cy,month,0)).getUTCDate()?1:0));
  return Math.max(0,last-first+1)*1.5;
}
function ledger(rows,extra,today,requestedYear, candidate=null){
  const cy=yearOf(today), target=Number(requestedYear);
  if(!Number.isInteger(target)||target>cy+10)throw new Error('Invalid privileged leave year');
  if(target<2026)return {earned:0,used:0,pending:0,available:0,carry_in:0,carry_cap:CAP,future_approved:0,future_pending:0,overcommitted:0,allowed:false};
  if(!Number.isFinite(Number(extra)))throw new Error('Invalid privileged leave adjustment');
  const map=new Map();
  for(const r of rows){
    if(!['approved','pending'].includes(r.status)||r.revert_status==='approved')continue;
    for(const x of allocation(r)){
      if(x.year<2026)continue;
      const v=map.get(x.year)||{used:0,pending:0};v[r.status==='approved'?'used':'pending']+=x.days;map.set(x.year,v);
    }
  }
  const horizon=Math.max(cy,target,...map.keys());
  if(horizon>cy+10)throw new Error('Future privileged leave exceeds reconciliation horizon');
  function simulate(add=[], through=horizon){
    let regular=0, grant=Math.max(0,Number(extra)), debt=Math.max(0,-Number(extra)), result=new Map();
    for(let y=2026;y<=through;y++){
      regular=Math.min(CAP,regular);const carry=regular;
      regular+=accrued(y,today);
      // Outstanding historical commitments cannot disappear at a year boundary.
      let paid=Math.min(regular,debt);regular-=paid;debt-=paid;paid=Math.min(grant,debt);grant-=paid;debt-=paid;
      const opening=regular+grant;
      const u=map.get(y)||{used:0,pending:0};
      let spend=u.used+u.pending+add.filter(x=>x.year===y).reduce((a,x)=>a+x.days,0);
      paid=Math.min(regular,spend);regular-=paid;spend-=paid;paid=Math.min(grant,spend);grant-=paid;spend-=paid;debt+=spend;
      result.set(y,{opening,carry,regular,grant,debt,used:u.used,pending:u.pending});
    }
    return result;
  }
  const base=simulate();
  const viewYear=Math.min(cy,target), v=base.get(viewYear);
  let used=v.used,pending=v.pending,futureUsed=0,futurePending=0;
  if(target>=cy)for(const [y,u] of map)if(y>cy){futureUsed+=u.used;futurePending+=u.pending;}
  used+=futureUsed;pending+=futurePending;
  const fits=add=>{const sim=simulate(add,Math.max(horizon,...add.map(x=>x.year)));return [...sim].filter(([y])=>y>=cy).every(([,x])=>x.debt<1e-8);};
  let available=0;
  if(target<cy)available=Math.max(0,v.opening-v.used-v.pending);
  else if(fits([])){
    // Monotonic capacity: all other reservations remain in the ledger.
    let lo=0,hi=Math.floor(Math.max(0,v.opening-used-pending)*100+1e-8);
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(fits([{year:target,days:mid/100}]))lo=mid;else hi=mid-1;}available=lo/100;
  }
  const overcommitted=Math.max(0,...[...base].filter(([y])=>y>=cy).map(([,x])=>x.debt));
  const requested=candidate?allocation(candidate):null;
  return {earned:round(v.opening),used:round(used),pending:round(pending),available:round(available),carry_in:round(v.carry),carry_cap:CAP,future_approved:round(futureUsed),future_pending:round(futurePending),overcommitted:round(overcommitted),allowed:requested?fits(requested):undefined};
}
async function load(db,employeeId,excludeLeaveId,today,year,candidate=null){
 const args=[employeeId,START];if(excludeLeaveId)args.push(excludeLeaveId);
 const [rows]=await db.query(`SELECT leave_id, DATE_FORMAT(start_date,'%Y-%m-%d') AS start_date, DATE_FORMAT(end_date,'%Y-%m-%d') AS end_date, total_days, status, COALESCE(revert_status,'none') AS revert_status FROM leave_applications WHERE employee_id=? AND leave_type='mandatory' AND start_date>=? AND status IN ('approved','pending') AND COALESCE(revert_status,'none')<>'approved' ${excludeLeaveId?'AND leave_id<>?':''}`,args);
 const [grants]=await db.query("SELECT COALESCE(SUM(adjustment_days),0) AS extra_days FROM employee_leave_adjustments WHERE employee_id=? AND leave_type='mandatory'",[employeeId]);
 return ledger(rows,num(grants[0]?.extra_days),today,year,candidate);
}
async function lock(conn,id){const key='valencia:pl:'+Number(id);if(!Number.isSafeInteger(Number(id))||Number(id)<=0)throw new Error('Invalid employee for leave lock');const [r]=await conn.query('SELECT GET_LOCK(?, 10) AS acquired',[key]);if(Number(r[0]?.acquired)!==1)throw new Error('Leave balance is busy. Please retry.');return key;}
async function unlock(conn,key){if(!key)return;try{const [r]=await conn.query('SELECT RELEASE_LOCK(?) AS released',[key]);if(Number(r[0]?.released)!==1)throw new Error('Leave lock release failed');}catch(e){conn.destroy();throw e;}}
module.exports={ledger,allocation,accrued,load,lock,unlock};
