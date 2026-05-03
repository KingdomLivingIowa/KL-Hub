import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';

const LEVELS = [1, 2, 3, 4];
const LEVEL_LABELS = { 1: 'Level 1', 2: 'Level 2', 3: 'Level 3', 4: 'Level 4 (Live Outs)' };
const LEVEL_NEXT = { 1: 'Requirements to move to Level 2', 2: 'Requirements to move to Level 3', 3: 'Requirements to move to Level 4', 4: 'Requirements to graduate from program' };

const s = {
  input: { background: '#1a1a1a', border: '1px solid #444', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 14, width: '100%', boxSizing: 'border-box' },
  btn: (color) => ({ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: color || '#b22222', color: '#fff' }),
  ghost: { padding: '6px 12px', borderRadius: 8, border: '1px solid #444', cursor: 'pointer', fontSize: 12, background: 'transparent', color: '#aaa' },
};

// ── Admin view: edit requirements ─────────────────────────────────────────────
export function LevelRequirementsAdmin() {
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeLevel, setActiveLevel] = useState(1);
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState('requirement');
  const [saving, setSaving] = useState(false);

  const fetchRequirements = useCallback(async () => {
    const { data } = await supabase.from('level_requirements').select('*').order('level').order('category').order('display_order');
    setRequirements(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRequirements(); }, [fetchRequirements]);

  const addRequirement = async () => {
    if (!newText.trim()) return;
    setSaving(true);
    const existing = requirements.filter(r => r.level === activeLevel && r.category === newCategory);
    await supabase.from('level_requirements').insert([{
      level: activeLevel, category: newCategory, text: newText.trim(), display_order: existing.length,
    }]);
    setNewText('');
    setSaving(false);
    fetchRequirements();
  };

  const deleteRequirement = async (id) => {
    await supabase.from('level_requirements').delete().eq('id', id);
    fetchRequirements();
  };

  const updateText = async (id, text) => {
    await supabase.from('level_requirements').update({ text }).eq('id', id);
    fetchRequirements();
  };

  const levelReqs = requirements.filter(r => r.level === activeLevel && r.category === 'requirement');
  const levelAllowances = requirements.filter(r => r.level === activeLevel && r.category === 'allowance');

  if (loading) return <div style={{ color: '#555', fontSize: 14 }}>Loading...</div>;

  return (
    <div>
      {/* Level tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {LEVELS.map(l => (
          <button key={l} onClick={() => setActiveLevel(l)}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: activeLevel === l ? '#b22222' : '#2a2a2a', color: activeLevel === l ? '#fff' : '#aaa' }}>
            {LEVEL_LABELS[l]}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 13, color: '#b22222', fontWeight: 600, marginBottom: 16 }}>{LEVEL_NEXT[activeLevel]}</p>

      {/* Requirements */}
      <div style={{ background: '#2a2a2a', borderRadius: 12, border: '1px solid #333', padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#999', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Requirements</div>
        {levelReqs.map(r => (
          <EditableRequirement key={r.id} req={r} onDelete={deleteRequirement} onUpdate={updateText} />
        ))}
        {levelReqs.length === 0 && <p style={{ color: '#555', fontSize: 13 }}>No requirements added yet.</p>}
      </div>

      {/* Allowances */}
      <div style={{ background: '#2a2a2a', borderRadius: 12, border: '1px solid #333', padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#999', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Allowances While in This Level</div>
        {levelAllowances.map(r => (
          <EditableRequirement key={r.id} req={r} onDelete={deleteRequirement} onUpdate={updateText} />
        ))}
        {levelAllowances.length === 0 && <p style={{ color: '#555', fontSize: 13 }}>No allowances added yet.</p>}
      </div>

      {/* Add new */}
      <div style={{ background: '#2a2a2a', borderRadius: 12, border: '1px solid #333', padding: '16px 18px' }}>
        <div style={{ fontSize: 12, color: '#999', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Add Item</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button onClick={() => setNewCategory('requirement')}
            style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: newCategory === 'requirement' ? '#b22222' : '#1a1a1a', color: newCategory === 'requirement' ? '#fff' : '#aaa' }}>
            Requirement
          </button>
          <button onClick={() => setNewCategory('allowance')}
            style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: newCategory === 'allowance' ? '#10b981' : '#1a1a1a', color: newCategory === 'allowance' ? '#fff' : '#aaa' }}>
            Allowance
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={newText} onChange={e => setNewText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addRequirement(); }}
            style={s.input} placeholder="Enter requirement or allowance text..." />
          <button onClick={addRequirement} disabled={saving || !newText.trim()} style={s.btn()}>Add</button>
        </div>
      </div>
    </div>
  );
}

function EditableRequirement({ req, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(req.text);

  const save = async () => {
    await onUpdate(req.id, text);
    setEditing(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '6px 0', borderBottom: '1px solid #333' }}>
      {editing ? (
        <>
          <input value={text} onChange={e => setText(e.target.value)} style={{ ...s.input, flex: 1 }}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} autoFocus />
          <button onClick={save} style={s.btn()}>Save</button>
          <button onClick={() => setEditing(false)} style={s.ghost}>Cancel</button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, color: '#ccc', fontSize: 14, lineHeight: 1.5 }}>• {req.text}</span>
          <button onClick={() => setEditing(true)} style={s.ghost}>Edit</button>
          <button onClick={() => onDelete(req.id)} style={{ ...s.ghost, color: '#ef4444', borderColor: '#ef4444' }}>×</button>
        </>
      )}
    </div>
  );
}

