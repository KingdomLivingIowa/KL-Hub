import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';

const NOTIFICATION_TYPES = [
  {
    id: 'ua_overdue',
    label: 'UA Overdue',
    icon: '🧪',
    description: 'Weekly list of clients who have not had a UA in the past 30 days, grouped by house.',
  },
  {
    id: 'infractions',
    label: 'Infractions',
    icon: '⚠️',
    description: 'Weekly list of clients who received an infraction in the past 7 days.',
  },
  {
    id: 'maintenance_request',
    icon: '🔧',
    label: 'Maintenance Request',
    description: 'Sent when a house manager submits a new maintenance request.',
  },
  {
    id: 'house_report',
    icon: '📋',
    label: 'Weekly House Report',
    description: 'Sent every Friday with a full weekly summary per house — move-ins, discharges, infractions, UAs, balances, and house updates.',
  },
  {
    id: 'confirmed_move_in',
    icon: '🏠',
    label: 'Confirmed Move-In',
    description: 'Sent immediately when a house manager confirms a client move-in.',
  },
  {
    id: 'move_out_request',
    label: 'Move-Out Request',
    icon: '🚪',
    description: 'Sent immediately when a client submits a move-out request form.',
  },
  {
    id: 'overdue_balance',
    label: 'Overdue Balance',
    icon: '💰',
    description: 'Weekly list of clients in-house for 30+ days who still have an outstanding balance.',
  },
  {
    id: 'early_admissions',
    label: 'Early Admissions',
    icon: '⭐',
    description: 'Weekly list of clients who were admitted early in the past 7 days.',
  },
  {
    id: 'ride_needed',
    label: 'Ride to All-House Meeting',
    icon: '🚗',
    description: 'Weekly list of clients who have indicated they need a ride to the all-house meeting.',
  },
  {
    id: 'new_application',
    label: 'New Application',
    icon: '📝',
    description: 'Sent immediately when a new application is submitted through the public application form.',
  },
  {
    id: 'overnight_pass_request',
    label: 'Overnight Pass Request',
    icon: '🌙',
    description: 'Sent immediately when a resident submits an overnight pass request.',
  },
  {
    id: 'did_not_move_in',
    label: 'Did Not Move In',
    icon: '🚫',
    description: 'Sent immediately when a confirmed move-in is marked as Did Not Move In.',
  },
];

