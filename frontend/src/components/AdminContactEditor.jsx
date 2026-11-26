import {useState,useRef,useEffect} from 'react';
import {createPortal} from 'react-dom';
import {Edit3,X} from 'lucide-react';
import api from '../api/axios';
import './AdminContactEditor.css';
export default function AdminContactEditor({person,url,onSaved}){
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[phone,setPhone]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const dialog=useRef(null),trigger=useRef(null);
 const start=()=>{setName(person.full_name||'');setPhone(person.phone||'');setError('');setOpen(true)};
 useEffect(()=>{if(open&&dialog.current&&!dialog.current.open)dialog.current.showModal()},[open]);
 const close=()=>{if(busy)return;setOpen(false);requestAnimationFrame(()=>trigger.current?.focus())};
 async function submit(e){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const {data}=await api.patch(url,{full_name:name,phone});onSaved?.({full_name:data.full_name,phone:data.phone});setOpen(false);requestAnimationFrame(()=>trigger.current?.focus())}catch(e){setError(e.response?.data?.message||'Could not save profile')}finally{setBusy(false)}}
 return <><button ref={trigger} type="button" className="rms-contact-trigger" onClick={start}><Edit3 size={16}/> Edit Profile</button>{open&&createPortal(<dialog ref={dialog} className="rms-contact-dialog" aria-labelledby="rms-contact-title" onCancel={e=>{e.preventDefault();close()}}><form onSubmit={submit}><header className="rms-contact-header"><div><h2 id="rms-contact-title">Edit Profile</h2><p>Update your contact details.</p></div><button type="button" aria-label="Close" className="rms-contact-close" onClick={close} disabled={busy}><X size={20}/></button></header><label>Full name<input autoFocus required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><label>Phone number<input type="tel" maxLength={20} value={phone} onChange={e=>setPhone(e.target.value)}/></label>{error&&<p role="alert" className="rms-contact-error">{error}</p>}<footer><button type="button" className="rms-contact-cancel" disabled={busy} onClick={close}>Cancel</button><button type="submit" className="rms-contact-save" disabled={busy}>{busy?'Saving...':'Save Changes'}</button></footer></form></dialog>,document.body)}</>;
}
