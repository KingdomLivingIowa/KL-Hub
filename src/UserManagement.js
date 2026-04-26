import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'upper_management', label: 'Upper Management' },
  { value: 'head_house_manager', label: 'Head House Manager' },
  { value: 'house_manager', label: 'House Manager' },
];

const ROLE_COLORS = {
  admin: { bg: '#3a1e1e', color: '#f87171' },
  upper_management: { bg: '#3a1e1e', color: '#f87171' },
  head_house_manager: { bg: '#2d1e3a', color: '#c084fc' },
  house_manager: { bg: '#1e3a2f', color: '#4ade80' },
};

const PRESET_GROUP_NAMES = ["Management", "Men's Move In/Out", "Women's Move In/Out"];

function UserManagement({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [houses, setHouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showHouseModal, setShowHouseModal] = useState(null);
  const [houseAssignments, setHouseAssignments] = useState({});
  const [saving, setSaving] = useState(false);
  const [resetModal, setResetModal] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetting, setResetting] = useState(false);
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', role: 'house_manager',
  });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Group chat state
  const [presetGroups, setPresetGroups] = useState([]); // [{id, name}]
  const [groupMemberships, setGroupMemberships] = useState({}); // { userId: [convId, ...] }
  const [togglingGroup, setTogglingGroup] = useState({}); // { userId-convId: true }

  useEffect(() => {
    fetchUsers();
    fetchHouses();
    fetchPresetGroups();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPresetGroups = async () => {
    const { data } = await supabase
      .from('conversations')
      .select('id, name')
      .eq('type', 'group')
      .in('name', PRESET_GROUP_NAMES);
    setPresetGroups(data || []);
  };

  const fetchGroupMemberships = async (userIds) => {
    if (!userIds.length) return;
    const presetIds = presetGroups.map(g => g.id);
    if (!presetIds.length) return;

    const { data } = await supabase
      .from('conversation_members')
      .select('user_id, conversation_id')
      .in('user_id', userIds)
      .in('conversation_id', presetIds);

    const map = {};
    userIds.forEach(id => { map[id] = []; });
    (data || []).forEach(m => {
      if (!map[m.user_id]) map[m.user_id] = [];
      map[m.user_id].push(m.conversation_id);
    });
    setGroupMemberships(map);
  };

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (profiles) {
      const { data: assignments } = await supabase
        .from('user_house_assignments')
        .select('*, houses(name)');

      const assignmentMap = {};
      (assignments || []).forEach(a => {
        if (!assignmentMap[a.user_id]) assignmentMap[a.user_id] = [];
        assignmentMap[a.user_id].push({ id: a.house_id, name: a.houses?.name, assignmentId: a.id });
      });

      setHouseAssignments(assignmentMap);
      setUsers(profiles);

      // Fetch group memberships after users load
      const userIds = profiles.map(p => p.id);
      await fetchGroupMemberships(userIds);
    }
    setLoading(false);
  };

  const fetchHouses = async () => {
    const { data } = await supabase.from('houses').select('id, name, type').order('name');
    setHouses(data || []);
  };

  const toggleGroupMembership = async (userId, groupId, isMember) => {
    const key = `${userId}-${groupId}`;
    setTogglingGroup(prev => ({ ...prev, [key]: true }));

    if (isMember) {
      // Remove from group
      await supabase.from('conversation_members')
        .delete()
        .eq('user_id', userId)
        .eq('conversation_id', groupId);

      setGroupMemberships(prev => ({
        ...prev,
        [userId]: (prev[userId] || []).filter(id => id !== groupId),
      }));
    } else {
      // Add to group
      await supabase.from('conversation_members').upsert({
        user_id: userId,
        conversation_id: groupId,
        last_read_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id,user_id' });

      setGroupMemberships(prev => ({
        ...prev,
        [userId]: [...(prev[userId] || []), groupId],
      }));
    }

    setTogglingGroup(prev => ({ ...prev, [key]: false }));
  };

  const createUser = async () => {
    setFormError('');
    setFormSuccess('');
    if (!form.full_name || !form.email || !form.password || !form.role) {
      setFormError('All fields are required.'); return;
    }
    if (form.password.length < 8) {
      setFormError('Password must be at least 8 characters.'); return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password, full_name: form.full_name, role: form.role }),
      });
      const result = await response.json();
      if (!response.ok) { setFormError(result.error || 'Failed to create user.'); setSaving(false); return; }
      setFormSuccess(`${form.full_name} has been added successfully!`);
      setForm({ full_name: '', email: '', password: '', role: 'house_manager' });
      setShowAddUser(false);
      fetchUsers();
    } catch {
      setFormError('Network error. Please try again.');
    }
    setSaving(false);
  };

  const updateRole = async (userId, newRole) => {
    await supabase.from('user_profiles').update({ role: newRole }).eq('id', userId);
    fetchUsers();
  };

  const removeUser = async (userId) => {
    if (!window.confirm('Remove this user? They will no longer be able to log in.')) return;
    await supabase.from('user_profiles').delete().eq('id', userId);
    fetchUsers();
  };

  const assignHouse = async (userId, houseId) => {
    await supabase.from('user_house_assignments').insert([{ user_id: userId, house_id: houseId }]);
    fetchUsers();
  };

  const removeHouseAssignment = async (assignmentId) => {
    await supabase.from('user_house_assignments').delete().eq('id', assignmentId);
    fetchUsers();
  };

  const resetPassword = async () => {
    setResetError(''); setResetSuccess('');
    if (newPassword.length < 8) { setResetError('Password must be at least 8 characters.'); return; }
    setResetting(true);
    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: resetModal.id, newPassword }),
      });
      const result = await response.json();
      if (!response.ok) {
        setResetError(result.error || 'Failed to reset password.');
      } else {
        setResetSuccess('Password updated successfully!');
        setNewPassword('');
        setTimeout(() => { setResetModal(null); setResetSuccess(''); }, 2000);
      }
    } catch {
      setResetError('Network error. Please try again.');
    }
    setResetting(false);
  };

  const roleLabel = (role) => ROLES.find(r => r.value === role)?.label || role;
  const roleColor = (role) => ROLE_COLORS[role] || { bg: '#2a2a2a', color: '#aaa' };
  const needsHouseAssignment = (role) => role === 'house_manager' || role === 'head_house_manager';

  return (
    <div style={s.page}>
      <div style={s.topBar}>
        <div>
          <h2 style={s.title}>User Management</h2>
          <p style={s.sub}>{users.length} staff members</p>
        </div>
        <button onClick={() => { setShowAddUser(!showAddUser); setFormError(''); setFormSuccess(''); }} style={s.addBtn}>
          {showAddUser ? 'Cancel' : '+ Add Staff Member'}
        </button>
      </div>

      {formSuccess && <div style={s.successBanner}>{formSuccess}</div>}

      {/* Add User Form */}
      {showAddUser && (
        <div style={s.addForm}>
          <p style={s.formTitle}>New Staff Member</p>
          <div style={s.formGrid}>
            <div>
              <label style={s.label}>Full Name *</label>
              <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} style={s.input} placeholder="First and last name" />
            </div>
            <div>
              <label style={s.label}>Email *</label>
              <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} style={s.input} placeholder="staff@example.com" type="email" />
            </div>
            <div>
              <label style={s.label}>Temporary Password *</label>
              <input value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} style={s.input} placeholder="Min 8 characters" type="password" />
            </div>
            <div>
              <label style={s.label}>Role *</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} style={s.input}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
          {formError && <p style={s.errorText}>{formError}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '4px' }}>
            <button onClick={createUser} disabled={saving} style={s.saveBtn}>
              {saving ? 'Creating...' : 'Create Account'}
            </button>
            <p style={s.hint}>The staff member will use this email and password to log in to KL Hub.</p>
          </div>
        </div>
      )}

      {/* Users Table */}
      {loading ? (
        <p style={{ color: '#888' }}>Loading...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {users.map(u => {
            const col = roleColor(u.role);
            const assignments = houseAssignments[u.id] || [];
            const isCurrentUser = u.id === currentUser?.id;
            const userGroupIds = groupMemberships[u.id] || [];

            return (
              <div key={u.id} style={s.userCard}>
                {/* Top row: name, email, role, actions */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Name + email */}
                  <div style={{ flex: 2, minWidth: '160px' }}>
                    <p style={{ color: '#fff', fontSize: '14px', fontWeight: '600', margin: 0 }}>{u.full_name}</p>
                    <p style={{ color: '#666', fontSize: '12px', margin: '2px 0 0 0' }}>{u.email}</p>
                    {isCurrentUser && <span style={{ fontSize: '10px', color: '#b22222' }}>You</span>}
                  </div>

                  {/* Role */}
                  <div style={{ flex: 1, minWidth: '140px' }}>
                    <p style={s.fieldLabel}>Role</p>
                    {isCurrentUser ? (
                      <span style={{ ...s.roleBadge, background: col.bg, color: col.color }}>{roleLabel(u.role)}</span>
                    ) : (
                      <select value={u.role} onChange={e => updateRole(u.id, e.target.value)}
                        style={{ ...s.roleSelect, background: col.bg, color: col.color, borderColor: col.color + '44' }}>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    )}
                  </div>

                  {/* House assignments */}
                  <div style={{ flex: 2, minWidth: '160px' }}>
                    <p style={s.fieldLabel}>House Assignments</p>
                    {needsHouseAssignment(u.role) ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                        {assignments.map(a => (
                          <span key={a.assignmentId} style={s.houseTag}>
                            {a.name}
                            {!isCurrentUser && (
                              <button onClick={() => removeHouseAssignment(a.assignmentId)} style={s.removeHouseBtn}>×</button>
                            )}
                          </span>
                        ))}
                        {!isCurrentUser && (
                          <button onClick={() => setShowHouseModal(u)} style={s.assignHouseBtn}>+ Assign</button>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#555', fontSize: '12px' }}>All houses</span>
                    )}
                  </div>

                  {/* Actions */}
                  {!isCurrentUser && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                      <button onClick={() => { setResetModal(u); setNewPassword(''); setResetError(''); setResetSuccess(''); }} style={s.resetBtn}>
                        Reset PW
                      </button>
                      <button onClick={() => removeUser(u.id)} style={s.removeBtn}>Remove</button>
                    </div>
                  )}
                </div>

                {/* Group chat memberships */}
                {!isCurrentUser && presetGroups.length > 0 && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #333' }}>
                    <p style={s.fieldLabel}>Group Chat Memberships</p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {presetGroups.map(group => {
                        const isMember = userGroupIds.includes(group.id);
                        const key = `${u.id}-${group.id}`;
                        const isToggling = togglingGroup[key];
                        return (
                          <button
                            key={group.id}
                            onClick={() => toggleGroupMembership(u.id, group.id, isMember)}
                            disabled={isToggling}
                            style={{
                              padding: '4px 12px',
                              borderRadius: '20px',
                              fontSize: '12px',
                              cursor: 'pointer',
                              fontWeight: '500',
                              border: isMember ? 'none' : '1px dashed #444',
                              background: isMember ? '#1e2d3a' : 'transparent',
                              color: isMember ? '#60a5fa' : '#555',
                              opacity: isToggling ? 0.5 : 1,
                              transition: 'all 0.15s',
                            }}>
                            {isMember ? '✓ ' : '+ '}{group.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* House Assignment Modal */}
      {showHouseModal && (
        <div style={s.overlay} onClick={() => setShowHouseModal(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', margin: '0 0 6px 0', fontSize: '16px' }}>Assign House to {showHouseModal.full_name}</h3>
            <p style={{ color: '#666', fontSize: '13px', margin: '0 0 16px 0' }}>Select a house to assign. You can assign multiple houses.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {houses.map(h => {
                const alreadyAssigned = (houseAssignments[showHouseModal.id] || []).some(a => a.id === h.id);
                return (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#2a2a2a', borderRadius: '8px', border: '1px solid #333' }}>
                    <div>
                      <p style={{ color: '#fff', fontSize: '14px', margin: 0 }}>{h.name}</p>
                      <p style={{ color: '#666', fontSize: '12px', margin: '2px 0 0 0' }}>{h.type}</p>
                    </div>
                    {alreadyAssigned ? (
                      <span style={{ fontSize: '12px', color: '#4ade80' }}>✓ Assigned</span>
                    ) : (
                      <button onClick={() => assignHouse(showHouseModal.id, h.id)}
                        style={{ background: '#b22222', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        Assign
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={() => setShowHouseModal(null)}
                style={{ background: 'transparent', border: '1px solid #444', color: '#aaa', padding: '8px 18px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetModal && (
        <div style={s.overlay} onClick={() => setResetModal(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', margin: '0 0 6px 0', fontSize: '16px' }}>Reset Password</h3>
            <p style={{ color: '#666', fontSize: '13px', margin: '0 0 16px 0' }}>
              Set a new temporary password for <strong style={{ color: '#ddd' }}>{resetModal.full_name}</strong>.
            </p>
            <label style={s.label}>New Password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') resetPassword(); }}
              placeholder="Min 8 characters" style={{ ...s.input, marginBottom: '12px' }} />
            {resetError && <p style={{ color: '#f87171', fontSize: '13px', margin: '0 0 12px 0' }}>{resetError}</p>}
            {resetSuccess && <p style={{ color: '#4ade80', fontSize: '13px', margin: '0 0 12px 0' }}>{resetSuccess}</p>}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setResetModal(null)}
                style={{ background: 'transparent', border: '1px solid #444', color: '#aaa', padding: '8px 18px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={resetPassword} disabled={resetting}
                style={{ background: '#ca8a04', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' }}>
                {resetting ? 'Saving...' : 'Set New Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  page: { fontFamily: 'sans-serif', color: '#fff' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: '700', margin: 0 },
  sub: { color: '#666', fontSize: '14px', margin: '4px 0 0 0' },
  addBtn: { backgroundColor: '#b22222', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '500' },
  addForm: { background: '#2a2a2a', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px', border: '1px solid #333' },
  formTitle: { color: '#fff', fontSize: '15px', fontWeight: '600', margin: '0 0 16px 0' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' },
  label: { display: 'block', color: '#aaa', fontSize: '13px', marginBottom: '4px' },
  fieldLabel: { color: '#555', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px 0' },
  input: { width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  saveBtn: { backgroundColor: '#16a34a', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' },
  hint: { color: '#555', fontSize: '12px', margin: 0, lineHeight: '1.5' },
  errorText: { color: '#f87171', fontSize: '13px', margin: '0 0 12px 0' },
  successBanner: { background: '#1e3a2f', border: '1px solid #1D9E75', color: '#4ade80', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', marginBottom: '20px' },
  userCard: { background: '#2a2a2a', borderRadius: '12px', padding: '16px 20px', border: '1px solid #333' },
  roleBadge: { fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '500' },
  roleSelect: { fontSize: '11px', padding: '3px 8px', borderRadius: '20px', fontWeight: '500', border: '1px solid', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', outline: 'none' },
  houseTag: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: '#1e2d3a', color: '#60a5fa' },
  removeHouseBtn: { background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '13px', padding: '0', lineHeight: 1 },
  assignHouseBtn: { fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: 'transparent', border: '1px dashed #444', color: '#666', cursor: 'pointer' },
  resetBtn: { backgroundColor: 'transparent', border: '1px solid #ca8a04', color: '#ca8a04', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' },
  removeBtn: { backgroundColor: 'transparent', border: '1px solid #dc2626', color: '#dc2626', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
  modal: { background: '#1a1a1a', borderRadius: '16px', padding: '24px', maxWidth: '500px', width: '100%', maxHeight: '80vh', overflowY: 'auto', border: '1px solid #333' },
};

export default UserManagement;