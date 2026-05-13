import { useState, useEffect, useCallback, useRef } from 'react';
import { getCached, setCached } from './dataCache';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';

const SUPABASE_URL = 'https://pmvxnetpbxuzkrxitioc.supabase.co';
const PAGE_SIZE = 25;

function Admissions() {
  const { isAdmin } = useUser();
  const [applications, setApplications] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [expanded, setExpanded] = useState(null);
  const [duplicateModal, setDuplicateModal] = useState(null);
  const [mergeReturningModal, setMergeReturningModal] = useState(null);
  const [merging, setMerging] = useState(false);
  const [acceptingId, setAcceptingId] = useState(null);

  const debounceTimer = useRef(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setCurrentPage(1);
    }, 300);

    return () => clearTimeout(debounceTimer.current);
  }, [search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  const applyApplicationFilters = useCallback(
    (query) => {
      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      if (debouncedSearch) {
        query = query.or(
          `first_name.ilike.%${debouncedSearch}%,last_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%`
        );
      }

      return query;
    },
    [filter, debouncedSearch]
  );

  const fetchApplications = useCallback(async (force = false) => {
    const cacheKey = `admissions_${filter}_${debouncedSearch}_${currentPage}`;
    if (!force) {
      const cached = getCached(cacheKey);
      if (cached) { setApplications(cached.apps); setTotalCount(cached.total); setLoading(false); return; }
    }
    setLoading(true);

    try {
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let countQuery = supabase
        .from('applications')
        .select('id', { count: 'exact', head: true });

      countQuery = applyApplicationFilters(countQuery);

      const { count, error: countError } = await countQuery;

      if (countError) {
        console.error('Error fetching application count:', countError);
        alert('There was a problem loading the admissions count.');
        setApplications([]);
        setTotalCount(0);
        return;
      }

      setTotalCount(count || 0);

      let dataQuery = supabase
        .from('applications')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      dataQuery = applyApplicationFilters(dataQuery);

      const { data, error: dataError } = await dataQuery;

      if (dataError) {
        console.error('Error fetching applications:', dataError);
        alert('There was a problem loading admissions.');
        setApplications([]);
        return;
      }

      setApplications(data || []);
      setCached(cacheKey, { apps: data || [], total: count || 0 });
    } catch (error) {
      console.error('Unexpected fetchApplications error:', error);
      alert('Something went wrong while loading admissions.');
      setApplications([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [currentPage, applyApplicationFilters, filter, debouncedSearch]);

  const fetchClients = useCallback(async () => {
    try {
      const { data: cls, error: clientsError } = await supabase
        .from('clients')
        .select('id, first_name, last_name, date_of_birth, ssn, email, application_id, status');

      if (clientsError) {
        console.error('Error loading clients:', clientsError);
      } else {
        setClients(cls || []);
      }
    } catch (error) {
      console.error('Unexpected fetchClients error:', error);
    }
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const createClientFromApp = async (app) => {
    const { data: existingClient, error: existingError } = await supabase
      .from('clients')
      .select('id')
      .eq('application_id', app.id)
      .maybeSingle();

    if (existingError) return existingError;
    if (existingClient) return null;

    const fullName = `${app.first_name || ''} ${app.last_name || ''}`.trim();

    const uniqueId =
      (app.first_name || '').slice(0, 2).toLowerCase() +
      (app.last_name || '').slice(0, 2).toLowerCase() +
      (app.date_of_birth ? app.date_of_birth.replace(/-/g, '').slice(2) : '000000');

    const payload = {
      full_name: fullName,
      first_name: app.first_name || null,
      last_name: app.last_name || null,
      date_of_birth: app.date_of_birth || null,
      ssn: app.ssn || null,
      gender: app.assigned_sex || app.gender || null,
      ethnicity: app.ethnicity || null,
      marital_status: app.marital_status || null,
      unique_id: uniqueId,
      photo_url: app.photo_url || null,

      status: 'Accepted',
      level: 1,
      start_date: null,

      personal_status: app.current_situation || null,
      application_type: app.program || null,
      phone: app.phone || null,
      email: app.email || null,

      emergency_contact_name: app.emergency_contact || null,
      present_residence: app.present_residence || app.current_situation || null,

      po_name: app.po_name || null,
      po_phone: app.po_phone || null,
      on_probation: app.on_probation || null,
      on_parole: app.on_parole || null,
      sex_offender: app.sex_offender || null,
      criminal_history: app.criminal_history || null,

      substance_history: app.substance_history || null,
      treatment_history: app.attended_treatment || null,
      recovery_meetings: app.recovery_meetings || null,
      oud: app.oud_diagnosis || null,

      application_id: app.id,
      client_notes: app.client_notes || null,
      medication_details: app.medication_details || null,
      drug_of_choice: app.drug_of_choice || null,
    };

    const { data: existingForApp } = await supabase
      .from('clients')
      .select('id')
      .eq('application_id', app.id)
      .maybeSingle();

    if (existingForApp) return null; // already merged, skip insert

    const { error } = await supabase.from('clients').insert([payload]);
    return error;
  };

  const deleteApplication = async (id) => {
    if (!window.confirm('Permanently delete this application? This cannot be undone.')) return;
    const { error } = await supabase.from('applications').delete().eq('id', id);
    if (error) { alert('Error deleting application: ' + error.message); return; }
    fetchApplications();
  };

  const updateStatus = async (id, status) => {
    const app = applications.find((a) => a.id === id);
    if (!app) { alert('Application not found.'); return; }
    const fullName = `${app.first_name || ''} ${app.last_name || ''}`.trim();

    if (status === 'accepted') {
      setAcceptingId(id);
      const clientError = await createClientFromApp(app);
      if (clientError) console.error('createClientFromApp error:', clientError);
    }

    const { error } = await supabase.from('applications').update({ status }).eq('id', id);
    if (error) { setAcceptingId(null); alert('Error updating application: ' + error.message); return; }

    // Send email via edge function for manual decisions
    if (app.email) {
      const { data: { session } } = await supabase.auth.getSession();
      const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdnhuZXRwYnh1emtyeGl0aW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjE1NDcsImV4cCI6MjA5MDgzNzU0N30.IRRDTmFc3Ew1GWk69q0pSRTezsJOskK43yklIK4h2Xc';
      const authToken = session?.access_token || ANON_KEY;
      fetch(`${SUPABASE_URL}/functions/v1/send-application-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ type: status === 'denied' ? 'denied_manual' : 'accepted_manual', email: app.email, correspondence_contact: app.correspondence_contact || null, full_name: fullName, flag: app.auto_flag, balance: app.auto_flag === 'past_balance' ? parseFloat((app.flag_reason || '').match(/\$([\d.]+)/)?.[1] || 0) : null }),
      }).catch(err => console.error('send-application-email error:', err));
    }

    setAcceptingId(null);
    fetchApplications();
    fetchClients();
  };

  const findDuplicate = (app) => {
    if (app.status !== 'pending') return null;

    const firstLower = app.first_name?.toLowerCase().trim();
    const lastLower = app.last_name?.toLowerCase().trim();
    const appDob = app.date_of_birth;
    const appSsn = app.ssn?.replace(/\D/g, '');
    const appEmail = app.email?.toLowerCase().trim();

    // Require name + at least one other matching field to flag as duplicate
    const clientMatch = clients.find((c) => {
      if (c.application_id === app.id) return false; // same app
      const nameMatch = c.first_name?.toLowerCase().trim() === firstLower &&
                        c.last_name?.toLowerCase().trim() === lastLower;
      if (!nameMatch) return false;
      const dobMatch = appDob && c.date_of_birth && c.date_of_birth === appDob;
      const ssnMatch = appSsn && appSsn.length >= 4 && c.ssn?.replace(/\D/g, '') === appSsn;
      const emailMatch = appEmail && c.email?.toLowerCase().trim() === appEmail;
      return dobMatch || ssnMatch || emailMatch;
    });
    if (clientMatch) return clientMatch;

    // For other pending apps, name match alone is enough (same person applying twice)
    const appMatch = applications.find((a) =>
      a.id !== app.id &&
      a.status === 'pending' &&
      a.first_name?.toLowerCase().trim() === firstLower &&
      a.last_name?.toLowerCase().trim() === lastLower
    );
    if (appMatch) return { ...appMatch, isApplication: true };

    return null;
  };

  const handleMerge = async () => {
    if (!duplicateModal) return;

    setMerging(true);
    const { app, client } = duplicateModal;

    if (client.isApplication) {
      const { error } = await supabase
        .from('applications')
        .update({ status: 'accepted' })
        .eq('id', app.id);

      if (error) {
        alert('Error updating duplicate application: ' + error.message);
        console.error(error);
        setMerging(false);
        return;
      }

      setDuplicateModal(null);
      fetchApplications();
      setMerging(false);
      return;
    }

    const { error } = await supabase
      .from('clients')
      .update({
        first_name: app.first_name || client.first_name,
        last_name: app.last_name || client.last_name,
        phone: app.phone || null,
        email: app.email || null,
        date_of_birth: app.date_of_birth || client.date_of_birth,
        ssn: app.ssn || client.ssn,
        gender: app.assigned_sex || app.gender || null,
        present_residence: app.current_situation || null,
        application_type: app.program || null,
        application_id: app.id,
      })
      .eq('id', client.id);

    if (error) {
      alert('Error merging into existing client: ' + error.message);
      console.error(error);
      setMerging(false);
      return;
    }

    const { error: appUpdateError } = await supabase
      .from('applications')
      .update({ status: 'accepted' })
      .eq('id', app.id);

    if (appUpdateError) {
      alert(
        'Client was updated, but application status could not be changed: ' +
          appUpdateError.message
      );
      console.error(appUpdateError);
      setMerging(false);
      return;
    }

    setDuplicateModal(null);
    fetchApplications();
    fetchClients();
    setMerging(false);
  };

  const handleIgnore = () => {
    if (!duplicateModal) return;
    setDuplicateModal(null);
  };

  const handleMergeReturning = async () => {
    if (!mergeReturningModal) return;
    setMerging(true);
    const { app, existingClient } = mergeReturningModal;

    const { error } = await supabase.from('clients').update({
      first_name: app.first_name || existingClient.first_name,
      last_name: app.last_name || existingClient.last_name,
      phone: app.phone || existingClient.phone,
      email: app.email || existingClient.email,
      date_of_birth: app.date_of_birth || existingClient.date_of_birth,
      ssn: app.ssn || existingClient.ssn,
      gender: app.assigned_sex || app.gender || existingClient.gender,
      po_name: app.po_name || existingClient.po_name,
      po_phone: app.po_phone || existingClient.po_phone,
      sponsor_name: app.sponsor_name || existingClient.sponsor_name,
      sponsor_phone: app.sponsor_phone || existingClient.sponsor_phone,
      application_id: app.id,
      status: 'Accepted',
    }).eq('id', existingClient.id);

    if (error) { alert('Error merging client: ' + error.message); setMerging(false); return; }

    await supabase.from('applications').update({ merged: true }).eq('id', app.id);

    setMergeReturningModal(null);
    fetchApplications();
    fetchClients();
    setMerging(false);
  };

  const statusColor = (status) => {
    if (status === 'accepted') return '#16a34a';
    if (status === 'denied') return '#dc2626';
    return '#ca8a04';
  };

  const fmt = (val) => val || '—';

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalCount);

  const flagInfo = (flag) => {
    if (flag === 'sex_offender') return { icon: '🚫', color: '#f87171', label: 'Auto-denied: Registered sex offender' };
    if (flag === 'disability_review') return { icon: '♿', color: '#fb923c', label: 'Needs review: Disability indicated — review before accepting or denying' };
    if (flag === 'past_balance') return { icon: '💰', color: '#fb923c', label: 'Needs review: Returning client with outstanding balance' };
    if (flag === 'returning_merge') return { icon: '🔄', color: '#60a5fa', label: 'Returning client — merge with existing profile before accepting' };
    return { icon: '⚠', color: '#fb923c', label: flag };
  };

  const renderCard = (app, duplicate, isReview) => {
    const fi = app.auto_flag ? flagInfo(app.auto_flag) : null;
    return (
      <div key={app.id} style={{ ...s.card, ...(isReview ? { borderColor: '#fb923c44', borderWidth: '1px', borderStyle: 'solid' } : {}) }}>
        <div style={s.cardHeader}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={s.name}>{fmt(app.first_name)} {fmt(app.last_name)}</span>
              {duplicate && app.status === 'pending' && (
                <button style={s.dupBadge} onClick={() => setDuplicateModal({ app, client: duplicate })}>
                  ⚠ Possible Duplicate
                </button>
              )}
            </div>
            <p style={s.meta}>{fmt(app.email)} · {fmt(app.phone)}</p>
            <p style={s.meta}>Applied: {app.created_at ? new Date(app.created_at).toLocaleDateString() : '—'}</p>
            {fi && (
              <div style={{ marginTop: '8px', padding: '8px 12px', background: '#1a1a1a', borderRadius: '8px', borderLeft: `3px solid ${fi.color}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px' }}>{fi.icon}</span>
                <span style={{ fontSize: '13px', color: fi.color, fontWeight: '500' }}>{fi.label}</span>
              </div>
            )}
            {app.flag_reason && (
              <p style={{ fontSize: '12px', color: '#888', margin: '4px 0 0 12px' }}>{app.flag_reason}</p>
            )}
          </div>
          <span style={{ ...s.badge, backgroundColor: statusColor(app.status) }}>
            {app.status ? app.status.charAt(0).toUpperCase() + app.status.slice(1) : 'Pending'}
          </span>
        </div>

        <div style={s.snapshot}>
          {[
            ['Gender', app.gender || app.assigned_sex], ['Program', app.program],
            ['Lived Here Before?', app.lived_here_before], ['On Disability?', app.on_disability],
            ['Substance History?', app.substance_history], ['Registered Sex Offender?', app.sex_offender],
            ['Correspondence Contact', app.correspondence_contact], ['Current Situation', app.current_situation],
          ].map(([label, val]) => (
            <div key={label} style={s.snapshotItem}>
              <span style={s.snapshotLabel}>{label}</span>
              <span style={s.snapshotVal}>{fmt(val)}</span>
            </div>
          ))}
        </div>

        <div style={s.cardActions}>
          <button style={s.viewBtn} onClick={() => setExpanded(expanded === app.id ? null : app.id)}>
            {expanded === app.id ? 'Hide Application' : 'View Full Application'}
          </button>
          {app.auto_flag === 'returning_merge' && app.status === 'pending' && (
            <button style={{ padding: '7px 14px', background: '#1e3a5f', border: '1px solid #3b82f6', borderRadius: '8px', color: '#60a5fa', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}
              onClick={async () => {
                const { data: existing } = await supabase.from('clients')
                  .select('id, full_name, email, status')
                  .or(`email.eq.${app.email},full_name.eq.${(app.first_name + ' ' + app.last_name).trim()}`)
                  .limit(1).maybeSingle();
                setMergeReturningModal({ app, existingClient: existing || { id: null, full_name: 'unknown', email: '' } });
              }}>
              🔄 Merge with Existing
            </button>
          )}          {app.status === 'pending' && (
            <>
              <button style={s.acceptBtn} onClick={() => updateStatus(app.id, 'accepted')} disabled={acceptingId === app.id}>
                {acceptingId === app.id ? 'Accepting...' : 'Accept'}
              </button>
              <button style={s.denyBtn} onClick={() => updateStatus(app.id, 'denied')}>Deny</button>
            </>
          )}
          {app.status === 'accepted' && (
            <button style={s.denyBtn} onClick={() => updateStatus(app.id, 'denied')}>Deny</button>
          )}
          {app.status === 'denied' && (
            <button style={s.acceptBtn} onClick={() => updateStatus(app.id, 'accepted')} disabled={acceptingId === app.id}>
              {acceptingId === app.id ? 'Accepting...' : 'Accept'}
            </button>
          )}
          {isAdmin && (
            <button style={{ padding: '7px 14px', background: 'transparent', border: '1px solid #7f1d1d', borderRadius: '8px', color: '#f87171', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}
              onClick={() => deleteApplication(app.id)}>
              🗑 Delete
            </button>
          )}
        </div>

        {expanded === app.id && (
          <div style={s.fullApp}>
            <p style={s.sectionDivider}>General Info</p>
            <div style={s.fullGrid}>
              {[
                ['First Name', app.first_name], ['Last Name', app.last_name],
                ['Email', app.email], ['Phone', app.phone],
                ['Date of Birth', app.date_of_birth], ['SSN', app.ssn],
                ['Gender', app.gender || app.assigned_sex], ['Ethnicity', app.ethnicity],
                ['Marital Status', app.marital_status], ['Present Residence', app.present_residence],
                ['Has ID?', app.has_id], ['Has SS Card?', app.has_ss_card],
                ['Employment Status', app.employment_status], ['Employer Name', app.employer_name],
                ['Program', app.program], ['Lived Here Before?', app.lived_here_before],
                ['Current Situation', app.current_situation], ['On Disability?', app.on_disability],
                ['Difficulty Concentrating?', app.disability_concentrating],
                ['Difficulty Walking?', app.disability_walking],
                ['Difficulty Dressing?', app.disability_dressing],
                ['Able to Work?', app.able_to_work], ['Agree to Volunteer?', app.agree_to_volunteer],
                ['Allergy Info', app.allergy_info], ['Doctor Info', app.doctor_info],
                ['Correspondence Contact', app.correspondence_contact],
              ].map(([label, val]) => val ? (
                <div key={label} style={s.fullItem}>
                  <span style={s.fullLabel}>{label}</span>
                  <span style={s.fullVal}>{val}</span>
                </div>
              ) : null)}
            </div>
            <p style={s.sectionDivider}>Recovery</p>
            <div style={s.fullGrid}>
              {[
                ['Substance History?', app.substance_history], ['Drug of Choice', app.drug_of_choice],
                ['Sober Date', app.sober_date], ['OUD Diagnosis', app.oud_diagnosis],
                ['Recovery Meetings', app.recovery_meetings], ['Attended Treatment?', app.attended_treatment],
                ['Takes Medication?', app.takes_medication],
              ].map(([label, val]) => val ? (
                <div key={label} style={s.fullItem}>
                  <span style={s.fullLabel}>{label}</span>
                  <span style={s.fullVal}>{val}</span>
                </div>
              ) : null)}
            </div>
            <p style={s.sectionDivider}>Emergency Contacts</p>
            <div style={s.fullGrid}>
              {[
                ['Emergency Contact', app.emergency_contact],
                ['Collateral Contacts', app.collateral_contacts],
              ].map(([label, val]) => val ? (
                <div key={label} style={s.fullItem}>
                  <span style={s.fullLabel}>{label}</span>
                  <span style={s.fullVal}>{val}</span>
                </div>
              ) : null)}
            </div>
            <p style={s.sectionDivider}>Legal</p>
            <div style={s.fullGrid}>
              {[
                ['On Probation?', app.on_probation], ['On Parole?', app.on_parole],
                ['Parole Officer', app.po_name], ['PO Phone', app.po_phone],
                ['Criminal History', app.criminal_history], ['Sex Offender?', app.sex_offender],
                ['Sex Offense Details', app.sex_offense_details],
              ].map(([label, val]) => val ? (
                <div key={label} style={s.fullItem}>
                  <span style={s.fullLabel}>{label}</span>
                  <span style={s.fullVal}>{val}</span>
                </div>
              ) : null)}
            </div>
            <p style={s.sectionDivider}>Information Accuracy</p>
            <div style={s.fullGrid}>
              {[
                ['Form Completed By', app.form_completed_by], ['Agreed to Rules?', app.agree_to_rules],
                ['Agreed to KL Levels?', app.agree_to_levels], ['Client Notes', app.client_notes],
                ['Signature', app.signature],
              ].map(([label, val]) => val ? (
                <div key={label} style={s.fullItem}>
                  <span style={s.fullLabel}>{label}</span>
                  <span style={s.fullVal}>{val}</span>
                </div>
              ) : null)}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={s.page}>
      <h1 style={s.title}>Admissions</h1>

      <div style={s.toolbar}>
        <input
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={s.search}
        />

        <div style={s.tabs}>
          {['pending', 'all', 'accepted', 'denied'].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              style={{ ...s.tab, ...(filter === tab ? s.tabActive : {}) }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <p style={s.sub}>
          {totalCount > 0
            ? `Showing ${rangeStart}–${rangeEnd} of ${totalCount} ${
                filter === 'all' ? 'applications' : filter
              }`
            : `0 ${filter === 'all' ? 'applications' : filter}`}
        </p>
      </div>

      {loading ? (
        <p style={s.empty}>Loading...</p>
      ) : applications.length === 0 ? (
        <p style={s.empty}>No applications found.</p>
      ) : (
        <>
          {/* Needs Review section — only show on pending/all tabs */}
          {(filter === 'pending' || filter === 'all') && (() => {
            const flagged = applications.filter(a => a.auto_flag && a.status === 'pending');
            if (!flagged.length) return null;
            return (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#fb923c' }}>⚠ Needs Review</span>
                  <span style={{ background: '#3a2d1e', color: '#fb923c', fontSize: '12px', padding: '2px 8px', borderRadius: '20px', fontWeight: '600' }}>{flagged.length}</span>
                </div>
                <div style={s.list}>
                  {flagged.map(app => {
                    const duplicate = findDuplicate(app);
                    return renderCard(app, duplicate, true);
                  })}
                </div>
              </div>
            );
          })()}

          {/* Regular applications */}
          <div style={s.list}>
            {applications.filter(a => !a.auto_flag || a.status !== 'pending').map(app => {
              const duplicate = findDuplicate(app);
              return renderCard(app, duplicate, false);
            })}
          </div>

          {totalPages > 1 && (
            <div style={s.pagination}>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{ ...s.pageBtn, ...(currentPage === 1 ? s.pageBtnDisabled : {}) }}
              >
                ← Previous
              </button>

              <div style={s.pageNumbers}>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                  .reduce((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === '...' ? (
                      <span key={`ellipsis-${i}`} style={s.ellipsis}>
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        style={{ ...s.pageBtn, ...(currentPage === p ? s.pageBtnActive : {}) }}
                      >
                        {p}
                      </button>
                    )
                  )}
              </div>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{ ...s.pageBtn, ...(currentPage === totalPages ? s.pageBtnDisabled : {}) }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {duplicateModal && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>Possible Duplicate Detected</h2>
              <p style={s.modalSub}>
                {duplicateModal.client.isApplication
                  ? 'Another application with this name already exists. Review and choose an action.'
                  : 'A client with this name already exists. Review and choose an action.'}
              </p>
            </div>

            <div style={s.compareGrid}>
              <div style={s.compareCol}>
                <div style={s.compareColHeader}>New Application</div>
                {[
                  ['Name', `${duplicateModal.app.first_name} ${duplicateModal.app.last_name}`],
                  ['DOB', duplicateModal.app.date_of_birth],
                  ['SSN', duplicateModal.app.ssn],
                  ['Email', duplicateModal.app.email],
                  ['Phone', duplicateModal.app.phone],
                  [
                    'Gender',
                    duplicateModal.app.assigned_sex || duplicateModal.app.gender,
                  ],
                  ['Program', duplicateModal.app.program],
                ].map(([label, val]) => (
                  <div key={label} style={s.compareRow}>
                    <span style={s.compareLabel}>{label}</span>
                    <span style={s.compareVal}>{fmt(val)}</span>
                  </div>
                ))}
              </div>

              <div style={s.compareCol}>
                <div style={s.compareColHeader}>
                  {duplicateModal.client.isApplication
                    ? 'Existing Application'
                    : 'Existing Client'}
                </div>
                {[
                  [
                    'Name',
                    `${duplicateModal.client.first_name} ${duplicateModal.client.last_name}`,
                  ],
                  ['DOB', duplicateModal.client.date_of_birth],
                  ['SSN', duplicateModal.client.ssn],
                  ['Status', duplicateModal.client.status],
                ].map(([label, val]) => (
                  <div key={label} style={s.compareRow}>
                    <span style={s.compareLabel}>{label}</span>
                    <span style={s.compareVal}>{fmt(val)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={s.modalActions}>
              {!duplicateModal.client.isApplication && (
                <button style={s.mergeBtn} onClick={handleMerge} disabled={merging}>
                  {merging ? 'Merging...' : 'Merge into Existing Client'}
                </button>
              )}
              <button style={s.ignoreBtn} onClick={handleIgnore}>
                Treat as New Person
              </button>
              <button style={s.cancelBtn} onClick={() => setDuplicateModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Returning Client Modal */}
      {mergeReturningModal && (
        <div style={s.modalOverlay} onClick={() => setMergeReturningModal(null)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', margin: '0 0 8px 0', fontSize: '16px' }}>Merge with Existing Profile</h3>
            <p style={{ color: '#999', fontSize: '13px', margin: '0 0 16px 0' }}>
              This will update <strong style={{ color: '#ddd' }}>{mergeReturningModal.existingClient?.full_name || 'the existing client'}</strong>'s profile with the new application data and set their status to Accepted.
            </p>
            <div style={{ background: '#222', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
              <p style={{ color: '#aaa', fontSize: '13px', margin: '0 0 4px 0' }}>New application from: <strong style={{ color: '#fff' }}>{mergeReturningModal.app.first_name} {mergeReturningModal.app.last_name}</strong></p>
              <p style={{ color: '#aaa', fontSize: '13px', margin: 0 }}>Will merge into: <strong style={{ color: '#60a5fa' }}>{mergeReturningModal.existingClient?.full_name}</strong></p>
            </div>
            <div style={s.modalActions}>
              <button style={s.mergeBtn} onClick={handleMergeReturning} disabled={merging}>
                {merging ? 'Merging...' : 'Confirm Merge'}
              </button>
              <button style={s.cancelBtn} onClick={() => setMergeReturningModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  page: {
    padding: '32px',
    backgroundColor: '#1a1a1a',
    minHeight: '100vh',
    color: '#fff',
    fontFamily: 'sans-serif',
  },
  title: { fontSize: '24px', fontWeight: '600', margin: '0 0 24px 0' },
  toolbar: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' },
  sub: { color: '#999', fontSize: '14px', margin: 0 },
  search: {
    width: '100%',
    maxWidth: '360px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #444',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#fff',
    fontSize: '14px',
  },
  tabs: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  tab: {
    padding: '8px 18px',
    borderRadius: '20px',
    border: '1px solid #444',
    background: 'transparent',
    color: '#bbb',
    cursor: 'pointer',
    fontSize: '13px',
  },
  tabActive: { background: '#b22222', color: '#fff', borderColor: '#b22222' },
  empty: { color: '#999', fontSize: '14px' },
  list: { display: 'flex', flexDirection: 'column', gap: '16px' },
  card: {
    background: '#333',
    borderRadius: '12px',
    padding: '20px',
    border: '1px solid #333',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
  },
  name: { fontSize: '18px', fontWeight: '600', color: '#fff' },
  meta: { fontSize: '13px', color: '#bbb', margin: '2px 0 0 0' },
  badge: {
    fontSize: '12px',
    padding: '4px 12px',
    borderRadius: '20px',
    color: '#fff',
    fontWeight: '500',
    flexShrink: 0,
  },
  dupBadge: {
    fontSize: '11px',
    padding: '3px 10px',
    borderRadius: '20px',
    background: '#78350f',
    color: '#fbbf24',
    border: '1px solid #92400e',
    cursor: 'pointer',
    fontFamily: 'sans-serif',
  },
  snapshot: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px',
    background: '#222',
    borderRadius: '8px',
    padding: '14px',
    marginBottom: '16px',
  },
  snapshotItem: { display: 'flex', flexDirection: 'column', gap: '2px' },
  snapshotLabel: {
    fontSize: '10px',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  snapshotVal: { fontSize: '13px', color: '#fff' },
  cardActions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  viewBtn: {
    padding: '7px 14px',
    borderRadius: '8px',
    border: '1px solid #444',
    background: 'transparent',
    color: '#aaa',
    cursor: 'pointer',
    fontSize: '13px',
    fontFamily: 'sans-serif',
  },
  acceptBtn: {
    padding: '7px 14px',
    borderRadius: '8px',
    border: 'none',
    background: '#16a34a',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    fontFamily: 'sans-serif',
  },
  denyBtn: {
    padding: '7px 14px',
    borderRadius: '8px',
    border: 'none',
    background: '#dc2626',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    fontFamily: 'sans-serif',
  },
  fullApp: { marginTop: '16px', borderTop: '1px solid #333', paddingTop: '16px' },
  sectionDivider: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    margin: '16px 0 10px 0',
    paddingBottom: '6px',
    borderBottom: '1px solid #333',
  },
  fullGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '12px',
  },
  fullItem: { display: 'flex', flexDirection: 'column', gap: '2px' },
  fullLabel: {
    fontSize: '10px',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  fullVal: { fontSize: '13px', color: '#ddd', lineHeight: '1.4' },
  subCard: {
    background: '#1a1a1a',
    borderRadius: '8px',
    padding: '12px 14px',
    border: '1px solid #333',
  },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    background: '#333',
    borderRadius: '16px',
    padding: '28px',
    maxWidth: '700px',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    border: '1px solid #444',
  },
  modalHeader: { marginBottom: '20px' },
  modalTitle: { fontSize: '18px', fontWeight: '600', margin: '0 0 6px 0', color: '#fff' },
  modalSub: { fontSize: '13px', color: '#bbb', margin: 0 },
  compareGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '24px',
  },
  compareCol: { background: '#1a1a1a', borderRadius: '10px', padding: '14px' },
  compareColHeader: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#bbb',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '12px',
  },
  compareRow: { display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '10px' },
  compareLabel: {
    fontSize: '10px',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  compareVal: { fontSize: '13px', color: '#fff' },
  modalActions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  mergeBtn: {
    padding: '10px 18px',
    borderRadius: '8px',
    border: 'none',
    background: '#b22222',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: 'sans-serif',
  },
  ignoreBtn: {
    padding: '10px 18px',
    borderRadius: '8px',
    border: '1px solid #444',
    background: 'transparent',
    color: '#aaa',
    cursor: 'pointer',
    fontSize: '13px',
    fontFamily: 'sans-serif',
  },
  cancelBtn: {
    padding: '10px 18px',
    borderRadius: '8px',
    border: '1px solid #444',
    background: 'transparent',
    color: '#999',
    cursor: 'pointer',
    fontSize: '13px',
    fontFamily: 'sans-serif',
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    marginTop: '20px',
    flexWrap: 'wrap',
  },
  pageBtn: {
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid #444',
    background: 'transparent',
    color: '#aaa',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  pageBtnActive: {
    background: '#b22222',
    borderColor: '#b22222',
    color: '#fff',
    fontWeight: '600',
  },
  pageBtnDisabled: { opacity: 0.3, cursor: 'not-allowed' },
  ellipsis: { color: '#bbb', fontSize: '13px', padding: '0 4px' },
  pageNumbers: { display: 'flex', alignItems: 'center', gap: '6px' },
};

export default Admissions;