import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3,
  BriefcaseBusiness,
  Download,
  ExternalLink,
  FileClock,
  Folders,
  LayoutDashboard,
  LogOut,
  Plus,
  Save,
  Search,
  SquarePen,
  Trash2
} from 'lucide-react';
import { Sankey, Tooltip, ResponsiveContainer } from 'recharts';
import { hasSupabaseConfig, supabase } from './supabaseClient';
import './styles.css';

const statusOptions = [
  'Saved',
  'Applied',
  'Recruiter Screen',
  'Technical Screen',
  'Hiring Manager Screen',
  'Take Home',
  'Onsite',
  'Final Round',
  'Offer',
  'Accepted',
  'Rejected',
  'Withdrawn',
  'Ghosted',
  'Closed'
];

const statusColors = {
  Saved: '#6b7280',
  Applied: '#2563eb',
  'Recruiter Screen': '#0891b2',
  'Technical Screen': '#7c3aed',
  'Hiring Manager Screen': '#4f46e5',
  'Take Home': '#ca8a04',
  Onsite: '#ea580c',
  'Final Round': '#db2777',
  Offer: '#16a34a',
  Accepted: '#15803d',
  Rejected: '#dc2626',
  Withdrawn: '#64748b',
  Ghosted: '#9333ea',
  Closed: '#334155',
  Unknown: '#475569'
};

const workModes = ['Remote', 'Hybrid', 'In Person', 'Flexible', 'Unknown'];

const employmentTypes = [
  'Full Time',
  'Part Time',
  'Contract',
  'Contract to Hire',
  'Internship',
  'Temporary',
  'Freelance',
  'Apprenticeship',
  'Seasonal',
  'Unknown'
];

const options = {
  statuses: statusOptions,
  workModes,
  employmentTypes,
  today: today()
};

const ALL_GROUP_ID = 'all';

const roleFields = [
  ['role_title', 'Role Title'],
  ['company', 'Company'],
  ['external_link', 'External Link'],
  ['source', 'Source'],
  ['internal_link', 'Internal Link'],
  ['date_posted', 'Date Posted'],
  ['date_applied', 'Date Applied'],
  ['work_mode', 'Work Mode'],
  ['employment_type', 'Employment Type'],
  ['location', 'Location'],
  ['referrer', 'Referrer'],
  ['salary', 'Salary'],
  ['notes', 'Notes']
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function requireFields(row, fields) {
  const missing = fields.filter((field) => !String(row[field] ?? '').trim());
  if (missing.length) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
}

function normalizeOptionalFields(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value ?? '']));
}

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setAuthLoading(false);
      return undefined;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (!hasSupabaseConfig) {
    return <MissingConfig />;
  }

  if (authLoading) {
    return <div className="empty">Loading...</div>;
  }

  if (!session) {
    return <SignIn />;
  }

  return <Tracker session={session} />;
}

function MissingConfig() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>Supabase setup needed</h1>
        <p>Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to your local `.env` file or Vercel environment variables.</p>
      </section>
    </main>
  );
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('sign-in');
  const [message, setMessage] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (mode === 'sign-up') {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage(error.message);
        return;
      }
      if (!data.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        setMessage(signInError ? 'Account created. Check your email if confirmation is enabled.' : '');
      }
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-panel" onSubmit={submit}>
        <div className="brand auth-brand">
          <BarChart3 size={22} />
          <span>Job Tracker</span>
        </div>
        <h1>{mode === 'sign-up' ? 'Create Account' : 'Sign In'}</h1>
        <label className="field">
          <span>Email<b className="required-mark">*</b></span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="field">
          <span>Password<b className="required-mark">*</b></span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength="6" required />
        </label>
        <button className="primary" type="submit">
          <Save size={18} />
          <span>{mode === 'sign-up' ? 'Create Account' : 'Sign In'}</span>
        </button>
        <button className="text-button" type="button" onClick={() => setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up')}>
          {mode === 'sign-up' ? 'Use existing account' : 'Create a new account'}
        </button>
        {message && <div className="notice">{message}</div>}
      </form>
    </main>
  );
}

