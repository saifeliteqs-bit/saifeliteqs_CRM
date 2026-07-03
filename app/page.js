'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';

// ── CONFIG ──────────────────────────────────────────────────────────────────
const USERS = [
  { id: 'saif',   name: 'Saif',   role: 'CEO',        badge: 'avatar-ceo',       initials: 'SA', access: 'all' },
  { id: 'nouman', name: 'Nouman', role: 'Marketing',  badge: 'avatar-marketing', initials: 'NO', access: 'all' },
  { id: 'zafar',  name: 'Zafar',  role: 'Operations', badge: 'avatar-ops',       initials: 'ZA', access: 'assigned' },
];

const STAGES = [
  { id: 'new',       label: 'New Inquiry',    col: 'col-new',       pill: 'pill-new',       icon: '🔵' },
  { id: 'contacted', label: 'Contacted',      col: 'col-contacted', pill: 'pill-contacted', icon: '📞' },
  { id: 'proposal',  label: 'Proposal Sent',  col: 'col-proposal',  pill: 'pill-proposal',  icon: '📄' },
  { id: 'review',    label: 'Under Review',   col: 'col-review',    pill: 'pill-review',    icon: '🔍' },
  { id: 'won',       label: 'Won',            col: 'col-won',       pill: 'pill-won',       icon: '✅' },
  { id: 'lost',      label: 'Lost',           col: 'col-lost',      pill: 'pill-lost',      icon: '❌' },
];

const SERVICE_TYPES = ['Quantity Surveying', 'Cost Consulting', 'Project Management', 'Contract Admin', 'Tendering', 'Feasibility Study', 'Value Engineering', 'Other'];
const SOURCES       = ['Direct Inquiry', 'Referral', 'Website', 'LinkedIn', 'WhatsApp', 'Email', 'Phone Call', 'Other'];
const ACTIVITY_TYPES = [
  { id: 'call',     label: '📞 Call',      cls: 'icon-call'     },
  { id: 'note',     label: '📝 Note',      cls: 'icon-note'     },
  { id: 'email',    label: '✉️ Email',     cls: 'icon-email'    },
  { id: 'visit',    label: '🏗️ Site Visit',cls: 'icon-visit'   },
  { id: 'whatsapp', label: '💬 WhatsApp',  cls: 'icon-whatsapp' },
];

function linkify(text) {
  if (!text) return text;
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      const href = part.startsWith('http') ? part : 'https://' + part;
      return <a key={i} href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{part}</a>;
    }
    return part;
  });
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getFileIcon(name) {
  const ext = name?.split('.').pop()?.toLowerCase();
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return null;
  if (ext === 'pdf') return '📄';
  if (['doc','docx'].includes(ext)) return '📝';
  if (['xls','xlsx'].includes(ext)) return '📊';
  return '📎';
}

function getUserById(id) { return USERS.find(u => u.id === id) || { name: id, initials: id?.substring(0,2).toUpperCase(), badge: 'avatar-ops' }; }
function getStageById(id) { return STAGES.find(s => s.id === id) || STAGES[0]; }

function staleCheck(lead) {
  const last = lead.updatedAt || lead.createdAt;
  if (!last) return false;
  return (Date.now() - new Date(last).getTime()) > 7 * 24 * 60 * 60 * 1000;
}

// ── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function CRM() {
  const [session, setSession]        = useState(null); // { userId, passwordOk }
  const [loginStep, setLoginStep]    = useState(1);    // 1=select user 2=password
  const [selUser, setSelUser]        = useState('');
  const [pwInput, setPwInput]        = useState('');
  const [loginError, setLoginError]  = useState('');
  const [leads, setLeads]            = useState([]);
  const [view, setView]              = useState('pipeline');
  const [search, setSearch]          = useState('');
  const [dateFrom, setDateFrom]      = useState('');
  const [dateTo, setDateTo]          = useState('');
  const [openLead, setOpenLead]      = useState(null);
  const [showNewLead, setShowNewLead]= useState(false);
  const [showImport, setShowImport]  = useState(false);
  const [editing, setEditing]        = useState(false);
  const [loading, setLoading]        = useState(false);
  const [toasts, setToasts]          = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [seenNotifs, setSeenNotifs]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('seqs_seen_notifs') || '[]'); } catch { return []; }
  });
  const fileInputRef = useRef(null);
  const uploadRef    = useRef(null);

  // ── Auth persist ──
  useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem('seqs_session') || 'null');
      if (s?.userId) setSession(s);
    } catch {}
  }, []);

  // ── Load leads + extract notifications ──
  const loadLeads = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const r = await fetch('/api/leads');
      if (r.ok) {
        const data = await r.json();
        setLeads(data);
        // Extract @mention notifications for current user
        const myMentionKey = '@' + session.userId;
        const notifs = [];
        data.forEach(lead => {
          (lead.activities || []).forEach(act => {
            if (act.note && act.note.toLowerCase().includes(myMentionKey) && act.by !== session.userId) {
              notifs.push({
                id: act.id,
                leadId: lead.id,
                leadName: lead.name,
                by: act.by,
                note: act.note,
                at: act.at,
                lead,
              });
            }
          });
        });
        notifs.sort((a,b) => new Date(b.at) - new Date(a.at));
        setNotifications(notifs);
      }
    } catch {}
    setLoading(false);
  }, [session]);

  useEffect(() => { loadLeads(); }, [loadLeads]);
  
  // Poll for new notifications every 30 seconds
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(loadLeads, 30000);
    return () => clearInterval(interval);
  }, [session, loadLeads]);

  // ── Toast ──
  function toast(msg, type = 'success') {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }

  // ── Login ──
  async function handleLogin() {
    setLoginError('');
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: selUser, password: pwInput }),
    });
    const data = await r.json();
    if (data.ok) {
      const s = { userId: selUser };
      sessionStorage.setItem('seqs_session', JSON.stringify(s));
      setSession(s);
      setLoginStep(1);
      setPwInput('');
    } else {
      setLoginError(data.error || 'Incorrect password');
    }
  }

  function logout() {
    sessionStorage.removeItem('seqs_session');
    setSession(null);
    setLoginStep(1);
    setSelUser('');
    setPwInput('');
    setLeads([]);
  }

  // ── Leads CRUD ──
  async function saveLead(data) {
    const isNew = !data.id;
    const payload = {
      ...data,
      id: data.id || `lead_${Date.now()}`,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: data.createdBy || session.userId,
    };
    await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setLeads(prev => {
      const exists = prev.find(l => l.id === payload.id);
      let next = exists ? prev.map(l => l.id === payload.id ? payload : l) : [payload, ...prev];
      return next.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    });
    if (openLead?.id === payload.id) setOpenLead(payload);
    toast(isNew ? 'Lead added!' : 'Lead updated!');
    return payload;
  }

  async function deleteLead(id) {
    if (!confirm('Delete this lead? This cannot be undone.')) return;
    await fetch(`/api/leads?id=${id}`, { method: 'DELETE' });
    setLeads(p => p.filter(l => l.id !== id));
    setOpenLead(null);
    toast('Lead deleted', 'error');
  }

  async function changeStage(lead, stageId) {
    const entry = {
      id: `act_${Date.now()}`,
      type: 'stage',
      note: `Stage changed to ${getStageById(stageId).label}`,
      by: session.userId,
      at: new Date().toISOString(),
    };
    const updated = { ...lead, stage: stageId, updatedAt: new Date().toISOString(), activities: [...(lead.activities || []), entry] };
    await saveLead(updated);
  }

  async function addActivity(lead, type, note) {
    if (!note.trim()) return;
    const entry = {
      id: `act_${Date.now()}`,
      type,
      note: note.trim(),
      by: session.userId,
      at: new Date().toISOString(),
    };
    const updated = { ...lead, updatedAt: new Date().toISOString(), activities: [...(lead.activities || []), entry] };
    await saveLead(updated);
    toast('Activity logged!');
  }

  async function deleteActivity(lead, actId) {
    if (!confirm('Delete this activity?')) return;
    const updated = { ...lead, activities: (lead.activities || []).filter(a => a.id !== actId), updatedAt: new Date().toISOString() };
    await saveLead(updated);
  }

  // ── File upload ──
  async function uploadFile(lead, file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('leadId', lead.id);
    const r = await fetch('/api/upload', { method: 'POST', body: formData });
    if (!r.ok) { toast('Upload failed', 'error'); return; }
    const { url, name } = await r.json();
    const fileEntry = { id: `file_${Date.now()}`, name: file.name, url, uploadedBy: session.userId, at: new Date().toISOString() };
    const act = { id: `act_${Date.now()}`, type: 'note', note: `📎 Uploaded file: ${file.name}`, by: session.userId, at: new Date().toISOString() };
    const updated = { ...lead, updatedAt: new Date().toISOString(), files: [...(lead.files || []), fileEntry], activities: [...(lead.activities || []), act] };
    await saveLead(updated);
    toast(`${file.name} uploaded!`);
  }

  async function deleteFile(lead, fileId) {
    if (!confirm('Delete this file?')) return;
    const updated = { ...lead, files: (lead.files || []).filter(f => f.id !== fileId), updatedAt: new Date().toISOString() };
    await saveLead(updated);
  }

  // ── Filters ──
  function filterLeads(arr) {
    const currentUserObj = getUserById(session?.userId);
    return arr.filter(l => {
      // Zafar: only sees leads assigned to him
      if (currentUserObj?.access === 'assigned') {
        if (l.assignedTo !== session.userId) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!['name','company','phone','email','location','projectRef'].some(k => l[k]?.toLowerCase().includes(q))) return false;
      }
      if (dateFrom && new Date(l.createdAt) < new Date(dateFrom)) return false;
      if (dateTo   && new Date(l.createdAt) > new Date(dateTo + 'T23:59:59')) return false;
      return true;
    }).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  }

  // ── Excel Import ──
  function handleImportFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (data.length < 2) { toast('File has no data', 'error'); return; }
      const headers = data[0].map(h => String(h || '').trim());
      const rows    = data.slice(1);
      // Auto-detect common column names
      const map = {};
      const detect = (keys, col) => { const k = keys.find(k => headers.some(h => h.toLowerCase().includes(k))); if (k) map[col] = headers.findIndex(h => h.toLowerCase().includes(k)); };
      detect(['name','client','customer'], 'name');
      detect(['company','firm','org'], 'company');
      detect(['phone','mobile','tel'], 'phone');
      detect(['email'], 'email');
      detect(['location','city','address','project location'], 'location');
      detect(['service','type','looking'], 'service');
      detect(['value','amount','aed','budget','cost'], 'value');
      detect(['source','channel','platform'], 'source');
      detect(['ref','reference','project ref'], 'projectRef');
      detect(['note','notes','remark','comment'], 'notes');

      const importedLeads = rows.filter(r => r.some(c => c)).map(r => ({
        id: `lead_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name:       map.name       !== undefined ? String(r[map.name]       || '') : '',
        company:    map.company    !== undefined ? String(r[map.company]    || '') : '',
        phone:      map.phone      !== undefined ? String(r[map.phone]      || '') : '',
        email:      map.email      !== undefined ? String(r[map.email]      || '') : '',
        location:   map.location   !== undefined ? String(r[map.location]   || '') : '',
        service:    map.service    !== undefined ? String(r[map.service]    || '') : '',
        value:      map.value      !== undefined ? String(r[map.value]      || '') : '',
        source:     map.source     !== undefined ? String(r[map.source]     || '') : '',
        projectRef: map.projectRef !== undefined ? String(r[map.projectRef] || '') : '',
        stage: 'new',
        createdBy: session.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        activities: map.notes !== undefined && r[map.notes] ? [{
          id: `act_${Date.now()}`,
          type: 'note',
          note: String(r[map.notes]),
          by: session.userId,
          at: new Date().toISOString(),
        }] : [],
        files: [],
      })).filter(l => l.name);

      importAllLeads(importedLeads);
    };
    reader.readAsArrayBuffer(file);
  }

  async function importAllLeads(arr) {
    let count = 0;
    for (const l of arr) {
      await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(l) });
      count++;
    }
    await loadLeads();
    setShowImport(false);
    toast(`✅ ${count} leads imported!`);
  }

  // ── Dashboard stats ──
  function computeStats(arr) {
    const total    = arr.length;
    const won      = arr.filter(l => l.stage === 'won').length;
    const totalVal = arr.reduce((s, l) => s + (parseFloat(l.value) || 0), 0);
    const wonVal   = arr.filter(l => l.stage === 'won').reduce((s, l) => s + (parseFloat(l.value) || 0), 0);
    const byStage  = {};
    STAGES.forEach(s => { byStage[s.id] = arr.filter(l => l.stage === s.id).length; });
    const byUser   = {};
    USERS.forEach(u => { byUser[u.id] = arr.filter(l => l.createdBy === u.id || l.assignedTo === u.id).length; });
    return { total, won, totalVal, wonVal, byStage, byUser, convRate: total ? Math.round((won / total) * 100) : 0 };
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  RENDER: LOGIN
  // ──────────────────────────────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="login-screen">

        {/* ── LEFT PANEL ── */}
        <div className="login-left">
          {/* Background image — Dubai/construction aerial */}
          <div className="login-bg-img" />
          <div className="login-bg-overlay" />

          {/* Animated grid overlay */}
          <div className="login-grid-overlay" />

          {/* Top nav bar */}
          <div className="login-topnav">
            <div className="login-topnav-logo">
              <img src="/logo.png" alt="Saif Elite QS" style={{ height: 36, objectFit: 'contain', filter: 'drop-shadow(0 2px 8px rgba(201,168,76,0.4))' }} />
              <div>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 14, fontWeight: 700, color: '#C9A84C', letterSpacing: 0.5 }}>Saif Elite QS</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, textTransform: 'uppercase' }}>Quantity Surveyor</div>
              </div>
            </div>
            <a href="https://saifeliteqs.com" target="_blank" rel="noopener noreferrer" className="login-topnav-link">
              Visit Website →
            </a>
          </div>

          {/* Hero text */}
          <div className="login-hero">
            <div className="login-hero-eyebrow">
              <span className="login-hero-dot" />
              Client Management System
            </div>
            <h1 className="login-hero-title">
              Precision in <br />
              <span className="login-hero-gold">Every Estimate.</span>
            </h1>
            <p className="login-hero-desc">
              Manage your QS leads, track project proposals, monitor cost consulting pipeline — all in one secure platform built for Saif Elite QS.
            </p>

            {/* Stats row */}
            <div className="login-stats-row">
              <div className="login-stat-item">
                <div className="login-stat-num">100%</div>
                <div className="login-stat-lbl">Secure & Private</div>
              </div>
              <div className="login-stat-divider" />
              <div className="login-stat-item">
                <div className="login-stat-num">Live</div>
                <div className="login-stat-lbl">Real-time Sync</div>
              </div>
              <div className="login-stat-divider" />
              <div className="login-stat-item">
                <div className="login-stat-num">3</div>
                <div className="login-stat-lbl">Team Members</div>
              </div>
            </div>

            {/* Feature tags */}
            <div className="login-tags">
              {['📐 Quantity Surveying','💰 Cost Consulting','📋 Proposals','📊 Pipeline Tracking','📎 File Uploads'].map(t => (
                <span key={t} className="login-tag">{t}</span>
              ))}
            </div>
          </div>

          {/* Bottom footer */}
          <div className="login-left-footer">
            <span>© {new Date().getFullYear()} Saif Elite QS</span>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
            <span>Quantity Surveyor & Cost Consultant</span>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
            <span>Dubai, UAE</span>
          </div>
        </div>

        {/* ── RIGHT PANEL — LOGIN CARD ── */}
        <div className="login-right">
          <div className="login-card">
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <img src="/logo.png" alt="Saif Elite QS" className="login-logo" />
              <div className="login-company">Saif Elite QS</div>
              <div className="login-subtitle">Quantity Surveyor & Cost Consultant</div>
              <div className="login-divider" />
            </div>

            {loginStep === 1 && (
              <>
                <div className="login-label">Select Your Account</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                  {USERS.map(u => (
                    <button
                      key={u.id}
                      onClick={() => { setSelUser(u.id); setLoginStep(2); setLoginError(''); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 16px',
                        background: 'var(--dark-3)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 10,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        fontFamily: 'Inter, sans-serif',
                        color: 'var(--text)',
                        textAlign: 'left',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.background = 'var(--dark-4)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--dark-3)'; }}
                    >
                      <div className={`user-avatar ${u.badge}`}>{u.initials}</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.role}</div>
                      </div>
                      <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: 16 }}>›</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {loginStep === 2 && (
              <>
                <button onClick={() => { setLoginStep(1); setLoginError(''); setPwInput(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Inter, sans-serif' }}>
                  ← Back
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '10px 14px', background: 'var(--dark-3)', borderRadius: 8 }}>
                  <div className={`user-avatar ${getUserById(selUser).badge}`}>{getUserById(selUser).initials}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{getUserById(selUser).name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{getUserById(selUser).role}</div>
                  </div>
                </div>
                {loginError && <div className="login-error">{loginError}</div>}
                <div className="login-label">Password</div>
                <input
                  type="password"
                  className="login-input"
                  value={pwInput}
                  onChange={e => setPwInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  placeholder="Enter your password"
                  autoFocus
                />
                <button className="login-btn" onClick={handleLogin}>Sign In →</button>
              </>
            )}

            <div className="login-footer">Saif Elite QS — CRM v1.0</div>
          </div>
        </div>
      </div>
    );
  }


  // ──────────────────────────────────────────────────────────────────────────
  //  RENDER: APP
  // ──────────────────────────────────────────────────────────────────────────
  const currentUser = getUserById(session.userId);
  const filtered    = filterLeads(leads);
  const stats       = computeStats(filtered);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* TOP BAR */}
      <div className="topbar">
        <img src="/logo.png" alt="Saif Elite QS" className="topbar-logo" />
        <div className="topbar-divider" />
        <span className="topbar-brand">Saif Elite QS</span>

        <div className="topbar-center">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input
              className="topbar-search"
              placeholder="Search clients, projects, phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="topbar-actions">
          <button className="topbar-btn" onClick={() => setShowImport(true)}>📥 Import</button>
          <button className="topbar-btn primary" onClick={() => { setEditing(false); setShowNewLead(true); }}>+ New Lead</button>

          <div className="user-badge" onClick={logout} title="Click to sign out">
            <div className={`user-avatar ${currentUser.badge}`}>{currentUser.initials}</div>
            <div className="user-info">
              <div className="user-name">{currentUser.name}</div>
              <div className="user-role">{currentUser.role}</div>
            </div>
          </div>
        </div>
      </div>

      {/* VIEW TABS */}
      <div className="view-tabs">
        {['dashboard','pipeline','list'].map(v => (
          <button key={v} className={`view-tab${view === v ? ' active' : ''}`} onClick={() => setView(v)}>
            {v === 'dashboard' ? '📊' : v === 'pipeline' ? '🗂️' : '📋'} {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
        <div className="view-tab-divider" />
        <div className="filter-section">
          <span className="filter-label">From</span>
          <input type="date" className="filter-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="filter-label">To</span>
          <input type="date" className="filter-input" value={dateTo}   onChange={e => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && <button className="filter-clear" onClick={() => { setDateFrom(''); setDateTo(''); }}>×</button>}
          <span className="filter-label" style={{ marginLeft: 8 }}>
            {filtered.length} lead{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, overflow: 'auto' }}>

        {/* DASHBOARD */}
        {view === 'dashboard' && (
          <div className="dashboard">
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">📋</div>
                <div className="stat-value">{stats.total}</div>
                <div className="stat-label">Total Leads</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">💰</div>
                <div className="stat-value gold">AED {(stats.totalVal / 1000).toFixed(0)}K</div>
                <div className="stat-label">Pipeline Value</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">✅</div>
                <div className="stat-value success">{stats.won}</div>
                <div className="stat-label">Deals Won</div>
                <div className="stat-sub">AED {(stats.wonVal / 1000).toFixed(0)}K value</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📈</div>
                <div className="stat-value teal">{stats.convRate}%</div>
                <div className="stat-label">Conversion Rate</div>
              </div>
            </div>

            <div className="dash-grid-2">
              <div className="dash-card">
                <div className="section-header"><div className="section-title">Pipeline by Stage</div></div>
                {STAGES.map(s => (
                  <div className="stage-bar-row" key={s.id}>
                    <div className="stage-bar-label">{s.icon} {s.label}</div>
                    <div className="stage-bar-track">
                      <div className="stage-bar-fill" style={{ width: stats.total ? `${(stats.byStage[s.id] / stats.total) * 100}%` : '0%' }} />
                    </div>
                    <div className="stage-bar-count">{stats.byStage[s.id]}</div>
                  </div>
                ))}
              </div>

              <div className="dash-card">
                <div className="section-header"><div className="section-title">Team Performance</div></div>
                <div className="team-table">
                  {USERS.map(u => (
                    <div className="team-row" key={u.id}>
                      <div className={`user-avatar ${u.badge}`} style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{u.initials}</div>
                      <div>
                        <div className="team-name">{u.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{u.role}</div>
                      </div>
                      <div className="team-stat"><span>{stats.byUser[u.id]}</span> leads</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="dash-card">
              <div className="section-header"><div className="section-title">Recent Activity</div></div>
              {leads.slice(0, 8).flatMap(l =>
                (l.activities || []).slice(-1).map(a => ({ lead: l, act: a }))
              ).sort((a, b) => new Date(b.act.at) - new Date(a.act.at)).slice(0, 8).map(({ lead, act }, i) => (
                <div className="activity-item" key={i} style={{ cursor: 'pointer' }} onClick={() => setOpenLead(lead)}>
                  <div className={`activity-dot ${act.type === 'stage' ? 'dot-teal' : act.type === 'call' ? 'dot-gold' : 'dot-muted'}`} />
                  <div>
                    <div className="activity-text"><strong>{lead.name}</strong> — {act.note}</div>
                    <div className="activity-meta">{getUserById(act.by).name} · {timeAgo(act.at)}</div>
                  </div>
                </div>
              ))}
              {leads.length === 0 && <div className="empty-state"><div className="empty-text">No activity yet</div></div>}
            </div>
          </div>
        )}

        {/* PIPELINE */}
        {view === 'pipeline' && (
          <div className="pipeline-wrap">
            {filtered.length === 0 && !loading && (
              <div className="empty-state"><div className="empty-icon">🔍</div><div className="empty-text">No leads found</div><div className="empty-sub">Add a new lead or adjust filters</div></div>
            )}
            <div className="pipeline-board">
              {STAGES.map(stage => {
                const stagLeads = filtered.filter(l => l.stage === stage.id);
                return (
                  <div className="pipeline-col" key={stage.id}>
                    <div className="col-header">
                      <span className="col-title">{stage.icon} {stage.label}</span>
                      <span className="col-count">{stagLeads.length}</span>
                    </div>
                    <div className={`col-body ${stage.col}`}>
                      {stagLeads.map(lead => (
                        <LeadCard key={lead.id} lead={lead} onClick={() => setOpenLead(lead)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* LIST */}
        {view === 'list' && (
          <div className="list-wrap">
            {filtered.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">📋</div><div className="empty-text">No leads found</div></div>
            ) : (
              <table className="list-table">
                <thead>
                  <tr>
                    <th>Client / Company</th>
                    <th>Service</th>
                    <th>Stage</th>
                    <th>Value (AED)</th>
                    <th>Source</th>
                    <th>Assigned</th>
                    <th>Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(lead => {
                    const stage = getStageById(lead.stage);
                    const lastAct = (lead.activities || []).slice(-1)[0];
                    return (
                      <tr key={lead.id} onClick={() => setOpenLead(lead)}>
                        <td>
                          <div className="td-name">{lead.name}</div>
                          {lead.company && <div className="td-company">{lead.company}</div>}
                          {lead.phone   && <div className="td-meta">{lead.phone}</div>}
                        </td>
                        <td><div className="td-meta">{lead.service || '—'}</div></td>
                        <td><span className={`stage-pill ${stage.pill}`}>{stage.icon} {stage.label}</span></td>
                        <td><div className="td-value">{lead.value ? `${Number(lead.value).toLocaleString()}` : '—'}</div></td>
                        <td><div className="td-meta">{lead.source || '—'}</div></td>
                        <td>
                          {lead.assignedTo ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <div className={`user-avatar ${getUserById(lead.assignedTo).badge}`} style={{ width: 22, height: 22, borderRadius: '50%', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{getUserById(lead.assignedTo).initials}</div>
                              <span className="td-meta">{getUserById(lead.assignedTo).name}</span>
                            </div>
                          ) : '—'}
                        </td>
                        <td><div className="td-meta">{lastAct ? timeAgo(lastAct.at) : formatDate(lead.createdAt)}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* DETAIL MODAL */}
      {openLead && (
        <DetailModal
          lead={openLead}
          session={session}
          onClose={() => setOpenLead(null)}
          onSave={saveLead}
          onDelete={deleteLead}
          onStageChange={changeStage}
          onActivity={addActivity}
          onDeleteActivity={deleteActivity}
          onUpload={uploadFile}
          onDeleteFile={deleteFile}
          uploadRef={uploadRef}
        />
      )}

      {/* NEW/EDIT LEAD MODAL */}
      {showNewLead && (
        <LeadForm
          session={session}
          onClose={() => setShowNewLead(false)}
          onSave={async (d) => { await saveLead(d); setShowNewLead(false); }}
        />
      )}

      {/* IMPORT MODAL */}
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImport={handleImportFile} />
      )}

      {/* TOASTS */}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>
        ))}
      </div>

      {/* FLOATING NOTIFICATION WIDGET */}
      <FloatingNotif
        notifications={notifications}
        seenNotifs={seenNotifs}
        setSeenNotifs={setSeenNotifs}
        showNotifPanel={showNotifPanel}
        setShowNotifPanel={setShowNotifPanel}
        setOpenLead={setOpenLead}
        session={session}
      />
    </div>
  );
}

// ── FLOATING NOTIFICATION WIDGET ────────────────────────────────────────────
function FloatingNotif({ notifications, seenNotifs, setSeenNotifs, showNotifPanel, setShowNotifPanel, setOpenLead, session }) {
  const unreadCount = notifications.filter(n => !seenNotifs.includes(n.id)).length;

  function openPanel() {
    setShowNotifPanel(p => !p);
    const ids = notifications.map(n => n.id);
    setSeenNotifs(ids);
    try { localStorage.setItem('seqs_seen_notifs', JSON.stringify(ids)); } catch {}
  }

  return (
    <div className="floating-notif-wrap">
      {/* Panel */}
      {showNotifPanel && (
        <div className="floating-notif-panel">
          <div className="notif-panel-header">
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:20 }}>🔔</span>
              <span>Mentions & Tags</span>
              {unreadCount > 0 && <span className="notif-badge-inline">{unreadCount} new</span>}
            </div>
            <button onClick={() => setShowNotifPanel(false)} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</button>
          </div>
          {notifications.length === 0 ? (
            <div className="notif-empty">
              <div style={{ fontSize:48, marginBottom:12 }}>🔔</div>
              <div style={{ fontWeight:600, marginBottom:6 }}>No mentions yet</div>
              <div style={{ fontSize:12, color:'var(--text-dim)' }}>
                When someone tags you with <span style={{ color:'var(--gold)' }}>@{session?.userId}</span> in a comment, it appears here
              </div>
            </div>
          ) : (
            <div className="notif-list">
              {notifications.map(n => (
                <div
                  key={n.id}
                  className={`notif-item${!seenNotifs.includes(n.id) ? ' notif-unread' : ''}`}
                  onClick={() => { setOpenLead(n.lead); setShowNotifPanel(false); }}
                >
                  <div className="notif-avatar-wrap">
                    <div className={`user-avatar ${getUserById(n.by).badge}`}
                      style={{ width:40, height:40, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, flexShrink:0 }}>
                      {getUserById(n.by).initials}
                    </div>
                    {!seenNotifs.includes(n.id) && <div className="notif-unread-dot" />}
                  </div>
                  <div style={{ flex:1 }}>
                    <div className="notif-text">
                      <strong>{getUserById(n.by).name}</strong> tagged you in <strong style={{ color:'var(--gold)' }}>{n.leadName}</strong>
                    </div>
                    <div className="notif-note">"{n.note.length > 70 ? n.note.slice(0,70)+'…' : n.note}"</div>
                    <div className="notif-time">{timeAgo(n.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Big fancy bell button */}
      <button className="floating-notif-btn" onClick={openPanel}>
        <div className="floating-notif-ring" />
        <div className="floating-notif-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </div>
        {unreadCount > 0 && (
          <div className="floating-notif-count">{unreadCount}</div>
        )}
      </button>
    </div>
  );
}

// ── LEAD CARD ────────────────────────────────────────────────────────────────
function LeadCard({ lead, onClick }) {
  const isStale = staleCheck(lead) && !['won','lost'].includes(lead.stage);
  const u = getUserById(lead.assignedTo || lead.createdBy);
  const svc = lead.service?.split(' ')[0];
  return (
    <div className={`lead-card${isStale ? ' stale' : ''}`} onClick={onClick}>
      <div className="lead-name">{lead.name}</div>
      {lead.company && <div className="lead-company">{lead.company}</div>}
      <div className="lead-meta">
        {svc && <span className={`lead-type ${svc === 'Quantity' ? 'type-qs' : svc === 'Cost' ? 'type-cost' : svc === 'Project' ? 'type-pm' : 'type-other'}`}>{lead.service}</span>}
        {lead.value && <span className="lead-value">AED {Number(lead.value).toLocaleString()}</span>}
      </div>
      <div className="lead-assigned">
        <div className={`assigned-dot ${u.badge}`} style={{ width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700 }}>{u.initials}</div>
        <span className="assigned-name">{u.name}</span>
        {isStale && <span className="stale-badge" style={{ marginLeft: 'auto' }}>⚠️ Stale</span>}
      </div>
      <div className="lead-date">Added {timeAgo(lead.createdAt)}</div>
    </div>
  );
}

// ── DETAIL MODAL ─────────────────────────────────────────────────────────────
function DetailModal({ lead, session, onClose, onSave, onDelete, onStageChange, onActivity, onDeleteActivity, onUpload, onDeleteFile }) {
  const [actType, setActType]     = useState('call');
  const [actNote, setActNote]     = useState('');
  const [uploading, setUploading] = useState(false);
  const [editMode, setEditMode]   = useState(false);
  const [form, setForm]           = useState({ ...lead });
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPos, setMentionPos]     = useState(null); // index of @ in text
  const [showMentions, setShowMentions] = useState(false);
  const fileRef    = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => { setForm({ ...lead }); }, [lead]);

  // @mention detection
  function handleNoteChange(e) {
    const val = e.target.value;
    setActNote(val);
    const cursor = e.target.selectionStart;
    const textBefore = val.slice(0, cursor);
    const match = textBefore.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1].toLowerCase());
      setMentionPos(match.index);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  }

  function insertMention(userId) {
    const cursor = textareaRef.current?.selectionStart || actNote.length;
    const textBefore = actNote.slice(0, cursor);
    const atIdx = textBefore.lastIndexOf('@');
    const before = actNote.slice(0, atIdx);
    const after  = actNote.slice(cursor);
    const newVal = before + '@' + userId + ' ' + after;
    setActNote(newVal);
    setShowMentions(false);
    textareaRef.current?.focus();
  }

  const filteredMentions = USERS.filter(u =>
    u.id !== session.userId &&
    (u.id.toLowerCase().includes(mentionQuery) || u.name.toLowerCase().includes(mentionQuery))
  );

  async function handleUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    for (const f of files) await onUpload(lead, f);
    setUploading(false);
    e.target.value = '';
  }

  const stageColors = { new: '#5E6AD2', contacted: '#1B9AA0', proposal: '#C9A84C', review: '#F39C12', won: '#2ECC71', lost: '#E74C3C' };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">{lead.name}</div>
            {lead.company && <div className="modal-company">{lead.company}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditMode(!editMode)} style={{ padding: '6px 12px', background: 'var(--dark-3)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontFamily: 'Inter,sans-serif' }}>
              {editMode ? 'Cancel' : '✏️ Edit'}
            </button>
            <button onClick={() => onDelete(lead.id)} style={{ padding: '6px 12px', background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.2)', borderRadius: 6, color: '#E74C3C', cursor: 'pointer', fontSize: 12, fontFamily: 'Inter,sans-serif' }}>
              🗑️
            </button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="modal-body">
          {/* STAGE BUTTONS */}
          <div className="stage-buttons">
            {STAGES.map(s => (
              <button
                key={s.id}
                className={`stage-btn${lead.stage === s.id ? ' active-stage' : ''}`}
                style={{
                  borderColor: lead.stage === s.id ? stageColors[s.id] : 'var(--border-subtle)',
                  background:  lead.stage === s.id ? `${stageColors[s.id]}22` : 'transparent',
                  color:       lead.stage === s.id ? stageColors[s.id] : 'var(--text-muted)',
                }}
                onClick={() => lead.stage !== s.id && onStageChange(lead, s.id)}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>

          {/* EDIT FORM */}
          {editMode ? (
            <div className="form-grid" style={{ marginBottom: 16 }}>
              {[['name','Client Name'],['company','Company'],['phone','Phone'],['email','Email'],['location','Location'],['projectRef','Project Ref'],['value','Value (AED)']].map(([k,l]) => (
                <div className="form-group" key={k}>
                  <label className="form-label">{l}</label>
                  <input className="form-input" value={form[k]||''} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} />
                </div>
              ))}
              {[['service','Service Type',SERVICE_TYPES],['source','Source',SOURCES],['assignedTo','Assigned To',USERS.map(u=>u.id)]].map(([k,l,opts]) => (
                <div className="form-group" key={k}>
                  <label className="form-label">{l}</label>
                  <select className="form-select" value={form[k]||''} onChange={e => setForm(f => ({...f,[k]:e.target.value}))}>
                    <option value="">Select…</option>
                    {k === 'assignedTo' ? USERS.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>) : opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div className="form-group full">
                <label className="form-label">Scope of Work</label>
                <textarea className="form-textarea" value={form.scope||''} onChange={e => setForm(f => ({...f,scope:e.target.value}))} rows={3} />
              </div>
              <div className="form-actions" style={{ gridColumn: '1/-1' }}>
                <button className="btn-cancel" onClick={() => setEditMode(false)}>Cancel</button>
                <button className="btn-save" onClick={() => { onSave(form); setEditMode(false); }}>Save Changes</button>
              </div>
            </div>
          ) : (
            <div className="info-grid">
              {[['Phone',lead.phone],['Email',lead.email],['Location',lead.location],['Service',lead.service],['Source',lead.source],['Project Ref',lead.projectRef],['Assigned To',lead.assignedTo ? getUserById(lead.assignedTo).name+' ('+getUserById(lead.assignedTo).role+')' : null],['Value','AED '+(lead.value ? Number(lead.value).toLocaleString() : '—')],['Added By',getUserById(lead.createdBy).name],['Date Added',formatDate(lead.createdAt)]].map(([l,v]) => v ? (
                <div className="info-item" key={l}>
                  <div className="info-label">{l}</div>
                  <div className={`info-value${l==='Value'?' gold':''}`}>{linkify(v)}</div>
                </div>
              ) : null)}
              {lead.scope && (
                <div className="info-item" style={{ gridColumn: '1/-1' }}>
                  <div className="info-label">Scope of Work</div>
                  <div className="info-value">{linkify(lead.scope)}</div>
                </div>
              )}
            </div>
          )}

          {/* FILES */}
          <div className="files-section">
            <div className="activity-section-title">📎 Files & Documents</div>
            <div className="upload-btn-wrap">
              <button className="upload-btn" onClick={() => fileRef.current?.click()}>
                {uploading ? '⏳ Uploading…' : '📎 Upload Files'}
              </button>
              <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={handleUpload} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" />
            </div>
            {(lead.files || []).length > 0 && (
              <div className="files-grid">
                {lead.files.map(f => {
                  const icon = getFileIcon(f.name);
                  return (
                    <div className="file-card" key={f.id} onClick={() => window.open(f.url, '_blank')}>
                      {icon ? <div className="file-icon">{icon}</div> : <img src={f.url} alt={f.name} className="file-thumb" onError={e => e.target.style.display='none'} />}
                      <div className="file-name">{f.name}</div>
                      <button className="file-delete" onClick={e => { e.stopPropagation(); onDeleteFile(lead, f.id); }}>×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ACTIVITY LOG */}
          <div className="activity-section">
            <div className="activity-section-title">📋 Activity Timeline</div>
            <div className="log-form" style={{ position:'relative' }}>
              <select className="log-type-select" value={actType} onChange={e => setActType(e.target.value)}>
                {ACTIVITY_TYPES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
              <div style={{ flex:1, position:'relative' }}>
                <textarea
                  ref={textareaRef}
                  className="log-textarea"
                  style={{ width:'100%' }}
                  placeholder="Add a note… type @ to mention someone"
                  value={actNote}
                  onChange={handleNoteChange}
                  onKeyDown={e => {
                    if (e.key === 'Escape') setShowMentions(false);
                    if (e.key === 'Enter' && e.ctrlKey) { onActivity(lead, actType, actNote); setActNote(''); setShowMentions(false); }
                  }}
                />
                {/* @mention dropdown */}
                {showMentions && filteredMentions.length > 0 && (
                  <div className="mention-dropdown">
                    <div className="mention-dropdown-header">Tag a team member</div>
                    {filteredMentions.map(u => (
                      <div key={u.id} className="mention-option" onClick={() => insertMention(u.id)}>
                        <div className={`user-avatar ${u.badge}`} style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, flexShrink:0 }}>
                          {u.initials}
                        </div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{u.name}</div>
                          <div style={{ fontSize:11, color:'var(--text-dim)' }}>{u.role}</div>
                        </div>
                        <span style={{ marginLeft:'auto', fontSize:11, color:'var(--gold)' }}>@{u.id}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button className="log-submit" onClick={() => { onActivity(lead, actType, actNote); setActNote(''); setShowMentions(false); }}>Log</button>
            </div>
            <div className="timeline">
              {[...(lead.activities || [])].reverse().map(a => {
                const at = ACTIVITY_TYPES.find(x => x.id === a.type) || ACTIVITY_TYPES[1];
                return (
                  <div className="timeline-item" key={a.id}>
                    <div className={`timeline-icon ${at.cls}`}>{at.label.split(' ')[0]}</div>
                    <div className="timeline-content">
                      <div className="timeline-text">{linkify(a.note)}</div>
                      <div className="timeline-meta">{getUserById(a.by).name} · {timeAgo(a.at)} · {formatDate(a.at)}</div>
                    </div>
                    {a.type !== 'stage' && (
                      <button className="timeline-delete" onClick={() => onDeleteActivity(lead, a.id)}>×</button>
                    )}
                  </div>
                );
              })}
              {!(lead.activities?.length) && <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: '10px 0' }}>No activities yet — log the first one above.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── LEAD FORM ────────────────────────────────────────────────────────────────
function LeadForm({ session, onClose, onSave, initial }) {
  const [form, setForm] = useState({
    name: '', company: '', phone: '', email: '', location: '',
    service: '', source: '', projectRef: '', value: '', scope: '',
    assignedTo: '', stage: 'new',
    ...initial,
  });

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">New Lead</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            {[['name','Client Name *'],['company','Company / Firm'],['phone','Phone Number'],['email','Email'],['location','Project Location'],['projectRef','Project Reference']].map(([k,l]) => (
              <div className="form-group" key={k}>
                <label className="form-label">{l}</label>
                <input className="form-input" value={form[k]} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} />
              </div>
            ))}
            <div className="form-group">
              <label className="form-label">Service Required</label>
              <select className="form-select" value={form.service} onChange={e => setForm(f => ({...f,service:e.target.value}))}>
                <option value="">Select service…</option>
                {SERVICE_TYPES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Source</label>
              <select className="form-select" value={form.source} onChange={e => setForm(f => ({...f,source:e.target.value}))}>
                <option value="">Select source…</option>
                {SOURCES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Estimated Value (AED)</label>
              <input className="form-input" type="number" value={form.value} onChange={e => setForm(f => ({...f,value:e.target.value}))} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="form-label">Assign To</label>
              <select className="form-select" value={form.assignedTo} onChange={e => setForm(f => ({...f,assignedTo:e.target.value}))}>
                <option value="">Unassigned</option>
                {USERS.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
            </div>
            <div className="form-group full">
              <label className="form-label">Scope of Work / Requirements</label>
              <textarea className="form-textarea" rows={4} value={form.scope} onChange={e => setForm(f => ({...f,scope:e.target.value}))} placeholder="Describe the project scope, requirements, and any other relevant details…" />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-save" onClick={() => {
              if (!form.name.trim()) { alert('Client name is required'); return; }
              onSave({ ...form, createdBy: session.userId });
            }}>Save Lead</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── IMPORT MODAL ─────────────────────────────────────────────────────────────
function ImportModal({ onClose, onImport }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef(null);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 500 }}>
        <div className="modal-header">
          <div className="modal-title">📥 Import from Excel / CSV</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div
            className={`import-area${drag ? ' drag-over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) { onImport(f); onClose(); } }}
            onClick={() => ref.current?.click()}
          >
            <div className="import-icon">📊</div>
            <div className="import-text">Drop your Excel or CSV file here</div>
            <div className="import-sub">or click to browse — .xlsx, .xls, .csv supported</div>
            <input ref={ref} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) { onImport(f); onClose(); } }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--gold)' }}>Tips:</strong><br />
            • First row should be column headers (Name, Phone, Email, etc.)<br />
            • System auto-detects common column names<br />
            • Existing leads will not be duplicated — new rows only<br />
            • All imported leads start in "New Inquiry" stage
          </div>
        </div>
      </div>
    </div>
  );
}
