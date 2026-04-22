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
  upper_management: { bg: '#1e2d3a', color: '#60a5fa' },
  head_house_manager: { bg: '#2d1e3a', color: '#c084fc' },
  house_manager: { bg: '#1e3a2f', color: '#4ade80' },
};

function UserManagement({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [houses, setHouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showHouseModal, setShowHouseModal] = useState(null); // user object
  const [houseAssignments, setHouseAssignments] = useState({});
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'house_manager',
  });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  useEffect(() => {
    fetchUsers();
    fetchHouses();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (profiles) {
      // Fetch house assignments for all users
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
    }
    setLoading(false);
  };

  const fetchHouses = async () => {
    const { data } = await supabase.from('houses').select('id, name, type').order('name');
    setHouses(data || []);
  };

  const createUser = async () => {
    setFormError('');
    setFormSuccess('');

    if (!form.full_name || !form.email || !form.password || !form.role) {
      setFormError('All fields are required.');
      return;
    }
    if (form.password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }

    setSaving(true);

    try {
      const response = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          role: form.role,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setFormError(result.error || 'Failed to create user.');
        setSaving(false);
        return;
      }

      setFormSuccess(`${form.full_name} has been added successfully!`);
      setForm({ full_name: '', email: '', password: '', role: 'house_manager' });
      setShowAddUser(false);
      fetchUsers();
    } catch (err) {
      setFormError('Network error. Please try again.');
    }

    setSaving(false);
  };

  const updateRole = async (userId, newRole) => {
    await supabase
      .from('user_profiles')
      .update({ role: newRole })
      .eq('id', userId);
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

  const roleLabel = (role) => ROLES.find(r => r.value === role)?.label || role;
  const roleColor = (role) => ROLE_COLORS[role] || { bg: '#2a2a2a', color: '#aaa' };

  const needsHouseAssignment = (role) =>
    role === 'house_manager' || role === 'head_house_manager';

  return (
    <div style={s.page}>
      <div style={s.topBar}>
        <div>
          <h2 style={s.title}>User Management</h2>
          <p style={s.sub}>{users.length} staff members</p>
        </div>
        <button onClick={() => { setShowAddUser(!showAddUser); setFormError(''); setFormSuccess(''); }}
          style={s.addBtn}>
          {showAddUser ? 'Cancel' : '+ Add Staff Member'}
        </button>
      </div>

      {formSuccess && (
        <div style={s.successBanner}>{formSuccess}</div>
      )}

      {/* Add User Form */}
      {showAddUser && (
        <div style={s.addForm}>
          <p style={s.formTitle}>New Staff Member</p>
          <div style={s.formGrid}>
            <div>
              <label style={s.label}>Full Name *</label>
              <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                style={s.input} placeholder="First and last name" />
            </div>
            <div>
              <label style={s.label}>Email *</label>
              <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                style={s.input} placeholder="staff@example.com" type="email" />
            </div>
            <div>
              <label style={s.label}>Temporary Password *</label>
              <input value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                style={s.input} placeholder="Min 8 characters" type="password" />
            </div>
            <div>
              <label style={s.label}>Role *</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} style={s.input}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
          {formError && <p style={s.errorText}>{formError}</p>}
          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
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
        <div style={s.table}>
          <div style={s.tableHeader}>
            <span style={{ flex: 2 }}>Name</span>
            <span style={{ flex: 2 }}>Email</span>
            <span style={{ flex: 1.5 }}>Role</span>
            <span style={{ flex: 2 }}>House Assignments</span>
            <span style={{ flex: 1 }}>Actions</span>
          </div>
          {users.map(u => {
            const col = roleColor(u.role);
            const assignments = houseAssignments[u.id] || [];
            const isCurrentUser = u.id === currentUser?.id;
            return (
              <div key={u.id} style={s.tableRow}>
                <span style={{ flex: 2 }}>
                  <p style={{ color: '#fff', fontSize: '14px', fontWeight: '500', margin: 0 }}>{u.full_name}</p>
                  {isCurrentUser && <span style={{ fontSize: '10px', color: '#b22222' }}>You</span>}
                </span>
                <span style={{ flex: 2, color: '#aaa', fontSize: '13px' }}>{u.email}</span>
                <span style={{ flex: 1.5 }}>
                  {isCurrentUser ? (
                    <span style={{ ...s.roleBadge, background: col.bg, color: col.color }}>
                      {roleLabel(u.role)}
                    </span>
                  ) : (
                    <select
                      value={u.role}
                      onChange={e => updateRole(u.id, e.target.value)}
                      style={{ ...s.roleSelect, background: col.bg, color: col.color, borderColor: col.color + '44' }}
                    >
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  )}
                </span>
                <span style={{ flex: 2 }}>
                  {needsHouseAssignment(u.role) ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                      {assignments.map(a => (
                        <span key={a.assignmentId} style={s.houseTag}>
                          {a.name}
                          {!isCurrentUser && (
                            <button onClick={() => removeHouseAssignment(a.assignmentId)}
                              style={s.removeHouseBtn}>×</button>
                          )}
                        </span>
                      ))}
                      {!isCurrentUser && (
                        <button onClick={() => setShowHouseModal(u)} style={s.assignHouseBtn}>
                          + Assign House
                        </button>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: '#555', fontSize: '12px' }}>All houses</span>
                  )}
                </span>
                <span style={{ flex: 1 }}>
                  {!isCurrentUser && (
                    <button onClick={() => removeUser(u.id)} style={s.removeBtn}>Remove</button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* House Assignment Modal */}
      {showHouseModal && (
        <div style={s.overlay} onClick={() => setShowHouseModal(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', margin: '0 0 6px 0', fontSize: '16px' }}>
              Assign House to {showHouseModal.full_name}
            </h3>
            <p style={{ color: '#666', fontSize: '13px', margin: '0 0 16px 0' }}>
              Select a house to assign. You can assign multiple houses.
            </p>
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
                      <button onClick={() => { assignHouse(showHouseModal.id, h.id); fetchUsers(); }}
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
  input: { width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  saveBtn: { backgroundColor: '#16a34a', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '600' },
  hint: { color: '#555', fontSize: '12px', margin: '10px 0 0 0', lineHeight: '1.5' },
  errorText: { color: '#f87171', fontSize: '13px', margin: '0 0 12px 0' },
  successBanner: { background: '#1e3a2f', border: '1px solid #1D9E75', color: '#4ade80', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', marginBottom: '20px' },
  table: { background: '#2a2a2a', borderRadius: '12px', overflow: 'hidden', border: '1px solid #333' },
  tableHeader: { display: 'flex', padding: '12px 16px', borderBottom: '1px solid #333', fontSize: '11px', color: '#666', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', gap: '12px' },
  tableRow: { display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #222', gap: '12px' },
  roleBadge: { fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '500' },
  roleSelect: { fontSize: '11px', padding: '3px 8px', borderRadius: '20px', fontWeight: '500', border: '1px solid', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', outline: 'none' },
  houseTag: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: '#1e2d3a', color: '#60a5fa' },
  removeHouseBtn: { background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '13px', padding: '0', lineHeight: 1 },
  assignHouseBtn: { fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: 'transparent', border: '1px dashed #444', color: '#666', cursor: 'pointer' },
  removeBtn: { backgroundColor: 'transparent', border: '1px solid #dc2626', color: '#dc2626', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
  modal: { background: '#1a1a1a', borderRadius: '16px', padding: '24px', maxWidth: '500px', width: '100%', maxHeight: '80vh', overflowY: 'auto', border: '1px solid #333' },
};

export default UserManagement;