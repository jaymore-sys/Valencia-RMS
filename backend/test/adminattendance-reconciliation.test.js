const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const admin = {user_id: 101, role_name: 'admin', department_id: 5, joining_date: '2026-01-01', status: 'active'};
const employee = {user_id: 102, role_name: 'employee', department_id: 5, joining_date: '2026-01-01', status: 'active'};
const attendance = [
  {attendance_id: 1, employee_id: 101, attendance_date: '2026-11-14', status: 'present', check_in_time: '10:56:00', check_out_time: '19:11:00', total_minutes: 495, remarks: 'Original punch'},
  {attendance_id: 2, employee_id: 101, attendance_date: '2026-11-23', status: 'present', check_in_time: '09:46:00', check_out_time: '09:46:00', total_minutes: 0},
  {attendance_id: 3, employee_id: 102, attendance_date: '2026-11-14', status: 'present', check_in_time: '11:15:00', check_out_time: '19:30:00', total_minutes: 495},
];
const leaves = [
  {leave_id: 1, employee_id: 101, leave_type: 'casual', start_date: '2026-11-16', end_date: '2026-11-16', duration_type: 'full_day', status: 'approved'},
  {leave_id: 2, employee_id: 101, leave_type: 'mandatory', start_date: '2026-11-17', end_date: '2026-11-18', duration_type: 'full_day', status: 'approved'},
  {leave_id: 3, employee_id: 101, leave_type: 'sick', start_date: '2026-11-19', end_date: '2026-11-20', duration_type: 'full_day', status: 'approved'},
  {leave_id: 4, employee_id: 102, leave_type: 'casual', start_date: '2026-11-16', end_date: '2026-11-16', duration_type: 'full_day', status: 'approved', revert_status: 'approved'},
];
const rules = [{id: 1, employee_id: 101, rule_type: 'wfh', attendance_mode: 'present_wfh', start_date: '2026-11-21', end_date: '2026-11-21', weekdays_mask: 64, reason: 'WFH'}];
function setup({pendingVisits = [], members = [], extraAttendance = []} = {}) {
  const actual = [...attendance, ...extraAttendance];
  const db = { async query(sql, args = []) {
    const q = sql.replace(/\s+/g, ' ').trim();
    assert.match(q, /^(SELECT|SHOW)\b/i, 'read-only query expected');
    const scoped = (rows) => rows.filter(row => args.includes(row.employee_id));
    if (q.includes('FROM users u') && q.includes('WHERE u.user_id = ?')) return [[admin]];
    if (q.includes('FROM users u') && q.includes('employee_ud.user_id = u.user_id')) return [[admin, employee]];
    if (q.includes('AS start_date') && q.includes('AS end_date') && q.includes('MIN(attendance_date)')) return [[{start_date:'2026-11-14',end_date:'2026-11-23'}]];
    if (q.includes('AS first_date') && q.includes('AS last_date')) return [[{first_date:'2026-11-14',last_date:'2026-11-23'}]];
    if (q.includes('AS first_attendance_date')) return [[{employee_id:101,first_attendance_date:'2026-11-14'}, {employee_id:102,first_attendance_date:'2026-11-14'}]];
    if (q.includes('FROM attendance a') || (q.includes('FROM attendance') && q.includes('employee_id IN'))) return [scoped(actual)];
    if (q.includes('FROM leave_applications la') && q.includes("LOWER(TRIM(la.status)) = 'approved'")) {
      assert.match(q, /COALESCE\(la\.revert_status, 'none'\) <> 'approved'/);
      return [scoped(leaves).filter(l => l.revert_status !== 'approved')];
    }
    if (q.includes('FROM leave_applications la')) return [scoped(leaves)];
    if (q.includes('FROM hr_employee_attendance_rules')) return [scoped(rules)];
    if (q.includes('FROM employee_field_visits fv') && q.includes("WHERE LOWER(fv.status) = 'approved'")) return [[]];
    if (q.includes('FROM employee_field_visits fv')) return [[]];
    if (q.includes('FROM employee_field_visits') && q.includes("LOWER(TRIM(status))='pending'")) return [pendingVisits];
    if (q.startsWith('SHOW COLUMNS FROM field_visit_members')) return [[{Field:'visit_id'},{Field:'employee_id'}]];
    if (q.includes('FROM field_visit_members')) return [members];
    throw new Error('Unexpected mock query: ' + q.slice(0,200));
  }};
  const load = (filename, dependencies) => {
    const mod = {exports:{}};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'src/controllers', filename), 'utf8'), {
      module: mod, exports: mod.exports, console, process, Buffer,
      require: name => {
        if (Object.hasOwn(dependencies,name)) return dependencies[name];
        if (name === 'crypto') return require('crypto');
        throw new Error('Unexpected require: ' + name);
      },
    }, {filename});
    return mod.exports;
  };
  const hr = load('hrattendancecontroller.js', {
    '../config/db':db, 'csv-parse/sync':{}, xlsx:{}, '../utils/leavepolicy':{}, '../utils/privilegedledger':require('../src/utils/privilegedledger'), './employeeleavecontroller':{}, '../utils/hrattendanceaccess':{},
  });
  const controller = load('adminattendancecontroller.js', {'../config/db':db,'../utils/emailservice':{},'./hrattendancecontroller':hr});
  return {controller,hr};
}
async function getAdminResult(controller) {
  let status=200, body;
  const response = {status(code){status=code;return this;},json(value){body=value;return this;}};
  await controller.getDepartmentAttendance({user:{user_id:101}},response);
  assert.equal(status,200,JSON.stringify(body));
  return body;
}
function findDate(summary,date) {return summary.records.find(row=>row.attendance_date===date);}
test('Admin route reconciles five approved leave days and one WFH day',async()=>{
  const {controller}=setup();
  const body=await getAdminResult(controller), my=body.my_attendance;
  assert.equal(my.total,8);assert.equal(my.leave,5);assert.equal(my.present,3);assert.equal(my.absent,0);
  for(const [day,label] of [[16,'Casual Leave'],[17,'Privileged Leave'],[18,'Privileged Leave'],[19,'Sick Leave'],[20,'Sick Leave']]) {
    const row=findDate(my,`2026-11-${day}`);assert.equal(row.status,label);assert.equal(row.attendance_id,null);assert.equal(row.check_in_time,'-');assert.equal(row.is_missing_date,false);
  }
  const wfh=findDate(my,'2026-11-21');assert.equal(wfh.status,'Present');assert.match(wfh.remarks,/Work From Home/);assert.equal(wfh.check_in_time,'-');assert.equal(wfh.total_minutes,0);
  const original=findDate(my,'2026-11-14');assert.equal(original.status,'Present');assert.equal(original.working_hours,'8h 15m');assert.equal(original.remarks,'Original punch');
  assert.equal(findDate(my,'2026-11-15'),undefined);assert.equal(findDate(my,'2026-11-22'),undefined);
  const team=body.employee_summary[0];assert.equal(team.user_id,102);assert.equal(findDate(team,'2026-11-16').status,'Absent');assert.equal(findDate(team,'2026-11-21').status,'Absent');assert.equal(findDate(team,'2026-11-14').status,'Late');
});
test('Pending cross-department field visit blocks WFH credit; no invented punch or leave',async()=>{
  const pendingVisits=[{visit_id:99,employee_id:999,visit_date:'2026-11-21',end_date:'2026-11-21',status:'pending',duration_type:'full_day'}];
  const {controller,hr}=setup({pendingVisits,members:[{visit_id:99,employee_id:101}]});
  const scoped=await hr.getScopedHrAttendanceRecords([admin],'2026-11-21','2026-11-21');
  assert.equal(scoped.length,1);assert.equal(scoped[0].source,'pending_field_visit');assert.equal(scoped[0].user_id,101);
  const result=await getAdminResult(controller);
  assert.equal(findDate(result.my_attendance,'2026-11-21').status,'Absent'); // Existing Admin pending behavior is outside this targeted fix.
});
test('Approved leave with conflicting biometric punches does not overwrite the original Admin record',async()=>{
  const {controller}=setup({extraAttendance:[{attendance_id:10,employee_id:101,attendance_date:'2026-11-19',status:'present',check_in_time:'10:55:00',check_out_time:'19:30:00',total_minutes:515}]});
  const result=await getAdminResult(controller), row=findDate(result.my_attendance,'2026-11-19');
  assert.equal(row.attendance_id,10);assert.equal(row.status,'Present');assert.equal(row.check_in_time,'10:55:00');assert.equal(row.total_minutes,515);
});
test('Admin monthly totals recognize specific leave labels',()=>{
  const source=fs.readFileSync(path.join(root,'../frontend/src/pages/admin/adminAttendance.jsx'),'utf8');
  const start=source.indexOf('const monthOfAttendanceDate =');const end=source.indexOf('const AdminAttendance =',start);
  assert.ok(start>=0&&end>start);
  const context={};vm.runInNewContext(source.slice(start,end)+'\nthis.monthlyAttendance=monthlyAttendance;',context);
  const rows=[{attendance_date:'2026-11-16',status:'Casual Leave'},{attendance_date:'2026-11-17',status:'Privileged Leave'},{attendance_date:'2026-11-18',status:'Half Day Leave'},{attendance_date:'2026-11-19',status:'Sick Leave'},{attendance_date:'2026-11-21',status:'Present'},{attendance_date:'2026-10-31',status:'Absent'}];
  const result=context.monthlyAttendance({records:rows},'2026-11');assert.equal(result.leave,4);assert.equal(result.present,1);assert.equal(result.absent,0);assert.equal(result.total,5);
});
