import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';

const STATUS_TABS = ['pending', 'accepted', 'waitlisted', 'denied', 'all'];
const STATUS_LABEL = { pending: 'Pending', accepted: 'Accepted', waitlisted: 'Waitlisted', denied: 'Denied', all: 'All' };
const STATUS_COLOR = { pending: { bg: '#ffedd5', color: '#c2410c' }, accepted: { bg: '#dcfce7', color: '#16a34a' }, waitlisted: { bg: '#dbeafe', color: '#2563eb' }, denied: { bg: '#fee2e2', color: '#dc2626' } };

function Kinship() {
  const { role } = useUser();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingId, setSavingId] = useState(null);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('kinship_applications').select('*').order('created_at', { ascending: false });
    if (tab !== 'all') query = query.eq('status', tab);
    const { data, error } = await query;
    if (error) console.error('[kinship] fetch error:', error);
    setApps(data || []);
    setLoading(false);
  }, [tab]);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const filtered = apps.filter(a => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = `${a.primary_first_name || ''} ${a.primary_last_name || ''}`.toLowerCase();
    return name.includes(q) || (a.primary_email || '').toLowerCase().includes(q) || (a.co_applicant_name || '').toLowerCase().includes(q);
  });

  const setStatus = async (app, status) => {
    const { error } = await supabase.from('kinship_applications')
      .update({ status, reviewed_by: role || 'Staff', reviewed_at: new Date().toISOString() })
      .eq('id', app.id);
    if (error) { alert('Error updating status: ' + error.message); return; }
    fetchApps();
  };

  const deleteApp = async (id) => {
    if (!window.confirm('Delete this application permanently? This cannot be undone.')) return;
    const { error } = await supabase.from('kinship_applications').delete().eq('id', id);
    if (error) { alert('Error deleting: ' + error.message); return; }
    fetchApps();
  };

  const startEditNotes = (app) => { setNotesDraft(app.staff_notes || ''); };

  const saveNotes = async (app) => {
    setSavingId(app.id);
    const { error } = await supabase.from('kinship_applications').update({ staff_notes: notesDraft }).eq('id', app.id);
    setSavingId(null);
    if (error) { alert('Error saving notes: ' + error.message); return; }
    fetchApps();
  };

  const fmtDate = (d) => d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

  return (
    <div style={k.page}>
      <div style={k.header}>
        <div>
          <h2 style={k.title}>Keys to Kinship</h2>
          <p style={k.subtitle}>Applications for the Keys to Kinship program</p>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..." style={k.search} />
      </div>

      <div style={k.tabs}>
        {STATUS_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ ...k.tabBtn, ...(tab === t ? k.tabBtnActive : {}) }}>
            {STATUS_LABEL[t]}
          </button>
        ))}
      </div>

      {loading ? <p style={{ color: '#6b7280' }}>Loading...</p> : filtered.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No {tab === 'all' ? '' : STATUS_LABEL[tab].toLowerCase() + ' '}applications.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(app => {
            const expanded = expandedId === app.id;
            const sc = STATUS_COLOR[app.status] || { bg: '#e4e4e8', color: '#52525b' };
            return (
              <div key={app.id} style={k.card}>
                <div style={k.cardHeader} onClick={() => { setExpandedId(expanded ? null : app.id); if (!expanded) startEditNotes(app); }}>
                  <div>
                    <p style={k.name}>{app.primary_first_name} {app.primary_last_name}{app.co_applicant_name ? ` & ${app.co_applicant_name}` : ''}</p>
                    <p style={k.meta}>{app.primary_email || '—'} · {app.primary_phone || '—'} · Submitted {fmtDateTime(app.created_at)}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ ...k.statusBadge, background: sc.bg, color: sc.color }}>{STATUS_LABEL[app.status] || app.status}</span>
                    <span style={{ color: '#71717a' }}>{expanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {expanded && (
                  <div style={k.cardBody}>
                    <Section title="Applicant Information">
                      <Grid>
                        <Field label="Primary Applicant" value={`${app.primary_first_name || ''} ${app.primary_last_name || ''}`} />
                        <Field label="Date of Birth" value={fmtDate(app.primary_dob)} />
                        <Field label="Phone" value={app.primary_phone} />
                        <Field label="SMS Consent" value={app.primary_sms_consent} />
                        <Field label="Email" value={app.primary_email} />
                        <Field label="Email Consent" value={app.primary_email_consent} />
                        <Field label="Address" value={app.primary_address} />
                        <Field label="Relationship to Child(ren)" value={app.primary_relationship_to_children} />
                      </Grid>
                    </Section>

                    {app.co_applicant_name && (
                      <Section title="Partner / Co-Applicant">
                        <Grid>
                          <Field label="Name" value={app.co_applicant_name} />
                          <Field label="Date of Birth" value={fmtDate(app.co_applicant_dob)} />
                          <Field label="Phone" value={app.co_applicant_phone} />
                          <Field label="Email" value={app.co_applicant_email} />
                          <Field label="Address" value={app.co_applicant_address} />
                          <Field label="Relationship to Child(ren)" value={app.co_applicant_relationship_to_children} />
                        </Grid>
                      </Section>
                    )}

                    <Section title="Housing">
                      <Grid>
                        <Field label="Coming from KL Housing" value={app.coming_from_kl_housing} />
                        {app.coming_from_kl_housing === 'Yes' && <Field label="Name(s)" value={app.coming_from_kl_housing_name} />}
                      </Grid>
                    </Section>

                    {[1, 2, 3, 4].some(n => app[`child${n}_name`]) && (
                      <Section title="Children">
                        <Grid>
                          {[1, 2, 3, 4].filter(n => app[`child${n}_name`]).map(n => (
                            <Field key={n} label={`Child ${n}`} value={`${app[`child${n}_name`]}${app[`child${n}_dob`] ? ' — ' + fmtDate(app[`child${n}_dob`]) : ''}`} />
                          ))}
                        </Grid>
                      </Section>
                    )}

                    <Section title="Employment">
                      <Grid>
                        <Field label="Primary Employment Status" value={app.primary_employment_status} />
                        <Field label="Primary Place of Employment" value={app.primary_employer} />
                        <Field label="Primary Income" value={app.primary_income} />
                        <Field label="Co-Applicant Employment Status" value={app.co_applicant_employment_status} />
                        <Field label="Co-Applicant Place of Employment" value={app.co_applicant_employer} />
                        <Field label="Co-Applicant Income" value={app.co_applicant_income} />
                      </Grid>
                    </Section>

                    <Section title="Recovery">
                      <Field label="Drug of Choice" value={app.drug_of_choice} full />
                      <Field label="Recovery Program" value={app.recovery_program} full />
                      <Grid>
                        <Field label="Sober Date" value={fmtDate(app.sober_date)} />
                        <Field label="Attended Treatment / PHP / IOP" value={app.attended_treatment} />
                      </Grid>
                    </Section>

                    {app.attended_treatment === 'Yes' && (
                      <Section title="Treatment">
                        <Grid>
                          <Field label="Treatment Name" value={app.treatment_name} />
                          <Field label="Contact Name" value={app.treatment_contact_name} />
                          <Field label="Job Title" value={app.treatment_contact_title} />
                          <Field label="Contact Phone" value={app.treatment_contact_phone} />
                          <Field label="Contact Email" value={app.treatment_contact_email} />
                          <Field label="Discharge Date" value={fmtDate(app.treatment_discharge_date)} />
                          <Field label="Level of Care" value={app.treatment_level_of_care} />
                          <Field label="Referral" value={app.treatment_referred} />
                          <Field label="Referral Date" value={fmtDate(app.treatment_referral_date)} />
                        </Grid>
                      </Section>
                    )}

                    {app.takes_medication === 'Yes' && app.medication_details && (
                      <Section title="Medications">
                        {(() => { try { return JSON.parse(app.medication_details); } catch { return []; } })().map((m, i) => (
                          <div key={i} style={k.medRow}>
                            <strong style={{ color: '#18181b' }}>{m.name}</strong>
                            <span style={{ color: '#71717a' }}> — {m.dose_count} {m.dose_unit}, Count {m.count}, {(m.times || []).join('/') || 'no schedule'}{m.notes ? `, ${m.notes}` : ''}</span>
                          </div>
                        ))}
                      </Section>
                    )}

                    <Section title="Emergency Contact">
                      <Grid>
                        <Field label="Name" value={`${app.ec_first_name || ''} ${app.ec_last_name || ''}`} />
                        <Field label="Relationship" value={app.ec_relationship} />
                        <Field label="Phone" value={app.ec_phone} />
                        <Field label="Email" value={app.ec_email} />
                        <Field label="Address" value={app.ec_address} />
                        <Field label="Additional Info" value={app.ec_additional_info} />
                      </Grid>
                    </Section>

                    <Section title="Legal History">
                      <Grid>
                        <Field label="On Probation" value={app.on_probation} />
                        <Field label="On Parole" value={app.on_parole} />
                        <Field label="Probation/Parole Officer" value={app.po_name} />
                        <Field label="Officer Phone" value={app.po_phone} />
                        <Field label="Probation/Parole Completion Date" value={fmtDate(app.po_completion_date)} />
                        <Field label="Registered Sex Offender" value={app.sex_offender} />
                        {app.sex_offender === 'Yes' && <Field label="Sex Offense Details" value={app.sex_offense_details} full />}
                        <Field label="Child Abuse/Neglect Registry" value={app.child_abuse_registry} />
                        <Field label="Pending Criminal Charges" value={app.pending_charges} />
                        <Field label="Active No-Contact/Protective Order" value={app.protective_order} />
                      </Grid>
                      <Field label="Criminal History" value={app.criminal_history} full />
                    </Section>

                    <Section title="Signatures">
                      <Grid>
                        <Field label="Primary Applicant Signature" value={app.primary_signature} />
                        <Field label="Partner/Co-Applicant Signature" value={app.co_applicant_signature} />
                      </Grid>
                    </Section>

                    <Section title="Staff Notes">
                      <textarea value={notesDraft} onChange={e => setNotesDraft(e.target.value)} rows={3}
                        placeholder="Internal notes about this applicant..."
                        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #c9c9cf', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#18181b', resize: 'vertical' }} />
                      <button onClick={() => saveNotes(app)} disabled={savingId === app.id}
                        style={{ marginTop: '8px', background: 'transparent', border: '1px solid #c9c9cf', color: '#52525b', padding: '6px 14px', borderRadius: '7px', fontSize: '13px', cursor: 'pointer' }}>
                        {savingId === app.id ? 'Saving...' : 'Save Notes'}
                      </button>
                      {app.reviewed_at && <p style={{ color: '#9ca3af', fontSize: '12px', marginTop: '8px' }}>Last reviewed {fmtDateTime(app.reviewed_at)}{app.reviewed_by ? ` by ${app.reviewed_by}` : ''}</p>}
                    </Section>

                    <div style={k.actionRow}>
                      {app.status !== 'accepted' && <button onClick={() => setStatus(app, 'accepted')} style={{ ...k.actionBtn, borderColor: '#16a34a', color: '#16a34a' }}>Accept</button>}
                      {app.status !== 'waitlisted' && <button onClick={() => setStatus(app, 'waitlisted')} style={{ ...k.actionBtn, borderColor: '#2563eb', color: '#2563eb' }}>Waitlist</button>}
                      {app.status !== 'denied' && <button onClick={() => setStatus(app, 'denied')} style={{ ...k.actionBtn, borderColor: '#dc2626', color: '#dc2626' }}>Deny</button>}
                      {app.status !== 'pending' && <button onClick={() => setStatus(app, 'pending')} style={{ ...k.actionBtn, borderColor: '#c2410c', color: '#c2410c' }}>Reset to Pending</button>}
                      <button onClick={() => deleteApp(app.id)} style={{ ...k.actionBtn, borderColor: '#9ca3af', color: '#71717a', marginLeft: 'auto' }}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const Section = ({ title, children }) => (
  <div style={{ marginBottom: '18px' }}>
    <p style={{ fontSize: '11px', color: '#b22222', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700', margin: '0 0 8px' }}>{title}</p>
    {children}
  </div>
);

const Grid = ({ children }) => <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>{children}</div>;

const Field = ({ label, value, full }) => (
  <div style={{ gridColumn: full ? '1 / -1' : undefined, padding: '4px 0' }}>
    <p style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 2px' }}>{label}</p>
    <p style={{ fontSize: '13px', color: '#3f3f46', margin: 0, whiteSpace: 'pre-wrap' }}>{value || '—'}</p>
  </div>
);

const k = {
  page: { padding: '4px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' },
  title: { color: '#18181b', fontSize: '20px', fontWeight: '700', margin: '0 0 2px' },
  subtitle: { color: '#6b7280', fontSize: '13px', margin: 0 },
  search: { border: '1px solid #c9c9cf', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#18181b', minWidth: '240px' },
  tabs: { display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' },
  tabBtn: { background: '#ffffff', border: '1px solid #c9c9cf', color: '#52525b', padding: '7px 16px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' },
  tabBtnActive: { background: '#b22222', borderColor: '#b22222', color: '#ffffff' },
  card: { background: '#ffffff', border: '1px solid #c9c9cf', borderRadius: '12px', overflow: 'hidden' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', cursor: 'pointer' },
  name: { color: '#18181b', fontSize: '15px', fontWeight: '600', margin: '0 0 3px' },
  meta: { color: '#71717a', fontSize: '12px', margin: 0 },
  statusBadge: { fontSize: '12px', fontWeight: '600', padding: '4px 10px', borderRadius: '20px', whiteSpace: 'nowrap' },
  cardBody: { padding: '0 18px 18px', borderTop: '1px solid #e4e4e8' },
  medRow: { fontSize: '13px', padding: '4px 0' },
  actionRow: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px', paddingTop: '14px', borderTop: '1px solid #e4e4e8' },
  actionBtn: { background: 'transparent', border: '1px solid', padding: '7px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
};

export default Kinship;