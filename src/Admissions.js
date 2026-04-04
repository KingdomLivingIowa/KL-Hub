import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

function Admissions() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => { fetchApplications(); }, []);

  const fetchApplications = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setApplications(data || []);
    setLoading(false);
  };

  const updateStatus = async (id, status) => {
    const { error } = await supabase
      .from('applications')
      .update({ status })
      .eq('id', id);
    if (!error) fetchApplications();
  };

  const filtered = filter === 'all'
    ? applications
    : applications.filter(a => a.status === filter);

  const statusColor = (status) => {
    if (status === 'accepted') return '#16a34a';
    if (status === 'denied') return '#dc2626';
    return '#ca8a04';
  };

  return (
    <div>
      <div style={styles.tabs}>
        {['all', 'pending', 'accepted', 'denied'].map(tab => (
          <button key={tab} onClick={() => setFilter(tab)}
            style={{ ...styles.tab, ...(filter === tab ? styles.tabActive : {}) }}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={styles.empty}>Loading...</p>
      ) : filtered.length === 0 ? (
        <p style={styles.empty}>No applications found.</p>
      ) : (
        <div style={styles.list}>
          {filtered.map(app => (
            <div key={app.id} style={styles.card}>
              {/* Card Header */}
              <div style={styles.cardTop}>
                <div>
                  <p style={styles.name}>{app.full_name}</p>
                  <p style={styles.meta}>{app.email} · {app.phone}</p>
                  <p style={styles.date}>Applied: {new Date(app.created_at).toLocaleDateString()}</p>
                </div>
                <span style={{ ...styles.badge, backgroundColor: statusColor(app.status) + '22', color: statusColor(app.status) }}>
                  {app.status}
                </span>
              </div>

              {/* Snapshot — key accept/deny fields */}
              <div style={styles.snapshot}>
                <SnapField label="Gender" value={app.assigned_sex} />
                <SnapField label="Program" value={app.program} />
                <SnapField label="Lived here before?" value={app.lived_here_before} highlight={app.lived_here_before === 'Yes'} />
                <SnapField label="On disability?" value={app.on_disability} />
                <SnapField label="Substance history?" value={app.substance_history} />
                <SnapField label="Registered sex offender?" value={app.sex_offender} highlight={app.sex_offender === 'Yes'} />
                <SnapField label="Correspondence contact" value={app.correspondence_contact} />
                <SnapField label="Current situation" value={app.current_situation} />
              </div>

              {/* Full Application Toggle */}
              <button onClick={() => setExpanded(expanded === app.id ? null : app.id)} style={styles.viewBtn}>
                {expanded === app.id ? 'Hide Full Application' : 'View Full Application'}
              </button>

              {/* Full Application */}
              {expanded === app.id && (
                <div style={styles.fullApp}>
                  <Section title="General Info">
                    <Field label="First Name" value={app.first_name} />
                    <Field label="Last Name" value={app.last_name} />
                    <Field label="Phone" value={app.phone} />
                    <Field label="Email" value={app.email} />
                    <Field label="Correspondence Contact" value={app.correspondence_contact} />
                    <Field label="Date of Birth" value={app.date_of_birth} />
                    <Field label="SSN" value={app.ssn} />
                    <Field label="Has SS Card?" value={app.has_ss_card} />
                    <Field label="Present Residence" value={app.present_residence} />
                    <Field label="Program" value={app.program} />
                    <Field label="Lived Here Before?" value={app.lived_here_before} />
                    <Field label="Assigned Sex" value={app.assigned_sex} />
                    <Field label="Ethnicity" value={app.ethnicity} />
                    <Field label="Current Situation" value={app.current_situation} />
                    <Field label="Has ID?" value={app.has_id} />
                    <Field label="Marital Status" value={app.marital_status} />
                    <Field label="On Disability?" value={app.on_disability} />
                    <Field label="Difficulty Concentrating?" value={app.disability_concentrating} />
                    <Field label="Difficulty Walking?" value={app.disability_walking} />
                    <Field label="Difficulty Dressing?" value={app.disability_dressing} />
                    <Field label="Able to Work?" value={app.able_to_work} />
                    <Field label="Agrees to Volunteer?" value={app.agree_to_volunteer} />
                    <Field label="Allergy Info" value={app.allergy_info} />
                    <Field label="Doctor Info" value={app.doctor_info} />
                    <Field label="Employment Status" value={app.employment_status} />
                    <Field label="Employer Name" value={app.employer_name} />
                  </Section>
                  <Section title="Recovery">
                    <Field label="Substance or Alcohol History?" value={app.substance_history} />
                    <Field label="OUD Diagnosis?" value={app.oud_diagnosis} />
                    <Field label="Recovery Meetings" value={app.recovery_meetings} />
                    <Field label="Attended Treatment/PHP/IOP/Recovery House?" value={app.attended_treatment} />
                    <Field label="Takes Prescription Medication?" value={app.takes_medication} />
                    <Field label="Medication Details" value={app.medication_details} />
                  </Section>
                  <Section title="Emergency Contacts">
                    <Field label="Emergency Contact" value={app.emergency_contact} />
                    <Field label="Collateral Contacts" value={app.collateral_contacts} />
                  </Section>
                  <Section title="Legal History">
                    <Field label="On Probation?" value={app.on_probation} />
                    <Field label="On Parole?" value={app.on_parole} />
                    <Field label="PO Name" value={app.po_name} />
                    <Field label="PO Phone" value={app.po_phone} />
                    <Field label="Criminal History (last 5 years)" value={app.criminal_history} />
                    <Field label="Registered Sex Offender?" value={app.sex_offender} />
                    <Field label="Sex Offense Details" value={app.sex_offense_details} />
                  </Section>
                  <Section title="Information Accuracy">
                    <Field label="Form Completed By" value={app.form_completed_by} />
                    <Field label="Agrees to Rules?" value={app.agree_to_rules} />
                    <Field label="Agrees to KL Levels?" value={app.agree_to_levels} />
                    <Field label="Client Notes" value={app.client_notes} />
                    <Field label="Signature" value={app.signature} />
                  </Section>
                </div>
              )}

              {app.status === 'pending' && (
                <div style={styles.actions}>
                  <button onClick={() => updateStatus(app.id, 'accepted')} style={styles.acceptBtn}>Accept</button>
                  <button onClick={() => updateStatus(app.id, 'denied')} style={styles.denyBtn}>Deny</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SnapField = ({ label, value, highlight }) => (
  <div style={styles.snapField}>
    <span style={styles.snapLabel}>{label}</span>
    <span style={{ ...styles.snapValue, color: highlight ? '#dc2626' : '#ffffff' }}>{value || '—'}</span>
  </div>
);

const Section = ({ title, children }) => (
  <div style={styles.fullSection}>
    <p style={styles.fullSectionTitle}>{title}</p>
    {children}
  </div>
);

const Field = ({ label, value }) => (
  <div style={styles.fullField}>
    <span style={styles.fullLabel}>{label}:</span>
    <span style={{ ...styles.fullValue, color: value ? '#fff' : '#555' }}>{value || '—'}</span>
  </div>
);

const styles = {
  tabs: { display: 'flex', gap: '8px', marginBottom: '24px' },
  tab: { backgroundColor: 'transparent', border: '1px solid #444', color: '#a0a0a0', padding: '8px 18px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer' },
  tabActive: { backgroundColor: '#b22222', border: '1px solid #b22222', color: '#ffffff' },
  empty: { color: '#a0a0a0', textAlign: 'center', marginTop: '60px', fontSize: '15px' },
  list: { display: 'flex', flexDirection: 'column', gap: '16px' },
  card: { backgroundColor: '#2a2a2a', borderRadius: '12px', padding: '20px 24px' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' },
  name: { color: '#ffffff', fontSize: '16px', fontWeight: '600', margin: '0 0 4px 0' },
  meta: { color: '#a0a0a0', fontSize: '13px', margin: '2px 0' },
  date: { color: '#666', fontSize: '12px', margin: '4px 0 0 0' },
  badge: { padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', textTransform: 'capitalize' },
  snapshot: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', backgroundColor: '#1e1e1e', borderRadius: '8px', padding: '16px', marginBottom: '12px' },
  snapField: { display: 'flex', flexDirection: 'column', gap: '2px' },
  snapLabel: { color: '#666', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  snapValue: { color: '#ffffff', fontSize: '13px', fontWeight: '500' },
  viewBtn: { backgroundColor: 'transparent', border: '1px solid #444', color: '#a0a0a0', padding: '6px 14px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', marginBottom: '12px' },
  fullApp: { backgroundColor: '#1a1a1a', borderRadius: '8px', padding: '16px', marginBottom: '12px' },
  fullSection: { marginBottom: '16px' },
  fullSectionTitle: { color: '#b22222', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px 0' },
  fullField: { display: 'flex', gap: '8px', marginBottom: '6px' },
  fullLabel: { color: '#888', fontSize: '13px', minWidth: '180px' },
  fullValue: { color: '#fff', fontSize: '13px' },
  actions: { display: 'flex', gap: '10px', marginTop: '16px' },
  acceptBtn: { backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 20px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' },
  denyBtn: { backgroundColor: 'transparent', color: '#dc2626', border: '1px solid #dc2626', borderRadius: '8px', padding: '8px 20px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' },
};

export default Admissions;