function Tracker({ session }) {
  const [page, setPage] = useState('dashboard');
  const [data, setData] = useState({ roles: [], statuses: [], roleSummaries: [] });
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(window.localStorage.getItem(`jobtracker-group-${session.user.id}`) || ALL_GROUP_ID);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  async function ensureGroup(existingGroups, requestedGroupId) {
    if (existingGroups.length) {
      return existingGroups.find((group) => group.group_id === requestedGroupId)?.group_id || existingGroups[0].group_id;
    }

    const { data: group, error } = await supabase
      .from('application_groups')
      .insert({ user_id: session.user.id, name: 'Jobs' })
      .select()
      .single();
    if (error) throw error;
    return group.group_id;
  }

  async function loadData(groupId = selectedGroupId) {
    setLoading(true);
    const groupsResult = await supabase
      .from('application_groups')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true });
    if (groupsResult.error) throw groupsResult.error;

    const nextGroups = groupsResult.data || [];
    const activeGroupId = groupId === ALL_GROUP_ID ? ALL_GROUP_ID : await ensureGroup(nextGroups, groupId);
    const activeGroups = nextGroups.length
      ? nextGroups
      : [{ group_id: await ensureGroup(nextGroups, ''), user_id: session.user.id, name: 'Jobs' }];

    if (activeGroupId !== groupId || activeGroupId !== selectedGroupId) {
      setSelectedGroupId(activeGroupId);
      window.localStorage.setItem(`jobtracker-group-${session.user.id}`, activeGroupId);
    }

    setGroups(activeGroups);

    let rolesQuery = supabase
      .from('roles')
      .select('*')
      .eq('user_id', session.user.id)
      .order('date_applied', { ascending: false });
    if (activeGroupId !== ALL_GROUP_ID) {
      rolesQuery = rolesQuery.eq('group_id', activeGroupId);
    }
    const rolesResult = await rolesQuery;

    if (rolesResult.error) throw rolesResult.error;

    const roles = rolesResult.data || [];
    const roleIds = roles.map((role) => role.role_id);
    const statusesResult = roleIds.length
      ? await supabase
          .from('status_history')
          .select('*')
          .eq('user_id', session.user.id)
          .in('role_id', roleIds)
          .order('changed_at', { ascending: true })
      : { data: [], error: null };
    if (statusesResult.error) throw statusesResult.error;

    const statuses = statusesResult.data || [];
    setData({
      roles,
      statuses,
      roleSummaries: summarizeRoles(roles, statuses)
    });
    setLoading(false);
  }

  useEffect(() => {
    loadData().catch((error) => {
      setMessage(error.message || 'Could not load tracker data.');
      setLoading(false);
    });
  }, []);

  async function changeGroup(groupId) {
    try {
      setSelectedGroupId(groupId);
      window.localStorage.setItem(`jobtracker-group-${session.user.id}`, groupId);
      await loadData(groupId);
    } catch (error) {
      setMessage(error.message || 'Could not switch application group.');
      setLoading(false);
    }
  }

  async function createGroup(name, notes = '') {
    try {
      const { data: group, error } = await supabase
        .from('application_groups')
        .insert({ user_id: session.user.id, name: name.trim(), notes: notes ?? '' })
        .select()
        .single();
      if (error) throw error;
      setGroups((current) => [...current, group]);
      await changeGroup(group.group_id);
      setMessage('Application group created.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function editGroup(groupId, field, value) {
    try {
      const { error } = await supabase
        .from('application_groups')
        .update({ [field]: value })
        .eq('group_id', groupId);
      if (error) throw error;
      setMessage('Application group updated.');
      await loadData(selectedGroupId);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteGroup(groupId, name) {
    if (groups.length <= 1) {
      setMessage('At least one application group must exist.');
      return;
    }
    if (!window.confirm(`Delete the "${name}" application group? Its roles will remain visible in All.`)) {
      return;
    }
    try {
      const { error } = await supabase.from('application_groups').delete().eq('group_id', groupId);
      if (error) throw error;
      setMessage('Application group deleted.');
      await changeGroup(selectedGroupId === groupId ? ALL_GROUP_ID : selectedGroupId);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function signOut() {
    if (!window.confirm('Are you sure you want to log out?')) {
      return;
    }
    await supabase.auth.signOut();
  }

  const navSections = [
    { heading: 'Dashboard', pages: [{ id: 'dashboard', label: 'Sankey', icon: LayoutDashboard }] },
    {
      heading: 'Roles',
      pages: [
        { id: 'new-role', label: 'New Role', icon: Plus },
        { id: 'roles', label: 'Roles', icon: BriefcaseBusiness }
      ]
    },
    {
      heading: 'Status',
      pages: [
        { id: 'update-status', label: 'Update Status', icon: SquarePen },
        { id: 'statuses', label: 'Status', icon: FileClock }
      ]
    }
  ];
  const pages = [...navSections.flatMap((section) => section.pages), { id: 'groups', label: 'Groups', icon: Folders }];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <BarChart3 size={22} />
          <span>Job Tracker</span>
        </div>
        <nav>
          {navSections.map((section) => (
            <div className="nav-section" key={section.heading}>
              <div className="nav-heading">{section.heading}</div>
              {section.pages.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    className={page === item.id ? 'nav-item active' : 'nav-item'}
                    key={item.id}
                    onClick={() => {
                      setMessage('');
                      setPage(item.id);
                    }}
                    type="button"
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="group-switcher">
          <div className="nav-heading">Application Group</div>
          <select value={selectedGroupId} onChange={(event) => changeGroup(event.target.value)}>
            <option value={ALL_GROUP_ID}>All</option>
            {groups.map((group) => (
              <option key={group.group_id} value={group.group_id}>
                {group.name}
              </option>
            ))}
          </select>
          <button
            className={page === 'groups' ? 'group-manager-button active' : 'group-manager-button'}
            type="button"
            onClick={() => {
              setMessage('');
              setPage('groups');
            }}
          >
            <Folders size={16} />
            <span>Manage Groups</span>
          </button>
        </div>
      </aside>
      <main className="content">
        <header className="topbar">
          <div>
            <h1>{pages.find((item) => item.id === page)?.label}</h1>
            <p>{data.roles.length} roles · {data.statuses.length} status events · {session.user.email}</p>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" onClick={signOut} title="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        {message && (
          <div className="notice">
            <span>{message}</span>
            <button className="notice-close" type="button" onClick={() => setMessage('')} aria-label="Dismiss message">
              x
            </button>
          </div>
        )}
        {loading ? (
          <div className="empty">Loading tracker data...</div>
        ) : (
          <>
            {page === 'dashboard' && <Dashboard data={data} />}
            {page === 'new-role' && <NewRole user={session.user} groupId={selectedGroupId === ALL_GROUP_ID ? null : selectedGroupId} onSaved={loadData} setMessage={setMessage} />}
            {page === 'update-status' && <UpdateStatus user={session.user} data={data} onSaved={loadData} setMessage={setMessage} />}
            {page === 'roles' && <RolesTable data={data} onSaved={loadData} setMessage={setMessage} />}
            {page === 'statuses' && <StatusTable data={data} user={session.user} onSaved={loadData} setMessage={setMessage} />}
            {page === 'groups' && <GroupsManager groups={groups} onAdd={createGroup} onEdit={editGroup} onDelete={deleteGroup} />}
          </>
        )}
      </main>
    </div>
  );
}

function summarizeRoles(roles, statuses) {
  const latest = statuses.reduce((map, status) => {
    const current = map.get(status.role_id);
    const isNewerDate = current && status.changed_at > current.changed_at;
    const isSameDateNewerEvent = current && status.changed_at === current.changed_at && status.created_at > current.created_at;
    if (!current || isNewerDate || isSameDateNewerEvent) {
      map.set(status.role_id, status);
    }
    return map;
  }, new Map());

  return roles.map((role) => {
    const status = latest.get(role.role_id);
    return {
      ...role,
      current_status: status?.status || '',
      current_status_label: status?.status || 'No Status',
      status_updated_at: status?.changed_at || '',
      status_notes: status?.notes || ''
    };
  });
}

function Dashboard({ data }) {
  const metrics = useMemo(() => {
    return [
      ['Roles', data.roles.length],
      ['Interviews', data.statuses.filter((event) => event.status.includes('Screen') || event.status.includes('Onsite')).length],
      ['Offers', data.statuses.filter((event) => event.status === 'Offer').length]
    ];
  }, [data]);

  const sankey = useMemo(() => buildSankey(data.statuses), [data.statuses]);

  return (
    <section className="page-stack">
      <div className="metric-grid">
        {metrics.map(([label, value]) => (
          <div className="metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="panel chart-panel">
        {sankey.links.length ? (
          <ResponsiveContainer width="100%" height={460}>
            <Sankey
              data={sankey}
              node={<SankeyNode />}
              link={<SankeyLink />}
              nodePadding={26}
              nodeWidth={14}
              margin={{ top: 24, right: 160, bottom: 24, left: 32 }}
            >
              <Tooltip />
            </Sankey>
          </ResponsiveContainer>
        ) : (
          <div className="empty">Add status changes to build the Sankey flow.</div>
        )}
      </div>
    </section>
  );
}

function buildSankey(statuses) {
  const byRole = statuses.reduce((acc, event) => {
    acc[event.role_id] = acc[event.role_id] || [];
    acc[event.role_id].push(event);
    return acc;
  }, {});
  const linkCounts = new Map();
  Object.values(byRole).forEach((events) => {
    events
      .slice()
      .sort((a, b) => a.changed_at.localeCompare(b.changed_at))
      .forEach((event, index, sorted) => {
        if (index === 0) return;
        const from = sorted[index - 1].status || 'Unknown';
        const to = event.status || 'Unknown';
        const key = `${from}:::${to}`;
        linkCounts.set(key, (linkCounts.get(key) || 0) + 1);
      });
  });
  const names = Array.from(new Set(Array.from(linkCounts.keys()).flatMap((key) => key.split(':::'))));
  const nodes = names.map((name) => ({ name, fill: colorForStatus(name) }));
  const indexByName = new Map(names.map((name, index) => [name, index]));
  const links = Array.from(linkCounts.entries()).map(([key, value]) => {
    const [source, target] = key.split(':::');
    return { source: indexByName.get(source), target: indexByName.get(target), value, fill: colorForStatus(source) };
  });
  return { nodes, links };
}

function colorForStatus(status) {
  return statusColors[status] || statusColors.Unknown;
}

function SankeyNode(props) {
  const { x, y, width, height, payload } = props;
  const labelX = x + width + 8;
  const labelY = y + height / 2;

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4} fill={payload.fill} />
      <text className="sankey-label" x={labelX} y={labelY} dominantBaseline="middle">
        {payload.name}
      </text>
    </g>
  );
}

function SankeyLink(props) {
  const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload } = props;
  const path = `
    M${sourceX},${sourceY}
    C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}
  `;

  return <path d={path} stroke={payload.fill} strokeWidth={Math.max(1, linkWidth)} fill="none" opacity={0.36} />;
}

function NewRole({ user, groupId, onSaved, setMessage }) {
  const [form, setForm] = useState({
    role_title: '',
    company: '',
    external_link: '',
    source: '',
    internal_link: '',
    date_posted: options.today,
    date_applied: options.today,
    work_mode: 'In Person',
    employment_type: 'Full Time',
    location: '',
    referrer: '',
    salary: '',
    notes: '',
    initial_status: 'Applied',
    status_notes: ''
  });

  async function submit(event) {
    event.preventDefault();
    try {
      requireFields(form, ['role_title', 'company', 'date_applied']);
      const rolePayload = normalizeOptionalFields({
        user_id: user.id,
        group_id: groupId,
        role_title: form.role_title,
        company: form.company,
        external_link: form.external_link,
        source: form.source,
        internal_link: form.internal_link,
        date_posted: form.date_posted || options.today,
        date_applied: form.date_applied,
        work_mode: form.work_mode,
        employment_type: form.employment_type,
        location: form.location,
        referrer: form.referrer,
        salary: form.salary,
        notes: form.notes
      });
      const { data: role, error: roleError } = await supabase.from('roles').insert(rolePayload).select().single();
      if (roleError) throw roleError;

      const statusPayload = {
        user_id: user.id,
        role_id: role.role_id,
        status: form.initial_status || 'Applied',
        changed_at: form.date_applied,
        notes: form.status_notes || ''
      };
      const { error: statusError } = await supabase.from('status_history').insert(statusPayload);
      if (statusError) throw statusError;

      setMessage('Role created.');
      setForm((current) => ({
        ...current,
        role_title: '',
        company: '',
        external_link: '',
        source: '',
        internal_link: '',
        location: '',
        referrer: '',
        salary: '',
        notes: '',
        status_notes: ''
      }));
      await onSaved();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <form className="form-grid single-column" onSubmit={submit}>
      <TextInput label="Role Title" value={form.role_title} onChange={(value) => setForm({ ...form, role_title: value })} required />
      <TextInput label="Company" value={form.company} onChange={(value) => setForm({ ...form, company: value })} required />
      <TextInput label="External Link" value={form.external_link} onChange={(value) => setForm({ ...form, external_link: value })} />
      <TextInput label="Source" value={form.source} onChange={(value) => setForm({ ...form, source: value })} />
      <TextInput label="Internal Link" value={form.internal_link} onChange={(value) => setForm({ ...form, internal_link: value })} />
      <TextInput type="date" label="Date Posted" value={form.date_posted} onChange={(value) => setForm({ ...form, date_posted: value })} />
      <TextInput type="date" label="Date Applied" value={form.date_applied} onChange={(value) => setForm({ ...form, date_applied: value })} required />
      <SelectInput label="Work Mode" value={form.work_mode} options={options.workModes} onChange={(value) => setForm({ ...form, work_mode: value })} />
      <SelectInput label="Employment Type" value={form.employment_type} options={options.employmentTypes} onChange={(value) => setForm({ ...form, employment_type: value })} />
      <TextInput label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
      <TextInput label="Referrer" value={form.referrer} onChange={(value) => setForm({ ...form, referrer: value })} />
      <TextInput label="Salary" value={form.salary} onChange={(value) => setForm({ ...form, salary: value })} />
      <SelectInput label="Initial Status" value={form.initial_status} options={options.statuses} onChange={(value) => setForm({ ...form, initial_status: value })} />
      <TextArea label="Role Notes" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
      <TextArea label="Status Notes" value={form.status_notes} onChange={(value) => setForm({ ...form, status_notes: value })} />
      <div className="form-actions">
        <button className="primary" type="submit">
          <Save size={18} />
          <span>Create Role</span>
        </button>
      </div>
    </form>
  );
}

function UpdateStatus({ user, data, onSaved, setMessage }) {
  const [form, setForm] = useState({ role_id: '', status: 'Applied', changed_at: options.today, notes: '' });
  const [roleQuery, setRoleQuery] = useState('');

  async function submit(event) {
    event.preventDefault();
    try {
      requireFields(form, ['role_id', 'status', 'changed_at']);
      const { error } = await supabase.from('status_history').insert({
        user_id: user.id,
        role_id: form.role_id,
        status: form.status,
        changed_at: form.changed_at,
        notes: form.notes || ''
      });
      if (error) throw error;
      setMessage('Status event added.');
      setForm({ ...form, role_id: '', notes: '' });
      setRoleQuery('');
      await onSaved();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <form className="form-grid narrow" onSubmit={submit}>
      <RolePicker roles={data.roles} query={roleQuery} setQuery={setRoleQuery} value={form.role_id} onChange={(value) => setForm({ ...form, role_id: value })} />
      <SelectInput label="Status" value={form.status} options={options.statuses} onChange={(value) => setForm({ ...form, status: value })} required />
      <TextInput type="date" label="Changed At" value={form.changed_at} onChange={(value) => setForm({ ...form, changed_at: value })} required />
      <TextArea label="Notes" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
      <div className="form-actions">
        <button className="primary" type="submit">
          <Save size={18} />
          <span>Add Status</span>
        </button>
      </div>
    </form>
  );
}

function RolePicker({ roles, query, setQuery, value, onChange }) {
  const selected = roles.find((role) => role.role_id === value);
  const matches = query ? fuzzyRoleMatches(roles, query).slice(0, 8) : [];
  const showMenu = Boolean(query && !selected);

  return (
    <div className="field role-picker">
      <span>Role<b className="required-mark">*</b></span>
      <input
        className={showMenu ? 'menu-open' : ''}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange('');
        }}
        placeholder="Search company, role, location, work mode, or type"
      />
      <input className="sr-only" tabIndex="-1" value={value} onChange={() => {}} required />
      {showMenu && (
        <div className="role-results">
          {matches.length ? (
            matches.map((role) => (
              <button
                className="role-result"
                key={role.role_id}
                type="button"
                onClick={() => {
                  onChange(role.role_id);
                  setQuery(`${role.company} ${role.role_title}`);
                }}
              >
                <strong>{role.company} · {role.role_title}</strong>
                <span>{[role.location, role.source, role.date_applied].filter(Boolean).join(' · ')}</span>
              </button>
            ))
          ) : (
            <div className="role-empty">No matching roles</div>
          )}
        </div>
      )}
    </div>
  );
}

function fuzzyRoleMatches(roles, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) {
    return roles.slice().sort((a, b) => (b.date_applied || '').localeCompare(a.date_applied || ''));
  }

  return roles
    .map((role) => {
      const haystack = [role.company, role.role_title, role.location, role.work_mode, role.employment_type]
        .join(' ')
        .toLowerCase();
      const score = terms.reduce((total, term) => {
        if (haystack.includes(term)) return total + 3;
        if (fuzzyIncludes(haystack, term)) return total + 1;
        return total;
      }, 0);
      return { role, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (b.role.date_applied || '').localeCompare(a.role.date_applied || ''))
    .map(({ role }) => role);
}

function fuzzyIncludes(text, term) {
  let index = 0;
  for (const char of text) {
    if (char === term[index]) index += 1;
    if (index === term.length) return true;
  }
  return false;
}

function RolesTable({ data, onSaved, setMessage }) {
  const [query, setQuery] = useState('');
  const rows = data.roleSummaries.filter((role) =>
    `${role.company} ${role.role_title} ${role.current_status} ${role.source}`.toLowerCase().includes(query.toLowerCase())
  );

  async function update(roleId, field, value) {
    try {
      const next = { [field]: value };
      const current = data.roles.find((role) => role.role_id === roleId);
      requireFields({ ...current, ...next }, ['role_title', 'company', 'date_applied']);
      const { error } = await supabase.from('roles').update(next).eq('role_id', roleId);
      if (error) throw error;
      setMessage('Role updated.');
      await onSaved();
    } catch (error) {
      setMessage(error.message);
      await onSaved();
    }
  }

  async function remove(roleId) {
    const role = data.roles.find((item) => item.role_id === roleId);
    if (!window.confirm(`Delete ${role?.company || 'this company'} · ${role?.role_title || 'this role'} and all status history?`)) {
      return;
    }
    try {
      const { error } = await supabase.from('roles').delete().eq('role_id', roleId);
      if (error) throw error;
      setMessage('Role deleted.');
      await onSaved();
    } catch (error) {
      setMessage(error.message);
      await onSaved();
    }
  }

  return (
    <EditableTable
      query={query}
      setQuery={setQuery}
      rows={rows}
      columns={[
        ['current_status_label', 'Current Status', 'readonly'],
        ...roleFields.map(([key, label]) => [key, label, key === 'work_mode' ? options.workModes : key === 'employment_type' ? options.employmentTypes : null])
      ]}
      idField="role_id"
      onUpdate={update}
      onDelete={remove}
      exportName="roles.csv"
      exportRows={rows}
      exportColumns={[...roleFields.map(([key]) => key), 'current_status', 'status_updated_at', 'status_notes']}
    />
  );
}

function StatusTable({ data, user, onSaved, setMessage }) {
  const [query, setQuery] = useState('');
  const labels = new Map(roleOptions(data.roles).map((role) => [role.value, role.label]));
  const rows = data.statuses
    .map((status) => ({ ...status, role_label: labels.get(status.role_id) || status.role_id }))
    .filter((status) => `${status.role_label} ${status.status} ${status.notes}`.toLowerCase().includes(query.toLowerCase()));

  async function update(eventId, field, value) {
    try {
      const next = { [field]: value };
      const current = data.statuses.find((status) => status.event_id === eventId);
      requireFields({ ...current, ...next, user_id: user.id }, ['role_id', 'status', 'changed_at']);
      const { error } = await supabase.from('status_history').update(next).eq('event_id', eventId);
      if (error) throw error;
      setMessage('Status event updated.');
      await onSaved();
    } catch (error) {
      setMessage(error.message);
      await onSaved();
    }
  }

  async function remove(eventId) {
    if (!window.confirm('Delete this status event?')) {
      return;
    }
    try {
      const { error } = await supabase.from('status_history').delete().eq('event_id', eventId);
      if (error) throw error;
      setMessage('Status event deleted.');
      await onSaved();
    } catch (error) {
      setMessage(error.message);
      await onSaved();
    }
  }

  return (
    <EditableTable
      query={query}
      setQuery={setQuery}
      rows={rows}
      columns={[
        ['role_id', 'Role', roleOptions(data.roles)],
        ['status', 'Status', options.statuses],
        ['changed_at', 'Changed At', 'date'],
        ['notes', 'Notes', null]
      ]}
      idField="event_id"
      onUpdate={update}
      onDelete={remove}
      exportName="status_history.csv"
      exportRows={rows}
      exportColumns={['event_id', 'role_id', 'status', 'changed_at', 'notes']}
    />
  );
}

function roleOptions(roles) {
  return roles.map((role) => ({ value: role.role_id, label: `${role.company} · ${role.role_title}` }));
}

function GroupModal({ title, submitLabel, initialName = '', initialNotes = '', onClose, onSubmit }) {
  const [form, setForm] = useState({ name: initialName, notes: initialNotes });

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    await onSubmit(form.name, form.notes);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <form onSubmit={submit}>
          <label className="field">
            <span>Name<b className="required-mark">*</b></span>
            <input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Summer 2025" required />
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows="3" placeholder="Optional notes about this group" />
          </label>
          <div className="modal-actions">
            <button className="secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="primary" type="submit">{submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GroupsManager({ groups, onAdd, onEdit, onDelete }) {
  const [addOpen, setAddOpen] = useState(false);

  function saveIfChanged(group, field, value) {
    const prev = String(group[field] ?? '');
    if (value === prev) return;
    if (field === 'name' && !value.trim()) return;
    onEdit(group.group_id, field, value);
  }

  return (
    <section className="panel table-panel">
      <div className="table-tools">
        <button className="primary" type="button" onClick={() => setAddOpen(true)}>
          <Plus size={18} />
          <span>Add Group</span>
        </button>
      </div>
      {addOpen && (
        <GroupModal
          title="New Group"
          submitLabel="Create"
          onClose={() => setAddOpen(false)}
          onSubmit={async (name, notes) => {
            await onAdd(name, notes);
            setAddOpen(false);
          }}
        />
      )}
      <div className="table-wrap">
        <table className="groups-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Notes</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.group_id}>
                <td>
                  <input
                    defaultValue={group.name}
                    onBlur={(event) => saveIfChanged(group, 'name', event.target.value.trim())}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
                  />
                </td>
                <td>
                  <input
                    defaultValue={group.notes || ''}
                    placeholder="—"
                    onBlur={(event) => saveIfChanged(group, 'notes', event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
                  />
                </td>
                <td>{group.created_at?.slice(0, 10) || ''}</td>
                <td className="row-action-cell">
                  <button className="danger-row-button" type="button" onClick={() => onDelete(group.group_id, group.name)} title="Delete">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EditableTable({ rows, columns, idField, onUpdate, onDelete, query, setQuery, exportRows, exportColumns, exportName }) {
  function saveIfChanged(row, key, value) {
    const previous = String(row[key] ?? '');
    const next = String(value ?? '');
    if (previous === next) {
      return;
    }
    onUpdate(row[idField], key, value);
  }

  return (
    <section className="panel table-panel">
      <div className="table-tools">
        <label className="search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
        </label>
        <button className="secondary" type="button" onClick={() => downloadCsv(exportName, exportRows, exportColumns)}>
          <Download size={18} />
          <span>CSV</span>
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map(([, label]) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[idField]}>
                {columns.map(([key, label, type]) => (
                  <td key={`${row[idField]}-${key}`}>
                    {type === 'readonly' ? (
                      linkValue(key, row[key])
                    ) : Array.isArray(type) ? (
                      <select
                        defaultValue={row[key]}
                        onBlur={(event) => saveIfChanged(row, key, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            saveIfChanged(row, key, event.currentTarget.value);
                            event.currentTarget.blur();
                          }
                        }}
                      >
                        {normalizeOptions(type).map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={type === 'date' || label.startsWith('Date') ? 'date' : 'text'}
                        defaultValue={row[key] || ''}
                        onBlur={(event) => saveIfChanged(row, key, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            saveIfChanged(row, key, event.currentTarget.value);
                            event.currentTarget.blur();
                          }
                        }}
                      />
                    )}
                  </td>
                ))}
                {onDelete && (
                  <td className="row-action-cell">
                    <button className="danger-row-button" type="button" onClick={() => onDelete(row[idField])} title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function normalizeOptions(items) {
  return items.map((item) => (typeof item === 'string' ? { value: item, label: item } : item));
}

function downloadCsv(filename, rows, columns) {
  const csvRows = [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => csvValue(row[column])).join(','))
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvValue(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function linkValue(key, value) {
  if (!value) return '';
  if (key.includes('link')) {
    return (
      <a href={value} target="_blank" rel="noreferrer">
        <ExternalLink size={16} />
      </a>
    );
  }
  return value;
}

function TextInput({ label, value, onChange, type = 'text', required = false }) {
  return (
    <label className="field">
      <span>{label}{required && <b className="required-mark">*</b>}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </label>
  );
}

function SelectInput({ label, value, options: selectOptions, onChange, required = false }) {
  return (
    <label className="field">
      <span>{label}{required && <b className="required-mark">*</b>}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} required={required}>
        <option value="">Select</option>
        {normalizeOptions(selectOptions).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextArea({ label, value, onChange }) {
  return (
    <label className="field wide">
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows="4" />
    </label>
  );
}

createRoot(document.getElementById('root')).render(<App />);