// ── Client view: progress checklist ──────────────────────────────────────────
export function ClientLevelProgress({ client, currentUser }) {
  const { isAdmin, isUpperManagement, hasFullAccess } = useUser();
  const canCheck = isAdmin || isUpperManagement || hasFullAccess;
  const clientLevel = client?.level || 1;
  const [requirements, setRequirements] = useState([]);
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data: reqs } = await supabase.from('level_requirements').select('*').eq('level', clientLevel).order('category').order('display_order');
    const { data: prog } = await supabase.from('client_level_progress').select('*').eq('client_id', client.id);
    const progressMap = {};
    (prog || []).forEach(p => { progressMap[p.requirement_id] = p; });
    setRequirements(reqs || []);
    setProgress(progressMap);
    setLoading(false);
  }, [client.id, clientLevel]);

  useEffect(() => { if (client?.id) fetchData(); }, [fetchData]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleProgress = async (reqId, currentlyCompleted) => {
    if (!canCheck) return;
    const newVal = !currentlyCompleted;
    if (newVal) {
      await supabase.from('client_level_progress').upsert([{
        client_id: client.id, requirement_id: reqId, completed: true,
        completed_at: new Date().toISOString(), completed_by: currentUser?.email || 'Staff',
      }], { onConflict: 'client_id,requirement_id' });
    } else {
      await supabase.from('client_level_progress').update({ completed: false, completed_at: null, completed_by: null })
        .eq('client_id', client.id).eq('requirement_id', reqId);
    }
    fetchData();
  };

  if (loading) return <p style={{ color: '#555', fontSize: 14 }}>Loading...</p>;

  const reqs = requirements.filter(r => r.category === 'requirement');
  const allowances = requirements.filter(r => r.category === 'allowance');
  const completedCount = reqs.filter(r => progress[r.id]?.completed).length;
  const pct = reqs.length > 0 ? Math.round((completedCount / reqs.length) * 100) : 0;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: '#aaa' }}>Progress to {clientLevel < 4 ? `Level ${clientLevel + 1}` : 'Graduate'}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{completedCount}/{reqs.length}</span>
        </div>
        <div style={{ background: '#1a1a1a', borderRadius: 6, height: 8, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#10b981' : '#b22222', borderRadius: 6, transition: 'width 0.3s' }} />
        </div>
      </div>

      {reqs.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#b22222', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            {LEVEL_NEXT[clientLevel]}
          </div>
          {reqs.map(req => {
            const done = progress[req.id]?.completed;
            return (
              <div key={req.id} onClick={() => toggleProgress(req.id, done)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid #333', cursor: canCheck ? 'pointer' : 'default' }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${done ? '#10b981' : '#444'}`, background: done ? '#10b981' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  {done && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, color: done ? '#666' : '#ddd', textDecoration: done ? 'line-through' : 'none', lineHeight: 1.5 }}>{req.text}</span>
                  {done && progress[req.id]?.completed_by && (
                    <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>Marked by {progress[req.id].completed_by}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {allowances.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: '#999', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Allowances at This Level
          </div>
          {allowances.map(req => (
            <div key={req.id} style={{ padding: '6px 0', borderBottom: '1px solid #333' }}>
              <span style={{ fontSize: 14, color: '#aaa', lineHeight: 1.5 }}>• {req.text}</span>
            </div>
          ))}
        </div>
      )}

      {reqs.length === 0 && allowances.length === 0 && (
        <p style={{ color: '#555', fontSize: 14 }}>No level requirements set up yet. Admins can add them in the Resources section.</p>
      )}
    </div>
  );
}