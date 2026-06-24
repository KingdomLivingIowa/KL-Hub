import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { getCached, setCached } from './dataCache';
import { useUser } from './UserContext';
import { ClientLevelProgress } from './LevelRequirements';
import klLogo from './kingdom-living-logo.jpg';
import ClientPayments from './ClientPayments';
import { sendHouseNotification, NOTIF_TYPES } from './notifications';

const PAGE_SIZE = 25;
const TIMELINE_PAGE_SIZE = 50;
const SUPABASE_URL = 'https://pmvxnetpbxuzkrxitioc.supabase.co';

function generateDischargePDF(stay, client, logoSrc, photoUrls = []) {
  const name = `${client.first_name || ''} ${client.last_name || ''}`.trim();
  const location = stay.house_name || '—';
  const startDate = stay.start_date ? new Date(stay.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) : '—';
  const dischargeDate = stay.discharge_date ? new Date(stay.discharge_date + 'T12:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) : '—';
  const completionDate = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  const balance = parseFloat(stay.balance_at_discharge) || 0;
  const balanceStr = balance > 0 ? `$${balance.toFixed(2)} owed` : balance < 0 ? `$${Math.abs(balance).toFixed(2)} credit` : '$0.00';
  const dischargeType = stay.discharge_type || '';
  const uaResult = stay.ua_at_discharge || '';
  const twoWeek = stay.two_week_notice || '';
  const reason = stay.discharge_reason || '—';
  const notes = stay.discharge_notes || '';
  const completedBy = stay.discharged_by || '—';
  const notAllowedBack = stay.not_allowed_back || false;
  const needsReview = stay.needs_review_before_readmit || false;

  const row = (label, value, highlight = '') => `
    <tr>
      <td style="font-weight:bold;padding:10px 14px;border:1px solid #ccc;width:160px;vertical-align:top;">${label}</td>
      <td style="padding:10px 14px;border:1px solid #ccc;${highlight}">${value}</td>
    </tr>`;

  const choiceRow = (label, options, selected) => {
    const opts = options.map(o => `<span style="margin-right:24px;">${o === selected ? `<span style="background:#ffd700;color:#000;padding:1px 6px;border-radius:3px;">${o}</span>` : `<span style="color:#999;">${o}</span>`}</span>`).join('');
    return row(label, `<span style="font-size:13px;">${opts}</span>`);
  };

  const logoHtml = logoSrc
    ? `<img src="${logoSrc}" style="width:70px;height:70px;object-fit:contain;" />`
    : `<div style="width:70px;height:70px;border:2px solid #8b1c1c;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;color:#8b1c1c;">KL</div>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Discharge Sheet – ${name}</title>
  <style>
    @media print { body { margin: 0; } .no-print { display: none; } }
    body { font-family: Arial, sans-serif; margin: 40px; color: #000; }
    .header { display: flex; align-items: center; gap: 20px; margin-bottom: 8px; }
    .org-name { font-size: 22px; font-weight: bold; }
    .org-sub { font-size: 13px; color: #555; }
    hr { border: none; border-top: 1px solid #999; margin: 14px 0 20px 0; }
    h2 { text-align: center; font-size: 18px; margin: 0 0 20px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .print-btn { position: fixed; top: 16px; right: 16px; padding: 10px 20px; background: #8b1c1c; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
  </style></head><body>
  <button class="no-print print-btn" onclick="window.print()">⬇ Print / Save PDF</button>
  <div class="header">
    ${logoHtml}
    <div>
      <div class="org-name">KINGDOM LIVING IOWA</div>
      <div class="org-sub">Non-Profit Recovery Community</div>
    </div>
  </div>
  <hr/>
  <h2>Discharge Sheet</h2>
  <table>
    ${row('Name:', name)}
    ${row('Location:', location)}
    ${row('Start Date:', startDate)}
    ${row('Date of Discharge:', dischargeDate)}
    ${choiceRow('Type of Discharge:', ['Complete', 'Incomplete'], dischargeType)}
    ${row('Reason for Discharge:', reason, 'line-height:1.6;')}
    ${notes ? row('Notes:', notes, 'line-height:1.6;color:#333;') : ''}
    ${choiceRow('UA:', ['Positive', 'Negative', 'N/A'], uaResult)}
    ${choiceRow('Did client give two-week notice?', ['Yes', 'No'], twoWeek)}
    ${row('Completed by:', completedBy)}
    ${row('Date of Completion:', completionDate)}
    ${row('Final Balance:', balanceStr, balance > 0 ? 'color:#b22222;font-weight:bold;' : '')}
    ${notAllowedBack ? row('🚫 Not Allowed Back:', 'Yes', 'color:#b22222;font-weight:bold;') : ''}
    ${needsReview ? row('⚠️ Needs Review Before Re-admitting:', 'Yes', 'color:#d97706;font-weight:bold;') : ''}
  </table>
  ${photoUrls?.length ? `
    <h3 style="margin:28px 0 12px;font-size:15px;">Discharge Photos</h3>
    <div style="display:flex;flex-wrap:wrap;gap:12px;">
      ${photoUrls.map(url => `<img src="${url}" style="width:200px;height:150px;object-fit:cover;border-radius:6px;border:1px solid #ccc;" />`).join('')}
    </div>` : ''
  }
  </body></html>`;

  const win = window.open('', '_blank', 'width=800,height=900');
  win.document.write(html);
  win.document.close();
}

function generateProgressReportPDF(client, uaRecords, meetingRecords, choreRecords, stays, checkIn, logoSrc) {
  const name = client.full_name || '—';
  const logoHtml = logoSrc ? `<img src="${logoSrc}" style="width:70px;height:70px;object-fit:contain;" />` : `<div style="width:70px;height:70px;border:2px solid #8b1c1c;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;color:#8b1c1c;">KL</div>`;
  const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
  const today = new Date();
  const generatedDate = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Sober days
  const soberDays = client.sober_date ? Math.floor((today - new Date(client.sober_date + 'T12:00:00')) / (1000*60*60*24)) : null;

  // Days in program
  const daysInProgram = client.start_date ? Math.floor((today - new Date(client.start_date + 'T12:00:00')) / (1000*60*60*24)) : null;

  // Meeting stats (last 4 weeks)
  const fourWeeksAgo = new Date(today); fourWeeksAgo.setDate(today.getDate() - 28);
  const recentMeetings = meetingRecords.filter(m => new Date(m.created_at) >= fourWeeksAgo);
  const totalMeetings = meetingRecords.length;

  // UA stats
  const totalUAs = uaRecords.length;
  const negUAs = uaRecords.filter(u => u.event_name === 'Negative').length;
  const posUAs = uaRecords.filter(u => u.event_name === 'Positive').length;
  const lastUA = uaRecords[0];

  // Chore stats (last 4 weeks)
  const recentChores = choreRecords.filter(c => new Date(c.created_at) >= fourWeeksAgo);
  const choreCompleted = recentChores.filter(c => c.event_name === 'Completed').length;
  const choreMissed = recentChores.filter(c => c.event_name === 'Not Completed').length;

  // Latest weekly check-in
  const fmtCheckInDate = checkIn?.created_at ? new Date(checkIn.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  const section = (title) => `<div style="font-size:13px;font-weight:700;color:#b22222;text-transform:uppercase;letter-spacing:0.08em;margin:24px 0 10px;border-left:4px solid #b22222;padding-left:10px;">${title}</div>`;
  const row = (label, value, highlight = '') => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;"><span style="font-size:14px;color:#555;">${label}</span><span style="font-size:14px;font-weight:600;color:${highlight || '#111'};">${value}</span></div>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Progress Report – ${name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; color: #111; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; align-items: center; gap: 20px; margin-bottom: 8px; }
    .org-name { font-size: 24px; font-weight: 700; }
    .org-sub { font-size: 13px; color: #888; margin-top: 2px; }
    .divider { height: 3px; background: #b22222; margin: 14px 0; }
    .report-title { font-size: 20px; font-weight: 700; color: #b22222; margin-bottom: 4px; }
    .report-sub { font-size: 13px; color: #888; margin-bottom: 20px; }
    .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 8px; }
    .stat-box { background: #f5f5f5; border-radius: 8px; padding: 14px; text-align: center; }
    .stat-num { font-size: 28px; font-weight: 700; color: #111; }
    .stat-label { font-size: 12px; color: #888; margin-top: 4px; }
    .checkin-box { background: #f5f5f5; border-radius: 8px; padding: 14px; margin-top: 8px; }
    .print-btn { position: fixed; top: 16px; right: 16px; padding: 10px 20px; background: #8b1c1c; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
    @media print { .print-btn { display: none; } body { padding: 20px; } }
  </style></head><body>
  <button class="print-btn" onclick="window.print()">⬇ Print / Save PDF</button>
  <div class="header">${logoHtml}<div><div class="org-name">KINGDOM LIVING IOWA</div><div class="org-sub">Non-Profit Recovery Community</div></div></div>
  <div class="divider"></div>
  <div class="report-title">Client Progress Report</div>
  <div class="report-sub">Generated ${generatedDate}</div>

  ${section('Client Information')}
  ${row('Name', name)}
  ${row('House', client.house_name || '—')}
  ${row('Status', client.status || '—')}
  ${row('Level', client.level ? `Level ${client.level}` : '—')}
  ${row('Move-In Date', fmtDate(client.start_date))}
  ${daysInProgram !== null ? row('Days in Program', `${daysInProgram} days`) : ''}
  ${row('PO Name', client.po_name || '—')}
  ${row('Recovery Meetings', client.recovery_meetings || '—')}

  ${section('Recovery')}
  ${row('Recovery Date', fmtDate(client.sober_date))}
  ${soberDays !== null ? row('Days in Recovery', `${soberDays} days`, soberDays >= 90 ? '#16a34a' : '#b45309') : ''}

  ${section('UA History')}
  <div class="stat-grid">
    <div class="stat-box"><div class="stat-num">${totalUAs}</div><div class="stat-label">Total UAs</div></div>
    <div class="stat-box"><div class="stat-num" style="color:#16a34a;">${negUAs}</div><div class="stat-label">Negative</div></div>
    <div class="stat-box"><div class="stat-num" style="color:${posUAs > 0 ? '#dc2626' : '#16a34a'};">${posUAs}</div><div class="stat-label">Positive</div></div>
  </div>
  ${lastUA ? row('Most Recent UA', `${lastUA.event_name} — ${new Date(lastUA.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, lastUA.event_name === 'Negative' ? '#16a34a' : '#dc2626') : row('Most Recent UA', 'No UAs on record')}

  ${section('Meeting Attendance')}
  <div class="stat-grid">
    <div class="stat-box"><div class="stat-num">${totalMeetings}</div><div class="stat-label">Total Meetings</div></div>
    <div class="stat-box"><div class="stat-num">${recentMeetings.length}</div><div class="stat-label">Last 4 Weeks</div></div>
    <div class="stat-box"><div class="stat-num" style="color:${recentMeetings.length >= 16 ? '#16a34a' : recentMeetings.length >= 8 ? '#b45309' : '#dc2626'};">${Math.round(recentMeetings.length / 4 * 10) / 10}</div><div class="stat-label">Avg / Week</div></div>
  </div>

  ${section('Chore Compliance (Last 4 Weeks)')}
  <div class="stat-grid">
    <div class="stat-box"><div class="stat-num">${recentChores.length}</div><div class="stat-label">Total Chores</div></div>
    <div class="stat-box"><div class="stat-num" style="color:#16a34a;">${choreCompleted}</div><div class="stat-label">Completed</div></div>
    <div class="stat-box"><div class="stat-num" style="color:${choreMissed > 0 ? '#dc2626' : '#16a34a'};">${choreMissed}</div><div class="stat-label">Missed</div></div>
  </div>

  ${section('Latest Weekly Check-In')}
  ${!checkIn ? '<p style="color:#888;font-size:14px;padding:8px 0;">No weekly check-ins on record.</p>' : `
  <div class="checkin-box">
    <div style="font-size:12px;color:#b22222;font-weight:600;margin-bottom:10px;">Submitted ${fmtCheckInDate}${checkIn.author ? ` by ${checkIn.author}` : ''}</div>
    ${checkIn.checkin_meetings != null ? row('Meetings attended', checkIn.checkin_meetings) : ''}
    ${checkIn.checkin_sponsor_contacts != null ? row('Sponsor contacts', checkIn.checkin_sponsor_contacts) : ''}
    ${checkIn.checkin_chore ? row('Assigned chore', checkIn.checkin_chore) : ''}
    ${checkIn.checkin_chore_completed != null ? row('Chore completed', checkIn.checkin_chore_completed ? 'Yes ✓' : 'No ✗', checkIn.checkin_chore_completed ? '#16a34a' : '#dc2626') : ''}
    ${checkIn.checkin_employed != null ? row('Employed', checkIn.checkin_employed ? 'Yes' : 'No') : ''}
    ${checkIn.checkin_employer ? row('Employer', checkIn.checkin_employer) : ''}
    ${checkIn.checkin_payment_plan ? row('Payment plan', checkIn.checkin_payment_plan) : ''}
    ${checkIn.notes ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #ddd;"><div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Weekly reflection</div><div style="font-size:14px;color:#333;line-height:1.6;">${checkIn.notes}</div></div>` : ''}
  </div>`}

  <div style="margin-top:32px;text-align:center;color:#aaa;font-size:12px;">Kingdom Living Iowa · Non-Profit Recovery Community<br>Generated ${generatedDate}</div>
  </body></html>`;

  const win = window.open('', '_blank', 'width=800,height=1000');
  win.document.write(html);
  win.document.close();
}

function generateUAHistoryPDF(client, uaRecords, logoSrc) {
  const name = client.full_name || '—';
  const logoHtml = logoSrc ? `<img src="${logoSrc}" style="width:70px;height:70px;object-fit:contain;" />` : `<div style="width:70px;height:70px;border:2px solid #8b1c1c;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;color:#8b1c1c;">KL</div>`;
  const generatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const negCount = uaRecords.filter(u => u.event_name === 'Negative').length;
  const posCount = uaRecords.filter(u => u.event_name === 'Positive').length;
  const incCount = uaRecords.filter(u => u.event_name === 'Inconclusive').length;
  const refCount = uaRecords.filter(u => u.event_name === 'Refused').length;

  const resultColor = (r) => r === 'Negative' ? '#16a34a' : r === 'Positive' ? '#dc2626' : r === 'Inconclusive' ? '#b45309' : '#888';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>UA History – ${name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; color: #111; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; align-items: center; gap: 20px; margin-bottom: 8px; }
    .org-name { font-size: 24px; font-weight: 700; }
    .org-sub { font-size: 13px; color: #888; margin-top: 2px; }
    .divider { height: 3px; background: #b22222; margin: 14px 0; }
    .report-title { font-size: 20px; font-weight: 700; color: #b22222; margin-bottom: 4px; }
    .report-sub { font-size: 13px; color: #888; margin-bottom: 20px; }
    .summary { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 24px; }
    .sum-box { background: #f5f5f5; border-radius: 8px; padding: 12px; text-align: center; }
    .sum-num { font-size: 26px; font-weight: 700; }
    .sum-label { font-size: 12px; color: #888; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { background: #111; color: #fff; padding: 10px 12px; text-align: left; font-size: 13px; }
    td { padding: 10px 12px; border-bottom: 1px solid #eee; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .result-badge { padding: 2px 10px; border-radius: 20px; font-size: 13px; font-weight: 600; color: #fff; display: inline-block; }
    .print-btn { position: fixed; top: 16px; right: 16px; padding: 10px 20px; background: #8b1c1c; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
    @media print { .print-btn { display: none; } body { padding: 20px; } }
  </style></head><body>
  <button class="print-btn" onclick="window.print()">⬇ Print / Save PDF</button>
  <div class="header">${logoHtml}<div><div class="org-name">KINGDOM LIVING IOWA</div><div class="org-sub">Non-Profit Recovery Community</div></div></div>
  <div class="divider"></div>
  <div class="report-title">UA History Report</div>
  <div class="report-sub">${name} &nbsp;·&nbsp; ${client.house_name || '—'} &nbsp;·&nbsp; Generated ${generatedDate}</div>

  <div class="summary">
    <div class="sum-box"><div class="sum-num">${uaRecords.length}</div><div class="sum-label">Total UAs</div></div>
    <div class="sum-box"><div class="sum-num" style="color:#16a34a;">${negCount}</div><div class="sum-label">Negative</div></div>
    <div class="sum-box"><div class="sum-num" style="color:${posCount > 0 ? '#dc2626' : '#16a34a'};">${posCount}</div><div class="sum-label">Positive</div></div>
    <div class="sum-box"><div class="sum-num" style="color:#888;">${incCount + refCount}</div><div class="sum-label">Inc. / Refused</div></div>
  </div>

  ${uaRecords.length === 0 ? '<p style="color:#888;font-size:14px;">No UA records on file.</p>' : `
  <table>
    <thead><tr><th>Date</th><th>Result</th><th>Administered By</th><th>Notes</th></tr></thead>
    <tbody>
      ${uaRecords.map(u => `<tr>
        <td>${fmtDate(u.created_at)}</td>
        <td><span class="result-badge" style="background:${resultColor(u.event_name)};">${u.event_name || '—'}</span></td>
        <td>${u.author || '—'}</td>
        <td style="color:#555;">${u.notes || '—'}</td>
      </tr>`).join('')}
    </tbody>
  </table>`}

  <div style="margin-top:32px;text-align:center;color:#aaa;font-size:12px;">Kingdom Living Iowa · Non-Profit Recovery Community<br>Generated ${generatedDate}</div>
  </body></html>`;

  const win = window.open('', '_blank', 'width=800,height=1000');
  win.document.write(html);
  win.document.close();
}

const LISTS = ['DOC Men', 'Community Men', 'Treatment Men', 'DOC Women', 'Community Women', 'Treatment Women'];

const STATUS_FLOW = {
  'Applied': ['Accepted', 'Waiting List', 'Pending', 'Active', 'Discharged', 'Denied', 'Archived'],
  'Accepted': ['Applied', 'Waiting List', 'Pending', 'Active', 'Discharged', 'Denied', 'Archived'],
  'Waiting List': ['Applied', 'Accepted', 'Pending', 'Active', 'Discharged', 'Denied', 'Archived'],
  'Pending': ['Applied', 'Accepted', 'Waiting List', 'Active', 'Discharged', 'Denied', 'Archived'],
  'Active': ['Applied', 'Accepted', 'Waiting List', 'Pending', 'Discharged', 'Denied', 'Archived'],
  'Discharged': ['Applied', 'Accepted', 'Waiting List', 'Pending', 'Active', 'Denied', 'Archived'],
  'Denied': ['Applied', 'Accepted', 'Waiting List', 'Pending', 'Active', 'Discharged', 'Archived'],
  'Archived': ['Applied', 'Accepted', 'Waiting List', 'Pending', 'Active', 'Discharged', 'Denied'],
};

const ENTRY_TYPES = ['UA', 'Crisis', 'Infraction', 'Meeting', 'Chores', 'Mood Check-In', 'Check-In', 'General Note', 'Jobs Applied For', 'Weekly Check-In'];

const PRIMARY_TABS = ['overview', 'payments', 'UAs', 'meetings', 'chores', 'medications', 'timeline'];
const MORE_TABS = ['stays', 'forms', 'application', 'documents', 'notes'];

const reverseGeocode = async (lat, lng) => {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
    const data = await res.json();
    if (data && data.display_name) {
      const a = data.address || {};
      const parts = [
        a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road,
        a.city || a.town || a.village,
        a.state,
      ].filter(Boolean);
      return parts.join(', ') || data.display_name;
    }
    return null;
  } catch { return null; }
};

const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatWeekLabel = (weekStart) => {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${weekStart.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
};

const groupByWeek = (entries) => {
  const weeks = {};
  entries.forEach((entry) => {
    const weekStart = getWeekStart(new Date(entry.created_at));
    const key = weekStart.toISOString();
    if (!weeks[key]) weeks[key] = { weekStart, entries: [] };
    weeks[key].entries.push(entry);
  });
  return Object.values(weeks).sort((a, b) => b.weekStart - a.weekStart);
};

// ── Invite to Portal Button ───────────────────────────────────────────────────
function InvitePortalButton({ client }) {
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const handleInvite = async (e) => {
    e.stopPropagation();
    if (status === 'sent') return;
    if (!window.confirm(`Send a portal invite to ${client.email}?`)) return;
    setStatus('sending');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ email: client.email }),
      });
      const result = await res.json();
      if (!res.ok) {
        // If account already exists, send a password reset instead
        if (result.error?.includes('already been registered') || result.error?.includes('already exists')) {
          const { data: { session } } = await supabase.auth.getSession();
          const resetRes = await fetch(`${SUPABASE_URL}/functions/v1/reset-portal-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ email: client.email }),
          });
          if (resetRes.ok) {
            setStatus('sent');
            setErrorMsg('Account exists — password reset email sent instead.');
            setTimeout(() => setErrorMsg(''), 5000);
          } else {
            setErrorMsg('Account exists. Ask the client to use Forgot Password on the portal.');
            setStatus('error');
            setTimeout(() => { setStatus('idle'); setErrorMsg(''); }, 6000);
          }
          return;
        }
        throw new Error(result.error || 'Invite failed');
      }
      setStatus('sent');
      // Save auth_user_id to clients table and add to house chat
      if (result.user?.id) {
        await supabase.from('clients').update({ auth_user_id: result.user.id }).eq('id', client.id);
        if (client.house_id) {
          setTimeout(async () => {
            const { data: conv } = await supabase.from('conversations').select('id').eq('house_id', client.house_id).maybeSingle();
            if (conv) {
              await supabase.from('conversation_members').upsert({
                conversation_id: conv.id, user_id: result.user.id, last_read_at: new Date().toISOString(),
              }, { onConflict: 'conversation_id,user_id' });
            }
          }, 2000);
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
      setStatus('error');
      setTimeout(() => { setStatus('idle'); setErrorMsg(''); }, 5000);
    }
  };
  const btnStyles = {
    idle:    { background: 'transparent', border: '1px solid #3a3a48', color: '#aaa' },
    sending: { background: 'transparent', border: '1px solid #3a3a48', color: '#aaa', opacity: 0.6 },
    sent:    { background: '#1e3a2f', border: '1px solid #1D9E75', color: '#4ade80' },
    error:   { background: '#3a1e1e', border: '1px solid #f87171', color: '#f87171' },
  };
  const btnLabel = { idle: '✉ Invite', sending: '...', sent: '✓ Sent', error: 'Error' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
      <button onClick={handleInvite} style={{ ...btnStyles[status], fontSize: '14px', padding: '5px 10px', borderRadius: '7px', cursor: status === 'sent' ? 'default' : 'pointer', fontWeight: '500', transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
        {btnLabel[status]}
      </button>
      {errorMsg && <p style={{ color: '#f87171', fontSize: '11px', margin: 0, maxWidth: '200px', textAlign: 'right' }}>{errorMsg}</p>}
    </div>
  );
}

// ── Move To Button ────────────────────────────────────────────────────────────
function MoveToButton({ client, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);
  const statuses = STATUS_FLOW[client.status] || [];
  if (!statuses.length) return null;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{ background: '#26262e', border: '1px solid #3a3a48', color: '#ddd', fontSize: '14px', padding: '5px 10px', borderRadius: '7px', cursor: 'pointer', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
        Move to {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#1c1c24', border: '1px solid #32323e', borderRadius: '10px', overflow: 'hidden', zIndex: 100, minWidth: '160px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          {statuses.map(ns => (
            <button key={ns} onClick={e => { e.stopPropagation(); setOpen(false); onSelect(ns); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'transparent', border: 'none', color: '#ddd', fontSize: '14px', cursor: 'pointer', borderBottom: '1px solid #2a2a2a' }}
              onMouseEnter={e => e.currentTarget.style.background = '#333'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {ns}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Move House Modal ──────────────────────────────────────────────────────────
function MoveHouseModal({ client, houses, onClose, onSuccess }) {
  const [toHouseId, setToHouseId] = useState('');
  const [moveDate, setMoveDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const eligibleHouses = houses.filter(h => h.id !== client.house_id);

  const handleMove = async () => {
    if (!toHouseId) { alert('Please select a destination house.'); return; }
    setSaving(true);
    try {
      const fromHouseName = client.house_name || 'Unknown house';
      const toHouse = houses.find(h => h.id === toHouseId);
      const toHouseName = toHouse?.name || 'Unknown house';

      // 1. Update client house_id
      const { error } = await supabase.from('clients').update({ house_id: toHouseId }).eq('id', client.id);
      if (error) throw error;

      // 2. Adjust occupied_beds on both houses
      const { data: fromHouseData } = await supabase.from('houses').select('occupied_beds').eq('id', client.house_id).single();
      if (fromHouseData) await supabase.from('houses').update({ occupied_beds: Math.max((fromHouseData.occupied_beds || 0) - 1, 0) }).eq('id', client.house_id);
      const { data: toHouseData } = await supabase.from('houses').select('occupied_beds').eq('id', toHouseId).single();
      if (toHouseData) await supabase.from('houses').update({ occupied_beds: (toHouseData.occupied_beds || 0) + 1 }).eq('id', toHouseId);

      // 3. Swap house chat membership
      if (client.email) {
        const { data: fromAuthUser } = await supabase.from('user_profiles').select('id').eq('email', client.email).maybeSingle();
        if (fromAuthUser?.id) {
          // Remove from old chat
          const { data: fromConv } = await supabase.from('conversations').select('id').eq('house_id', client.house_id).maybeSingle();
          if (fromConv) await supabase.from('conversation_members').delete().eq('conversation_id', fromConv.id).eq('user_id', fromAuthUser.id);
          // Add to new chat
          const { data: toConv } = await supabase.from('conversations').select('id').eq('house_id', toHouseId).maybeSingle();
          if (toConv) await supabase.from('conversation_members').upsert({ conversation_id: toConv.id, user_id: fromAuthUser.id, last_read_at: new Date().toISOString() }, { onConflict: 'conversation_id,user_id' });
        }
      }

      // 4. Log timeline entry
      const noteText = note.trim() ? ` — ${note.trim()}` : '';
      await supabase.from('client_timeline').insert([{
        client_id: client.id,
        type: 'General Note',
        note: `Transferred from ${fromHouseName} to ${toHouseName} on ${moveDate}${noteText}`,
        created_at: new Date().toISOString(),
      }]);

      onSuccess(toHouseId, toHouseName);
    } catch (err) {
      alert('Error moving client: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div style={{ background: '#1e1e26', border: '1px solid #32323e', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: '600', color: '#fff' }}>Move to a Different House</h3>
        <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#888' }}>
          Currently at <strong style={{ color: '#ddd' }}>{client.house_name || 'Unknown'}</strong>. Status stays Active — no discharge recorded.
        </p>
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '14px', color: '#aaa', marginBottom: '5px' }}>Destination House *</label>
          <select value={toHouseId} onChange={e => setToHouseId(e.target.value)}
            style={{ width: '100%', background: '#1e1e24', border: '1px solid #3a3a48', borderRadius: '8px', padding: '10px 12px', color: toHouseId ? '#fff' : '#666', fontSize: '14px', boxSizing: 'border-box' }}>
            <option value="">Select a house...</option>
            {eligibleHouses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '14px', color: '#aaa', marginBottom: '5px' }}>Transfer Date</label>
          <input type="date" value={moveDate} onChange={e => setMoveDate(e.target.value)}
            style={{ width: '100%', background: '#1e1e24', border: '1px solid #3a3a48', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '14px', color: '#aaa', marginBottom: '5px' }}>Note (optional)</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Reason for transfer, room change, etc."
            style={{ width: '100%', background: '#1e1e24', border: '1px solid #3a3a48', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '14px', resize: 'vertical', fontFamily: "'Inter', 'system-ui', sans-serif", boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', background: 'transparent', border: '1px solid #3a3a48', borderRadius: '9px', color: '#aaa', fontSize: '14px', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleMove} disabled={saving || !toHouseId}
            style={{ flex: 1, padding: '11px', background: saving || !toHouseId ? '#333' : '#1e3a5f', border: '1px solid ' + (saving || !toHouseId ? '#444' : '#3b82f6'), borderRadius: '9px', color: saving || !toHouseId ? '#666' : '#60a5fa', fontSize: '14px', fontWeight: '600', cursor: saving || !toHouseId ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Moving...' : 'Confirm Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Weekly Reflection Form ────────────────────────────────────────────────────
function WeeklyReflectionForm({ entryForm, setEntryForm }) {
  return (
    <>
      <div style={{ marginBottom: '12px' }}>
        <label style={sf.label}>Overall mood this week (1–10): {entryForm.reflection_mood || 5}</label>
        <input type="range" min="1" max="10" value={entryForm.reflection_mood || 5}
          onChange={e => setEntryForm(p => ({ ...p, reflection_mood: e.target.value }))} style={{ width: '100%' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#bbb', marginTop: '2px' }}>
          <span>1 — Rough</span><span>10 — Great</span>
        </div>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={sf.label}>Biggest challenge this week</label>
        <textarea value={entryForm.reflection_challenge || ''} onChange={e => setEntryForm(p => ({ ...p, reflection_challenge: e.target.value }))}
          style={{ ...sf.input, resize: 'vertical' }} rows={2} placeholder="What was hard this week?" />
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={sf.label}>A win or something you're proud of</label>
        <textarea value={entryForm.reflection_win || ''} onChange={e => setEntryForm(p => ({ ...p, reflection_win: e.target.value }))}
          style={{ ...sf.input, resize: 'vertical' }} rows={2} placeholder="What went well or what are you proud of?" />
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={sf.label}>Goals for next week</label>
        <textarea value={entryForm.reflection_goals || ''} onChange={e => setEntryForm(p => ({ ...p, reflection_goals: e.target.value }))}
          style={{ ...sf.input, resize: 'vertical' }} rows={2} placeholder="What do you want to focus on next week?" />
      </div>
    </>
  );
}

// ── Weekly Reflection Display ─────────────────────────────────────────────────
function WeeklyReflectionCard({ entry }) {
  let data = null;
  try { data = entry.reflection_data ? JSON.parse(entry.reflection_data) : null; } catch { data = null; }
  return (
    <div style={{ marginTop: '6px' }}>
      {data?.mood && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '14px', color: '#bbb' }}>Mood:</span>
          <span style={{ ...st.badge, background: '#3a2d1e', color: '#fb923c' }}>{data.mood}/10</span>
        </div>
      )}
      {data?.challenge && <div style={{ marginBottom: '8px' }}><p style={{ fontSize: '14px', color: '#bbb', margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Challenge</p><p style={{ fontSize: '14px', color: '#aaa', margin: 0, lineHeight: 1.5 }}>{data.challenge}</p></div>}
      {data?.win && <div style={{ marginBottom: '8px' }}><p style={{ fontSize: '14px', color: '#bbb', margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Win</p><p style={{ fontSize: '14px', color: '#aaa', margin: 0, lineHeight: 1.5 }}>{data.win}</p></div>}
      {data?.goals && <div style={{ marginBottom: '8px' }}><p style={{ fontSize: '14px', color: '#bbb', margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Goals for next week</p><p style={{ fontSize: '14px', color: '#aaa', margin: 0, lineHeight: 1.5 }}>{data.goals}</p></div>}
      {entry.notes && <div><p style={{ fontSize: '14px', color: '#bbb', margin: '0 0 2px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Additional notes</p><p style={{ fontSize: '14px', color: '#aaa', margin: 0, lineHeight: 1.5 }}>{entry.notes}</p></div>}
    </div>
  );
}

// ── Client Application View ─────────────────────────────────────────────────
function ClientApplicationView({ client }) {
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      // Try by application_id first, then by email match
      let data = null;
      if (client.application_id) {
        const res = await supabase.from('applications').select('*').eq('id', client.application_id).maybeSingle();
        data = res.data;
      }
      if (!data && client.email) {
        const res = await supabase.from('applications').select('*').eq('email', client.email).order('created_at', { ascending: false }).limit(1).maybeSingle();
        data = res.data;
      }
      setApp(data);
      setLoading(false);
    };
    load();
  }, [client.id, client.application_id, client.email]);

  if (loading) return <div style={{ padding: 20, color: '#555' }}>Loading application...</div>;
  if (!app) return (
    <Card title="Application" full>
      <p style={{ color: '#555', fontSize: 14 }}>No application found for this client.</p>
    </Card>
  );

  const Section = ({ title, fields }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#b22222', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
        {fields.filter(([,v]) => v != null && v !== '').map(([label, val]) => (
          <div key={label} style={{ padding: '7px 0', borderBottom: '1px solid #32323e' }}>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 14, color: '#ddd', lineHeight: 1.4 }}>{String(val)}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const parsedMeds = (() => { try { return JSON.parse(app.medication_details) || []; } catch { return []; } })();
  const parsedTreatments = (() => { try { return JSON.parse(app.treatment_details) || []; } catch { return []; } })();

  return (
    <div style={{ padding: '4px 0' }}>
      <Card title="Application" full>
        <div style={{ fontSize: 12, color: '#555', marginBottom: 16 }}>
          Submitted {app.created_at ? new Date(app.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
          {' · '}<span style={{ color: app.status === 'accepted' ? '#4ade80' : app.status === 'denied' ? '#ef4444' : '#f59e0b', textTransform: 'capitalize', fontWeight: 600 }}>{app.status}</span>
        </div>

        <Section title="Personal Info" fields={[
          ['First Name', app.first_name],
          ['Last Name', app.last_name],
          ['Email', app.email],
          ['Phone', app.phone],
          ['Date of Birth', app.date_of_birth],
          ['Gender', app.gender || app.assigned_sex],
          ['Ethnicity', app.ethnicity],
          ['Marital Status', app.marital_status],
          ['SSN', app.ssn],
        ]} />

        <Section title="Housing & Background" fields={[
          ['Program Type', app.program || app.application_type],
          ['Present Residence', app.present_residence],
          ['Has ID?', app.has_id],
          ['Has SS Card?', app.has_ss_card],
          ['Lived Here Before?', app.lived_here_before],
          ['Current Situation', app.current_situation],
          ['Criminal History', app.criminal_history],
        ]} />

        <Section title="Employment & Disability" fields={[
          ['Employment Status', app.employment_status],
          ['Employer', app.employer_name],
          ['On Disability?', app.on_disability],
          ...(app.on_disability === 'Yes' ? [
            ['Difficulty Concentrating/Memory?', app.disability_concentrating],
            ['Difficulty Walking/Stairs?', app.disability_walking],
            ['Difficulty Dressing/Bathing?', app.disability_dressing],
            ['Able to Work?', app.able_to_work],
          ] : []),
          ['Agree to Volunteer?', app.agree_to_volunteer],
        ]} />

        <Section title="Recovery" fields={[
          ['Substance History?', app.substance_history],
          ['Drug of Choice', app.drug_of_choice],
          ['Sober Date', app.sober_date],
          ['OUD Diagnosis', app.oud_diagnosis],
          ['Recovery Meetings', app.recovery_meetings],
          ['Attended Treatment?', app.attended_treatment],
          ['Takes Medication?', app.takes_medication],
        ]} />

        <Section title="Legal" fields={[
          ['PO Name', app.po_name],
          ['PO Phone', app.po_phone],
          ['On Probation?', app.on_probation],
          ['On Parole?', app.on_parole],
          ['Sex Offense?', app.sex_offense],
          ['Personal Status', app.personal_status],
        ]} />

        <Section title="Other" fields={[
          ['Emergency Contact', app.emergency_contact],
          ['Sponsor', app.sponsor_name],
          ['Allergy Info', app.allergy_info],
          ['Doctor Info', app.doctor_info],
          ['Referral Source', app.referral_source],
          ['Correspondence Contact', app.correspondence_contact],
        ]} />

        {parsedMeds.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#b22222', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Medications</div>
            {parsedMeds.map((med, i) => (
              <div key={i} style={{ background: '#1e1e26', borderRadius: 8, padding: '10px 14px', marginBottom: 8, border: '1px solid #32323e' }}>
                <div style={{ fontSize: 14, color: '#fff', fontWeight: 600, marginBottom: 4 }}>{med.name || 'Medication ' + (i+1)}</div>
                {[['Dosage', med.dosage], ['Times/day', med.intake], ['Notes', med.notes]].filter(([,v]) => v).map(([l,v]) => (
                  <div key={l} style={{ fontSize: 13, color: '#aaa' }}>{l}: {v}</div>
                ))}
              </div>
            ))}
          </div>
        )}

        {parsedTreatments.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#b22222', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Treatment History</div>
            {parsedTreatments.map((t, i) => (
              <div key={i} style={{ background: '#1e1e26', borderRadius: 8, padding: '10px 14px', marginBottom: 8, border: '1px solid #32323e' }}>
                <div style={{ fontSize: 14, color: '#fff', fontWeight: 600, marginBottom: 4 }}>{t.name || 'Treatment ' + (i+1)}</div>
                {[['Level of Care', t.level_of_care], ['Contact', t.contact_name], ['Phone', t.contact_phone], ['Discharge Date', t.discharge_date]].filter(([,v]) => v).map(([l,v]) => (
                  <div key={l} style={{ fontSize: 13, color: '#aaa' }}>{l}: {v}</div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Weekly Check-In Card (timeline display) ─────────────────────────────────
function WeeklyCheckInCard({ entry }) {
  const Row = ({ label, value }) => value != null && value !== '' ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #2a2a2a' }}>
      <span style={{ fontSize: '14px', color: '#999' }}>{label}</span>
      <span style={{ fontSize: '14px', color: '#ddd', fontWeight: 500 }}>{String(value)}</span>
    </div>
  ) : null;

  return (
    <div style={{ marginTop: '8px' }}>
      <Row label="Meetings attended" value={entry.checkin_meetings} />
      <Row label="Sponsor contacts" value={entry.checkin_sponsor_contacts} />
      <Row label="Assigned chore" value={entry.checkin_chore} />
      <Row label="Chore completed" value={entry.checkin_chore_completed === true ? 'Yes ✓' : entry.checkin_chore_completed === false ? 'No ✗' : null} />
      <Row label="Employed" value={entry.checkin_employed === true ? 'Yes' : entry.checkin_employed === false ? 'No' : null} />
      <Row label="Employer" value={entry.checkin_employer} />
      <Row label="Payment plan" value={entry.checkin_payment_plan} />
      {entry.notes && (
        <div style={{ marginTop: '8px' }}>
          <p style={{ fontSize: '13px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px 0' }}>Weekly reflection</p>
          <p style={{ fontSize: '14px', color: '#aaa', margin: 0, lineHeight: 1.5 }}>{entry.notes}</p>
        </div>
      )}
    </div>
  );
}

// ── Latest Weekly Check-In Display ───────────────────────────────────────────
function LatestCheckIn({ clientId }) {
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('client_timeline')
      .select('*').eq('client_id', clientId).eq('entry_type', 'Weekly Check-In')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { setEntry(data); setLoading(false); });
  }, [clientId]);

  if (loading) return <p style={{ color: '#555', fontSize: 13 }}>Loading...</p>;
  if (!entry) return <p style={{ color: '#555', fontSize: 13 }}>No weekly check-ins yet.</p>;

  const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const Row = ({ label, value }) => value != null && value !== '' ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #32323e' }}>
      <span style={{ fontSize: 14, color: '#999' }}>{label}</span>
      <span style={{ fontSize: 14, color: '#fff', fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{value}</span>
    </div>
  ) : null;

  return (
    <div>
      <p style={{ fontSize: 12, color: '#b22222', fontWeight: 600, margin: '0 0 12px 0' }}>
        Submitted {fmtDate(entry.created_at)}{entry.author ? ` by ${entry.author}` : ''}
      </p>
      <Row label="Meetings this week" value={entry.checkin_meetings} />
      <Row label="Sponsor contacts" value={entry.checkin_sponsor_contacts} />
      <Row label="Assigned chore" value={entry.checkin_chore} />
      <Row label="Chore completed" value={entry.checkin_chore_completed === true ? 'Yes ✓' : entry.checkin_chore_completed === false ? 'No ✗' : null} />
      <Row label="Employed" value={entry.checkin_employed === true ? 'Yes' : entry.checkin_employed === false ? 'No' : null} />
      <Row label="Employer" value={entry.checkin_employer} />
      <Row label="Payment plan" value={entry.checkin_payment_plan} />
      {entry.notes && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px 0' }}>Weekly reflection</p>
          <p style={{ fontSize: 14, color: '#ccc', lineHeight: 1.6, margin: 0 }}>{entry.notes}</p>
        </div>
      )}
    </div>
  );
}

function ClientFormsTab({ client }) {
  const [packet, setPacket] = useState(null);
  const [overnights, setOvernights] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from('welcome_packets').select('*').eq('client_id', client.id).maybeSingle(),
      supabase.from('overnight_requests').select('*').eq('client_id', client.id).order('created_at', { ascending: false }),
    ]).then(([wpRes, orRes]) => {
      setPacket(wpRes.data);
      setOvernights(orRes.data || []);
      setLoading(false);
    });
  }, [client.id]);

  const generateWelcomePDF = (p) => {
    const submitted = p.submitted_at ? new Date(p.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
    const row = (label, value) => `<tr><td style="padding:8px 12px;color:#666;font-size:13px;width:55%;border-bottom:1px solid #f0f0f0;vertical-align:top;">${label}</td><td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #f0f0f0;vertical-align:top;font-weight:500;">${value || '—'}</td></tr>`;
    const section = (title) => `<tr><td colspan="2" style="padding:14px 12px 6px;background:#f9f9f9;font-size:12px;font-weight:700;color:#b22222;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #eee;">${title}</td></tr>`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <style>body{font-family:Arial,sans-serif;margin:0;padding:0;background:#fff;}
    .header{background:#1a1a1a;padding:24px 32px;display:flex;align-items:center;gap:16px;}
    .title{color:#fff;font-size:20px;font-weight:700;margin:0;}
    .subtitle{color:#b22222;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin:4px 0 0;}
    .red-bar{background:#b22222;height:4px;}
    .content{padding:24px 32px;}
    .meta{color:#999;font-size:12px;margin-bottom:20px;}
    table{width:100%;border-collapse:collapse;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;}
    </style></head><body>
    <div class="header">
      <div><p class="title">Kingdom Living Iowa — Welcome Packet</p><p class="subtitle">Resident Submission</p></div>
    </div>
    <div class="red-bar"></div>
    <div class="content">
      <p class="meta">Submitted by <strong>${client.full_name}</strong> on ${submitted}</p>
      <table>
        ${section('Basic Information')}
        ${row('Resident Name', client.full_name)}
        ${row('Program', p.program)}
        ${row('Phone', p.phone)}
        ${row('Email', p.email)}
        ${row('Knows House Manager', p.know_house_manager)}
        ${row('Knows Head House Manager', p.know_head_house_manager)}
        ${row('Knows Houseperson', p.know_houseperson)}
        ${row('Assigned Mentor', p.assigned_mentor)}
        ${row('On Band App', p.on_band_app)}
        ${section('Level 1 Agreements')}
        ${row('Agrees to Employment Requirements', p.agree_employment)}
        ${row('Agrees to Sponsor Requirements', p.agree_sponsor)}
        ${row('Agrees to Meeting Requirements', p.agree_meetings)}
        ${row('Agrees to Sunday Morning Meeting', p.agree_sunday_meeting)}
        ${row('Agrees to Thursday Night Alive', p.agree_thursday_alive)}
        ${row('Agrees to Employment Lab', p.agree_employment_lab)}
        ${row('Commits to Positive Financial Balance', p.agree_financial_balance)}
        ${row('Understands Level Requirements', p.understand_level_requirements)}
        ${section('Program Policies')}
        ${row('Agrees to Levels', p.agree_levels)}
        ${row('Agrees to Rules', p.agree_rules)}
        ${row('Understands Services', p.understand_services)}
        ${row('Understands Supplies Policy', p.understand_supplies)}
        ${row('Commits to Graduating', p.commit_graduating)}
        ${row('Understands Fees', p.understand_fees)}
        ${row('Understands Refund Policy', p.understand_refund_policy)}
        ${row('Understands Third Party Payments', p.understand_third_party)}
        ${row('Understands Property Removal', p.understand_property_removal)}
        ${row('Understands Grievances Policy', p.understand_grievances)}
        ${row('Understands Relapse Policy', p.understand_relapse)}
        ${row('Emergency Procedures Reviewed', p.emergency_procedures)}
        ${row('Understands Naloxone Availability', p.understand_naloxone)}
        ${row('Agrees to Social Media Policy', p.agree_social_media)}
        ${row('Understands Neighbor Policy', p.understand_neighbor)}
        ${row('Understands Parking Policy', p.understand_parking)}
        ${row('Understands Mail Policy', p.understand_mail)}
        ${row('Understands Location Verification', p.understand_location_verification)}
        ${row('Understands Payment Processing Fees', p.understand_payment_fees)}
        ${row('Understands AI Policy', p.understand_ai_policy)}
        ${section('Signature')}
        ${row('I Testify That', p.signature_testify)}
        ${row('I Understand That', p.signature_understand)}
        ${row('Submission Date', submitted)}
      </table>
    </div></body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.print(); };
  };

  if (loading) return <div style={{ padding: '20px', color: '#888' }}>Loading...</div>;

  const s = { padding: '0 2px' };
  const labelStyle = { fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 3px' };
  const valueStyle = { fontSize: '14px', color: '#ddd', margin: 0 };

  if (!packet) return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <p style={{ color: '#888', fontSize: '15px' }}>No welcome packet submitted yet.</p>
      <p style={{ color: '#666', fontSize: '14px' }}>The client can submit this from their portal under the Forms tab.</p>
    </div>
  );

  const Row = ({ label, value }) => (
    <div style={{ padding: '8px 0', borderBottom: '1px solid #222' }}>
      <p style={labelStyle}>{label}</p>
      <p style={{ ...valueStyle, color: value === 'Yes' ? '#4ade80' : value === 'No' ? '#f87171' : '#ddd' }}>{value || '—'}</p>
    </div>
  );

  const Section = ({ title }) => (
    <div style={{ padding: '12px 0 4px', marginTop: '8px' }}>
      <p style={{ fontSize: '12px', color: '#b22222', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700', margin: 0 }}>{title}</p>
    </div>
  );

  return (
    <div style={s}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <p style={{ color: '#fff', fontWeight: '600', margin: '0 0 3px' }}>Welcome Packet</p>
          <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>
            Submitted {packet.submitted_at ? new Date(packet.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
          </p>
        </div>
        <button onClick={() => generateWelcomePDF(packet)}
          style={{ background: '#1a2a1a', border: '1px solid #2a5a2a', color: '#4ade80', padding: '6px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
          ⬇ Export PDF
        </button>
      </div>

      <Section title="Basic Information" />
      <Row label="Program" value={packet.program} />
      <Row label="Phone" value={packet.phone} />
      <Row label="Email" value={packet.email} />
      <Row label="Knows House Manager" value={packet.know_house_manager} />
      <Row label="Knows Head House Manager" value={packet.know_head_house_manager} />
      <Row label="Knows Houseperson" value={packet.know_houseperson} />
      <Row label="Assigned Mentor" value={packet.assigned_mentor} />
      <Row label="On Band App" value={packet.on_band_app} />

      <Section title="Level 1 Agreements" />
      <Row label="Employment Requirements" value={packet.agree_employment} />
      <Row label="Sponsor Requirements" value={packet.agree_sponsor} />
      <Row label="Meeting Requirements" value={packet.agree_meetings} />
      <Row label="Sunday Morning Meeting" value={packet.agree_sunday_meeting} />
      <Row label="Thursday Night Alive" value={packet.agree_thursday_alive} />
      <Row label="Employment Lab" value={packet.agree_employment_lab} />
      <Row label="Financial Balance Commitment" value={packet.agree_financial_balance} />
      <Row label="Understands Level Requirements" value={packet.understand_level_requirements} />

      <Section title="Program Policies" />
      <Row label="Agrees to Levels" value={packet.agree_levels} />
      <Row label="Agrees to Rules" value={packet.agree_rules} />
      <Row label="Understands Services" value={packet.understand_services} />
      <Row label="Understands Supplies Policy" value={packet.understand_supplies} />
      <Row label="Commits to Graduating" value={packet.commit_graduating} />
      <Row label="Understands Fees" value={packet.understand_fees} />
      <Row label="Understands Refund Policy" value={packet.understand_refund_policy} />
      <Row label="Understands Third Party Payments" value={packet.understand_third_party} />
      <Row label="Property Removal Policy" value={packet.understand_property_removal} />
      <Row label="Grievances Policy" value={packet.understand_grievances} />
      <Row label="Relapse Policy" value={packet.understand_relapse} />
      <Row label="Emergency Procedures Reviewed" value={packet.emergency_procedures} />
      <Row label="Naloxone Availability" value={packet.understand_naloxone} />
      <Row label="Social Media Policy" value={packet.agree_social_media} />
      <Row label="Neighbor Policy" value={packet.understand_neighbor} />
      <Row label="Parking Policy" value={packet.understand_parking} />
      <Row label="Mail Policy" value={packet.understand_mail} />
      <Row label="Location Verification" value={packet.understand_location_verification} />
      <Row label="Payment Processing Fees" value={packet.understand_payment_fees} />
      <Row label="AI & Recording Policy" value={packet.understand_ai_policy} />

      <Section title="Signature" />
      <Row label="I Testify That" value={packet.signature_testify} />
      <Row label="I Understand That" value={packet.signature_understand} />

      {/* Overnight Requests */}
      {overnights.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ padding: '12px 0 8px', borderTop: '1px solid #222' }}>
            <p style={{ fontSize: '12px', color: '#b22222', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700', margin: 0 }}>Overnight Pass Requests</p>
          </div>
          {overnights.map(req => {
            const sc = req.status === 'approved' ? { bg: '#14532d', color: '#4ade80' } : req.status === 'denied' ? { bg: '#3a0f0f', color: '#f87171' } : { bg: '#3a2d1e', color: '#fb923c' };
            const fmt = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
            return (
              <div key={req.id} style={{ padding: '10px 0', borderBottom: '1px solid #1a1a1a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <p style={{ color: '#ddd', fontSize: '14px', margin: 0, fontWeight: '500' }}>
                    {fmt(req.departure_datetime)} → {fmt(req.return_datetime)}
                  </p>
                  <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: '600', background: sc.bg, color: sc.color, textTransform: 'capitalize' }}>{req.status}</span>
                </div>
                <p style={{ color: '#888', fontSize: '13px', margin: '0 0 2px' }}>📍 {req.location || '—'} · 👤 {req.who_seeing || '—'}</p>
                <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>Reason: {req.reason || '—'}</p>
                {req.review_notes && <p style={{ color: '#aaa', fontSize: '13px', margin: '4px 0 0', fontStyle: 'italic' }}>Note: {req.review_notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MedicationsTab({ client, setSelected, setClients }) {
  const parseMeds = (raw) => { try { return raw ? JSON.parse(raw) : []; } catch { return []; } };
  const [meds, setMeds] = useState(parseMeds(client.medication_details));
  const [modalState, setModalState] = useState(null); // { index: null | number, form: {...} }
  const [saving, setSaving] = useState(false);

  const persist = async (newMeds) => {
    setSaving(true);
    const filtered = newMeds.filter(m => m.name.trim());
    const value = JSON.stringify(filtered);
    const { error } = await supabase.from('clients').update({ medication_details: value }).eq('id', client.id);
    setSaving(false);
    if (error) { alert('Error saving: ' + error.message); return false; }
    setMeds(filtered);
    setSelected(prev => ({ ...prev, medication_details: value }));
    setClients(prev => prev.map(c => c.id === client.id ? { ...c, medication_details: value } : c));
    return true;
  };

  const openAddModal = () => setModalState({ index: null, form: { name: '', dosage: '', intake: '', notes: '' } });
  const openEditModal = (i) => setModalState({ index: i, form: { ...meds[i] } });
  const closeModal = () => setModalState(null);

  const saveModal = async () => {
    if (!modalState.form.name.trim()) { alert('Medication name is required.'); return; }
    let newMeds;
    if (modalState.index === null) {
      newMeds = [...meds, modalState.form];
    } else {
      newMeds = meds.map((m, idx) => idx === modalState.index ? modalState.form : m);
    }
    const ok = await persist(newMeds);
    if (ok) closeModal();
  };

  const removeMed = async (i) => {
    if (!window.confirm('Remove this medication?')) return;
    const newMeds = meds.filter((_, idx) => idx !== i);
    await persist(newMeds);
  };

  return (
    <Card title="Medications" full action={
      <button onClick={openAddModal} style={{ background: '#b22222', border: 'none', color: '#fff', padding: '5px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>+ Add</button>
    }>
      {meds.length === 0 && <p style={{ color: '#999', fontSize: '14px' }}>No medications added yet.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {meds.map((med, i) => (
          <div key={i} style={{ background: '#1c1c24', borderRadius: '8px', padding: '12px 14px', border: '1px solid #32323e', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <p style={{ color: '#fff', fontSize: '14px', fontWeight: '600', margin: '0 0 6px 0' }}>{med.name}</p>
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                {med.dosage && <span style={{ fontSize: '13px', color: '#aaa' }}>Dosage: {med.dosage}</span>}
                {med.intake && <span style={{ fontSize: '13px', color: '#aaa' }}>Frequency: {med.intake}x/day</span>}
              </div>
              {med.notes && <p style={{ fontSize: '13px', color: '#999', margin: '6px 0 0 0' }}>{med.notes}</p>}
            </div>
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              <button onClick={() => openEditModal(i)} style={{ background: 'transparent', border: '1px solid #3a3a48', color: '#aaa', padding: '4px 10px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>Edit</button>
              <button onClick={() => removeMed(i)} style={{ background: 'transparent', border: '1px solid #7f1d1d', color: '#f87171', padding: '4px 10px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {modalState && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}
          onClick={closeModal}>
          <div style={{ background: '#1c1c24', borderRadius: '16px', border: '1px solid #32323e', width: '100%', maxWidth: '420px', padding: '24px' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', margin: '0 0 18px 0', fontSize: '16px' }}>{modalState.index === null ? 'Add Medication' : 'Edit Medication'}</h3>
            {[
              { label: 'Medication Name *', field: 'name' },
              { label: 'Dosage (e.g. 10mg)', field: 'dosage' },
              { label: 'Times per day', field: 'intake' },
              { label: 'Notes', field: 'notes' },
            ].map(({ label, field }) => (
              <div key={field} style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '5px' }}>{label}</label>
                <input value={modalState.form[field] || ''}
                  onChange={e => setModalState(prev => ({ ...prev, form: { ...prev.form, [field]: e.target.value } }))}
                  style={{ width: '100%', background: '#1c1c24', border: '1px solid #3a3a48', borderRadius: '8px', padding: '9px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button onClick={closeModal} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid #3a3a48', borderRadius: '8px', color: '#aaa', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveModal} disabled={saving} style={{ flex: 1, padding: '10px', background: '#b22222', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
function StayPhotos({ clientId, stayId }) {
  const [photos, setPhotos] = useState([]);
  useEffect(() => {
    if (!clientId || !stayId) return;
    supabase.storage.from('discharge-photos').list(`discharge/${clientId}/${stayId}`)
      .then(({ data }) => {
        if (data?.length) {
          setPhotos(data.map(f => supabase.storage.from('discharge-photos').getPublicUrl(`discharge/${clientId}/${stayId}/${f.name}`).data.publicUrl));
        }
      });
  }, [clientId, stayId]);
  if (!photos.length) return null;
  return (
    <div style={{ gridColumn: 'span 2', marginTop: '8px' }}>
      <p style={{ fontSize: '14px', color: '#bbb', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Discharge Photos</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {photos.map((url, i) => (
          <img key={i} src={url} alt="" onClick={() => window.open(url, '_blank')}
            style={{ width: '100px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #32323e', cursor: 'pointer' }} />
        ))}
      </div>
    </div>
  );
}

function Clients({ pendingClientId, onClientOpened, onBackToHouses }) {
  const { hasFullAccess, isHouseManagerRole, assignedHouseIds, user, isAdmin, fullName } = useUser();

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [viewMode, setViewMode] = useState('operational');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showMoreTabs, setShowMoreTabs] = useState(false);
  const moreTabRef = useRef(null);
  const [statusModal, setStatusModal] = useState(null);
  const [confirmingStatus, setConfirmingStatus] = useState(false);
  const [moveHouseModal, setMoveHouseModal] = useState(null);
  const [statusForm, setStatusForm] = useState({
    list_type: 'DOC Men', move_in_date: '', discharge_reason: '', discharge_notes: '',
    discharge_date: '', house_id: '', successful_discharge: '', graduate: false,
  });

  const [houses, setHouses] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [timelineTotal, setTimelineTotal] = useState(0);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineLoadingMore, setTimelineLoadingMore] = useState(false);
  const [stays, setStays] = useState([]);
  const [staysLoading, setStaysLoading] = useState(false);
  const [expandedStay, setExpandedStay] = useState(null);
  const [stayHistory, setStayHistory] = useState({});
  const [stayHistoryLoading, setStayHistoryLoading] = useState({});
  const [stayDetailModal, setStayDetailModal] = useState(null); // { stayId, type: 'timeline'|'checkins'|'forms'|'balance' }
  const [latestCheckIn, setLatestCheckIn] = useState(null);
  const [clientBalance, setClientBalance] = useState(null);

  const [uaRecords, setUaRecords] = useState([]);
  const [meetingRecords, setMeetingRecords] = useState([]);
  const [choreRecords, setChoreRecords] = useState([]);

  const [locationLabels, setLocationLabels] = useState({});
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showTimelinePDFModal, setShowTimelinePDFModal] = useState(false);
  const [pdfRange, setPdfRange] = useState({ startDate: '', endDate: '', eventType: 'All' });
  const [entryType, setEntryType] = useState('General Note');
  const [entryForm, setEntryForm] = useState({
    author: fullName || user?.email || '', notes: '', severity: 'Low', meeting_name: '', chore_name: '',
    chore_status: 'Completed', mood_value: '5', ua_result: 'Negative',
    checkin_status: 'Here', latitude: '', longitude: '', pinDropped: false,
    reflection_mood: '5', reflection_challenge: '', reflection_win: '', reflection_goals: '',
  });
  const [editingField, setEditingField] = useState(null);
  const [expandedWeeks, setExpandedWeeks] = useState({});

  const debounceTimer = useRef(null);

  // Close More dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e) => { if (moreTabRef.current && !moreTabRef.current.contains(e.target)) setShowMoreTabs(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => { setDebouncedSearch(search.trim()); setCurrentPage(1); }, 300);
    return () => clearTimeout(debounceTimer.current);
  }, [search]);

  useEffect(() => { setCurrentPage(1); }, [statusFilter, viewMode]);

  // Auto-open client when coming from Houses
  useEffect(() => {
    if (!pendingClientId) return;
    supabase.from('clients').select('*, houses(name, house_manager)').eq('id', pendingClientId).single()
      .then(({ data }) => {
        if (data) {
          const enriched = { ...data, house_name: data.houses?.name || null, house_manager: data.houses?.house_manager || null };
          openProfile(enriched);
          if (onClientOpened) onClientOpened();
        }
      });
  }, [pendingClientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyClientFilters = useCallback((query) => {
    if (debouncedSearch) query = query.ilike('full_name', `%${debouncedSearch}%`);
    if (statusFilter !== 'All') {
      query = query.eq('status', statusFilter);
    } else if (viewMode === 'operational') {
      query = query.in('status', ['Accepted', 'Waiting List', 'Pending', 'Active']);
    } else {
      query = query.in('status', ['Archived', 'Discharged']);
    }
    if (isHouseManagerRole && assignedHouseIds.length > 0) query = query.in('house_id', assignedHouseIds);
    return query;
  }, [debouncedSearch, statusFilter, viewMode, isHouseManagerRole, assignedHouseIds]);

  const fetchClients = useCallback(async (force = false) => {
    const cacheKey = `clients_${viewMode}_${statusFilter}_${debouncedSearch}_${currentPage}`;
    if (!force) {
      const cached = getCached(cacheKey);
      if (cached) { setClients(cached.clients); setTotalCount(cached.total); setLoading(false); return; }
    }
    setLoading(true);
    try {
      if (isHouseManagerRole && assignedHouseIds.length === 0) { setClients([]); setTotalCount(0); setLoading(false); return; }
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let countQuery = supabase.from('clients').select('id', { count: 'exact', head: true });
      countQuery = applyClientFilters(countQuery);
      const { count, error: countError } = await countQuery;
      if (countError) { console.error(countError); setClients([]); setTotalCount(0); return; }
      setTotalCount(count || 0);
      let dataQuery = supabase.from('clients').select('*, houses(name, house_manager)').order('created_at', { ascending: false }).range(from, to);
      dataQuery = applyClientFilters(dataQuery);
      const { data, error: dataError } = await dataQuery;
      if (dataError) { console.error(dataError); setClients([]); return; }
      const mapped = (data || []).map(c => ({ ...c, house_name: c.houses?.name || null, house_manager: c.houses?.house_manager || null }));
      setClients(mapped);
      setCached(cacheKey, { clients: mapped, total: count || 0 });
    } catch (err) { console.error(err); setClients([]); setTotalCount(0); }
    finally { setLoading(false); }
  }, [currentPage, isHouseManagerRole, assignedHouseIds, applyClientFilters, statusFilter, viewMode, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const fetchHouses = useCallback(async () => {
    const { data } = await supabase.from('houses').select('id, name, type').order('name');
    setHouses(data || []);
  }, []);

  // Add a client to their house chat (only if they have an auth account)
  const addClientToHouseChat = async (clientId, houseId, clientEmail) => {
    if (!houseId || !clientEmail) return;
    // Get auth user id for this client
    const { data: authUsers } = await supabase.from('user_profiles').select('id').eq('email', clientEmail).maybeSingle();
    // Try auth.users via RPC if not in user_profiles
    let authUserId = authUsers?.id;
    if (!authUserId) return; // no auth account yet
    // Find the house chat conversation
    const { data: conv } = await supabase.from('conversations').select('id').eq('house_id', houseId).maybeSingle();
    if (!conv) return;
    await supabase.from('conversation_members').upsert({
      conversation_id: conv.id, user_id: authUserId, last_read_at: new Date().toISOString(),
    }, { onConflict: 'conversation_id,user_id' });
  };

  const removeClientFromHouseChat = async (clientEmail, houseId) => {
    if (!houseId || !clientEmail) return;
    const { data: authUser } = await supabase.from('user_profiles').select('id').eq('email', clientEmail).maybeSingle();
    if (!authUser?.id) return;
    const { data: conv } = await supabase.from('conversations').select('id').eq('house_id', houseId).maybeSingle();
    if (!conv) return;
    await supabase.from('conversation_members').delete().eq('conversation_id', conv.id).eq('user_id', authUser.id);
  };

  useEffect(() => { fetchHouses(); }, [fetchHouses]);

  const fetchTimeline = async (clientId, append = false) => {
    if (append) setTimelineLoadingMore(true);
    else setTimelineLoading(true);
    try {
      if (!append) {
        const { count } = await supabase.from('client_timeline').select('id', { count: 'exact', head: true }).eq('client_id', clientId);
        setTimelineTotal(count || 0);
      }
      const from = append ? timeline.length : 0;
      const to = from + TIMELINE_PAGE_SIZE - 1;
      const { data, error } = await supabase.from('client_timeline').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).range(from, to);
      if (error) { console.error(error); return; }
      const entries = data || [];
      if (append) { setTimeline(prev => [...prev, ...entries]); }
      else {
        setTimeline(entries);
        setLocationLabels({});
        const thisWeekKey = getWeekStart(new Date()).toISOString();
        setExpandedWeeks({ [thisWeekKey]: true });
      }
      entries.forEach(async entry => {
        if (entry.latitude && entry.longitude) {
          const address = await reverseGeocode(entry.latitude, entry.longitude);
          if (address) setLocationLabels(prev => ({ ...prev, [entry.id]: address }));
        }
      });
    } catch (err) { console.error(err); }
    finally { setTimelineLoading(false); setTimelineLoadingMore(false); }
  };

  const fetchLatestReflection = async (clientId) => {
    const { data } = await supabase
      .from('client_timeline')
      .select('reflection_data')
      .eq('client_id', clientId)
      .eq('entry_type', 'Weekly Reflection')
      .not('reflection_data', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.reflection_data) {
      // reflection data loaded but no longer displayed
    } else {
      // no reflection data
    }
  };

  const fetchFullHistory = async (clientId) => {
    const { data } = await supabase.from('client_timeline').select('*').eq('client_id', clientId).in('entry_type', ['UA', 'Meeting', 'Chores']).order('created_at', { ascending: false });
    const all = data || [];
    setUaRecords(all.filter(e => e.entry_type === 'UA'));
    setMeetingRecords(all.filter(e => e.entry_type === 'Meeting'));
    setChoreRecords(all.filter(e => e.entry_type === 'Chores'));
  };

  const fetchStays = async (clientId) => {
    setStaysLoading(true);
    const { data } = await supabase.from('client_stays').select('*').eq('client_id', clientId).order('discharge_date', { ascending: false });
    setStays(data || []);
    setStaysLoading(false);
  };

  const fetchClientBalance = async (clientId) => {
    const [{ data: chargesData }, { data: paymentsData }] = await Promise.all([
      supabase.from('charges').select('amount').eq('client_id', clientId),
      supabase.from('payments').select('amount').eq('client_id', clientId),
    ]);
    const totalCharged = (chargesData || []).reduce((s, c) => s + parseFloat(c.amount || 0), 0);
    const totalPaid = (paymentsData || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    setClientBalance(totalCharged - totalPaid);
  };

  const toggleWeek = (key) => setExpandedWeeks(prev => ({ ...prev, [key]: !prev[key] }));

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasMoreTimeline = timeline.length < timelineTotal;

  const statusFilters = hasFullAccess
    ? viewMode === 'operational' ? ['All', 'Accepted', 'Waiting List', 'Pending', 'Active'] : ['All', 'Archived', 'Discharged']
    : ['All', 'Active', 'Pending'];

  const statusColor = (s) => {
    if (s === 'Applied') return { bg: '#1e3a2f', color: '#4ade80' };
    if (s === 'Accepted') return { bg: '#1e2d3a', color: '#60a5fa' };
    if (s === 'Waiting List') return { bg: '#3a2d1e', color: '#fb923c' };
    if (s === 'Pending') return { bg: '#2d2d1e', color: '#facc15' };
    if (s === 'Active') return { bg: '#2d1e3a', color: '#c084fc' };
    if (s === 'Discharged') return { bg: '#3a1e1e', color: '#f87171' };
    if (s === 'Denied') return { bg: '#333', color: '#bbb' };
    return { bg: '#333', color: '#aaa' };
  };

  const uaResultColor = (result) => {
    if (result === 'Negative') return { bg: '#1e3a2f', color: '#4ade80' };
    if (result === 'Positive') return { bg: '#3a1e1e', color: '#f87171' };
    if (result === 'Inconclusive') return { bg: '#3a2d1e', color: '#fb923c' };
    if (result === 'Refused') return { bg: '#333', color: '#bbb' };
    return { bg: '#333', color: '#aaa' };
  };

  const choreStatusColor = (status) => {
    if (status === 'Completed') return { bg: '#1e3a2f', color: '#4ade80' };
    if (status === 'Not Completed') return { bg: '#3a1e1e', color: '#f87171' };
    if (status === 'Partial') return { bg: '#3a2d1e', color: '#fb923c' };
    return { bg: '#333', color: '#aaa' };
  };

  const entryColor = (type) => {
    if (type === 'House Check-In') return '#7F77DD';
    if (type === 'Batch UA') return '#1D9E75';
    if (type === 'Crisis') return '#E24B4A';
    if (type === 'Infraction') return '#dc2626';
    if (type === 'Event Attendance') return '#378ADD';
    if (type === 'Meeting') return '#60a5fa';
    if (type === 'Mood Check-In') return '#BA7517';
    if (type === 'Check-In') return '#c084fc';
    if (type === 'UA') return '#f472b6';
    if (type === 'General Note') return '#f59e0b';
    if (type === 'Chores') return '#34d399';
    if (type === 'Weekly Reflection') return '#a78bfa';
    return '#bbb';
  };

  const generateTimelinePDF = async (client, startDate, endDate, eventType) => {
    let query = supabase.from('client_timeline').select('*').eq('client_id', client.id).order('created_at', { ascending: false });
    if (startDate) query = query.gte('created_at', new Date(startDate + 'T00:00:00').toISOString());
    if (endDate) query = query.lte('created_at', new Date(endDate + 'T23:59:59').toISOString());
    if (eventType && eventType !== 'All') query = query.eq('entry_type', eventType);
    const { data: entries } = await query;
    if (!entries?.length) { alert('No entries found for the selected range.'); return; }

    const typeColors = {
      'Crisis': '#dc2626', 'Infraction': '#dc2626', 'UA': '#f472b6',
      'Meeting': '#60a5fa', 'Mood Check-In': '#BA7517', 'Check-In': '#c084fc',
      'General Note': '#f59e0b', 'Chores': '#34d399', 'Weekly Check-In': '#a78bfa',
      'Weekly Reflection': '#a78bfa', 'House Check-In': '#7F77DD', 'Batch UA': '#1D9E75',
      'Event Attendance': '#378ADD',
    };

    const fmt = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const rangeLabel = startDate && endDate ? `${new Date(startDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(endDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : startDate ? `From ${new Date(startDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : endDate ? `Until ${new Date(endDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : 'All Time';

    const rows = entries.map(e => {
      const color = typeColors[e.entry_type] || '#888';
      let detail = '';
      if (e.ua_result) detail = `Result: ${e.ua_result}`;
      else if (e.severity) detail = `Severity: ${e.severity}`;
      else if (e.mood_value) detail = `Mood: ${e.mood_value}/10`;
      else if (e.meeting_name) detail = e.meeting_name;
      const notes = e.notes ? `<div style="color:#444;font-size:13px;margin-top:4px;line-height:1.5;">${e.notes}</div>` : '';
      const author = e.author ? `<div style="color:#888;font-size:12px;margin-top:4px;">By ${e.author}</div>` : '';
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;vertical-align:top;white-space:nowrap;color:#555;font-size:13px;">${fmt(e.created_at)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;vertical-align:top;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px;vertical-align:middle;"></span>
          <strong style="font-size:13px;">${e.entry_type}</strong>
          ${detail ? `<span style="color:#666;font-size:12px;margin-left:6px;">${detail}</span>` : ''}
          ${notes}${author}
        </td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Timeline – ${client.full_name}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 32px; color: #111; }
      @media print { body { padding: 16px; } .no-print { display: none; } }
      h1 { font-size: 22px; margin: 0 0 4px 0; }
      .sub { color: #555; font-size: 14px; margin: 0 0 24px 0; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #f5f5f5; text-align: left; padding: 10px 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #666; border-bottom: 2px solid #ddd; }
      tr:hover td { background: #fafafa; }
      .print-btn { background: #8b1c1c; color: #fff; border: none; padding: 10px 24px; border-radius: 6px; font-size: 14px; cursor: pointer; margin-bottom: 24px; }
    </style></head><body>
    <button class="print-btn no-print" onclick="window.print()">⬇ Print / Save PDF</button>
    <h1>${client.full_name} — Timeline</h1>
    <p class="sub">${rangeLabel}${eventType !== 'All' ? ` · ${eventType}` : ''} · ${entries.length} entries · Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
    <table>
      <thead><tr><th style="width:180px;">Date</th><th>Entry</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  };

  const loadStayHistory = async (stay, client) => {
    const stayId = stay.id;
    if (stayHistory[stayId]) return; // already loaded
    setStayHistoryLoading(p => ({ ...p, [stayId]: true }));
    const start = stay.start_date;
    const end = stay.discharge_date || new Date().toISOString().slice(0, 10);

    const [timelineRes, overnightRes, welcomeRes, checkinRes, chargesRes, paymentsRes] = await Promise.all([
      supabase.from('client_timeline').select('*').eq('client_id', client.id)
        .gte('created_at', start + 'T00:00:00').lte('created_at', end + 'T23:59:59')
        .order('created_at', { ascending: false }),
      supabase.from('overnight_requests').select('*').eq('client_id', client.id)
        .gte('created_at', start + 'T00:00:00').lte('created_at', end + 'T23:59:59')
        .order('created_at', { ascending: false }),
      supabase.from('welcome_packets').select('*').eq('client_id', client.id)
        .gte('created_at', start + 'T00:00:00').lte('created_at', end + 'T23:59:59')
        .maybeSingle(),
      supabase.from('client_timeline').select('*').eq('client_id', client.id)
        .eq('entry_type', 'Weekly Check-In')
        .gte('created_at', start + 'T00:00:00').lte('created_at', end + 'T23:59:59')
        .order('created_at', { ascending: false }),
      supabase.from('charges').select('*').eq('client_id', client.id)
        .gte('due_date', start).lte('due_date', end)
        .order('due_date', { ascending: false }),
      supabase.from('payments').select('*').eq('client_id', client.id)
        .gte('payment_date', start).lte('payment_date', end)
        .order('payment_date', { ascending: false }),
    ]);

    setStayHistory(p => ({ ...p, [stayId]: {
      timeline: (timelineRes.data || []).filter(e => e.entry_type !== 'Weekly Check-In'),
      overnights: overnightRes.data || [],
      welcomePacket: welcomeRes.data || null,
      checkIns: checkinRes.data || [],
      charges: chargesRes.data || [],
      payments: paymentsRes.data || [],
    }}));
    setStayHistoryLoading(p => ({ ...p, [stayId]: false }));
  };

  const initials = (name) => name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '??';
  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const formatDateShort = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const formatDateFull = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

  const deleteClient = async (client) => {
    if (!window.confirm(`Permanently delete ${client.full_name}? This cannot be undone.`)) return;
    const { error } = await supabase.from('clients').delete().eq('id', client.id);
    if (error) { alert('Error deleting client: ' + error.message); return; }
    setSelected(null);
    fetchClients(true);
  };

  const openStatusModal = (client, newStatus) => {
    setStatusModal({ client, newStatus });
    setStatusForm({ list_type: 'DOC Men', move_in_date: '', discharge_reason: '', discharge_notes: '', discharge_date: '', house_id: client.house_id || '', successful_discharge: '', graduate: false, ready_date: '', discharge_type: '', ua_at_discharge: '', two_week_notice: '', early_admission: false, not_allowed_back: false, needs_review_before_readmit: false, discharge_photos: [] });
  };

  const confirmStatusChange = async () => {
    if (confirmingStatus) return;
    setConfirmingStatus(true);
    const { client, newStatus } = statusModal;
    const updates = { status: newStatus };

    // If moving away from Waiting List, remove from waiting list
    if (client.status === 'Waiting List' && newStatus !== 'Waiting List') {
      await supabase.from('waiting_list')
        .update({ status: 'removed' })
        .eq('client_id', client.id)
        .eq('status', 'waiting');
    }

    if (newStatus === 'Waiting List') {
      const { error: wlError } = await supabase.from('waiting_list').insert([{
        full_name: client.full_name, email: client.email || null, phone: client.phone || null,
        list_type: statusForm.list_type, position: 999, status: 'waiting',
        ready_date: statusForm.ready_date || null,
        application_id: client.application_id || null,
        client_id: client.id,
      }]);
      if (wlError) { alert('Error adding to waiting list: ' + wlError.message); return; }
    }

    if (newStatus === 'Pending') {
      if (!statusForm.house_id) { alert('Please select a house.'); return; }
      updates.house_id = statusForm.house_id;
      updates.expected_move_in_date = statusForm.expected_move_in_date || null;
      const { data: houseData } = await supabase.from('houses').select('occupied_beds').eq('id', statusForm.house_id).single();
      if (houseData) await supabase.from('houses').update({ occupied_beds: (houseData.occupied_beds || 0) + 1 }).eq('id', statusForm.house_id);
    }

    if (newStatus === 'Active') {
      updates.start_date = statusForm.move_in_date || null;
      updates.level = 1;
      updates.early_admission = statusForm.early_admission || false;
      if (statusForm.room_type) updates.room_type = statusForm.room_type;
      const activeHouseId = statusForm.house_id || client.house_id;
      // If moving to a different house, remove from old house chat first
      if (client.house_id && activeHouseId && client.house_id !== activeHouseId && client.email) {
        await removeClientFromHouseChat(client.email, client.house_id);
      }
      // Add to new house chat
      if (activeHouseId && client.email) {
        await addClientToHouseChat(client.id, activeHouseId, client.email);
      }
      updates.expected_move_in_date = null;
      const houseId = statusForm.house_id || client.house_id;
      if (houseId) {
        updates.house_id = houseId;
        if (houseId !== client.house_id || client.status !== 'Pending') {
          const { data: houseData } = await supabase.from('houses').select('occupied_beds').eq('id', houseId).single();
          if (houseData) await supabase.from('houses').update({ occupied_beds: (houseData.occupied_beds || 0) + 1 }).eq('id', houseId);
        }
      }
      const roomType = client.room_type || 'Double';
      const { data: feeData } = await supabase.from('fee_settings').select('move_in_fee').eq('room_type', roomType).maybeSingle();
      const moveInAmount = feeData ? parseFloat(feeData.move_in_fee) || 0 : 150;
      if (moveInAmount > 0) {
        await supabase.from('charges').insert([{
          client_id: client.id, charge_type: 'move_in_fee', amount: moveInAmount,
          due_date: statusForm.move_in_date || new Date().toISOString().split('T')[0],
          description: 'Move-in fee', status: 'unpaid', amount_paid: 0, created_by: user?.email || null,
        }]);
      }
    }

    if (newStatus === 'Discharged') {
      if (!statusForm.discharge_reason) { alert('Please select a reason for discharge.'); return; }
      // Remove client from house chat
      if (client.house_id && client.email) {
        await removeClientFromHouseChat(client.email, client.house_id);
      }
      const today = new Date().toISOString().split('T')[0];
      updates.discharge_date = statusForm.discharge_date || today;
      updates.reason_for_discharge = statusForm.discharge_reason;
      updates.discharge_notes = statusForm.discharge_notes || null;
      updates.discharged_by = user?.email || user?.id || null;
      updates.level = null;
      updates.successful_discharge = statusForm.successful_discharge === 'yes' ? true : statusForm.successful_discharge === 'no' ? false : null;
      updates.graduate = statusForm.discharge_reason === 'Graduate';

      const { data: chargesData } = await supabase.from('charges').select('amount').eq('client_id', client.id);
      const { data: paymentsData } = await supabase.from('payments').select('amount').eq('client_id', client.id);
      const totalCharged = (chargesData || []).reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
      const totalPaid = (paymentsData || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const balanceAtDischarge = totalCharged - totalPaid;
      const houseName = client.house_name || houses.find(h => h.id === client.house_id)?.name || null;

      const { data: stayData } = await supabase.from('client_stays').insert([{
        client_id: client.id, house_id: client.house_id || null, house_name: houseName,
        start_date: client.start_date || null, discharge_date: updates.discharge_date,
        discharge_reason: statusForm.discharge_reason, discharge_notes: statusForm.discharge_notes || null,
        balance_at_discharge: balanceAtDischarge, discharged_by: user?.email || user?.id || null,
        successful_discharge: updates.successful_discharge,
        graduate: updates.graduate,
        discharge_type: statusForm.discharge_type || null,
        ua_at_discharge: statusForm.ua_at_discharge || null,
        two_week_notice: statusForm.two_week_notice || null,
        not_allowed_back: statusForm.not_allowed_back || false,
        needs_review_before_readmit: statusForm.needs_review_before_readmit || false,
      }]).select('id').single();

      const stayId = stayData?.id;

      // Upload discharge photos
      if (statusForm.discharge_photos?.length && stayId) {
        for (const file of statusForm.discharge_photos) {
          const path = `discharge/${client.id}/${stayId}/${Date.now()}-${file.name}`;
          await supabase.storage.from('discharge-photos').upload(path, file, { upsert: true });
        }
      }

      // Update client flags
      if (statusForm.not_allowed_back || statusForm.needs_review_before_readmit) {
        await supabase.from('clients').update({
          not_allowed_back: statusForm.not_allowed_back || false,
          needs_review_before_readmit: statusForm.needs_review_before_readmit || false,
        }).eq('id', client.id);
      }

      if (client.house_id) {
        const { data: houseData } = await supabase.from('houses').select('occupied_beds').eq('id', client.house_id).single();
        if (houseData) await supabase.from('houses').update({ occupied_beds: Math.max((houseData.occupied_beds || 0) - 1, 0) }).eq('id', client.house_id);
      }
    }

    const { error } = await supabase.from('clients').update(updates).eq('id', client.id);
    if (error) { alert('Error updating status: ' + error.message); return; }
    setStatusModal(null);
    fetchClients();
    if (selected?.id === client.id) {
      setSelected({ ...selected, ...updates });
      if (newStatus === 'Discharged') fetchStays(client.id);
    }

    // Fire notification to house managers of the relevant house
    const notifHouseId = updates.house_id || client.house_id;
    if (notifHouseId) {
      await sendHouseNotification({
        houseId: notifHouseId,
        type: NOTIF_TYPES.CLIENT_STATUS_CHANGE,
        message: `${client.full_name} moved to ${newStatus}`,
        clientId: client.id,
      });
    }

    // Fire confirmed move-in email
    if (newStatus === 'Active') {
      const houseName = houses.find(h => h.id === (updates.house_id || client.house_id))?.name || client.house_name || 'Unknown House';
      const moveInDate = statusForm.move_in_date
        ? new Date(statusForm.move_in_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : 'Not specified';
      const MOVE_IN_URL = 'https://pmvxnetpbxuzkrxitioc.supabase.co';
      const MOVE_IN_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdnhuZXRwYnh1emtyeGl0aW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjE1NDcsImV4cCI6MjA5MDgzNzU0N30.IRRDTmFc3Ew1GWk69q0pSRTezsJOskK43yklIK4h2Xc';
      fetch(`${MOVE_IN_URL}/functions/v1/confirmed-move-in-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': MOVE_IN_KEY, 'Authorization': `Bearer ${MOVE_IN_KEY}` },
        body: JSON.stringify({
          client_name: client.full_name,
          house_name: houseName,
          move_in_date: moveInDate,
          level: updates.level || 1,
          early_admission: statusForm.early_admission || false,
        }),
      }).catch(err => console.error('Move-in notify error:', err));
    }
    setConfirmingStatus(false);
  };

  const dropPin = () => {
    if (!navigator.geolocation) { alert('Geolocation is not supported by your browser.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setEntryForm(p => ({ ...p, latitude: pos.coords.latitude.toString(), longitude: pos.coords.longitude.toString(), pinDropped: true })),
      () => alert('Unable to get location. Please allow location access.')
    );
  };

  const saveTimelineEntry = async () => {
    if (!entryForm.author) { alert('Author is required.'); return; }
    let reflectionData = null;
    if (entryType === 'Weekly Reflection') {
      reflectionData = JSON.stringify({
        mood: entryForm.reflection_mood, challenge: entryForm.reflection_challenge,
        win: entryForm.reflection_win, goals: entryForm.reflection_goals,
      });
    }
    // Upload photo if attached
    let photoUrl = null;
    if (entryForm.photo_file) {
      const ext = entryForm.photo_file.name.split('.').pop();
      const path = `${selected.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('timeline-photos').upload(path, entryForm.photo_file, { upsert: true });
      if (uploadErr) { alert('Photo upload failed: ' + uploadErr.message); return; }
      const { data: urlData } = supabase.storage.from('timeline-photos').getPublicUrl(path);
      photoUrl = urlData.publicUrl;
    }
    const { error } = await supabase.from('client_timeline').insert([{
      client_id: selected.id, entry_type: entryType, author: entryForm.author,
      notes: entryType === 'Weekly Check-In' ? (entryForm.wci_reflection || null) : (entryForm.notes || null),
      severity: entryType === 'Crisis' ? entryForm.severity : entryType === 'Infraction' ? entryForm.severity : null,
      event_name: entryType === 'UA' ? entryForm.ua_result : entryType === 'Chores' ? entryForm.chore_status : null,
      meeting_name: entryType === 'Meeting' ? entryForm.meeting_name : entryType === 'Chores' ? entryForm.chore_name : null,
      mood_value: entryType === 'Mood Check-In' ? parseInt(entryForm.mood_value) : null,
      reflection_data: reflectionData,
      latitude: entryForm.latitude ? parseFloat(entryForm.latitude) : null,
      longitude: entryForm.longitude ? parseFloat(entryForm.longitude) : null,
      photo_url: photoUrl,
      source: 'staff',
      checkin_meetings: entryType === 'Weekly Check-In' && entryForm.wci_meetings !== '' ? parseInt(entryForm.wci_meetings) : null,
      checkin_sponsor_contacts: entryType === 'Weekly Check-In' && entryForm.wci_sponsor_contacts !== '' ? parseInt(entryForm.wci_sponsor_contacts) : null,
      checkin_chore: entryType === 'Weekly Check-In' ? (entryForm.wci_chore || null) : null,
      checkin_chore_completed: entryType === 'Weekly Check-In' && entryForm.wci_chore_completed !== '' ? entryForm.wci_chore_completed === 'yes' : null,
      checkin_employed: entryType === 'Weekly Check-In' && entryForm.wci_employed !== '' ? entryForm.wci_employed === 'yes' : null,
      checkin_employer: entryType === 'Weekly Check-In' ? (entryForm.wci_employer || null) : null,
      checkin_payment_plan: entryType === 'Weekly Check-In' ? (entryForm.wci_payment_plan || null) : null,
    }]);
    if (error) { alert('Error saving entry: ' + error.message); return; }

    // Fire notifications for relevant entry types
    if (selected?.house_id) {
      if (entryType === 'UA' && entryForm.ua_result === 'Positive') {
        await sendHouseNotification({
          houseId: selected.house_id,
          type: NOTIF_TYPES.CLIENT_POSITIVE_UA,
          message: `Positive UA logged for ${selected.full_name}`,
          clientId: selected.id,
        });
      }
      if (entryType === 'Crisis') {
        await sendHouseNotification({
          houseId: selected.house_id,
          type: NOTIF_TYPES.CLIENT_CRISIS,
          message: `Crisis entry logged for ${selected.full_name}${entryForm.severity ? ` (${entryForm.severity})` : ''}`,
          clientId: selected.id,
        });
      }
    }

    setShowAddEntry(false);
    setEntryForm({ author: fullName || user?.email || '', notes: '', severity: 'Low', meeting_name: '', chore_name: '', chore_status: 'Completed', mood_value: '5', ua_result: 'Negative', checkin_status: 'Here', latitude: '', longitude: '', pinDropped: false, reflection_mood: '5', reflection_challenge: '', reflection_win: '', reflection_goals: '', photo_file: null, photo_preview: null, wci_meetings: '', wci_sponsor_contacts: '', wci_chore: '', wci_chore_completed: '', wci_employed: '', wci_employer: '', wci_payment_plan: '', wci_reflection: '' });
    setEntryType('General Note');
    fetchTimeline(selected.id);
    fetchFullHistory(selected.id);
  };

  const deleteTimelineEntry = async (id) => {
    if (!window.confirm('Delete this entry?')) return;
    await supabase.from('client_timeline').delete().eq('id', id);
    fetchTimeline(selected.id);
    fetchFullHistory(selected.id);
  };

  const openProfile = (client) => {
    setSelected(client);
    setActiveTab('overview');
    setEditingField(null);
    setTimeline([]);
    setTimelineTotal(0);
    setStays([]);
    setLatestCheckIn(null);
    setClientBalance(null);
    fetchTimeline(client.id);
    fetchFullHistory(client.id);
    fetchLatestReflection(client.id);
    fetchStays(client.id);
    fetchClientBalance(client.id);
    supabase.from('client_timeline').select('*').eq('client_id', client.id).eq('entry_type', 'Weekly Check-In')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data) setLatestCheckIn(data); });
  };

  const updateLevel = async (clientId, lvl) => {
    await supabase.from('clients').update({ level: lvl }).eq('id', clientId);
    fetchClients();
    setSelected(prev => prev ? { ...prev, level: lvl } : prev);
    if (selected?.house_id) {
      await sendHouseNotification({
        houseId: selected.house_id,
        type: NOTIF_TYPES.CLIENT_LEVEL_CHANGE,
        message: `${selected.full_name} moved to Level ${lvl}`,
        clientId,
      });
    }
  };

  const saveNotes = async (e) => {
    const newNotes = e.target.value;
    await supabase.from('clients').update({ client_notes: newNotes || null }).eq('id', selected.id);
    setSelected(prev => ({ ...prev, client_notes: newNotes }));
    setClients(prev => prev.map(c => c.id === selected.id ? { ...c, client_notes: newNotes } : c));
  };

  const startEdit = (field, currentValue) => setEditingField({ field, value: currentValue || '' });

  const saveField = async () => {
    if (!editingField) return;
    const { field, value } = editingField;
    await supabase.from('clients').update({ [field]: value || null }).eq('id', selected.id);
    // If editing move-in date, also update the active client_stay
    if (field === 'start_date' && value) {
      await supabase.from('client_stays')
        .update({ start_date: value })
        .eq('client_id', selected.id)
        .is('discharge_date', null);
    }
    setSelected(prev => ({ ...prev, [field]: value }));
    setClients(prev => prev.map(c => c.id === selected.id ? { ...c, [field]: value } : c));
    setEditingField(null);
  };

  const EarlyAdmissionField = () => {
    const [editing, setEditing] = useState(false);
    const [checked, setChecked] = useState(selected.early_admission || false);
    const [notes, setNotes] = useState(selected.early_admission_notes || '');

    const save = async () => {
      await supabase.from('clients').update({
        early_admission: checked,
        early_admission_notes: notes || null,
      }).eq('id', selected.id);
      setSelected(prev => ({ ...prev, early_admission: checked, early_admission_notes: notes }));
      setClients(prev => prev.map(c => c.id === selected.id ? { ...c, early_admission: checked, early_admission_notes: notes } : c));
      setEditing(false);
    };

    const cancel = () => {
      setChecked(selected.early_admission || false);
      setNotes(selected.early_admission_notes || '');
      setEditing(false);
    };

    return (
      <div style={{ padding: '6px 0', borderBottom: '1px solid #32323e' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '14px', color: '#999', flexShrink: 0 }}>⭐ Early Admission</span>
          {!editing ? (
            <span onClick={() => setEditing(true)} title="Click to edit"
              style={{ fontSize: '14px', color: selected.early_admission ? '#fbbf24' : '#999', cursor: 'text', padding: '1px 4px', borderRadius: '4px', border: '1px solid transparent', transition: 'border-color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#999'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
              {selected.early_admission ? 'Yes' : 'No'}
            </span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
                style={{ width: '15px', height: '15px', accentColor: '#b22222', cursor: 'pointer' }} />
              <span style={{ fontSize: '14px', color: '#ddd' }}>{checked ? 'Yes' : 'No'}</span>
            </div>
          )}
        </div>
        {editing && (
          <div style={{ marginTop: '8px' }}>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Reason for early admission..."
              rows={3}
              style={{ width: '100%', background: '#1e1e24', border: '1px solid #555', borderRadius: '6px', color: '#fff', fontSize: '14px', padding: '6px 8px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <button onClick={save} style={{ padding: '4px 12px', background: '#b22222', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>Save</button>
              <button onClick={cancel} style={{ padding: '4px 12px', background: '#26262e', color: '#aaa', border: '1px solid #32323e', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}
        {!editing && selected.early_admission && selected.early_admission_notes && (
          <p style={{ fontSize: '13px', color: '#888', margin: '4px 0 0 0', fontStyle: 'italic' }}>{selected.early_admission_notes}</p>
        )}
      </div>
    );
  };

  const EditableField = ({ label, field, value, alert: isAlert, options, type }) => {
    const isEditing = editingField?.field === field;
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid #32323e', gap: '12px' }}>
        <span style={{ fontSize: '14px', color: '#999', flexShrink: 0 }}>{label}</span>
        {isEditing ? (
          options ? (
            <select autoFocus value={editingField.value} onChange={e => setEditingField(p => ({ ...p, value: e.target.value }))} onBlur={saveField}
              style={{ background: '#1e1e24', border: '1px solid #555', borderRadius: '4px', color: '#fff', fontSize: '14px', padding: '1px 6px', outline: 'none', maxWidth: '200px' }}>
              <option value="">—</option>
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input autoFocus type={type || 'text'} value={editingField.value} onChange={e => setEditingField(p => ({ ...p, value: e.target.value }))} onBlur={saveField}
              onKeyDown={e => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') setEditingField(null); }}
              style={{ background: '#1e1e24', border: '1px solid #555', borderRadius: '4px', color: '#fff', fontSize: '14px', padding: '1px 6px', outline: 'none', width: '100%', maxWidth: '200px', textAlign: 'right' }} />
          )
        ) : (
          <span onClick={() => startEdit(field, value)} title="Click to edit"
            style={{ fontSize: '14px', color: isAlert ? '#f87171' : value ? '#ddd' : '#999', textAlign: 'right', wordBreak: 'break-word', cursor: 'text', padding: '1px 4px', borderRadius: '4px', border: '1px solid transparent', transition: 'border-color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#999'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
            {value || '—'}
          </span>
        )}
      </div>
    );
  };

  const ReadField = ({ label, value, alert: isAlert }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid #32323e', gap: '12px' }}>
      <span style={{ fontSize: '14px', color: '#999', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '14px', color: isAlert ? '#f87171' : value ? '#ddd' : '#999', textAlign: 'right', wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  );

  const Avatar = ({ name, photoUrl, size = 34, fontSize = 13 }) => (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#1e3a2f', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize, fontWeight: '500', flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
      {photoUrl ? <img src={photoUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0, borderRadius: '50%' }} /> : initials(name)}
    </div>
  );

  const LocationPin = ({ entryId, lat, lng }) => {
    const address = locationLabels[entryId];
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    return (
      <div style={{ background: '#26262e', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <span>📍</span>
          <span style={{ fontSize: '14px', color: '#aaa', lineHeight: '1.4' }}>{address || `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`}</span>
        </div>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', color: '#60a5fa', textDecoration: 'none', whiteSpace: 'nowrap', padding: '3px 8px', border: '1px solid #2a3d52', borderRadius: '4px', flexShrink: 0 }}>View map →</a>
      </div>
    );
  };

  const MeetingWeek = ({ weekStart, entries }) => {
    const key = weekStart.toISOString();
    const isExpanded = expandedWeeks[key];
    const isThisWeek = getWeekStart(new Date()).toISOString() === key;
    const count = entries.length;
    const meetsGoal = count >= 4;
    return (
      <div style={{ background: '#1c1c24', borderRadius: '10px', border: `1px solid ${isThisWeek ? '#2a3d52' : '#333'}`, marginBottom: '10px', overflow: 'hidden' }}>
        <div onClick={() => toggleWeek(key)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '14px', color: '#ddd', fontWeight: '500' }}>{formatWeekLabel(weekStart)}</span>
            {isThisWeek && <span style={{ fontSize: '13px', padding: '2px 7px', borderRadius: '10px', background: '#1e2d3a', color: '#60a5fa', fontWeight: '600' }}>This week</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '14px', fontWeight: '700', color: meetsGoal ? '#4ade80' : '#f87171' }}>{count} / 4 meetings</span>
            <span style={{ fontSize: '14px', color: meetsGoal ? '#4ade80' : '#f87171' }}>{meetsGoal ? '✓' : '✗'}</span>
            <span style={{ color: '#bbb', fontSize: '14px' }}>{isExpanded ? '▲' : '▼'}</span>
          </div>
        </div>
        {isExpanded && (
          <div style={{ borderTop: '1px solid #32323e', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {entries.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '14px', color: '#60a5fa', fontWeight: '500' }}>{m.meeting_name || 'Meeting'}</span>
                    <span style={{ fontSize: '14px', color: '#bbb' }}>by {m.author}</span>
                  </div>
                  {m.latitude && m.longitude && <LocationPin entryId={m.id} lat={m.latitude} lng={m.longitude} />}
                  {m.notes && <p style={{ color: '#bbb', fontSize: '14px', margin: '4px 0 0 0', lineHeight: '1.4' }}>{m.notes}</p>}
                </div>
                <span style={{ fontSize: '14px', color: '#bbb', whiteSpace: 'nowrap', flexShrink: 0 }}>{formatDateShort(m.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const ChoreWeek = ({ weekStart, entries }) => {
    const key = weekStart.toISOString();
    const isExpanded = expandedWeeks[key];
    const isThisWeek = getWeekStart(new Date()).toISOString() === key;
    const completed = entries.filter(c => c.event_name === 'Completed').length;
    const notCompleted = entries.filter(c => c.event_name === 'Not Completed').length;
    const partial = entries.filter(c => c.event_name === 'Partial').length;
    const total = entries.length;
    const allDone = total > 0 && notCompleted === 0 && partial === 0;
    return (
      <div style={{ background: '#1c1c24', borderRadius: '10px', border: `1px solid ${isThisWeek ? '#1a3a2a' : '#333'}`, marginBottom: '10px', overflow: 'hidden' }}>
        <div onClick={() => toggleWeek(key)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '14px', color: '#ddd', fontWeight: '500' }}>{formatWeekLabel(weekStart)}</span>
            {isThisWeek && <span style={{ fontSize: '13px', padding: '2px 7px', borderRadius: '10px', background: '#1e3a2f', color: '#4ade80', fontWeight: '600' }}>This week</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              {completed > 0 && <span style={{ fontSize: '14px', padding: '2px 7px', borderRadius: '10px', background: '#1e3a2f', color: '#4ade80' }}>{completed} done</span>}
              {partial > 0 && <span style={{ fontSize: '14px', padding: '2px 7px', borderRadius: '10px', background: '#3a2d1e', color: '#fb923c' }}>{partial} partial</span>}
              {notCompleted > 0 && <span style={{ fontSize: '14px', padding: '2px 7px', borderRadius: '10px', background: '#3a1e1e', color: '#f87171' }}>{notCompleted} missed</span>}
            </div>
            <span style={{ color: allDone ? '#4ade80' : notCompleted > 0 ? '#f87171' : '#fb923c', fontSize: '14px' }}>{allDone ? '✓' : '✗'}</span>
            <span style={{ color: '#bbb', fontSize: '14px' }}>{isExpanded ? '▲' : '▼'}</span>
          </div>
        </div>
        {isExpanded && (
          <div style={{ borderTop: '1px solid #32323e', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {entries.map(c => {
              const col = choreStatusColor(c.event_name);
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, flexWrap: 'wrap' }}>
                    <span style={{ ...st.badge, background: col.bg, color: col.color, fontSize: '14px' }}>{c.event_name}</span>
                    {c.meeting_name && <span style={{ fontSize: '14px', color: '#ddd', fontWeight: '500' }}>{c.meeting_name}</span>}
                    <span style={{ fontSize: '14px', color: '#bbb' }}>by {c.author}</span>
                    {c.notes && <span style={{ fontSize: '14px', color: '#999' }}>— {c.notes}</span>}
                  </div>
                  <span style={{ fontSize: '14px', color: '#bbb', whiteSpace: 'nowrap', flexShrink: 0 }}>{formatDateShort(c.created_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalCount);
  const isMoreTabActive = MORE_TABS.includes(activeTab);

  return (
    <div style={st.page}>
      <div style={st.header}>
        <h2 style={st.title}>Clients</h2>
        <p style={st.sub}>
          {totalCount > 0
            ? `Showing ${rangeStart}–${rangeEnd} of ${totalCount} ${statusFilter === 'All' ? (viewMode === 'archive' ? 'archived' : 'total') : statusFilter.toLowerCase()}`
            : `0 ${statusFilter === 'All' ? (viewMode === 'archive' ? 'archived' : 'total') : statusFilter.toLowerCase()}`}
          {isHouseManagerRole ? ' in your house(s)' : ''}
        </p>
      </div>

      <div style={st.toolbar}>
        <input placeholder="Search by name..." value={search} onChange={e => setSearch(e.target.value)} style={st.search} />
        {hasFullAccess && (
          <div style={st.viewToggleWrap}>
            <button onClick={() => { setViewMode('operational'); setStatusFilter('Active'); setCurrentPage(1); }} style={{ ...st.filterBtn, ...(viewMode === 'operational' ? st.filterActive : {}) }}>Operational</button>
            <button onClick={() => { setViewMode('archive'); setStatusFilter('All'); setCurrentPage(1); }} style={{ ...st.filterBtn, ...(viewMode === 'archive' ? st.filterActive : {}) }}>Archive</button>
          </div>
        )}
        <div style={st.filters}>
          {statusFilters.map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={{ ...st.filterBtn, ...(statusFilter === f ? st.filterActive : {}) }}>{f}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <p style={{ color: '#bbb', padding: '20px' }}>Loading clients...</p>
      ) : clients.length === 0 ? (
        <p style={{ color: '#bbb', padding: '20px' }}>{isHouseManagerRole ? 'No clients found in your assigned house(s).' : 'No clients found.'}</p>
      ) : (
        <>
          <div style={st.table}>
            <div style={st.tableHeader}>
              <span style={{ flex: 2 }}>Name</span>
              <span style={{ flex: 1 }}>Status</span>
              <span style={{ flex: 1 }}>Level</span>
              <span style={{ flex: 2 }}>House</span>
              <span style={{ flex: 1 }}>Start Date</span>
            </div>
            {clients.map(c => (
              <div key={c.id} style={st.row} onClick={() => openProfile(c)}>
                <span style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Avatar name={c.full_name} photoUrl={c.photo_url} size={34} fontSize={13} />
                  <span style={{ color: '#fff', fontWeight: '500' }}>{c.full_name}</span>
                </span>
                <span style={{ flex: 1 }}><span style={{ ...st.badge, background: statusColor(c.status).bg, color: statusColor(c.status).color }}>{c.status || '—'}</span></span>
                <span style={{ flex: 1, color: '#aaa' }}>{c.status === 'Active' && c.level ? `Level ${c.level}` : '—'}</span>
                <span style={{ flex: 2, color: '#aaa' }}>{c.house_name || '—'}</span>
                <span style={{ flex: 1, color: '#aaa' }}>{c.start_date || '—'}</span>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div style={st.pagination}>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ ...st.pageBtn, ...(currentPage === 1 ? st.pageBtnDisabled : {}) }}>← Previous</button>
              <div style={st.pageNumbers}>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                  .reduce((acc, p, idx, arr) => { if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...'); acc.push(p); return acc; }, [])
                  .map((p, i) => p === '...' ? (
                    <span key={`ellipsis-${i}`} style={st.ellipsis}>…</span>
                  ) : (
                    <button key={p} onClick={() => setCurrentPage(p)} style={{ ...st.pageBtn, ...(currentPage === p ? st.pageBtnActive : {}) }}>{p}</button>
                  ))}
              </div>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ ...st.pageBtn, ...(currentPage === totalPages ? st.pageBtnDisabled : {}) }}>Next →</button>
            </div>
          )}
        </>
      )}

      {selected && (
        <div style={st.overlay} onClick={() => { setSelected(null); setEditingField(null); }}>
          <div style={st.modal} onClick={e => e.stopPropagation()}>

            {/* ── Modal Header ── */}
            <div style={st.modalHeader}>
              <Avatar name={selected.full_name} photoUrl={selected.photo_url} size={52} fontSize={16} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={st.modalName}>{selected.full_name}</h2>
                <p style={st.modalSub}>{selected.house_name || 'No house assigned'} &nbsp;·&nbsp; {selected.start_date ? `Started ${selected.start_date}` : 'No start date'}</p>
                <div style={st.badges}>
                  <span style={{ ...st.badge, background: statusColor(selected.status).bg, color: statusColor(selected.status).color }}>{selected.status || 'Applied'}</span>
                  {selected.status === 'Active' && (
                    <select value={selected.level || 1} onChange={e => updateLevel(selected.id, parseInt(e.target.value))} onClick={e => e.stopPropagation()}
                      style={{ fontSize: '14px', padding: '3px 8px', borderRadius: '20px', fontWeight: '500', background: '#1e2d3a', color: '#60a5fa', border: '1px solid #2a3d52', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', outline: 'none' }}>
                      <option value={1}>Level 1</option><option value={2}>Level 2</option><option value={3}>Level 3</option><option value={4}>Level 4</option>
                    </select>
                  )}
                  {selected.sor_grant && <span style={{ ...st.badge, background: '#3a2d1e', color: '#fb923c' }}>SOR grant</span>}
                  {selected.oud === 'Yes' && <span style={{ ...st.badge, background: '#1e3a2f', color: '#4ade80' }}>OUD</span>}
                </div>
              </div>
              {/* Action buttons top-right */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                {onBackToHouses && (
                  <button onClick={() => { setSelected(null); setEditingField(null); onBackToHouses(); }}
                    style={{ background: 'transparent', border: '1px solid #3a3a48', color: '#aaa', fontSize: '14px', padding: '5px 10px', borderRadius: '7px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    ← Houses
                  </button>
                )}
                {hasFullAccess && <MoveToButton client={selected} onSelect={(ns) => openStatusModal(selected, ns)} />}
                {selected.email && hasFullAccess && <InvitePortalButton client={selected} />}
                <button onClick={() => { setSelected(null); setEditingField(null); }} style={st.closeBtn}>×</button>
              </div>
            </div>

            {/* ── Tabs with More dropdown ── */}
            <div style={{ ...st.tabs, position: 'relative' }}>
              {PRIMARY_TABS.map(t => (
                <button key={t} onClick={() => { setActiveTab(t); setEditingField(null); }} style={{ ...st.tab, ...(activeTab === t ? st.tabActive : {}) }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
              <div ref={moreTabRef} style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
                <button onClick={() => setShowMoreTabs(o => !o)}
                  style={{ ...st.tab, ...(isMoreTabActive ? st.tabActive : {}), display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {isMoreTabActive ? activeTab.charAt(0).toUpperCase() + activeTab.slice(1) : 'More'} {showMoreTabs ? '▲' : '▼'}
                </button>
                {showMoreTabs && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, background: '#1c1c24', border: '1px solid #32323e', borderRadius: '10px', overflow: 'hidden', zIndex: 50, minWidth: '140px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                    {MORE_TABS.map(t => (
                      <button key={t} onClick={() => { setActiveTab(t); setEditingField(null); setShowMoreTabs(false); }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: activeTab === t ? '#333' : 'transparent', border: 'none', color: activeTab === t ? '#fff' : '#aaa', fontSize: '14px', cursor: 'pointer', borderBottom: '1px solid #2a2a2a' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#333'}
                        onMouseLeave={e => e.currentTarget.style.background = activeTab === t ? '#333' : 'transparent'}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={st.modalBody}>
              {activeTab === 'overview' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {clientBalance !== null && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                          <span style={{ fontSize: '22px', fontWeight: '700', color: clientBalance > 0 ? '#f87171' : clientBalance < 0 ? '#4ade80' : '#bbb' }}>
                            {clientBalance > 0 ? `$${clientBalance.toFixed(2)}` : clientBalance < 0 ? `$${Math.abs(clientBalance).toFixed(2)}` : '$0.00'}
                          </span>
                          <span style={{ fontSize: '13px', color: clientBalance > 0 ? '#f87171' : clientBalance < 0 ? '#4ade80' : '#bbb' }}>
                            {clientBalance > 0 ? 'owed' : clientBalance < 0 ? 'credit' : 'paid in full'}
                          </span>
                          <button onClick={() => setActiveTab('payments')}
                            style={{ fontSize: '12px', color: '#60a5fa', background: 'transparent', border: '1px solid #2a3d52', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer', marginLeft: '4px' }}>
                            View payments →
                          </button>
                        </div>
                      )}
                      <p style={{ fontSize: '14px', color: '#555', margin: 0, fontStyle: 'italic' }}>Click any field to edit.</p>
                    </div>
                    {hasFullAccess && (
                      <button onClick={() => {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        img.onload = () => {
                          const canvas = document.createElement('canvas');
                          canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
                          canvas.getContext('2d').drawImage(img, 0, 0);
                          generateProgressReportPDF(selected, uaRecords, meetingRecords, choreRecords, stays, latestCheckIn, canvas.toDataURL('image/jpeg'));
                        };
                        img.onerror = () => generateProgressReportPDF(selected, uaRecords, meetingRecords, choreRecords, stays, latestCheckIn, null);
                        img.src = klLogo;
                      }} style={{ padding: '5px 12px', background: '#1e2d3a', border: '1px solid #2a3d52', borderRadius: '6px', color: '#60a5fa', fontSize: '13px', cursor: 'pointer', fontWeight: '500', whiteSpace: 'nowrap' }}>
                        📄 Progress Report
                      </button>
                    )}
                  </div>
                  <div style={st.grid}>
                    <Card title="Contact info">
                      <EditableField label="Phone" field="phone" value={selected.phone} />
                      <EditableField label="Email" field="email" value={selected.email} />
                      <EditableField label="DOB" field="date_of_birth" value={selected.date_of_birth} />
                      <EditableField label="Gender" field="gender" value={selected.gender} options={['Male', 'Female', 'Non-binary', 'No Response']} />
                      <p style={{ fontSize: '13px', color: '#777', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '16px 0 6px 0' }}>Emergency Contact</p>
                      <EditableField label="Name" field="emergency_contact_name" value={selected.emergency_contact_name} />
                      <EditableField label="Phone" field="emergency_contact_phone" value={selected.emergency_contact_phone} />
                      <EditableField label="Relationship" field="emergency_contact_relationship" value={selected.emergency_contact_relationship} />
                    </Card>
                    <Card title="House assignment" action={
                      selected.status === 'Active' && selected.house_id && hasFullAccess ? (
                        <button onClick={() => { setSelected(null); setEditingField(null); setMoveHouseModal(selected); }}
                          style={{ padding: '2px 8px', background: 'transparent', border: 'none', borderRadius: '4px', color: '#60a5fa', fontSize: '12px', fontWeight: '500', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          ⇄ Transfer
                        </button>
                      ) : null
                    }>
                      <ReadField label="House" value={selected.house_name} />
                      <EditableField label="Room type" field="room_type" value={selected.room_type} options={['Single', 'Double', 'Houseperson']} />
                      <ReadField label="House manager" value={selected.house_manager} />
                      <EditableField label="Move-in date" field="start_date" value={selected.start_date} type="date" />
                      {selected.status === 'Pending' && (
                        <EditableField label="Expected move-in" field="expected_move_in_date" value={selected.expected_move_in_date} />
                      )}
                      <EarlyAdmissionField />
                    </Card>
                    <Card title="PO & legal">
                      <EditableField label="PO name" field="po_name" value={selected.po_name} />
                      <EditableField label="PO phone" field="po_phone" value={selected.po_phone} />
                      <EditableField label="PO email" field="po_email" value={selected.po_email} />
                      <EditableField label="Personal status" field="personal_status" value={selected.personal_status} alert={selected.personal_status === 'Currently Incarcerated'} options={['Currently Incarcerated', 'Homeless', 'Housing Insecure', 'Currently staying at Inpatient Treatment', 'Currently being referred by Recovery Community Center']} />
                      <EditableField label="Sex offense" field="sex_offender" value={selected.sex_offender} options={['Yes', 'No']} />
                      <EditableField label="On probation" field="on_probation" value={selected.on_probation} options={['Yes', 'No']} />
                      <EditableField label="On parole" field="on_parole" value={selected.on_parole} options={['Yes', 'No']} />
                    </Card>
                    <Card title="Sponsor">
                      <EditableField label="Sponsor name" field="sponsor_name" value={selected.sponsor_name} />
                      <EditableField label="Sponsor phone" field="sponsor_phone" value={selected.sponsor_phone} />
                      <EditableField label="Recovery meetings" field="recovery_meetings" value={selected.recovery_meetings} options={['AA', 'NA', 'Both AA & NA', 'Smart Recovery', 'Other', 'None']} />
                    </Card>
                    <Card title="Recovery">
                      <EditableField label="Substance history" field="substance_history" value={selected.substance_history} options={['Yes', 'No']} />
                      <EditableField label="Drug of choice" field="drug_of_choice" value={selected.drug_of_choice} />
                      <EditableField label="Sober date" field="sober_date" value={selected.sober_date} />
                      <EditableField label="Treatment history" field="treatment_history" value={selected.treatment_history} options={['Yes', 'No']} />
                      <EditableField label="OUD" field="oud" value={selected.oud} options={['Yes', 'No']} />
                    </Card>
                    <Card title="Latest Weekly Check-In">
                      <LatestCheckIn clientId={selected.id} />
                    </Card>
                    {selected.status === 'Active' && (
                      <Card title="Level Progress" full>
                        <ClientLevelProgress client={selected} currentUser={user} />
                      </Card>
                    )}
                  </div>
                </>
              )}

              {activeTab === 'UAs' && (
                <Card title="UA Records" full action={
                  uaRecords.length > 0 && hasFullAccess ? (
                    <button onClick={() => {
                      const img = new Image();
                      img.crossOrigin = 'anonymous';
                      img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
                        canvas.getContext('2d').drawImage(img, 0, 0);
                        generateUAHistoryPDF(selected, uaRecords, canvas.toDataURL('image/jpeg'));
                      };
                      img.onerror = () => generateUAHistoryPDF(selected, uaRecords, null);
                      img.src = klLogo;
                    }} style={{ padding: '4px 12px', background: '#2d1e3a', border: '1px solid #4a2a5a', borderRadius: '6px', color: '#c084fc', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
                      📄 UA Report
                    </button>
                  ) : null
                }>
                  {uaRecords.length === 0 ? <p style={{ color: '#999', fontSize: '14px' }}>No UA records yet.</p> : (
                    <>
                      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        {['Negative', 'Positive', 'Inconclusive', 'Refused'].map(result => {
                          const count = uaRecords.filter(u => u.event_name === result).length;
                          if (count === 0) return null;
                          const col = uaResultColor(result);
                          return (
                            <div key={result} style={{ background: col.bg, borderRadius: '8px', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ color: col.color, fontSize: '18px', fontWeight: '700' }}>{count}</span>
                              <span style={{ color: col.color, fontSize: '14px', opacity: 0.8 }}>{result}</span>
                            </div>
                          );
                        })}
                        <div style={{ background: '#26262e', borderRadius: '8px', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ color: '#fff', fontSize: '18px', fontWeight: '700' }}>{uaRecords.length}</span>
                          <span style={{ color: '#bbb', fontSize: '14px' }}>Total</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {uaRecords.map(ua => {
                          const col = uaResultColor(ua.event_name);
                          return (
                            <div key={ua.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#1c1c24', borderRadius: '8px', border: '1px solid #32323e' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ ...st.badge, background: col.bg, color: col.color, fontSize: '14px', padding: '3px 10px' }}>{ua.event_name || 'Unknown'}</span>
                                <span style={{ color: '#aaa', fontSize: '14px' }}>By {ua.author}</span>
                                {ua.source === 'house' && <span style={{ ...st.badge, background: '#1e2d3a', color: '#60a5fa', fontSize: '13px' }}>House</span>}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                <span style={{ color: '#bbb', fontSize: '14px' }}>{formatDateShort(ua.created_at)}</span>
                                {ua.notes && <span style={{ color: '#999', fontSize: '14px', maxWidth: '200px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ua.notes}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </Card>
              )}

              {stayDetailModal && (() => {
                const h = stayHistory[stayDetailModal.stayId];
                if (!h) return null;
                const fmt = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const fmtFull = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const tColors = { 'Crisis': '#dc2626', 'Infraction': '#dc2626', 'UA': '#f472b6', 'Meeting': '#60a5fa', 'Mood Check-In': '#BA7517', 'Check-In': '#c084fc', 'General Note': '#f59e0b', 'Chores': '#34d399', 'Weekly Reflection': '#a78bfa', 'House Check-In': '#7F77DD', 'Batch UA': '#1D9E75', 'Event Attendance': '#378ADD' };
                const titles = { timeline: 'Timeline Entries', checkins: 'Weekly Check-Ins', forms: 'Forms Submitted', balance: 'Charges & Payments' };

                return (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3500 }}
                    onClick={() => setStayDetailModal(null)}>
                    <div style={{ background: '#1c1c24', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '560px', maxHeight: '80vh', overflowY: 'auto', border: '1px solid #32323e' }}
                      onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                        <h3 style={{ color: '#fff', margin: 0, fontSize: '17px' }}>{titles[stayDetailModal.type]}</h3>
                        <button onClick={() => setStayDetailModal(null)} style={{ background: 'none', border: 'none', color: '#999', fontSize: '20px', cursor: 'pointer' }}>×</button>
                      </div>

                      {stayDetailModal.type === 'timeline' && (
                        h.timeline.length === 0 ? <p style={{ color: '#666', fontSize: '14px' }}>No timeline entries during this stay.</p> : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {h.timeline.map(e => (
                              <div key={e.id} style={{ background: '#1e1e24', border: '1px solid #2e2e3a', borderRadius: '8px', padding: '10px 12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: tColors[e.entry_type] || '#bbb', flexShrink: 0 }} />
                                  <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>{e.entry_type}</span>
                                  {e.ua_result && <span style={{ color: '#f472b6', fontSize: '13px' }}>{e.ua_result}</span>}
                                  {e.severity && <span style={{ color: '#fb923c', fontSize: '13px' }}>{e.severity}</span>}
                                  {e.mood_value && <span style={{ color: '#fb923c', fontSize: '13px' }}>Mood: {e.mood_value}/10</span>}
                                  <span style={{ color: '#666', fontSize: '13px', marginLeft: 'auto' }}>{fmtFull(e.created_at)}</span>
                                </div>
                                {e.notes && <p style={{ color: '#aaa', fontSize: '13px', margin: '4px 0 0 0', lineHeight: 1.5 }}>{e.notes}</p>}
                                {e.author && <p style={{ color: '#666', fontSize: '13px', margin: '4px 0 0 0' }}>By {e.author}</p>}
                              </div>
                            ))}
                          </div>
                        )
                      )}

                      {stayDetailModal.type === 'checkins' && (
                        h.checkIns.length === 0 ? <p style={{ color: '#666', fontSize: '14px' }}>No weekly check-ins during this stay.</p> : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {h.checkIns.map(e => (
                              <div key={e.id} style={{ background: '#1e1e24', border: '1px solid #2e2e3a', borderRadius: '8px', padding: '12px 14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                  <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>Weekly Check-In</span>
                                  <span style={{ color: '#666', fontSize: '13px' }}>{fmtFull(e.created_at)}</span>
                                </div>
                                <WeeklyCheckInCard entry={e} />
                              </div>
                            ))}
                          </div>
                        )
                      )}

                      {stayDetailModal.type === 'forms' && (
                        h.overnights.length === 0 && !h.welcomePacket ? <p style={{ color: '#666', fontSize: '14px' }}>No forms submitted during this stay.</p> : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {h.welcomePacket && (
                              <div style={{ background: '#1e1e24', border: '1px solid #2e2e3a', borderRadius: '8px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: '#34d399', fontSize: '14px', fontWeight: '500' }}>Welcome Packet</span>
                                <span style={{ color: '#666', fontSize: '13px' }}>{fmtFull(h.welcomePacket.created_at)}</span>
                              </div>
                            )}
                            {h.overnights.map(r => (
                              <div key={r.id} style={{ background: '#1e1e24', border: '1px solid #2e2e3a', borderRadius: '8px', padding: '10px 12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                  <span style={{ color: '#fb923c', fontSize: '14px', fontWeight: '500' }}>Overnight Pass Request</span>
                                  <span style={{ fontSize: '13px', padding: '2px 8px', borderRadius: '10px', background: r.status === 'approved' ? '#1e3a2f' : r.status === 'denied' ? '#3a1e1e' : '#2a2a2a', color: r.status === 'approved' ? '#4ade80' : r.status === 'denied' ? '#f87171' : '#aaa' }}>{r.status || 'pending'}</span>
                                </div>
                                <p style={{ color: '#ddd', fontSize: '14px', margin: '0 0 2px' }}>{fmt(r.departure_datetime || r.start_date)} → {fmt(r.return_datetime || r.end_date)}</p>
                                {r.reason && <p style={{ color: '#999', fontSize: '13px', margin: 0 }}>Reason: {r.reason}</p>}
                              </div>
                            ))}
                          </div>
                        )
                      )}

                      {stayDetailModal.type === 'balance' && (
                        <>
                          <p style={{ color: '#bbb', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Charges</p>
                          {h.charges.length === 0 ? <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>No charges during this stay.</p> : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '18px' }}>
                              {h.charges.map(c => (
                                <div key={c.id} style={{ background: '#1e1e24', border: '1px solid #2e2e3a', borderRadius: '8px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <span style={{ color: '#ddd', fontSize: '14px' }}>{c.description || c.charge_type || 'Charge'}</span>
                                    {c.due_date && <span style={{ color: '#666', fontSize: '13px', marginLeft: '8px' }}>Due {fmt(c.due_date)}</span>}
                                  </div>
                                  <span style={{ color: '#f87171', fontSize: '14px', fontWeight: '600' }}>${parseFloat(c.amount || 0).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <p style={{ color: '#bbb', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Payments</p>
                          {h.payments.length === 0 ? <p style={{ color: '#666', fontSize: '14px' }}>No payments during this stay.</p> : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {h.payments.map(p => (
                                <div key={p.id} style={{ background: '#1e1e24', border: '1px solid #2e2e3a', borderRadius: '8px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <span style={{ color: '#ddd', fontSize: '14px' }}>{p.payment_method ? p.payment_method.charAt(0).toUpperCase() + p.payment_method.slice(1) : 'Payment'}</span>
                                    {p.payment_date && <span style={{ color: '#666', fontSize: '13px', marginLeft: '8px' }}>{fmt(p.payment_date)}</span>}
                                    {p.notes && <span style={{ color: '#999', fontSize: '13px', marginLeft: '8px' }}>{p.notes}</span>}
                                  </div>
                                  <span style={{ color: '#4ade80', fontSize: '14px', fontWeight: '600' }}>${parseFloat(p.amount || 0).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {activeTab === 'meetings' && (
                <Card title="Meeting Records" full>
                  {meetingRecords.length === 0 ? <p style={{ color: '#999', fontSize: '14px' }}>No meeting records yet.</p> : (
                    <>
                      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <div style={{ background: '#1e2d3a', borderRadius: '8px', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ color: '#60a5fa', fontSize: '18px', fontWeight: '700' }}>{meetingRecords.length}</span>
                          <span style={{ color: '#60a5fa', fontSize: '14px', opacity: 0.8 }}>Total Meetings</span>
                        </div>
                      </div>
                      <p style={{ fontSize: '14px', color: '#bbb', margin: '0 0 12px 0' }}>Goal: 4 meetings per week. Current week expands automatically.</p>
                      {groupByWeek(meetingRecords).map(({ weekStart, entries }) => (
                        <MeetingWeek key={weekStart.toISOString()} weekStart={weekStart} entries={entries} />
                      ))}
                    </>
                  )}
                </Card>
              )}

              {activeTab === 'chores' && (
                <Card title="Chore Records" full>
                  {choreRecords.length === 0 ? <p style={{ color: '#999', fontSize: '14px' }}>No chore records yet.</p> : (
                    <>
                      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        {['Completed', 'Not Completed', 'Partial'].map(status => {
                          const count = choreRecords.filter(c => c.event_name === status).length;
                          if (count === 0) return null;
                          const col = choreStatusColor(status);
                          return (
                            <div key={status} style={{ background: col.bg, borderRadius: '8px', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ color: col.color, fontSize: '18px', fontWeight: '700' }}>{count}</span>
                              <span style={{ color: col.color, fontSize: '14px', opacity: 0.8 }}>{status}</span>
                            </div>
                          );
                        })}
                        <div style={{ background: '#26262e', borderRadius: '8px', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ color: '#fff', fontSize: '18px', fontWeight: '700' }}>{choreRecords.length}</span>
                          <span style={{ color: '#bbb', fontSize: '14px' }}>Total</span>
                        </div>
                      </div>
                      <p style={{ fontSize: '14px', color: '#bbb', margin: '0 0 12px 0' }}>Current week expands automatically. ✓ = all chores completed that week.</p>
                      {groupByWeek(choreRecords).map(({ weekStart, entries }) => (
                        <ChoreWeek key={weekStart.toISOString()} weekStart={weekStart} entries={entries} />
                      ))}
                    </>
                  )}
                </Card>
              )}

              {activeTab === 'medications' && (
                <MedicationsTab client={selected} setSelected={setSelected} setClients={setClients} />
              )}

              {activeTab === 'timeline' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                      <p style={{ ...st.sectionLabel, margin: 0 }}>Timeline</p>
                      {timelineTotal > 0 && <p style={{ color: '#bbb', fontSize: '14px', margin: '4px 0 0 0' }}>Showing {timeline.length} of {timelineTotal} entries</p>}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => setShowTimelinePDFModal(true)} style={{ ...st.smallAddBtn, background: '#1e3a2f', color: '#4ade80', border: '1px solid #2d5a3d' }}>⬇ Export PDF</button>
                      <button onClick={() => setShowAddEntry(!showAddEntry)} style={st.smallAddBtn}>{showAddEntry ? 'Cancel' : '+ Add Entry'}</button>
                    </div>
                  </div>
                  {showAddEntry && (
                    <div style={st.miniForm}>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={sf.label}>Entry Type</label>
                        <select value={entryType} onChange={e => setEntryType(e.target.value)} style={sf.input}>
                          {ENTRY_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      {entryType === 'UA' && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={sf.label}>Result</label>
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            {['Positive', 'Negative', 'Inconclusive', 'Refused'].map(opt => (
                              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#aaa', fontSize: '14px', cursor: 'pointer' }}>
                                <input type="radio" name="ua_result" value={opt} checked={entryForm.ua_result === opt} onChange={() => setEntryForm(p => ({ ...p, ua_result: opt }))} />{opt}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {entryType === 'Crisis' && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={sf.label}>Severity</label>
                          <div style={{ display: 'flex', gap: '16px' }}>
                            {['Low', 'Medium', 'High'].map(sv => (
                              <label key={sv} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#aaa', fontSize: '14px', cursor: 'pointer' }}>
                                <input type="radio" name="severity" value={sv} checked={entryForm.severity === sv} onChange={() => setEntryForm(p => ({ ...p, severity: sv }))} />{sv}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {entryType === 'Infraction' && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={sf.label}>Severity</label>
                          <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
                            {['Minor', 'Major', 'Serious'].map(sv => (
                              <label key={sv} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#aaa', fontSize: '14px', cursor: 'pointer' }}>
                                <input type="radio" name="infraction_severity" value={sv} checked={entryForm.severity === sv} onChange={() => setEntryForm(p => ({ ...p, severity: sv }))} />{sv}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {entryType === 'Meeting' && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={sf.label}>Meeting Name</label>
                          <input value={entryForm.meeting_name} onChange={e => setEntryForm(p => ({ ...p, meeting_name: e.target.value }))} style={sf.input} placeholder="e.g. New Beginnings, Ground Zero" />
                        </div>
                      )}
                      {entryType === 'Chores' && (
                        <>
                          <div style={{ marginBottom: '12px' }}>
                            <label style={sf.label}>Chore Name</label>
                            <input value={entryForm.chore_name} onChange={e => setEntryForm(p => ({ ...p, chore_name: e.target.value }))} style={sf.input} placeholder="e.g. Kitchen, Bathroom, Yard" />
                          </div>
                          <div style={{ marginBottom: '12px' }}>
                            <label style={sf.label}>Status</label>
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                              {['Completed', 'Not Completed', 'Partial'].map(opt => (
                                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#aaa', fontSize: '14px', cursor: 'pointer' }}>
                                  <input type="radio" name="chore_status" value={opt} checked={entryForm.chore_status === opt} onChange={() => setEntryForm(p => ({ ...p, chore_status: opt }))} />{opt}
                                </label>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                      {entryType === 'Mood Check-In' && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={sf.label}>Mood Value (1–10): {entryForm.mood_value}</label>
                          <input type="range" min="1" max="10" value={entryForm.mood_value} onChange={e => setEntryForm(p => ({ ...p, mood_value: e.target.value }))} style={{ width: '100%' }} />
                        </div>
                      )}
                      {entryType === 'Check-In' && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={sf.label}>Status</label>
                          <div style={{ display: 'flex', gap: '16px' }}>
                            {['Here', 'Not Here'].map(opt => (
                              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#aaa', fontSize: '14px', cursor: 'pointer' }}>
                                <input type="radio" name="checkin" value={opt} checked={entryForm.checkin_status === opt} onChange={() => setEntryForm(p => ({ ...p, checkin_status: opt }))} />{opt}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {(entryType === 'Meeting' || entryType === 'Check-In') && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={sf.label}>Location</label>
                          <button type="button" onClick={dropPin}
                            style={{ ...sf.input, background: entryForm.pinDropped ? '#1e3a2f' : '#1a1a1a', color: entryForm.pinDropped ? '#4ade80' : '#aaa', cursor: 'pointer', textAlign: 'left', border: entryForm.pinDropped ? '1px solid #1D9E75' : '1px solid #444' }}>
                            {entryForm.pinDropped ? '📍 Pin dropped' : '📍 Drop pin (uses your current location)'}
                          </button>
                        </div>
                      )}
                      {entryType === 'Weekly Reflection' && (
                        <WeeklyReflectionForm entryForm={entryForm} setEntryForm={setEntryForm} />
                      )}
                      {entryType === 'Weekly Check-In' && (
                        <>
                          <div style={{ marginBottom: '12px' }}>
                            <label style={sf.label}>How many meetings did you go to in the past week?</label>
                            <input type="number" min="0" value={entryForm.wci_meetings} onChange={e => setEntryForm(p => ({ ...p, wci_meetings: e.target.value }))} style={sf.input} placeholder="Enter number" />
                          </div>
                          <div style={{ marginBottom: '12px' }}>
                            <label style={sf.label}>How many sponsor contacts in the past week? <span style={{ fontWeight: 400, color: '#888' }}>(Only phone calls and in-person count)</span></label>
                            <input type="number" min="0" value={entryForm.wci_sponsor_contacts} onChange={e => setEntryForm(p => ({ ...p, wci_sponsor_contacts: e.target.value }))} style={sf.input} placeholder="Enter number" />
                          </div>
                          <div style={{ marginBottom: '12px' }}>
                            <label style={sf.label}>Chore</label>
                            <input value={entryForm.wci_chore} onChange={e => setEntryForm(p => ({ ...p, wci_chore: e.target.value }))} style={sf.input} placeholder="Enter chore assignment" />
                          </div>
                          <div style={{ marginBottom: '12px' }}>
                            <label style={sf.label}>Did you complete your chores?</label>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                              {[['yes', 'Yes'], ['no', 'No']].map(([val, label]) => (
                                <button key={val} onClick={() => setEntryForm(p => ({ ...p, wci_chore_completed: val }))}
                                  style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontSize: '14px', fontWeight: '500',
                                    borderColor: entryForm.wci_chore_completed === val ? (val === 'yes' ? '#4ade80' : '#f87171') : '#555',
                                    background: entryForm.wci_chore_completed === val ? (val === 'yes' ? '#1a3a2a' : '#3a1a1a') : 'transparent',
                                    color: entryForm.wci_chore_completed === val ? (val === 'yes' ? '#4ade80' : '#f87171') : '#aaa',
                                  }}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div style={{ marginBottom: '12px' }}>
                            <label style={sf.label}>Are you employed?</label>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                              {[['yes', 'Yes'], ['no', 'No']].map(([val, label]) => (
                                <button key={val} onClick={() => setEntryForm(p => ({ ...p, wci_employed: val }))}
                                  style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontSize: '14px', fontWeight: '500',
                                    borderColor: entryForm.wci_employed === val ? '#60a5fa' : '#555',
                                    background: entryForm.wci_employed === val ? '#1e2d3a' : 'transparent',
                                    color: entryForm.wci_employed === val ? '#60a5fa' : '#aaa',
                                  }}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                          {entryForm.wci_employed === 'yes' && (
                            <div style={{ marginBottom: '12px' }}>
                              <label style={sf.label}>Who is your employer?</label>
                              <input value={entryForm.wci_employer} onChange={e => setEntryForm(p => ({ ...p, wci_employer: e.target.value }))} style={sf.input} placeholder="Employer name" />
                            </div>
                          )}
                          <div style={{ marginBottom: '12px' }}>
                            <label style={sf.label}>If you are not paid in full for program fees, enter your plan for your next payment <span style={{ fontWeight: 400, color: '#888' }}>(How much and when)</span></label>
                            <input value={entryForm.wci_payment_plan} onChange={e => setEntryForm(p => ({ ...p, wci_payment_plan: e.target.value }))} style={sf.input} placeholder="e.g. $135 on Friday" />
                          </div>
                          <div style={{ marginBottom: '12px' }}>
                            <label style={sf.label}>Weekly Reflection</label>
                            <textarea value={entryForm.wci_reflection} onChange={e => setEntryForm(p => ({ ...p, wci_reflection: e.target.value }))} style={{ ...sf.input, resize: 'vertical' }} rows={4} placeholder="Describe here any notes on how your week went" />
                          </div>
                        </>
                      )}
                      <div style={{ marginBottom: '12px' }}>
                        <label style={sf.label}>Author</label>
                        <input value={entryForm.author} readOnly style={{ ...sf.input, opacity: 0.7, cursor: 'not-allowed' }} />
                      </div>
                      {entryType !== 'Weekly Check-In' && (
                      <div style={{ marginBottom: '12px' }}>
                        <label style={sf.label}>{entryType === 'Weekly Reflection' ? 'Additional notes (optional)' : 'Notes'}</label>
                        <textarea value={entryForm.notes} onChange={e => setEntryForm(p => ({ ...p, notes: e.target.value }))} style={{ ...sf.input, resize: 'vertical' }} rows={3} placeholder="Add any notes..." />
                      </div>
                      )}
                      {['UA', 'Check-In', 'General Note', 'Jobs Applied For', 'Infraction'].includes(entryType) && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={sf.label}>Photo (optional)</label>
                          <input type="file" accept="image/*" onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = ev => setEntryForm(p => ({ ...p, photo_file: file, photo_preview: ev.target.result }));
                            reader.readAsDataURL(file);
                          }} style={{ color: '#aaa', fontSize: '14px', marginBottom: '8px', display: 'block' }} />
                          {entryForm.photo_preview && (
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                              <img src={entryForm.photo_preview} alt="Preview" style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #3a3a48' }} />
                              <button onClick={() => setEntryForm(p => ({ ...p, photo_file: null, photo_preview: null }))}
                                style={{ position: 'absolute', top: 4, right: 4, background: '#b22222', border: 'none', color: '#fff', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}>×</button>
                            </div>
                          )}
                        </div>
                      )}
                      <button onClick={saveTimelineEntry} style={sf.confirmBtn}>Save Entry</button>
                    </div>
                  )}
                  {timelineLoading ? (
                    <p style={{ color: '#999', fontSize: '14px' }}>Loading timeline...</p>
                  ) : timeline.length === 0 ? (
                    <p style={{ color: '#999', fontSize: '14px' }}>No timeline entries yet.</p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {timeline.map(entry => (
                          <div key={entry.id} style={{ ...st.timelineCard, ...(entry.entry_type === 'Infraction' ? { borderLeft: '3px solid #dc2626', background: '#1a0f0f' } : {}) }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: entryColor(entry.entry_type), flexShrink: 0 }} />
                                <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>{entry.entry_type}</span>
                                {entry.meeting_name && <span style={{ color: '#60a5fa', fontSize: '14px' }}>{entry.meeting_name}</span>}
                                {entry.event_name && <span style={{ color: '#60a5fa', fontSize: '14px' }}>{entry.event_name}</span>}
                                {entry.mood_value && <span style={{ ...st.badge, background: '#3a2d1e', color: '#fb923c' }}>Mood: {entry.mood_value}/10</span>}
                                {entry.severity && <span style={{ ...st.badge, background: entry.severity === 'High' || entry.severity === 'Serious' ? '#3a1e1e' : entry.severity === 'Medium' || entry.severity === 'Major' ? '#3a2d1e' : '#1e3a2f', color: entry.severity === 'High' || entry.severity === 'Serious' ? '#f87171' : entry.severity === 'Medium' || entry.severity === 'Major' ? '#fb923c' : '#4ade80' }}>{entry.severity}</span>}
                                {entry.source === 'house' && <span style={{ ...st.badge, background: '#1e2d3a', color: '#60a5fa', fontSize: '13px' }}>House</span>}
                                {entry.source === 'client' && <span style={{ ...st.badge, background: '#2d1e3a', color: '#c084fc', fontSize: '13px' }}>Self</span>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ color: '#bbb', fontSize: '14px', whiteSpace: 'nowrap' }}>{formatDate(entry.created_at)}</span>
                                <button onClick={() => deleteTimelineEntry(entry.id)} style={{ background: 'transparent', border: '1px solid #3a3a48', color: '#999', borderRadius: '4px', padding: '2px 8px', fontSize: '14px', cursor: 'pointer' }}>×</button>
                              </div>
                            </div>
                            {entry.latitude && entry.longitude && <LocationPin entryId={entry.id} lat={entry.latitude} lng={entry.longitude} />}
                            {entry.entry_type === 'Weekly Reflection'
                              ? <WeeklyReflectionCard entry={entry} />
                              : entry.entry_type === 'Weekly Check-In'
                              ? <WeeklyCheckInCard entry={entry} />
                              : entry.notes && <p style={{ color: '#aaa', fontSize: '14px', margin: '4px 0 0 0', lineHeight: '1.5' }}>{entry.notes}</p>}
                            {entry.photo_url && (
                                <img src={entry.photo_url} alt="" onClick={() => setLightboxUrl(entry.photo_url)}
                                  style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '8px', marginTop: '8px', border: '1px solid #3a3a48', cursor: 'pointer' }} />
                              )}
                            {entry.author && <p style={{ color: '#bbb', fontSize: '14px', margin: '6px 0 0 0' }}>By {entry.author}</p>}
                          </div>
                        ))}
                      </div>
                      {hasMoreTimeline && (
                        <div style={{ textAlign: 'center', marginTop: '16px' }}>
                          <button onClick={() => fetchTimeline(selected.id, true)} disabled={timelineLoadingMore}
                            style={{ background: 'transparent', border: '1px solid #3a3a48', color: '#aaa', padding: '8px 20px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
                            {timelineLoadingMore ? 'Loading...' : `Load more (${timelineTotal - timeline.length} remaining)`}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

                {showTimelinePDFModal && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}
                    onClick={() => setShowTimelinePDFModal(false)}>
                    <div style={{ background: '#1c1c24', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '440px', border: '1px solid #32323e' }}
                      onClick={e => e.stopPropagation()}>
                      <h3 style={{ color: '#fff', margin: '0 0 4px 0', fontSize: '18px' }}>Generate Timeline PDF</h3>
                      <p style={{ color: '#aaa', fontSize: '14px', margin: '0 0 20px 0' }}>Choose a date range and optional event type filter.</p>
                      <p style={{ color: '#bbb', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px 0' }}>Common Ranges</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                        {[
                          { label: 'Last 7 Days', days: 7 },
                          { label: 'This Week', week: true },
                          { label: 'Last 30 Days', days: 30 },
                          { label: 'This Month', month: true },
                          { label: 'Last Month', lastMonth: true },
                          { label: 'All Time', all: true },
                        ].map(opt => {
                          const today = new Date();
                          let start = '', end = '';
                          if (opt.days) { const d = new Date(today); d.setDate(d.getDate() - opt.days); start = d.toISOString().slice(0,10); end = today.toISOString().slice(0,10); }
                          else if (opt.week) { const d = new Date(today); d.setDate(d.getDate() - (d.getDay() || 7) + 1); start = d.toISOString().slice(0,10); end = today.toISOString().slice(0,10); }
                          else if (opt.month) { start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10); end = today.toISOString().slice(0,10); }
                          else if (opt.lastMonth) { const d = new Date(today.getFullYear(), today.getMonth() - 1, 1); start = d.toISOString().slice(0,10); end = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().slice(0,10); }
                          else if (opt.all) { start = ''; end = ''; }
                          const active = pdfRange.startDate === start && pdfRange.endDate === end;
                          return <button key={opt.label} onClick={() => setPdfRange(p => ({ ...p, startDate: start, endDate: end }))}
                            style={{ padding: '6px 12px', borderRadius: '20px', border: `1px solid ${active ? '#4ade80' : '#444'}`, background: active ? '#1e3a2f' : 'transparent', color: active ? '#4ade80' : '#aaa', fontSize: '14px', cursor: 'pointer' }}>{opt.label}</button>;
                        })}
                      </div>
                      <label style={{ color: '#bbb', fontSize: '14px', display: 'block', marginBottom: '6px' }}>Start Date</label>
                      <input type="date" value={pdfRange.startDate} onChange={e => setPdfRange(p => ({ ...p, startDate: e.target.value }))}
                        style={{ width: '100%', background: '#26262e', border: '1px solid #3a3a48', borderRadius: '8px', padding: '8px 12px', color: '#fff', fontSize: '14px', marginBottom: '14px', boxSizing: 'border-box' }} />
                      <label style={{ color: '#bbb', fontSize: '14px', display: 'block', marginBottom: '6px' }}>End Date <span style={{ color: '#666' }}>(optional)</span></label>
                      <input type="date" value={pdfRange.endDate} onChange={e => setPdfRange(p => ({ ...p, endDate: e.target.value }))}
                        style={{ width: '100%', background: '#26262e', border: '1px solid #3a3a48', borderRadius: '8px', padding: '8px 12px', color: '#fff', fontSize: '14px', marginBottom: '14px', boxSizing: 'border-box' }} />
                      <label style={{ color: '#bbb', fontSize: '14px', display: 'block', marginBottom: '6px' }}>Event Type <span style={{ color: '#666' }}>(optional)</span></label>
                      <select value={pdfRange.eventType} onChange={e => setPdfRange(p => ({ ...p, eventType: e.target.value }))}
                        style={{ width: '100%', background: '#26262e', border: '1px solid #3a3a48', borderRadius: '8px', padding: '8px 12px', color: '#fff', fontSize: '14px', marginBottom: '20px', boxSizing: 'border-box' }}>
                        <option value="All">All Event Types</option>
                        {['UA', 'Crisis', 'Infraction', 'Meeting', 'Chores', 'Mood Check-In', 'Check-In', 'General Note', 'Jobs Applied For', 'Weekly Check-In', 'Weekly Reflection', 'House Check-In', 'Batch UA', 'Event Attendance'].map(t => <option key={t}>{t}</option>)}
                      </select>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => setShowTimelinePDFModal(false)}
                          style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #3a3a48', background: 'transparent', color: '#aaa', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                        <button onClick={() => { generateTimelinePDF(selected, pdfRange.startDate, pdfRange.endDate, pdfRange.eventType); setShowTimelinePDFModal(false); }}
                          style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', background: '#4ade80', color: '#000', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Generate PDF</button>
                      </div>
                    </div>
                  </div>
                )}

              {activeTab === 'stays' && (
                <Card title="Stay History" full>
                  {staysLoading ? (
                    <p style={{ color: '#999', fontSize: '14px' }}>Loading stay history...</p>
                  ) : stays.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 0' }}>
                      <p style={{ color: '#bbb', fontSize: '14px', margin: 0 }}>No previous stays recorded.</p>
                      <p style={{ color: '#999', fontSize: '14px', margin: '6px 0 0 0' }}>Stay history is saved automatically when a client is discharged.</p>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                        <div style={{ background: '#1e2d3a', borderRadius: '8px', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ color: '#60a5fa', fontSize: '20px', fontWeight: '700' }}>{stays.length}</span>
                          <span style={{ color: '#60a5fa', fontSize: '14px', opacity: 0.8 }}>Total Stays</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {stays.map((stay, i) => {
                          const lengthDays = stay.start_date && stay.discharge_date
                            ? Math.round((new Date(stay.discharge_date) - new Date(stay.start_date)) / (1000 * 60 * 60 * 24))
                            : null;
                          const balance = parseFloat(stay.balance_at_discharge) || 0;
                          return (
                            <div key={stay.id} style={{ background: '#1c1c24', borderRadius: '12px', border: '1px solid #32323e', overflow: 'hidden' }}>
                              <div
                                onClick={() => {
                                  const isOpen = expandedStay === stay.id;
                                  setExpandedStay(isOpen ? null : stay.id);
                                  if (!isOpen) loadStayHistory(stay, selected);
                                }}
                                style={{ padding: '12px 16px', borderBottom: '1px solid #2a2a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span style={{ color: '#666', fontSize: '13px', transform: expandedStay === stay.id ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-block', transition: 'transform 0.2s' }}>▾</span>
                                  <span style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>Stay #{stays.length - i}</span>
                                  {stay.house_name && <span style={{ ...st.badge, background: '#1e2d3a', color: '#60a5fa' }}>{stay.house_name}</span>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} onClick={e => e.stopPropagation()}>
                                  {lengthDays !== null && <span style={{ fontSize: '14px', color: '#bbb' }}>{lengthDays} day{lengthDays !== 1 ? 's' : ''}</span>}
                                  <button
                                    onClick={() => {
                                      const img = new Image();
                                      img.crossOrigin = 'anonymous';
                                      img.onload = async () => {
                                        const canvas = document.createElement('canvas');
                                        canvas.width = img.naturalWidth;
                                        canvas.height = img.naturalHeight;
                                        canvas.getContext('2d').drawImage(img, 0, 0);
                                        // Fetch discharge photos for this stay
                                        const { data: photoFiles } = await supabase.storage.from('discharge-photos').list(`discharge/${selected.id}/${stay.id}`);
                                        const photoUrls = (photoFiles || []).map(f => supabase.storage.from('discharge-photos').getPublicUrl(`discharge/${selected.id}/${stay.id}/${f.name}`).data.publicUrl);
                                        generateDischargePDF(stay, selected, canvas.toDataURL('image/jpeg'), photoUrls);
                                      };
                                      img.onerror = () => generateDischargePDF(stay, selected, null);
                                      img.src = klLogo;
                                    }}
                                    style={{ padding: '5px 12px', background: '#1a2a1a', border: '1px solid #2a5a2a', borderRadius: '6px', color: '#4ade80', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}
                                  >
                                    ⬇ Discharge Sheet
                                  </button>
                                  {isAdmin && (
                                    <button
                                      onClick={async () => {
                                        if (!window.confirm('Delete this stay record? This cannot be undone.')) return;
                                        await supabase.from('client_stays').delete().eq('id', stay.id);
                                        setStays(prev => prev.filter(s => s.id !== stay.id));
                                      }}
                                      style={{ padding: '5px 12px', background: '#2a1a1a', border: '1px solid #7f1d1d', borderRadius: '6px', color: '#f87171', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}
                                    >
                                      🗑 Delete
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                  <p style={{ fontSize: '14px', color: '#bbb', margin: '0 0 3px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Move-in</p>
                                  <p style={{ fontSize: '14px', color: '#ddd', margin: 0 }}>{formatDateFull(stay.start_date)}</p>
                                </div>
                                <div>
                                  <p style={{ fontSize: '14px', color: '#bbb', margin: '0 0 3px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Discharge</p>
                                  <p style={{ fontSize: '14px', color: '#ddd', margin: 0 }}>{formatDateFull(stay.discharge_date)}</p>
                                </div>
                                <div>
                                  <p style={{ fontSize: '14px', color: '#bbb', margin: '0 0 3px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reason</p>
                                  <p style={{ fontSize: '14px', color: '#ddd', margin: 0 }}>{stay.discharge_reason || '—'}</p>
                                </div>
                                <div>
                                  <p style={{ fontSize: '14px', color: '#bbb', margin: '0 0 3px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Balance at discharge</p>
                                  <p style={{ fontSize: '14px', fontWeight: '600', margin: 0, color: balance > 0 ? '#f87171' : balance < 0 ? '#4ade80' : '#bbb' }}>
                                    {balance > 0 ? `$${balance.toFixed(2)} owed` : balance < 0 ? `$${Math.abs(balance).toFixed(2)} credit` : '$0.00'}
                                  </p>
                                </div>
                                {stay.discharge_notes && (
                                  <div style={{ gridColumn: 'span 2' }}>
                                    <p style={{ fontSize: '14px', color: '#bbb', margin: '0 0 3px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notes</p>
                                    <p style={{ fontSize: '14px', color: '#aaa', margin: 0, lineHeight: 1.5 }}>{stay.discharge_notes}</p>
                                  </div>
                                )}
                                {stay.discharged_by && (
                                  <div style={{ gridColumn: 'span 2' }}>
                                    <p style={{ fontSize: '14px', color: '#999', margin: 0 }}>Discharged by {stay.discharged_by}</p>
                                  </div>
                                )}
                                {(stay.not_allowed_back || stay.needs_review_before_readmit) && (
                                  <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                                    {stay.not_allowed_back && (
                                      <span style={{ padding: '4px 10px', background: '#3a0f0f', border: '1px solid #7f1d1d', borderRadius: '6px', color: '#f87171', fontSize: '13px', fontWeight: '600', display: 'inline-block' }}>
                                        🚫 Not allowed back
                                      </span>
                                    )}
                                    {stay.needs_review_before_readmit && (
                                      <span style={{ padding: '4px 10px', background: '#3a2a0f', border: '1px solid #92400e', borderRadius: '6px', color: '#fb923c', fontSize: '13px', fontWeight: '600', display: 'inline-block' }}>
                                        ⚠️ Needs upper management review before re-admitting
                                      </span>
                                    )}
                                  </div>
                                )}
                                <StayPhotos clientId={selected.id} stayId={stay.id} />
                              </div>

                              {expandedStay === stay.id && (() => {
                                const h = stayHistory[stay.id];
                                const loading = stayHistoryLoading[stay.id];
                                if (loading) return <div style={{ padding: '16px', borderTop: '1px solid #2a2a2a', color: '#999', fontSize: '14px' }}>Loading history...</div>;
                                if (!h) return null;

                                const totalCharged = h.charges.reduce((s, c) => s + parseFloat(c.amount || 0), 0);
                                const totalPaid = h.payments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);

                                const noHistory = h.timeline.length === 0 && h.checkIns.length === 0 && h.overnights.length === 0 && !h.welcomePacket && h.charges.length === 0 && h.payments.length === 0;

                                return (
                                  <div style={{ borderTop: '1px solid #2a2a2a', padding: '16px', background: '#1e1e24' }}>
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
                                      {[
                                        { label: 'Timeline Entries', val: h.timeline.length, color: '#a78bfa', modal: 'timeline' },
                                        { label: 'Check-Ins', val: h.checkIns.length, color: '#60a5fa', modal: 'checkins' },
                                        { label: 'Forms Submitted', val: h.overnights.length + (h.welcomePacket ? 1 : 0), color: '#fb923c', modal: 'forms' },
                                        { label: 'Balance at Discharge', val: '$' + (totalCharged - totalPaid).toFixed(2), color: (totalCharged - totalPaid) > 0 ? '#f87171' : '#4ade80', modal: 'balance' },
                                      ].map(s => (
                                        <div key={s.label} onClick={() => setStayDetailModal({ stayId: stay.id, type: s.modal })}
                                          style={{ background: '#1c1c24', border: '1px solid #2e2e3a', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}
                                          onMouseEnter={e => e.currentTarget.style.borderColor = '#444'}
                                          onMouseLeave={e => e.currentTarget.style.borderColor = '#2e2e3a'}>
                                          <div style={{ color: s.color, fontSize: '15px', fontWeight: '700' }}>{s.val}</div>
                                          <div style={{ color: '#666', fontSize: '12px' }}>{s.label}</div>
                                        </div>
                                      ))}
                                    </div>

                                    {noHistory && <p style={{ color: '#666', fontSize: '14px', textAlign: 'center', padding: '16px 0' }}>No history found for this stay.</p>}
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </Card>
              )}

              {activeTab === 'forms' && (
                <ClientFormsTab client={selected} />
              )}

              {activeTab === 'application' && (
                <ClientApplicationView client={selected} />
              )}

              {activeTab === 'notes' && (
                <Card title="Staff notes" full>
                  <textarea defaultValue={selected.client_notes || ''} onBlur={saveNotes} placeholder="Add staff notes here..."
                    style={{ width: '100%', backgroundColor: '#1c1c24', border: '1px solid #3a3a48', borderRadius: '8px', padding: '12px 14px', color: '#fff', fontSize: '14px', lineHeight: '1.6', resize: 'vertical', boxSizing: 'border-box', minHeight: '220px', outline: 'none', fontFamily: "'Inter', 'system-ui', sans-serif" }} />
                  <p style={{ color: '#bbb', fontSize: '14px', marginTop: '8px' }}>Changes save automatically when you click away.</p>
                </Card>
              )}

              {activeTab === 'payments' && (
                <Card title="Payments" full>
                  <ClientPayments client={selected} onPaymentChange={() => fetchClientBalance(selected.id)} />
                </Card>
              )}

              {activeTab === 'documents' && <Card title="Documents" full><p style={{ color: '#999', fontSize: '14px' }}>Documents will appear here once file uploads are set up.</p></Card>}

              {/* Delete button at bottom — admin only */}
              {isAdmin && (
                <div style={{ padding: '20px 0 8px', display: 'flex', justifyContent: 'center' }}>
                  <button onClick={() => deleteClient(selected)}
                    style={{ background: 'transparent', border: '1px solid #3a1a1a', color: '#666', fontSize: '12px', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', letterSpacing: '0.5px' }}>
                    🗑 Delete Client
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Photo Lightbox */}
      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img src={lightboxUrl} alt="" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: '10px', objectFit: 'contain' }} />
            <button onClick={() => setLightboxUrl(null)}
              style={{ position: 'absolute', top: -14, right: -14, background: '#b22222', border: 'none', color: '#fff', borderRadius: '50%', width: 30, height: 30, fontSize: '16px', fontWeight: '700', cursor: 'pointer' }}>×</button>
          </div>
        </div>
      )}

      {moveHouseModal && (
        <MoveHouseModal
          client={moveHouseModal}
          houses={houses}
          onClose={() => setMoveHouseModal(null)}
          onSuccess={(newHouseId, newHouseName) => {
            setMoveHouseModal(null);
            fetchClients();
            if (selected?.id === moveHouseModal.id) {
              setSelected(prev => ({ ...prev, house_id: newHouseId, house_name: newHouseName }));
            }
          }}
        />
      )}

      {statusModal && (
        <div style={{ ...st.overlay, zIndex: 2000 }} onClick={() => setStatusModal(null)}>
          <div style={{ ...st.modal, maxWidth: '420px', marginTop: '120px' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #32323e' }}>
              <h3 style={{ color: '#fff', margin: 0, fontSize: '16px' }}>Move to {statusModal.newStatus}</h3>
              <p style={{ color: '#999', fontSize: '14px', margin: '4px 0 0 0' }}>{statusModal.client.full_name}</p>
            </div>
            <div style={{ padding: '20px 24px' }}>
              {statusModal.newStatus === 'Waiting List' && (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>Select waiting list</label>
                    <select value={statusForm.list_type} onChange={e => setStatusForm(p => ({ ...p, list_type: e.target.value }))} style={sf.input}>
                      {LISTS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>Ready date (when are they ready to move in?)</label>
                    <input type="date" value={statusForm.ready_date || ''} onChange={e => setStatusForm(p => ({ ...p, ready_date: e.target.value }))} style={sf.input} />
                  </div>
                </>
              )}
              {statusModal.newStatus === 'Pending' && (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>Assign to house</label>
                    <select value={statusForm.house_id} onChange={e => setStatusForm(p => ({ ...p, house_id: e.target.value }))} style={sf.input}>
                      <option value="">Select a house</option>
                      {houses.map(h => <option key={h.id} value={h.id}>{h.name} ({h.type})</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>Expected move-in date (optional)</label>
                    <input type="date" value={statusForm.expected_move_in_date || ''} onChange={e => setStatusForm(p => ({ ...p, expected_move_in_date: e.target.value }))} style={sf.input} />
                  </div>
                </>
              )}
              {statusModal.newStatus === 'Active' && (
                <>
                  {!statusModal.client.house_id ? (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={sf.label}>Assign to house</label>
                      <select value={statusForm.house_id} onChange={e => setStatusForm(p => ({ ...p, house_id: e.target.value }))} style={sf.input}>
                        <option value="">Select a house</option>
                        {houses.map(h => <option key={h.id} value={h.id}>{h.name} ({h.type})</option>)}
                      </select>
                    </div>
                  ) : (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ padding: '10px 12px', background: '#1e2d3a', borderRadius: '8px', border: '1px solid #2a3d52', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '14px', color: '#60a5fa' }}>🏠 Already assigned: <span style={{ color: '#ddd' }}>{statusModal.client.house_name || 'Assigned house'}</span></span>
                        <button
                          onClick={() => setStatusForm(p => ({ ...p, changingHouse: !p.changingHouse, house_id: p.changingHouse ? statusModal.client.house_id : '' }))}
                          style={{ fontSize: '13px', color: '#60a5fa', background: 'transparent', border: '1px solid #2a3d52', borderRadius: '6px', padding: '3px 10px', cursor: 'pointer' }}>
                          {statusForm.changingHouse ? 'Keep current' : 'Change house'}
                        </button>
                      </div>
                      {statusForm.changingHouse && (
                        <select value={statusForm.house_id} onChange={e => setStatusForm(p => ({ ...p, house_id: e.target.value }))} style={sf.input}>
                          <option value="">Select a house</option>
                          {houses.map(h => <option key={h.id} value={h.id}>{h.name} ({h.type})</option>)}
                        </select>
                      )}
                    </div>
                  )}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>Room Type *</label>
                    <select value={statusForm.room_type || statusModal.client.room_type || 'Double'} onChange={e => setStatusForm(p => ({ ...p, room_type: e.target.value }))} style={sf.input}>
                      <option value="Single">Single — $160/week</option>
                      <option value="Double">Double — $135/week</option>
                      <option value="Houseperson">Houseperson — $110/week</option>
                      <option value="Live-Out">Live-Out — $35/week</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>Move-in date</label>
                    <input type="date" value={statusForm.move_in_date} onChange={e => setStatusForm(p => ({ ...p, move_in_date: e.target.value }))} style={sf.input} />
                  </div>
                  <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="checkbox"
                      id="early_admission"
                      checked={statusForm.early_admission || false}
                      onChange={e => setStatusForm(p => ({ ...p, early_admission: e.target.checked }))}
                      style={{ width: '16px', height: '16px', accentColor: '#b22222', cursor: 'pointer' }}
                    />
                    <label htmlFor="early_admission" style={{ ...sf.label, margin: 0, cursor: 'pointer' }}>
                      ⭐ Early Admission
                    </label>
                  </div>
                  <div style={{ background: '#26262e', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
                    <p style={{ color: '#aaa', fontSize: '14px', margin: '0 0 6px 0' }}>This will:</p>
                    <p style={{ color: '#ddd', fontSize: '14px', margin: '0 0 4px 0' }}>✓ Set status to <strong>Active</strong> with the selected move-in date</p>
                    <p style={{ color: '#ddd', fontSize: '14px', margin: '0 0 4px 0' }}>✓ Create a <strong>$150 move-in fee</strong> charge</p>
                    <p style={{ color: '#ddd', fontSize: '14px', margin: 0 }}>✓ Weekly charges start next Sunday</p>
                  </div>
                </>
              )}
              {statusModal.newStatus === 'Discharged' && (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>Reason for discharge *</label>
                    <select value={statusForm.discharge_reason} onChange={e => setStatusForm(p => ({ ...p, discharge_reason: e.target.value }))} style={sf.input}>
                      <option value="">Select reason</option>
                      <option>Move to Rent/Own Personal Home</option>
                      <option>Move to Other Recovery House</option>
                      <option>Move to Other Supportive Housing</option>
                      <option>Return to Treatment</option>
                      <option>Return to Use</option>
                      <option>Asked to Leave</option>
                      <option>Incarceration</option>
                      <option>Graduate</option>
                      <option>Unknown</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>Was this a successful discharge? *</label>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                      {['yes', 'no'].map(v => (
                        <button key={v} onClick={() => setStatusForm(p => ({ ...p, successful_discharge: v }))}
                          style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontSize: '14px', fontWeight: '500',
                            borderColor: statusForm.successful_discharge === v ? (v === 'yes' ? '#4ade80' : '#f87171') : '#999',
                            background: statusForm.successful_discharge === v ? (v === 'yes' ? '#1a3a2a' : '#3a1a1a') : 'transparent',
                            color: statusForm.successful_discharge === v ? (v === 'yes' ? '#4ade80' : '#f87171') : '#aaa',
                          }}>
                          {v === 'yes' ? 'Yes' : 'No'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>Date of discharge</label>
                    <input type="date" value={statusForm.discharge_date || ''} onChange={e => setStatusForm(p => ({ ...p, discharge_date: e.target.value }))} style={sf.input} />
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>Type of discharge</label>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                      {['Complete', 'Incomplete'].map(v => (
                        <button key={v} onClick={() => setStatusForm(p => ({ ...p, discharge_type: v }))}
                          style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontSize: '14px', fontWeight: '500',
                            borderColor: statusForm.discharge_type === v ? '#60a5fa' : '#999',
                            background: statusForm.discharge_type === v ? '#1e2d3a' : 'transparent',
                            color: statusForm.discharge_type === v ? '#60a5fa' : '#aaa',
                          }}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>UA at discharge</label>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                      {['Positive', 'Negative', 'N/A'].map(v => (
                        <button key={v} onClick={() => setStatusForm(p => ({ ...p, ua_at_discharge: v }))}
                          style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontSize: '14px', fontWeight: '500',
                            borderColor: statusForm.ua_at_discharge === v ? '#60a5fa' : '#999',
                            background: statusForm.ua_at_discharge === v ? '#1e2d3a' : 'transparent',
                            color: statusForm.ua_at_discharge === v ? '#60a5fa' : '#aaa',
                          }}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>Did client give two-week notice?</label>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                      {['Yes', 'No'].map(v => (
                        <button key={v} onClick={() => setStatusForm(p => ({ ...p, two_week_notice: v }))}
                          style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontSize: '14px', fontWeight: '500',
                            borderColor: statusForm.two_week_notice === v ? '#60a5fa' : '#999',
                            background: statusForm.two_week_notice === v ? '#1e2d3a' : 'transparent',
                            color: statusForm.two_week_notice === v ? '#60a5fa' : '#aaa',
                          }}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>Discharge notes</label>
                    <textarea value={statusForm.discharge_notes} onChange={e => setStatusForm(p => ({ ...p, discharge_notes: e.target.value }))} style={{ ...sf.input, resize: 'vertical' }} rows={4} placeholder="Add any details about why the client was discharged..." />
                  </div>
                  <div style={{ marginBottom: '12px', padding: '12px 14px', background: '#1c1c24', borderRadius: '8px', border: '1px solid #2e2e3a' }}>
                    <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Flags</p>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '10px' }}>
                      <input type="checkbox" checked={statusForm.not_allowed_back || false}
                        onChange={e => setStatusForm(p => ({ ...p, not_allowed_back: e.target.checked }))}
                        style={{ width: '16px', height: '16px', accentColor: '#b22222', cursor: 'pointer' }} />
                      <span style={{ fontSize: '14px', color: statusForm.not_allowed_back ? '#f87171' : '#aaa', fontWeight: statusForm.not_allowed_back ? '600' : '400' }}>
                        🚫 Not allowed back
                      </span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={statusForm.needs_review_before_readmit || false}
                        onChange={e => setStatusForm(p => ({ ...p, needs_review_before_readmit: e.target.checked }))}
                        style={{ width: '16px', height: '16px', accentColor: '#fb923c', cursor: 'pointer' }} />
                      <span style={{ fontSize: '14px', color: statusForm.needs_review_before_readmit ? '#fb923c' : '#aaa', fontWeight: statusForm.needs_review_before_readmit ? '600' : '400' }}>
                        ⚠️ Needs reviewed by upper management before re-admitting
                      </span>
                    </label>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={sf.label}>Discharge photos (optional)</label>
                    <input type="file" accept="image/*" multiple
                      onChange={e => setStatusForm(p => ({ ...p, discharge_photos: Array.from(e.target.files) }))}
                      style={{ ...sf.input, padding: '8px', cursor: 'pointer' }} />
                    {statusForm.discharge_photos?.length > 0 && (
                      <p style={{ fontSize: '13px', color: '#888', margin: '6px 0 0 0' }}>{statusForm.discharge_photos.length} photo{statusForm.discharge_photos.length !== 1 ? 's' : ''} selected</p>
                    )}
                  </div>
                </>
              )}
              {!['Waiting List', 'Pending', 'Active', 'Discharged'].includes(statusModal.newStatus) && (
                <p style={{ color: '#aaa', fontSize: '14px', margin: '0 0 16px 0' }}>This will update the client's status to {statusModal.newStatus}.</p>
              )}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setStatusModal(null)} style={sf.cancelBtn}>Cancel</button>
                <button onClick={confirmStatusChange} disabled={confirmingStatus} style={{ ...sf.confirmBtn, opacity: confirmingStatus ? 0.6 : 1, cursor: confirmingStatus ? 'not-allowed' : 'pointer' }}>
                  {confirmingStatus ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, children, full, action }) {
  return (
    <div style={{ background: '#26262e', border: '1px solid #32323e', borderRadius: '12px', padding: '14px 16px', gridColumn: full ? '1 / -1' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <p style={{ fontSize: '14px', fontWeight: '500', color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{title}</p>
        {action && action}
      </div>
      {children}
    </div>
  );
}

const st = {
  page: { padding: '32px', fontFamily: "'Inter', 'system-ui', sans-serif", color: '#fff' },
  header: { marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: '700', margin: 0 },
  sub: { color: '#999', fontSize: '14px', margin: '4px 0 0 0' },
  toolbar: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' },
  search: { width: '100%', maxWidth: '360px', backgroundColor: '#1c1c24', border: '1px solid #3a3a48', borderRadius: '8px', padding: '10px 14px', color: '#fff', fontSize: '14px' },
  viewToggleWrap: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  filters: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  filterBtn: { padding: '6px 14px', borderRadius: '20px', border: '1px solid #3a3a48', background: 'transparent', color: '#bbb', fontSize: '14px', cursor: 'pointer' },
  filterActive: { background: '#b22222', borderColor: '#b22222', color: '#fff' },
  table: { background: '#26262e', borderRadius: '12px', overflow: 'hidden', border: '1px solid #32323e' },
  tableHeader: { display: 'flex', padding: '12px 16px', borderBottom: '2px solid #7a1515', fontSize: '14px', color: '#999', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' },
  row: { display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #222', cursor: 'pointer' },
  badge: { fontSize: '14px', padding: '3px 8px', borderRadius: '20px', fontWeight: '500' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: '#1c1c24', borderRadius: '16px', border: '1px solid #32323e', width: '100%', maxWidth: '860px', overflow: 'hidden' },
  modalHeader: { display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '16px 20px', borderBottom: '2px solid #7a1515' },
  modalName: { fontSize: '18px', fontWeight: '500', margin: 0, color: '#fff' },
  modalSub: { fontSize: '14px', color: '#999', margin: '2px 0 0 0' },
  badges: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px', alignItems: 'center' },
  closeBtn: { width: '30px', height: '30px', borderRadius: '50%', border: '1px solid #3a3a48', background: 'transparent', cursor: 'pointer', color: '#bbb', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tabs: { display: 'flex', borderBottom: '1px solid #32323e', padding: '0 20px', overflowX: 'visible' },
  tab: { padding: '10px 14px', fontSize: '14px', cursor: 'pointer', color: '#999', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', whiteSpace: 'nowrap', flexShrink: 0 },
  tabActive: { color: '#fff', borderBottomColor: '#b22222' },
  modalBody: { padding: '20px', maxHeight: '520px', overflowY: 'auto' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' },
  sectionLabel: { fontSize: '14px', fontWeight: '500', color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px 0' },
  timelineCard: { background: '#26262e', borderRadius: '10px', padding: '12px 14px', border: '1px solid #32323e' },
  miniForm: { background: '#26262e', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', border: '1px solid #32323e' },
  smallAddBtn: { backgroundColor: 'transparent', border: '1px solid #3a3a48', color: '#aaa', padding: '6px 14px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '20px', flexWrap: 'wrap' },
  pageBtn: { padding: '6px 12px', borderRadius: '8px', border: '1px solid #3a3a48', background: 'transparent', color: '#aaa', fontSize: '14px', cursor: 'pointer', transition: 'all 0.15s' },
  pageBtnActive: { background: '#b22222', borderColor: '#b22222', color: '#fff', fontWeight: '600' },
  pageBtnDisabled: { opacity: 0.3, cursor: 'not-allowed' },
  ellipsis: { color: '#bbb', fontSize: '14px', padding: '0 4px' },
  pageNumbers: { display: 'flex', alignItems: 'center', gap: '6px' },
};

const sf = {
  label: { display: 'block', color: '#aaa', fontSize: '14px', marginBottom: '6px' },
  input: { width: '100%', backgroundColor: '#1c1c24', border: '1px solid #3a3a48', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  cancelBtn: { backgroundColor: 'transparent', border: '1px solid #3a3a48', color: '#aaa', padding: '8px 18px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' },
  confirmBtn: { backgroundColor: '#b22222', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' },
};

export default Clients;