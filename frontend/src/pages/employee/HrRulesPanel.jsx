import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, House, ShieldCheck, Settings2, Clock3, RefreshCw } from 'lucide-react';
import api from '../../api/axios';
import './HrRulesPanel.css';

const ARRANGEMENTS = [
  {value:'wfh',name:'Work From Home',icon:House,mode:'present_wfh'},
  {value:'part_time',name:'Part-Time Shift',icon:Clock3,mode:'shift'},
  {value:'flexible',name:'Flexible Hours',icon:CalendarClock,mode:'shift'},
  {value:'late_exempt',name:'Late Exemption',icon:ShieldCheck,mode:'exception'},
  {value:'custom',name:'Custom Arrangement',icon:Settings2,mode:'shift'},
];
const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const ymd=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const blank=()=>({employee_id:'',rule_type:'wfh',arrangement_name:'',attendance_mode:'present_wfh',
 weekdays_mask:64,shift_start:'',shift_end:'',grace_minutes:0,ignore_late:false,ignore_early:false,
 credit_mode:'full',effective_from:ymd(),effective_to:'',reason:'',temporary:false});
const timeLabel=t=>{if(!t)return '—';const [h,m]=String(t).split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`};
export default function HrRulesPanel({users=[]}){
 const [form,setForm]=useState(blank);const [rules,setRules]=useState([]);
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false);
 const [feedback,setFeedback]=useState(''),[tab,setTab]=useState('configure');
 const [disableTarget,setDisableTarget]=useState(null),[disableReason,setDisableReason]=useState(''),[disabling,setDisabling]=useState(false);
 const set=(k,v)=>setForm(old=>({...old,[k]:v}));
 const chosen=useMemo(()=>users.find(u=>Number(u.user_id)===Number(form.employee_id)),[users,form.employee_id]);
 const visibleDays=DAYS.filter((_,d)=>(Number(form.weekdays_mask)&(1<<d))!==0);
 async function reload(){try{setLoading(true);const r=await api.get('/hr-attendance/rules-v4');setRules(r.data.rules||[]);setFeedback('');}catch(e){setFeedback(e.response?.data?.message||'Unable to load HR Rules.');}finally{setLoading(false);}}
 useEffect(()=>{reload()},[]);
 function arrangement(t){const choice=ARRANGEMENTS.find(a=>a.value===t);setForm(p=>({...p,rule_type:t,attendance_mode:choice.mode,
 arrangement_name:t==='custom'?p.arrangement_name:'',weekdays_mask:t==='wfh'?64:126,
 shift_start:t==='part_time'?'17:00':t==='flexible'?'11:30':p.shift_start||'11:00',
 shift_end:t==='part_time'?'19:30':t==='flexible'?'17:30':p.shift_end||'19:00'}));}
 async function save(e){e.preventDefault();if(!form.employee_id||!form.reason.trim()||!Number(form.weekdays_mask))return setFeedback('Choose an employee, days and HR reason.');
  if(form.temporary&&!form.effective_to)return setFeedback('Select the temporary end date.');
  if(['part_time','flexible'].includes(form.rule_type)||(form.rule_type==='custom'&&form.attendance_mode==='shift')){
   if(!form.shift_start||!form.shift_end||form.shift_start>=form.shift_end)return setFeedback('Check-in must be before check-out.');
  }
  setSaving(true);setFeedback('');try{await api.post('/hr-attendance/rules-v4',{...form,effective_to:form.temporary?form.effective_to:null});
   setFeedback('Saved. The rule applies from its effective date.');setForm(blank());await reload();setTab('history');
  }catch(err){setFeedback(err.response?.data?.message||'Could not save the rule.');}finally{setSaving(false)}
 }
 function requestDisable(rule){setDisableTarget(rule);setDisableReason('');}
 async function confirmDisable(){if(!disableTarget||!disableReason.trim()||disabling)return;
  try{setDisabling(true);await api.patch(`/hr-attendance/rules-v4/${disableTarget.id}/disable`,{reason:disableReason.trim()});
    setDisableTarget(null);setDisableReason('');await reload();}
  catch(e){setFeedback(e.response?.data?.message||'Unable to disable rule.');}
  finally{setDisabling(false);}
 }
 return <section className="vhr-rules">
   <header className="vhr-rules-header"><div><h2>Employee Attendance Rules</h2><p>Configure once. Recurring arrangements stay active until HR disables them.</p></div>
   <div className="vhr-rules-switch"><button className={tab==='configure'?'active':''} onClick={()=>setTab('configure')}>Configure</button><button className={tab==='history'?'active':''} onClick={()=>setTab('history')}>Active rules & history</button></div></header>
   {feedback&&<div className="vhr-feedback" role="status">{feedback}</div>}
   {disableTarget&&<div className="vhr-modal-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!disabling)setDisableTarget(null)}}><div className="vhr-modal" role="dialog" aria-modal="true" aria-labelledby="vhr-disable-title"><div className="vhr-modal-title"><h3 id="vhr-disable-title">Disable attendance rule</h3><button type="button" aria-label="Close dialog" onClick={()=>setDisableTarget(null)} disabled={disabling}>×</button></div><p>This will stop this arrangement. Existing saved attendance and biometric punches will not change.</p><div className="vhr-modal-rule"><strong>{disableTarget.employee_name}</strong><span>{disableTarget.arrangement_name||ARRANGEMENTS.find(a=>a.value===disableTarget.rule_type)?.name||disableTarget.rule_type}</span></div><label>Reason for disabling *<textarea rows={3} maxLength={500} autoFocus value={disableReason} onChange={e=>setDisableReason(e.target.value)} placeholder="Enter HR reason..." /></label><div className="vhr-modal-actions"><button type="button" onClick={()=>setDisableTarget(null)} disabled={disabling}>Cancel</button><button type="button" className="danger" onClick={confirmDisable} disabled={disabling||!disableReason.trim()}>{disabling?'Disabling…':'Disable rule'}</button></div></div></div>}
   {tab==='configure'?<form onSubmit={save} className="vhr-rule-form">
     <div className="vhr-form-section"><h3>1. Employee</h3><label>Choose employee<select required value={form.employee_id} onChange={e=>set('employee_id',e.target.value)}><option value="">Select employee</option>{users.map(u=><option key={u.user_id} value={u.user_id}>{u.full_name} · {u.employee_code||'No code'}</option>)}</select></label></div>
     <div className="vhr-form-section"><h3>2. Attendance arrangement</h3><div className="vhr-types">{ARRANGEMENTS.map(a=><button key={a.value} type="button" aria-pressed={form.rule_type===a.value} className={form.rule_type===a.value?'selected':''} onClick={()=>arrangement(a.value)}><a.icon size={20}/><span>{a.name}</span></button>)}</div>
     {form.rule_type==='custom'&&<label>Arrangement name<input maxLength={120} required value={form.arrangement_name} onChange={e=>set('arrangement_name',e.target.value)} placeholder="e.g. Special working schedule"/></label>}</div>
     <div className="vhr-form-section"><h3>3. Working days and timing</h3><div className="vhr-days">{DAYS.map((d,i)=><button key={i} type="button" className={(form.weekdays_mask&(1<<i))?'selected':''} aria-pressed={!!(form.weekdays_mask&(1<<i))} onClick={()=>set('weekdays_mask',form.weekdays_mask^(1<<i))}>{d}</button>)}</div>
     {form.rule_type!=='wfh'&&form.rule_type!=='late_exempt'&&<div className="vhr-fields-two"><label>Approved check-in<input type="time" value={form.shift_start} onChange={e=>set('shift_start',e.target.value)} required/></label><label>Approved check-out<input type="time" value={form.shift_end} onChange={e=>set('shift_end',e.target.value)} required/></label></div>}
     {form.rule_type==='custom'&&<label>Attendance method<select value={form.attendance_mode} onChange={e=>set('attendance_mode',e.target.value)}><option value="shift">Evaluate approved shift</option><option value="present_wfh">Present · WFH without office punches</option><option value="exception">Timing exception</option></select></label>}
     {form.rule_type!=='wfh'&&form.rule_type!=='late_exempt'&&<label className="vhr-grace">Timing grace (minutes, applies to check-in and check-out)<input type="number" min="0" max="180" step="1" value={form.grace_minutes} onChange={e=>set('grace_minutes',Number(e.target.value)||0)}/></label>}
     {form.rule_type!=='wfh'&&<div className="vhr-exemptions"><label><input type="checkbox" checked={!!form.ignore_late} onChange={e=>set('ignore_late',e.target.checked)}/> Ignore Late within this arrangement</label><label><input type="checkbox" checked={!!form.ignore_early} onChange={e=>set('ignore_early',e.target.checked)}/> Ignore Early Out within this arrangement</label></div>}
     <p className="vhr-help">Existing biometric values stay unchanged. Sundays and public holidays remain protected.</p></div>
     <div className="vhr-form-section"><h3>4. Validity</h3><div className="vhr-validity"><label><input type="radio" name="vhr-validity" checked={!form.temporary} onChange={()=>set('temporary',false)}/> Ongoing until HR disables</label><label><input type="radio" name="vhr-validity" checked={form.temporary} onChange={()=>set('temporary',true)}/> Temporary</label></div><div className="vhr-fields-two"><label>Effective from<input type="date" required value={form.effective_from} onChange={e=>set('effective_from',e.target.value)}/></label>{form.temporary&&<label>Effective to<input type="date" min={form.effective_from} required value={form.effective_to} onChange={e=>set('effective_to',e.target.value)}/></label>}</div></div>
     <div className="vhr-form-section"><h3>5. HR approval</h3><label>HR reason<textarea rows={2} maxLength={500} required placeholder="Why is this arrangement approved?" value={form.reason} onChange={e=>set('reason',e.target.value)}/></label>
      <div className="vhr-preview"><strong>Attendance preview</strong><p>{chosen?.full_name||'Select an employee'} · {ARRANGEMENTS.find(a=>a.value===form.rule_type)?.name}</p><p>{visibleDays.join(', ')||'No days selected'} {form.rule_type==='wfh'||form.attendance_mode==='present_wfh'?'· Present (WFH)':`· ${timeLabel(form.shift_start)}–${timeLabel(form.shift_end)} · ${Number(form.grace_minutes)||0} min grace`}</p><small>{form.temporary?'Temporary arrangement':'Ongoing until disabled by HR'} · No fabricated biometric times</small></div>
      <div className="vhr-actions"><button type="button" onClick={()=>setForm(blank())}>Reset</button><button type="submit" disabled={saving}>{saving?'Saving…':'Save HR Rule'}</button></div></div>
   </form>:<div className="vhr-history"><div className="vhr-history-header"><h3>Rules & history</h3><button onClick={reload} type="button"><RefreshCw size={16}/> Refresh</button></div><p className="vhr-help">Every row is a saved rule. For overlapping active arrangements, disable the obsolete rule; history is retained.</p>{loading?<p>Loading…</p>:!rules.length?<p>No rules saved yet.</p>:rules.map(r=><article key={r.id} className="vhr-history-card"><div><strong>{r.employee_name}</strong><span className={r.is_active?'vhr-active':'vhr-disabled'}>{r.is_active?'Active':'Disabled'}</span></div><p>{r.arrangement_name||ARRANGEMENTS.find(a=>a.value===r.rule_type)?.name||r.rule_type}</p><small>{DAYS.filter((_,i)=>r.weekdays_mask&(1<<i)).join(', ')} · {r.shift_start&&r.shift_end?`${timeLabel(r.shift_start)}–${timeLabel(r.shift_end)}`:'WFH / exception'} · {r.effective_from} to {r.effective_to||'Ongoing'}</small><p>{r.reason}</p>{!!r.is_active&&<button type="button" onClick={()=>requestDisable(r)}>Disable rule</button>}</article>)}</div>}
 </section>
}
