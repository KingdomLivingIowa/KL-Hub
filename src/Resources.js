import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';
import { LevelRequirementsAdmin } from './LevelRequirements';

const CATEGORIES = [
  { id: 'policy', label: 'Policies & Procedures' },
  { id: 'shuttle', label: 'Shuttle Schedule' },
  { id: 'general', label: 'General' },
];

const s = {
  card: { background: '#2a2a2a', borderRadius: 12, border: '1px solid #333', borderTop: '2px solid #b22222', marginBottom: 16, overflow: 'hidden' },
  cardHeader: { padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' },
  cardBody: { padding: '16px 18px' },
  label: { fontSize: 12, color: '#999', marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { background: '#1a1a1a', border: '1px solid #444', borderRadius: 8, padding: '9px 12px', color: '#fff', fontSize: 14, width: '100%', boxSizing: 'border-box' },
  textarea: { background: '#1a1a1a', border: '1px solid #444', borderRadius: 8, padding: '9px 12px', color: '#fff', fontSize: 14, width: '100%', boxSizing: 'border-box', resize: 'vertical' },
  select: { background: '#1a1a1a', border: '1px solid #444', borderRadius: 8, padding: '9px 12px', color: '#fff', fontSize: 14, width: '100%', boxSizing: 'border-box' },
  btn: (color) => ({ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: color || '#b22222', color: '#fff' }),
  ghost: { padding: '7px 14px', borderRadius: 8, border: '1px solid #444', cursor: 'pointer', fontSize: 13, background: 'transparent', color: '#aaa' },
  tag: (color) => ({ display: 'inline-block', background: color || '#2a2a2a', border: '1px solid #444', borderRadius: 20, padding: '3px 10px', fontSize: 12, color: '#aaa' }),
};

export default function Resources() {
  const [activeTab, setActiveTabMain] = useState('resources');
  const { isAdmin, isUpperManagement, hasFullAccess } = useUser();
  const canEdit = isAdmin || isUpperManagement || hasFullAccess;

  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [form, setForm] = useState({ title: '', category: 'policy', content: '', url: '', visible_to: 'all', display_order: 0 });
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfName, setPdfName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const fetchResources = useCallback(async () => {
    const { data } = await supabase.from('resources').select('*').order('category').order('display_order');
    setResources(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchResources(); }, [fetchResources]);

  const resetForm = () => { setForm({ title: '', category: 'policy', content: '', url: '', visible_to: 'all', display_order: 0 }); setPdfFile(null); setPdfName(''); };

  const handleFileUpload = async (file) => {
    if (!file) return null;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: uploadErr } = await supabase.storage.from('resources').upload(path, file, { upsert: true });
    if (uploadErr) { alert('Upload failed: ' + uploadErr.message); setUploading(false); return null; }
    const { data } = supabase.storage.from('resources').getPublicUrl(path);
    setUploading(false);
    return data.publicUrl;
  };

  const saveResource = async (pdfFile) => {
    if (!form.title.trim()) return alert('Title is required.');
    setSaving(true);
    let url = form.url;
    if (pdfFile) {
      const uploadedUrl = await handleFileUpload(pdfFile);
      if (uploadedUrl) url = uploadedUrl;
    }
    const payload = { ...form, url };
    if (editingId) {
      await supabase.from('resources').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingId);
    } else {
      await supabase.from('resources').insert([payload]);
    }
    setSaving(false);
    setShowAdd(false);
    setEditingId(null);
    resetForm();
    fetchResources();
  };

  const deleteResource = async (id) => {
    if (!window.confirm('Delete this resource?')) return;
    await supabase.from('resources').delete().eq('id', id);
    fetchResources();
  };

  const startEdit = (r) => {
    setForm({ title: r.title, category: r.category, content: r.content || '', url: r.url || '', visible_to: r.visible_to || 'all', display_order: r.display_order || 0 });
    setEditingId(r.id);
    setShowAdd(true);
  };

  const filtered = activeCategory === 'all' ? resources : resources.filter(r => r.category === activeCategory);
  if (loading) return <div style={{ padding: 32, color: '#555' }}>Loading resources...</div>;

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      {/* Main tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        <button style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #444', cursor: 'pointer', fontSize: 14,
          background: activeTab === 'resources' ? '#2a2a2a' : 'transparent', color: activeTab === 'resources' ? '#fff' : '#aaa', fontWeight: activeTab === 'resources' ? 600 : 400 }}
          onClick={() => setActiveTabMain('resources')}>Resources</button>
        <button style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #444', cursor: 'pointer', fontSize: 14,
          background: activeTab === 'levels' ? '#2a2a2a' : 'transparent', color: activeTab === 'levels' ? '#fff' : '#aaa', fontWeight: activeTab === 'levels' ? 600 : 400 }}
          onClick={() => setActiveTabMain('levels')}>Level Requirements</button>
      </div>

      {activeTab === 'levels' && <LevelRequirementsAdmin />}

      {activeTab === 'resources' && <>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setActiveCategory('all')}
            style={{ ...s.tag(), background: activeCategory === 'all' ? '#b22222' : '#2a2a2a', color: activeCategory === 'all' ? '#fff' : '#aaa', cursor: 'pointer', border: 'none' }}>
            All
          </button>
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={() => setActiveCategory(c.id)}
              style={{ ...s.tag(), background: activeCategory === c.id ? '#b22222' : '#2a2a2a', color: activeCategory === c.id ? '#fff' : '#aaa', cursor: 'pointer', border: 'none' }}>
              {c.label}
            </button>
          ))}
        </div>
        {canEdit && (
          <button style={s.btn()} onClick={() => { resetForm(); setEditingId(null); setShowAdd(true); }}>
            + Add Resource
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {showAdd && canEdit && (
        <div style={{ ...s.card, marginBottom: 24 }}>
          <div style={s.cardHeader}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{editingId ? 'Edit Resource' : 'Add Resource'}</span>
            <button onClick={() => { setShowAdd(false); setEditingId(null); resetForm(); }} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>
          <div style={s.cardBody}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={s.label}>Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={s.input} placeholder="Resource title" />
              </div>
              <div>
                <label style={s.label}>Category *</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={s.select}>
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Content (text, schedule, description)</label>
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} style={{ ...s.textarea, minHeight: 100 }} placeholder="Enter content here..." rows={4} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>PDF Upload</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ background: '#2a2a2a', border: '1px dashed #555', borderRadius: 8, padding: '9px 16px', color: '#aaa', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>
                  📄 {pdfName || 'Choose PDF'}
                  <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) { setPdfFile(file); setPdfName(file.name); }
                  }} />
                </label>
                {pdfName && <button onClick={() => { setPdfFile(null); setPdfName(''); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18 }}>×</button>}
                {form.url && !pdfName && <a href={form.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#60a5fa' }}>View current PDF ↗</a>}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Document</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  style={{ background: '#1e3a2f', border: '1px solid #1D9E75', color: '#4ade80', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {uploading ? '⏳ Uploading...' : '📄 Upload PDF'}
                </button>
                <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handlePdfUpload} style={{ display: 'none' }} />
                {form.url && (
                  <>
                    <span style={{ fontSize: 13, color: '#4ade80' }}>✓ Uploaded</span>
                    <a href={form.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#60a5fa' }}>Preview ↗</a>
                    <button onClick={() => setForm(f => ({ ...f, url: '' }))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>Remove</button>
                  </>
                )}
              </div>
              <label style={{ ...s.label, marginBottom: 4 }}>Or paste a URL</label>
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} style={s.input} placeholder="https://..." />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={s.label}>Visible To</label>
                <select value={form.visible_to} onChange={e => setForm(f => ({ ...f, visible_to: e.target.value }))} style={s.select}>
                  <option value="all">Everyone (Staff & Clients)</option>
                  <option value="staff">Staff Only</option>
                </select>
              </div>
              <div>
                <label style={s.label}>Display Order</label>
                <input type="number" value={form.display_order} onChange={e => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} style={s.input} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowAdd(false); setEditingId(null); resetForm(); }} style={s.ghost}>Cancel</button>
              <button onClick={saveResource} disabled={saving || uploading} style={s.btn()}>{uploading ? 'Uploading...' : saving ? 'Saving...' : 'Save Resource'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Resource List */}
      {filtered.length === 0 && (
        <div style={{ color: '#555', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>
          No resources yet. {canEdit ? 'Click "+ Add Resource" to get started.' : ''}
        </div>
      )}

      {CATEGORIES.filter(c => activeCategory === 'all' || activeCategory === c.id).map(cat => {
        const catResources = filtered.filter(r => r.category === cat.id);
        if (catResources.length === 0) return null;
        return (
          <div key={cat.id}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#b22222', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, marginTop: 8 }}>{cat.label}</div>
            {catResources.map(r => (
              <div key={r.id} style={s.card}>
                <div style={s.cardHeader}>
                  <div>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{r.title}</span>
                    {r.visible_to === 'staff' && (
                      <span style={{ marginLeft: 8, fontSize: 11, background: '#1e2d3a', color: '#60a5fa', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>Staff Only</span>
                    )}
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => startEdit(r)} style={{ ...s.ghost, padding: '5px 12px', fontSize: 12 }}>Edit</button>
                      <button onClick={() => deleteResource(r.id)} style={{ ...s.btn('#ef4444'), padding: '5px 12px', fontSize: 12 }}>Delete</button>
                    </div>
                  )}
                </div>
                {(r.content || r.url) && (
                  <div style={s.cardBody}>
                    {r.content && <p style={{ color: '#ccc', fontSize: 14, margin: 0, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{r.content}</p>}
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: r.content ? 12 : 0, color: '#60a5fa', fontSize: 14, textDecoration: 'none', fontWeight: 500 }}>
                        📄 {r.url?.includes('resources') ? 'View PDF' : 'Open Document'} ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
      </>}
    </div>
  );
}