export default function EmailSettings() {
  const { isAdmin, isUpperManagement } = useUser();
  const [staffList, setStaffList] = useState([]);
  const [settings, setSettings] = useState({}); // { notif_type: [user_id, ...] }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [toast, setToast] = useState(null);

  const canEdit = isAdmin || isUpperManagement;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    const { data: staff } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, role')
      .in('role', ['admin', 'upper_management', 'head_house_manager', 'house_manager'])
      .order('full_name');

    const { data: existing } = await supabase
      .from('email_notification_settings')
      .select('*');

    const map = {};
    NOTIFICATION_TYPES.forEach(n => { map[n.id] = []; });
    (existing || []).forEach(row => {
      if (!map[row.notification_type]) map[row.notification_type] = [];
      map[row.notification_type].push(row.user_id);
    });

    setStaffList(staff || []);
    setSettings(map);
    setLoading(false);
  };

  const toggleStaff = async (notifType, userId) => {
    if (!canEdit) return;
    setSaving(notifType + userId);

    const current = settings[notifType] || [];
    const isAdding = !current.includes(userId);

    if (isAdding) {
      await supabase.from('email_notification_settings').insert({
        notification_type: notifType,
        user_id: userId,
      });
      setSettings(prev => ({ ...prev, [notifType]: [...(prev[notifType] || []), userId] }));
    } else {
      await supabase.from('email_notification_settings')
        .delete()
        .eq('notification_type', notifType)
        .eq('user_id', userId);
      setSettings(prev => ({ ...prev, [notifType]: (prev[notifType] || []).filter(id => id !== userId) }));
    }

    setSaving(null);
    showToast(isAdding ? 'Recipient added' : 'Recipient removed');
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const roleLabel = (role) => {
    if (!role) return '';
    return role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (loading) return (
    <div style={s.loadingWrap}>
      <div style={s.spinner} />
      <p style={{ color: '#888', marginTop: '12px' }}>Loading email settings...</p>
    </div>
  );

  return (
    <div style={s.page}>
      {toast && <div style={s.toast}>{toast}</div>}

      <div style={s.header}>
        <p style={s.subtitle}>
          Configure which staff members receive each automated email notification.
          {!canEdit && <span style={{ color: '#f87171', marginLeft: '8px' }}>View only — admin or upper management required to edit.</span>}
        </p>
      </div>

      <div style={s.grid}>
        {NOTIFICATION_TYPES.map(notif => {
          const assigned = settings[notif.id] || [];
          return (
            <div key={notif.id} style={s.card}>
              <div style={s.cardHeader}>
                <span style={s.icon}>{notif.icon}</span>
                <div>
                  <div style={s.notifLabel}>{notif.label}</div>
                  <div style={s.notifDesc}>{notif.description}</div>
                </div>
              </div>

              <div style={s.divider} />

              <div style={s.staffList}>
                {staffList.length === 0 && (
                  <p style={{ color: '#666', fontSize: '14px' }}>No staff found.</p>
                )}
                {staffList.map(staff => {
                  const isAssigned = assigned.includes(staff.id);
                  const isSaving = saving === notif.id + staff.id;
                  return (
                    <div key={staff.id} style={s.staffRow}>
                      <div style={s.staffInfo}>
                        <div style={s.staffAvatar}>
                          {(staff.full_name || staff.email || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={s.staffName}>{staff.full_name || staff.email}</div>
                          <div style={s.staffRole}>{roleLabel(staff.role)}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleStaff(notif.id, staff.id)}
                        disabled={!canEdit || isSaving}
                        style={{
                          ...s.toggle,
                          ...(isAssigned ? s.toggleOn : s.toggleOff),
                          opacity: (!canEdit || isSaving) ? 0.5 : 1,
                          cursor: canEdit ? 'pointer' : 'default',
                        }}
                      >
                        {isSaving ? '...' : isAssigned ? '✓ On' : 'Off'}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div style={s.cardFooter}>
                <span style={s.assignedCount}>
                  {assigned.length === 0
                    ? 'No recipients assigned'
                    : `${assigned.length} recipient${assigned.length !== 1 ? 's' : ''} assigned`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s = {
  page: {
    padding: '0 0 40px 0',
    maxWidth: '1100px',
  },
  loadingWrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: '300px',
  },
  spinner: {
    width: '32px', height: '32px',
    border: '3px solid #333', borderTop: '3px solid #b22222',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
  header: {
    marginBottom: '28px',
  },
  subtitle: {
    color: '#999', fontSize: '14px', margin: 0, lineHeight: '1.5',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '20px',
  },
  card: {
    background: '#1c1c24',
    border: '1px solid #2e2e3a',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  cardHeader: {
    display: 'flex', alignItems: 'flex-start', gap: '12px',
    padding: '18px 20px 14px',
  },
  icon: {
    fontSize: '24px', lineHeight: '1', marginTop: '2px', flexShrink: 0,
  },
  notifLabel: {
    color: '#fff', fontWeight: '600', fontSize: '15px', marginBottom: '4px',
  },
  notifDesc: {
    color: '#888', fontSize: '13px', lineHeight: '1.4',
  },
  divider: {
    height: '1px', background: '#26262e', margin: '0',
  },
  staffList: {
    padding: '10px 20px',
    display: 'flex', flexDirection: 'column', gap: '6px',
    minHeight: '60px',
  },
  staffRow: {
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', gap: '10px',
    padding: '6px 0',
  },
  staffInfo: {
    display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0,
  },
  staffAvatar: {
    width: '32px', height: '32px', borderRadius: '50%',
    background: '#26262e', border: '1px solid #32323e',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#ccc', fontSize: '14px', fontWeight: '600', flexShrink: 0,
  },
  staffName: {
    color: '#ddd', fontSize: '14px', fontWeight: '500',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  staffRole: {
    color: '#666', fontSize: '12px',
  },
  toggle: {
    padding: '4px 12px', borderRadius: '20px',
    fontSize: '13px', fontWeight: '600', border: 'none',
    minWidth: '52px', textAlign: 'center', transition: 'all 0.15s',
  },
  toggleOn: {
    background: '#14532d', color: '#4ade80',
    border: '1px solid #166534',
  },
  toggleOff: {
    background: '#26262e', color: '#666',
    border: '1px solid #32323e',
  },
  cardFooter: {
    padding: '10px 20px 14px',
    borderTop: '1px solid #2a2a2a',
  },
  assignedCount: {
    fontSize: '12px', color: '#555', fontStyle: 'italic',
  },
  toast: {
    position: 'fixed', bottom: '24px', right: '24px',
    background: '#14532d', color: '#4ade80',
    padding: '10px 18px', borderRadius: '8px',
    fontSize: '14px', fontWeight: '500',
    border: '1px solid #166534',
    zIndex: 9999, animation: 'fadeIn 0.2s ease',
  },
};