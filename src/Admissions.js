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
  const [mergeWizardOpen, setMergeWizardOpen] = useState(false);
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
      po_email: app.po_email || null,
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

    // Also check by name for clients merged without application_id linkage
    const { data: existingByName } = !existingForApp ? await supabase
      .from('clients')
      .select('id')
      .eq('full_name', fullName)
      .not('status', 'in', '("Applied","Accepted","Waiting List","Pending","Active")')
      .maybeSingle() : { data: null };

    const matchedClient = existingForApp || existingByName;

    if (matchedClient) {
      // Already exists — update status to Accepted
      await supabase.from('clients').update({
        status: 'Accepted',
        house_id: null,
        start_date: null,
        discharge_date: null,
        application_id: app.id,
      }).eq('id', matchedClient.id);
      return null;
    }

    const { error } = await supabase.from('clients').insert([payload]);
    return error;
  };

  const deleteApplication = async (id) => {
    if (!window.confirm('Permanently delete this application? This cannot be undone.')) return;
    const { error } = await supabase.from('applications').delete().eq('id', id);
    if (error) { alert('Error deleting application: ' + error.message); return; }
    setApplications(prev => prev.filter(a => a.id !== id));
    fetchApplications();
  };

  const updateStatus = async (id, status) => {
    const app = applications.find((a) => a.id === id);
    if (!app) { alert('Application not found.'); return; }
    const fullName = `${app.first_name || ''} ${app.last_name || ''}`.trim();

    try {
      if (status === 'accepted') {
        setAcceptingId(id);
        const clientError = await createClientFromApp(app);
        if (clientError) console.error('createClientFromApp error:', clientError);
      }

      const { error } = await supabase.from('applications').update({ status }).eq('id', id);
      if (error) { alert('Error updating application: ' + error.message); return; }

      // Send email via edge function for manual decisions
      if (app.email) {
        const { data: { session } } = await supabase.auth.getSession();
        const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdnhuZXRwYnh1emtyeGl0aW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjE1NDcsImV4cCI6MjA5MDgzNzU0N30.IRRDTmFc3Ew1GWk69q0pSRTezsJOskK43yklIK4h2Xc';
        const authToken = session?.access_token || ANON_KEY;
        fetch(`${SUPABASE_URL}/functions/v1/send-application-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({
            type: status === 'denied' ? 'denied_manual' : 'accepted_manual',
            email: app.email,
            correspondence_contact: app.correspondence_contact || null,
            full_name: fullName,
            current_situation: app.current_situation || null,
            flag: app.auto_flag,
            balance: app.auto_flag?.includes('past_balance') ? parseFloat((app.flag_reason || '').match(/\$([\d.]+)/)?.[1] || 0) : null,
          }),
        }).catch(err => console.error('send-application-email error:', err));
      }

      fetchApplications();
      fetchClients();
    } catch (err) {
      console.error('updateStatus error:', err);
      alert('Something went wrong: ' + err.message);
    } finally {
      setAcceptingId(null);
    }
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

    await supabase.from('applications').update({ status: 'accepted' }).eq('id', app.id);

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

  const flagInfo = (flag, flagReason) => {
    if (flag === 'sex_offender') return { icon: '🚫', color: '#f87171', label: 'Auto-denied: Registered sex offender' };
    if (flag === 'not_allowed_back') return { icon: '🚫', color: '#f87171', label: 'Auto-denied: Client is flagged as not allowed back' };
    if (flag === 'disability_review') return { icon: '♿', color: '#fb923c', label: 'Needs review: Disability indicated' };
    if (flag === 'past_balance') { const match = (flagReason || '').match(/\$([\d.]+)/); const amt = match ? ` of $${parseFloat(match[1]).toFixed(2)}` : ''; return { icon: '💰', color: '#fb923c', label: `Needs review: Returning client with outstanding balance${amt}` }; }
    if (flag === 'returning_merge') return { icon: '🔄', color: '#60a5fa', label: 'Returning client — merge with existing profile' };
    if (flag === 'needs_review_before_readmit') return { icon: '⚠️', color: '#fb923c', label: 'Needs review by upper management before re-admitting' };
    return { icon: '⚠', color: '#fb923c', label: flag };
  };

  const getFlags = (auto_flag, flagReason) => {
    if (!auto_flag) return [];
    return auto_flag.split(',').map(f => flagInfo(f.trim(), flagReason));
  };

  const renderCard = (app, duplicate, isReview) => {
    const flags = getFlags(app.auto_flag, app.flag_reason);
    return (
      <div key={app.id} style={{ ...s.card, ...(isReview ? { borderColor: '#fb923c44', borderWidth: '1px', borderStyle: 'solid' } : {}) }}>
        <div style={s.cardHeader}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={s.name}>{fmt(app.first_name)} {fmt(app.last_name)}</span>
              {duplicate && app.status === 'pending' && (
                <span style={s.dupBadge}>
                  ⚠ Possible Duplicate
                </span>
              )}
            </div>
            <p style={s.meta}>{fmt(app.email)} · {fmt(app.phone)}</p>
            <p style={s.meta}>Applied: {app.created_at ? new Date(app.created_at).toLocaleDateString() : '—'}</p>
            {flags.length > 0 && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {flags.map((f, i) => (
                  <div key={i} style={{ padding: '8px 12px', background: '#1c1c24', borderRadius: '8px', borderLeft: `3px solid ${f.color}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>{f.icon}</span>
                    <span style={{ fontSize: '14px', color: f.color, fontWeight: '500' }}>{f.label}</span>
                  </div>
                ))}
              </div>
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
            ...(app.on_disability === 'Yes' ? [
              ['Difficulty Concentrating/Memory?', app.disability_concentrating],
              ['Difficulty Walking/Stairs?', app.disability_walking],
              ['Difficulty Dressing/Bathing?', app.disability_dressing],
              ['Able to Work?', app.able_to_work],
            ] : []),
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
            {(app.auto_flag?.includes('returning_merge') || app.auto_flag?.includes('past_balance')) && app.status === 'pending' && (
            <button style={{ padding: '7px 14px', background: '#1e3a5f', border: '1px solid #3b82f6', borderRadius: '8px', color: '#60a5fa', fontSize: '14px', cursor: 'pointer', fontWeight: '500' }}
              onClick={async () => {
                const { data: existing } = await supabase.from('clients')
                  .select('*')
                  .or(`email.eq.${app.email},full_name.eq.${(app.first_name + ' ' + app.last_name).trim()}`)
                  .limit(1).maybeSingle();
                setMergeReturningModal({ app, existingClient: existing || { id: null, full_name: 'unknown', email: '' } });
                setMergeWizardOpen(false);
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
            <button style={{ padding: '7px 14px', background: 'transparent', border: '1px solid #7f1d1d', borderRadius: '8px', color: '#f87171', fontSize: '14px', cursor: 'pointer', fontWeight: '500' }}
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
                  <span style={{ background: '#3a2d1e', color: '#fb923c', fontSize: '13px', padding: '2px 8px', borderRadius: '20px', fontWeight: '600' }}>{flagged.length}</span>
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
                <button style={s.mergeBtn} onClick={async () => {
                  // Fetch full client data then open wizard
                  const { data: fullClient } = await supabase.from('clients').select('*').eq('id', duplicateModal.client.id).single();
                  setMergeReturningModal({ app: duplicateModal.app, existingClient: fullClient || duplicateModal.client });
                  setDuplicateModal(null);
                }}>
                  🧙 Open Merge Wizard
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
      {mergeReturningModal && !mergeWizardOpen && (
        <div style={s.modalOverlay} onClick={() => setMergeReturningModal(null)}>
          <div style={{ ...s.modalBox, maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', margin: '0 0 8px 0', fontSize: '16px' }}>Merge with Existing Profile</h3>
            <p style={{ color: '#999', fontSize: '14px', margin: '0 0 20px 0' }}>
              Choose how to handle the merge — quick auto-merge or review each field with the wizard.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div style={{ background: '#1e3a2f', border: '1px solid #2a5a3a', borderRadius: '10px', padding: '14px' }}>
                <p style={{ color: '#4ade80', fontWeight: '600', fontSize: '14px', margin: '0 0 4px' }}>Existing Client</p>
                <p style={{ color: '#fff', fontWeight: '700', fontSize: '15px', margin: '0 0 6px' }}>{mergeReturningModal.existingClient?.full_name}</p>
                <p style={{ color: '#888', fontSize: '13px', margin: '0 0 2px' }}>{mergeReturningModal.existingClient?.email}</p>
                <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>Status: {mergeReturningModal.existingClient?.status}</p>
              </div>
              <div style={{ background: '#1e2d3a', border: '1px solid #2a4a5a', borderRadius: '10px', padding: '14px' }}>
                <p style={{ color: '#60a5fa', fontWeight: '600', fontSize: '14px', margin: '0 0 4px' }}>New Application</p>
                <p style={{ color: '#fff', fontWeight: '700', fontSize: '15px', margin: '0 0 6px' }}>{mergeReturningModal.app.first_name} {mergeReturningModal.app.last_name}</p>
                <p style={{ color: '#888', fontSize: '13px', margin: '0 0 2px' }}>{mergeReturningModal.app.email}</p>
                <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>Applied: {mergeReturningModal.app.created_at ? new Date(mergeReturningModal.app.created_at).toLocaleDateString() : '—'}</p>
              </div>
            </div>
            <div style={{ background: '#1c1c24', borderRadius: '8px', padding: '12px 14px', marginBottom: '20px' }}>
              <p style={{ color: '#aaa', fontSize: '14px', margin: 0 }}>
                ℹ️ The existing client's ID and history (payments, timeline, UAs, stays) will be fully preserved. Only profile fields will be updated.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleMergeReturning} disabled={merging}
                style={{ flex: 1, background: '#16a34a', border: 'none', color: '#fff', padding: '10px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
                {merging ? 'Merging...' : '⚡ Quick Merge'}
              </button>
              <button onClick={() => setMergeWizardOpen(true)}
                style={{ flex: 1, background: '#1e2d3a', border: '1px solid #2a4a5a', color: '#60a5fa', padding: '10px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
                🧙 Merge Wizard
              </button>
              <button onClick={() => setMergeReturningModal(null)}
                style={{ background: 'transparent', border: '1px solid #3a3a48', color: '#aaa', padding: '10px 16px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Wizard */}
      {mergeReturningModal && mergeWizardOpen && (
        <MergeWizard
          app={mergeReturningModal.app}
          existingClient={mergeReturningModal.existingClient}
          onClose={() => { setMergeReturningModal(null); setMergeWizardOpen(false); }}
          onMerge={async (mergedFields) => {
            setMerging(true);
            // Convert empty strings to null to avoid Postgres type errors (e.g. date fields)
            const sanitized = Object.fromEntries(
              Object.entries(mergedFields).map(([k, v]) => [k, v === '' ? null : v])
            );
            const { error } = await supabase.from('clients').update({
              ...sanitized,
              application_id: mergeReturningModal.app.id,
              status: 'Accepted',
            }).eq('id', mergeReturningModal.existingClient.id);
            if (error) { alert('Error merging: ' + error.message); setMerging(false); return; }
            await supabase.from('applications').update({ status: 'accepted' }).eq('id', mergeReturningModal.app.id);
            setMergeReturningModal(null);
            setMergeWizardOpen(false);
            fetchApplications();
            fetchClients();
            setMerging(false);
          }}
        />
      )}
    </div>
  );
}

const s = {
  page: {
    padding: '32px',
    backgroundColor: '#1c1c24',
    minHeight: '100vh',
    color: '#fff',
    fontFamily: "'Inter', 'system-ui', sans-serif",
  },
  title: { fontSize: '24px', fontWeight: '600', margin: '0 0 24px 0' },
  toolbar: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' },
  sub: { color: '#999', fontSize: '14px', margin: 0 },
  search: {
    width: '100%',
    maxWidth: '360px',
    backgroundColor: '#1c1c24',
    border: '1px solid #3a3a48',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#fff',
    fontSize: '14px',
  },
  tabs: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  tab: {
    padding: '8px 18px',
    borderRadius: '20px',
    border: '1px solid #3a3a48',
    background: 'transparent',
    color: '#bbb',
    cursor: 'pointer',
    fontSize: '14px',
  },
  tabActive: { background: '#b22222', color: '#fff', borderColor: '#b22222' },
  empty: { color: '#999', fontSize: '14px' },
  list: { display: 'flex', flexDirection: 'column', gap: '16px' },
  card: {
    background: '#26262e',
    borderRadius: '12px',
    padding: '20px',
    border: '1px solid #32323e',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
  },
  name: { fontSize: '18px', fontWeight: '600', color: '#fff' },
  meta: { fontSize: '14px', color: '#bbb', margin: '2px 0 0 0' },
  badge: {
    fontSize: '13px',
    padding: '4px 12px',
    borderRadius: '20px',
    color: '#fff',
    fontWeight: '500',
    flexShrink: 0,
  },
  dupBadge: {
    fontSize: '12px',
    padding: '3px 10px',
    borderRadius: '20px',
    background: '#78350f',
    color: '#fbbf24',
    border: '1px solid #92400e',
    cursor: 'pointer',
    fontFamily: "'Inter', 'system-ui', sans-serif",
  },
  snapshot: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px',
    background: '#26262e',
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
  snapshotVal: { fontSize: '14px', color: '#fff' },
  cardActions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  viewBtn: {
    padding: '7px 14px',
    borderRadius: '8px',
    border: '1px solid #3a3a48',
    background: 'transparent',
    color: '#aaa',
    cursor: 'pointer',
    fontSize: '14px',
    fontFamily: "'Inter', 'system-ui', sans-serif",
  },
  acceptBtn: {
    padding: '7px 14px',
    borderRadius: '8px',
    border: 'none',
    background: '#16a34a',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontFamily: "'Inter', 'system-ui', sans-serif",
  },
  denyBtn: {
    padding: '7px 14px',
    borderRadius: '8px',
    border: 'none',
    background: '#dc2626',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontFamily: "'Inter', 'system-ui', sans-serif",
  },
  fullApp: { marginTop: '16px', borderTop: '1px solid #32323e', paddingTop: '16px' },
  sectionDivider: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    margin: '16px 0 10px 0',
    paddingBottom: '6px',
    borderBottom: '1px solid #32323e',
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
  fullVal: { fontSize: '14px', color: '#ddd', lineHeight: '1.4' },
  subCard: {
    background: '#1c1c24',
    borderRadius: '8px',
    padding: '12px 14px',
    border: '1px solid #32323e',
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
    background: '#26262e',
    borderRadius: '16px',
    padding: '28px',
    maxWidth: '700px',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    border: '1px solid #3a3a48',
  },
  modalHeader: { marginBottom: '20px' },
  modalTitle: { fontSize: '18px', fontWeight: '600', margin: '0 0 6px 0', color: '#fff' },
  modalSub: { fontSize: '14px', color: '#bbb', margin: 0 },
  compareGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '24px',
  },
  compareCol: { background: '#1c1c24', borderRadius: '10px', padding: '14px' },
  compareColHeader: {
    fontSize: '12px',
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
  compareVal: { fontSize: '14px', color: '#fff' },
  modalActions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  mergeBtn: {
    padding: '10px 18px',
    borderRadius: '8px',
    border: 'none',
    background: '#b22222',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    fontFamily: "'Inter', 'system-ui', sans-serif",
  },
  ignoreBtn: {
    padding: '10px 18px',
    borderRadius: '8px',
    border: '1px solid #3a3a48',
    background: 'transparent',
    color: '#aaa',
    cursor: 'pointer',
    fontSize: '14px',
    fontFamily: "'Inter', 'system-ui', sans-serif",
  },
  cancelBtn: {
    padding: '10px 18px',
    borderRadius: '8px',
    border: '1px solid #3a3a48',
    background: 'transparent',
    color: '#999',
    cursor: 'pointer',
    fontSize: '14px',
    fontFamily: "'Inter', 'system-ui', sans-serif",
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
    border: '1px solid #3a3a48',
    background: 'transparent',
    color: '#aaa',
    fontSize: '14px',
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
  ellipsis: { color: '#bbb', fontSize: '14px', padding: '0 4px' },
  pageNumbers: { display: 'flex', alignItems: 'center', gap: '6px' },
};

// ── Merge Wizard ──────────────────────────────────────────────────────────────
function MergeWizard({ app, existingClient, onClose, onMerge }) {
  const FIELDS = [
    { key: 'first_name', label: 'First Name', appKey: 'first_name' },
    { key: 'last_name', label: 'Last Name', appKey: 'last_name' },
    { key: 'date_of_birth', label: 'Date of Birth', appKey: 'date_of_birth' },
    { key: 'email', label: 'Email', appKey: 'email' },
    { key: 'phone', label: 'Phone', appKey: 'phone' },
    { key: 'gender', label: 'Gender', appKey: 'assigned_sex' },
    { key: 'ethnicity', label: 'Ethnicity', appKey: 'ethnicity' },
    { key: 'marital_status', label: 'Marital Status', appKey: 'marital_status' },
    { key: 'emergency_contact_name', label: 'Emergency Contact', appKey: 'emergency_contact' },
    { key: 'po_name', label: 'PO Name', appKey: 'po_name' },
    { key: 'po_phone', label: 'PO Phone', appKey: 'po_phone' },
    { key: 'po_email', label: 'PO Email', appKey: 'po_email' },
    { key: 'substance_history', label: 'Substance History', appKey: 'substance_history' },
    { key: 'drug_of_choice', label: 'Drug of Choice', appKey: 'drug_of_choice' },
    { key: 'sober_date', label: 'Sober Date', appKey: 'sober_date' },
    { key: 'treatment_history', label: 'Treatment History', appKey: 'treatment_history' },
    { key: 'on_probation', label: 'On Probation', appKey: 'on_probation' },
    { key: 'on_parole', label: 'On Parole', appKey: 'on_parole' },
    { key: 'sex_offender', label: 'Sex Offender', appKey: 'sex_offender' },
  ];

  // Initialize merged values — prefer existing client, fill gaps with app
  const init = {};
  FIELDS.forEach(f => {
    const clientVal = existingClient[f.key];
    const appVal = app[f.appKey];
    init[f.key] = clientVal || appVal || '';
  });

  const [merged, setMerged] = useState(init);
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState(false);

  const getAppVal = (f) => app[f.appKey] ?? '';
  const getClientVal = (f) => existingClient[f.key] ?? '';
  const fmt = (v) => v === null || v === undefined || v === '' ? '—' : String(v);

  const handleMerge = async () => {
    setSaving(true);
    await onMerge(merged);
    setSaving(false);
  };

  const ws = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 3000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px', overflowY: 'auto' },
    box: { background: '#1c1c24', borderRadius: '16px', border: '1px solid #32323e', width: '100%', maxWidth: '820px', marginTop: '20px', marginBottom: '40px', overflow: 'hidden' },
    header: { padding: '20px 24px', borderBottom: '1px solid #2a2a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    colHeader: { padding: '10px 14px', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center' },
    row: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid #1e1e1e' },
    cell: { padding: '10px 14px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' },
    label: { padding: '6px 14px 2px', fontSize: '10px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.7px', gridColumn: 'span 3', background: '#141414' },
    arrow: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px 6px', borderRadius: '4px', color: '#60a5fa' },
    input: { background: '#1e1e24', border: '1px solid #32323e', borderRadius: '6px', color: '#fff', padding: '5px 8px', fontSize: '14px', width: '100%', boxSizing: 'border-box' },
  };

  return (
    <div style={ws.overlay} onClick={onClose}>
      <div style={ws.box} onClick={e => e.stopPropagation()}>
        <div style={ws.header}>
          <div>
            <p style={{ color: '#fff', fontWeight: '700', fontSize: '16px', margin: 0 }}>Merge Wizard</p>
            <p style={{ color: '#888', fontSize: '13px', margin: '3px 0 0' }}>
              Choose which value to keep for each field. The existing client's history is always preserved.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer' }}>×</button>
        </div>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: '#141414', borderBottom: '1px solid #2a2a2a' }}>
          <div style={{ ...ws.colHeader, color: '#4ade80' }}>← Existing Client</div>
          <div style={{ ...ws.colHeader, color: '#aaa' }}>Will Be Saved</div>
          <div style={{ ...ws.colHeader, color: '#60a5fa' }}>New Application →</div>
        </div>

        {/* Client summary row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: '#1a2a1a', borderBottom: '1px solid #2a2a2a' }}>
          <div style={{ ...ws.cell, flexDirection: 'column', alignItems: 'flex-start' }}>
            <p style={{ color: '#4ade80', fontWeight: '600', fontSize: '14px', margin: 0 }}>{existingClient.full_name}</p>
            <p style={{ color: '#888', fontSize: '12px', margin: 0 }}>Status: {existingClient.status}</p>
          </div>
          <div style={{ ...ws.cell, justifyContent: 'center' }}>
            <span style={{ color: '#666', fontSize: '13px' }}>Merged result will update existing</span>
          </div>
          <div style={{ ...ws.cell, flexDirection: 'column', alignItems: 'flex-end' }}>
            <p style={{ color: '#60a5fa', fontWeight: '600', fontSize: '14px', margin: 0 }}>{app.first_name} {app.last_name}</p>
            <p style={{ color: '#888', fontSize: '12px', margin: 0 }}>Applied: {app.created_at ? new Date(app.created_at).toLocaleDateString() : '—'}</p>
          </div>
        </div>

        {/* Fields */}
        <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {FIELDS.map(f => {
            const clientVal = getClientVal(f);
            const appVal = getAppVal(f);
            const isEditing = editing[f.key];
            const same = fmt(clientVal) === fmt(appVal);

            return (
              <div key={f.key}>
                <div style={{ ...ws.row, background: '#1e1e24' }}>
                  <div style={{ ...ws.cell, fontSize: '10px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.7px', gridColumn: 'span 3', padding: '5px 14px 2px', background: '#141414' }}>
                    {f.label}
                  </div>
                </div>
                <div style={{ ...ws.row, background: same ? '#141414' : '#1a1a1a' }}>
                  {/* Existing client value */}
                  <div style={{ ...ws.cell, background: merged[f.key] === clientVal && !isEditing && clientVal ? '#1e3a2f' : 'transparent' }}>
                    <button onClick={() => { setMerged(p => ({ ...p, [f.key]: clientVal })); setEditing(p => ({ ...p, [f.key]: false })); }}
                      style={{ ...ws.arrow, color: '#4ade80' }} title="Use this value">→</button>
                    <span style={{ color: clientVal ? '#ddd' : '#444' }}>{fmt(clientVal)}</span>
                  </div>

                  {/* Merged value (center) */}
                  <div style={{ ...ws.cell, background: '#1c1c24', justifyContent: 'center', flexDirection: 'column', gap: '4px' }}>
                    {isEditing ? (
                      <input value={merged[f.key]} onChange={e => setMerged(p => ({ ...p, [f.key]: e.target.value }))}
                        style={ws.input} autoFocus onBlur={() => setEditing(p => ({ ...p, [f.key]: false }))} />
                    ) : (
                      <span style={{ color: '#fff', fontWeight: '500', fontSize: '14px', textAlign: 'center' }}>
                        {fmt(merged[f.key])}
                      </span>
                    )}
                    <button onClick={() => setEditing(p => ({ ...p, [f.key]: true }))}
                      style={{ background: 'transparent', border: 'none', color: '#555', fontSize: '12px', cursor: 'pointer', padding: '0' }}>
                      ✏️ edit
                    </button>
                  </div>

                  {/* App value */}
                  <div style={{ ...ws.cell, justifyContent: 'flex-end', background: merged[f.key] === appVal && !isEditing && appVal ? '#1e2d3a' : 'transparent' }}>
                    <span style={{ color: appVal ? '#ddd' : '#444' }}>{fmt(appVal)}</span>
                    <button onClick={() => { setMerged(p => ({ ...p, [f.key]: appVal })); setEditing(p => ({ ...p, [f.key]: false })); }}
                      style={{ ...ws.arrow, color: '#60a5fa' }} title="Use this value">←</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #2a2a2a', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: '#141414' }}>
          <button onClick={onClose}
            style={{ background: 'transparent', border: '1px solid #3a3a48', color: '#aaa', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleMerge} disabled={saving}
            style={{ background: '#16a34a', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Merging...' : '✓ Confirm Merge'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Admissions;