import React, { useState, useEffect, useMemo } from 'react';
import {
  auth,
  db,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from '../../firebase.js';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore';

import {
  LOG_ADMIN_EMAIL,
  dateInputValue,
  dateFromInputValue,
  prettyDate,
  logDate,
  timeText,
  hourKey,
  initials,
  logCredentialName,
  logDoctorCredential,
  logHaystack,
  logActor,
  logActorDetail,
  categoryForLog,
  isGeminiApiLog,
  noteActivityType,
  geminiValue,
  geminiDuration,
  geminiAttempts,
  logMatchesRange,
  logMatchesQuickFilter,
  sameActionText,
  actionTarget,
  titleCaseAction
} from '../../utils/logHelpers.js';

import './log.css';

export default function ActivityLog() {
  const [user, setUser] = useState(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [logs, setLogs] = useState([]);
  const [userProfiles, setUserProfiles] = useState(new Map());
  const [logsLoading, setLogsLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState(dateInputValue(new Date()));
  const [selectedRange, setSelectedRange] = useState('today');
  const [selectedActivityTab, setSelectedActivityTab] = useState('all');
  const [selectedNoteFilter, setSelectedNoteFilter] = useState('all');
  const [selectedQuickFilter, setSelectedQuickFilter] = useState('');

  // 1. Auth State Listener
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setLogs([]);
        setUserProfiles(new Map());
        return;
      }
      const email = String(currentUser.email || '').toLowerCase();
      if (email !== LOG_ADMIN_EMAIL && email !== 'drgigy@gmail.com') {
        signOut(auth).catch(() => {});
        setUser(null);
        setLoginError('This account is not authorized for the activity log.');
        return;
      }
      setUser(currentUser);
      setLoginError('');
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. Real-Time Firestore Data Listeners
  useEffect(() => {
    if (!user) return;

    let unsubLogs = null;
    let unsubUsers = null;

    setLogsLoading(true);

    const logsQuery = query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc'), limit(500));
    unsubLogs = onSnapshot(logsQuery, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(items);
      setLogsLoading(false);
    }, (error) => {
      console.error('Error loading activity logs:', error);
      setLogsLoading(false);
    });

    unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const map = new Map(snapshot.docs.map(doc => [doc.id, doc.data() || {}]));
      setUserProfiles(map);
    }, (error) => {
      console.warn('Unable to load user profile labels:', error);
      setUserProfiles(new Map());
    });

    return () => {
      if (unsubLogs) unsubLogs();
      if (unsubUsers) unsubUsers();
    };
  }, [user]);

  // Login handler
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
      setLoginPassword('');
    } catch (err) {
      setLoginError('Unable to sign in. Check the email and password.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Sign out handler
  const handleSignOut = () => {
    signOut(auth).catch(err => console.error('Signout failed:', err));
  };

  // Date Navigation Helpers
  const handleSetSelectedDate = (val, range = 'today') => {
    setSelectedDate(val);
    setSelectedRange(range);
  };

  const handleMoveSelectedDate = (days) => {
    const d = dateFromInputValue(selectedDate);
    d.setDate(d.getDate() + days);
    handleSetSelectedDate(dateInputValue(d), selectedRange === '7days' ? '7days' : 'today');
  };

  // Filter computations
  const baseDateLogs = useMemo(() => {
    return logs.filter(log => logMatchesRange(log, selectedRange, selectedDate));
  }, [logs, selectedRange, selectedDate]);

  const filteredLogs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return baseDateLogs.filter(log => {
      if (selectedActivityTab === 'gemini' && !isGeminiApiLog(log)) return false;
      if (selectedActivityTab !== 'all' && selectedActivityTab !== 'gemini' && categoryForLog(log) !== selectedActivityTab) return false;
      if (selectedActivityTab === 'notes' && selectedNoteFilter !== 'all' && noteActivityType(log) !== selectedNoteFilter) return false;
      if (!logMatchesQuickFilter(log, selectedQuickFilter)) return false;
      if (term && !logHaystack(log, userProfiles).includes(term)) return false;
      return true;
    });
  }, [baseDateLogs, selectedActivityTab, selectedNoteFilter, selectedQuickFilter, searchTerm, userProfiles]);

  // Stream & Quick counts
  const counts = useMemo(() => {
    const res = { all: baseDateLogs.length, users: 0, notes: 0, admin: 0, master: 0, gemini: 0, signins: 0, failed: 0, last60: 0 };
    baseDateLogs.forEach(log => {
      const category = categoryForLog(log);
      res[category] = (res[category] || 0) + 1;
      if (isGeminiApiLog(log)) res.gemini += 1;
      const action = String(log.action || '').toLowerCase();
      if (action.includes('signed_in') || action.includes('sign')) res.signins += 1;
      if (action.includes('failed') || action.includes('denied') || action.includes('error')) res.failed += 1;
      const date = logDate(log);
      if (date && Date.now() - date.getTime() <= 60 * 60 * 1000) res.last60 += 1;
    });
    return res;
  }, [baseDateLogs]);

  const noteCounts = useMemo(() => {
    const res = { all: 0, visit: 0, discharge: 0, addon: 0 };
    baseDateLogs.forEach(log => {
      if (categoryForLog(log) === 'notes') {
        const type = noteActivityType(log);
        res.all += 1;
        res[type] = (res[type] || 0) + 1;
      }
    });
    return res;
  }, [baseDateLogs]);

  // Summary Card Statistics
  const stats = useMemo(() => {
    const userMap = new Map();
    baseDateLogs.forEach(log => userMap.set(logActor(log, userProfiles), true));
    const last = filteredLogs[0] || baseDateLogs[0];
    const lastDate = last ? logDate(last) : null;

    const eventsSub = selectedActivityTab === 'all'
      ? 'All in Admin stream'
      : `${selectedActivityTab === 'notes' && selectedNoteFilter !== 'all' ? titleCaseAction(selectedNoteFilter) : selectedActivityTab === 'gemini' ? 'Gemini API use' : titleCaseAction(selectedActivityTab)} stream`;

    const uniqueSub = Array.from(userMap.keys()).slice(0, 2).map(val => val.replace(/@.*/, '')).join(' / ') || 'No users yet';
    const lastActivity = lastDate ? timeText(lastDate).replace(/\s/g, ' ') : '--';
    const lastActivitySub = last ? `${sameActionText(last)} / ${last.page || 'log'}` : 'No activity';

    return {
      eventsToday: filteredLogs.length,
      eventsSub,
      uniqueUsers: userMap.size,
      uniqueSub,
      lastActivity,
      lastActivitySub
    };
  }, [baseDateLogs, filteredLogs, selectedActivityTab, selectedNoteFilter, userProfiles]);

  // 24-hour Bars calculation
  const hourBarHeights = useMemo(() => {
    const countsArr = Array(24).fill(0);
    baseDateLogs.forEach(log => {
      const date = logDate(log);
      if (date) countsArr[date.getHours()] += 1;
    });
    const max = Math.max(...countsArr, 1);
    return countsArr.map(c => ({
      count: c,
      height: Math.max(5, Math.round((c / max) * 38))
    }));
  }, [baseDateLogs]);

  // Grouped Timeline by Hour
  const groupedTimeline = useMemo(() => {
    const map = new Map();
    filteredLogs.forEach(log => {
      const key = hourKey(logDate(log));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(log);
    });
    return Array.from(map.entries());
  }, [filteredLogs]);

  // If not authenticated, render Login Card
  if (!user) {
    return (
      <div className="log-app-wrapper">
        <section className="log-login-screen">
          <form className="log-login-card" onSubmit={handleLogin}>
            <div className="log-brand">
              <span className="log-brand-pill">
                <span className="log-brand-dot"></span>WOYZ
              </span>
              <span>Log</span>
            </div>
            <h1>Activity log</h1>
            <p className="log-sub">Activity log admin access only.</p>
            
            <label className="log-label" htmlFor="loginEmail">Email address</label>
            <input
              id="loginEmail"
              className="log-input"
              type="email"
              autoComplete="username"
              required
              value={loginEmail}
              onChange={e => setLoginEmail(e.target.value)}
            />

            <label className="log-label" htmlFor="loginPassword">Password</label>
            <input
              id="loginPassword"
              className="log-input"
              type="password"
              autoComplete="current-password"
              required
              value={loginPassword}
              onChange={e => setLoginPassword(e.target.value)}
            />

            <button className="log-btn primary" type="submit" disabled={loginLoading}>
              {loginLoading ? 'Signing in...' : 'Sign in'}
            </button>

            {loginError && <div className="log-error" role="alert">{loginError}</div>}
          </form>
        </section>
      </div>
    );
  }

  // Authenticated Activity Log Dashboard
  return (
    <div className="log-app-wrapper">
      <div className="log-app-grid">
        {/* Sidebar */}
        <aside className="log-sidebar">
          <div className="log-brand">
            <span className="log-brand-pill">
              <span className="log-brand-dot"></span>WOYZ
            </span>
            <span>Log</span>
          </div>

          <div className="log-search-wrap">
            <input
              className="log-input"
              type="search"
              autoComplete="off"
              placeholder="Search user, UHID..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <span className="log-shortcut">/</span>
          </div>

          <div className="log-side-section">
            <div className="log-side-title">Streams</div>
            
            <button
              className={`log-stream-btn ${selectedActivityTab === 'all' ? 'active' : ''}`}
              type="button"
              onClick={() => setSelectedActivityTab('all')}
            >
              <span className="log-stream-dot"></span>
              <span>All activity</span>
              <span className="log-pill-count">{counts.all}</span>
            </button>

            <button
              className={`log-stream-btn ${selectedActivityTab === 'users' ? 'active' : ''}`}
              type="button"
              data-tab="users"
              onClick={() => setSelectedActivityTab('users')}
            >
              <span className="log-stream-dot"></span>
              <span>Users</span>
              <span className="log-pill-count">{counts.users}</span>
            </button>

            <button
              className={`log-stream-btn ${selectedActivityTab === 'notes' ? 'active' : ''}`}
              type="button"
              data-tab="notes"
              onClick={() => setSelectedActivityTab('notes')}
            >
              <span className="log-stream-dot"></span>
              <span>Notes</span>
              <span className="log-pill-count">{counts.notes}</span>
            </button>

            {/* Note Subfilters */}
            <div className={`log-note-subfilters ${selectedActivityTab === 'notes' ? 'visible' : ''}`}>
              <button
                className={`log-note-filter-btn ${selectedNoteFilter === 'all' ? 'active' : ''}`}
                type="button"
                onClick={() => setSelectedNoteFilter('all')}
              >
                <span>All notes</span>
                <span className="log-pill-count">{noteCounts.all}</span>
              </button>
              <button
                className={`log-note-filter-btn ${selectedNoteFilter === 'visit' ? 'active' : ''}`}
                type="button"
                onClick={() => setSelectedNoteFilter('visit')}
              >
                <span>Visit note</span>
                <span className="log-pill-count">{noteCounts.visit}</span>
              </button>
              <button
                className={`log-note-filter-btn ${selectedNoteFilter === 'discharge' ? 'active' : ''}`}
                type="button"
                onClick={() => setSelectedNoteFilter('discharge')}
              >
                <span>Discharge</span>
                <span className="log-pill-count">{noteCounts.discharge}</span>
              </button>
              <button
                className={`log-note-filter-btn ${selectedNoteFilter === 'addon' ? 'active' : ''}`}
                type="button"
                onClick={() => setSelectedNoteFilter('addon')}
              >
                <span>Add on</span>
                <span className="log-pill-count">{noteCounts.addon}</span>
              </button>
            </div>

            <button
              className={`log-stream-btn ${selectedActivityTab === 'admin' ? 'active' : ''}`}
              type="button"
              data-tab="admin"
              onClick={() => setSelectedActivityTab('admin')}
            >
              <span className="log-stream-dot"></span>
              <span>Admin</span>
              <span className="log-pill-count">{counts.admin}</span>
            </button>

            <button
              className={`log-stream-btn ${selectedActivityTab === 'master' ? 'active' : ''}`}
              type="button"
              data-tab="master"
              onClick={() => setSelectedActivityTab('master')}
            >
              <span className="log-stream-dot"></span>
              <span>Master</span>
              <span className="log-pill-count">{counts.master}</span>
            </button>

            <button
              className={`log-stream-btn ${selectedActivityTab === 'gemini' ? 'active' : ''}`}
              type="button"
              data-tab="gemini"
              onClick={() => setSelectedActivityTab('gemini')}
            >
              <span className="log-stream-dot"></span>
              <span>Gemini API use</span>
              <span className="log-pill-count">{counts.gemini}</span>
            </button>
          </div>

          <div className="log-side-section">
            <div className="log-side-title">Quick filters</div>
            <button
              className={`log-quick-btn ${selectedQuickFilter === 'signins' ? 'active' : ''}`}
              type="button"
              onClick={() => setSelectedQuickFilter(prev => prev === 'signins' ? '' : 'signins')}
            >
              <span>Sign-ins only</span>
              <span className="log-pill-count">{counts.signins}</span>
            </button>
            <button
              className={`log-quick-btn ${selectedQuickFilter === 'failed' ? 'active' : ''}`}
              type="button"
              onClick={() => setSelectedQuickFilter(prev => prev === 'failed' ? '' : 'failed')}
            >
              <span>Failed attempts</span>
              <span className="log-pill-count">{counts.failed}</span>
            </button>
            <button
              className={`log-quick-btn ${selectedQuickFilter === 'last60' ? 'active' : ''}`}
              type="button"
              onClick={() => setSelectedQuickFilter(prev => prev === 'last60' ? '' : 'last60')}
            >
              <span>Last 60 minutes</span>
              <span className="log-pill-count">{counts.last60}</span>
            </button>
          </div>

          <div className="log-sidebar-foot">
            <div className="log-avatar">{initials(user?.email || 'Dr Gigy')}</div>
            <div className="log-user-lines">
              <strong>Log Admin</strong>
              <span>{user?.email || ''}</span>
            </div>
            <button className="log-signout-link" type="button" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <main className="log-content">
          <section className="log-hero">
            <div>
              <h1>Activity log</h1>
              <p className="log-sub">Aster ED / Admin stream <span className="log-live-dot">Live</span></p>
            </div>
            <div className="log-toolbar">
              <div className="log-range-tabs" aria-label="Date range">
                <button
                  className={`log-range-btn ${selectedRange === 'yesterday' ? 'active' : ''}`}
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() - 1);
                    handleSetSelectedDate(dateInputValue(d), 'yesterday');
                  }}
                >
                  Yesterday
                </button>
                <button
                  className={`log-range-btn ${selectedRange === 'today' ? 'active' : ''}`}
                  type="button"
                  onClick={() => handleSetSelectedDate(dateInputValue(new Date()), 'today')}
                >
                  Today
                </button>
                <button
                  className={`log-range-btn ${selectedRange === '7days' ? 'active' : ''}`}
                  type="button"
                  onClick={() => handleSetSelectedDate(dateInputValue(new Date()), '7days')}
                >
                  7 days
                </button>
              </div>

              <div className="log-date-nav" aria-label="Activity log date">
                <button
                  className="log-date-step"
                  type="button"
                  aria-label="Previous date"
                  onClick={() => handleMoveSelectedDate(-1)}
                >
                  &lsaquo;
                </button>
                <span className="log-date-input-wrap">
                  <span className="log-date-label">{prettyDate(selectedDate)}</span>
                  <span className="log-calendar-mark"></span>
                  <input
                    className="log-date-input"
                    type="date"
                    aria-label="Filter by date"
                    value={selectedDate}
                    onChange={e => handleSetSelectedDate(e.target.value || dateInputValue(new Date()), 'today')}
                  />
                </span>
                <button
                  className="log-date-step"
                  type="button"
                  aria-label="Next date"
                  onClick={() => handleMoveSelectedDate(1)}
                >
                  &rsaquo;
                </button>
              </div>

              <button
                className="log-btn dark"
                type="button"
                onClick={() => {
                  setSelectedDate(prev => prev);
                }}
              >
                Refresh
              </button>
            </div>
          </section>

          {/* Summary Cards */}
          <section className="log-summary-grid" aria-label="Activity summary">
            <article className="log-stat-card">
              <div className="log-label">Events today</div>
              <div className="log-stat-number">{stats.eventsToday}</div>
              <div className="log-stat-sub">{stats.eventsSub}</div>
            </article>

            <article className="log-stat-card">
              <div className="log-label">Unique users</div>
              <div className="log-stat-number">{stats.uniqueUsers}</div>
              <div className="log-stat-sub">{stats.uniqueSub}</div>
            </article>

            <article className="log-stat-card">
              <div className="log-label">Last activity</div>
              <div className="log-stat-number">{stats.lastActivity}</div>
              <div className="log-stat-sub">{stats.lastActivitySub}</div>
            </article>

            <article className="log-stat-card">
              <div className="log-label">By hour</div>
              <div className="log-hour-bars">
                {hourBarHeights.map((bar, idx) => (
                  <span
                    key={idx}
                    className={`log-hour-bar ${bar.count > 0 ? 'strong' : ''}`}
                    style={{ height: `${bar.height}px` }}
                    title={`Hour ${idx}:00 - ${bar.count} event(s)`}
                  />
                ))}
              </div>
            </article>
          </section>

          {/* Timeline / Gemini Table Dashboard */}
          <section className="log-dashboard">
            <article className="log-panel log-timeline-panel">
              <div className="log-panel-head">
                <div className="log-panel-title">Timeline</div>
                <div className="log-panel-note">Newest first / duplicates grouped</div>
              </div>

              {groupedTimeline.length === 0 ? (
                <div className="log-empty">
                  {selectedActivityTab === 'gemini' ? 'No Gemini API use found.' : 'No activities found.'}
                </div>
              ) : (
                <div className="log-timeline">
                  {groupedTimeline.map(([hour, group]) => (
                    <section key={hour} className="log-hour-group">
                      <div className="log-hour-label">
                        {hour} - {group.length} {selectedActivityTab === 'gemini' ? (group.length === 1 ? 'API event' : 'API events') : (group.length === 1 ? 'event' : 'events')}
                      </div>

                      <div className="log-gemini-table-wrap">
                        {selectedActivityTab === 'gemini' ? (
                          /* Gemini API Table View */
                          <table className="log-gemini-table">
                            <thead>
                              <tr>
                                <th className="gemini-time">Time</th>
                                <th className="gemini-user">User</th>
                                <th className="gemini-action">Action</th>
                                <th className="gemini-patient">Patient</th>
                                <th className="gemini-uhid">UHID</th>
                                <th className="gemini-duration">Recording</th>
                                <th className="gemini-model">Model</th>
                                <th className="gemini-attempt">Attempt</th>
                                <th className="gemini-doctor">Doctor</th>
                                <th className="gemini-page">Page</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.map(log => {
                                const date = logDate(log);
                                const userActor = logActor(log, userProfiles);
                                const detail = logActorDetail(log, userProfiles);
                                return (
                                  <tr key={log.id}>
                                    <td className="gemini-time">{timeText(date)}</td>
                                    <td className="gemini-user" title={detail}>
                                      {userActor.replace(/@.*/, '') || userActor}
                                    </td>
                                    <td className="gemini-action" title={sameActionText(log)}>
                                      {sameActionText(log)}
                                    </td>
                                    <td className="gemini-patient" title={actionTarget(log)}>
                                      {actionTarget(log)}
                                    </td>
                                    <td className="gemini-uhid" title={log.uhid || ''}>
                                      {geminiValue(log.uhid)}
                                    </td>
                                    <td className="gemini-duration">{geminiDuration(log)}</td>
                                    <td className="gemini-model" title={log.geminiModel || ''}>
                                      {geminiValue(log.geminiModel)}
                                    </td>
                                    <td className="gemini-attempt">{geminiAttempts(log)}</td>
                                    <td className="gemini-doctor" title={logDoctorCredential(log, userProfiles)}>
                                      {logDoctorCredential(log, userProfiles)}
                                    </td>
                                    <td className="gemini-page">{geminiValue(log.page)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        ) : (
                          /* Standard Activity Table View */
                          <table className="log-gemini-table log-activity-table">
                            <thead>
                              <tr>
                                <th className="gemini-time">Time</th>
                                <th className="gemini-user">User</th>
                                <th className="gemini-action">Action</th>
                                <th className="gemini-patient">Patient</th>
                                <th className="gemini-uhid">UHID</th>
                                <th className="gemini-type">Type</th>
                                <th className="gemini-doctor">Doctor</th>
                                <th className="gemini-page">Page</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.map(log => {
                                const category = selectedActivityTab === 'gemini' && isGeminiApiLog(log) ? 'gemini' : categoryForLog(log);
                                const date = logDate(log);
                                const userActor = logActor(log, userProfiles);
                                const detail = logActorDetail(log, userProfiles);
                                return (
                                  <tr key={log.id}>
                                    <td className="gemini-time">{timeText(date)}</td>
                                    <td className="gemini-user" title={detail}>
                                      {userActor.replace(/@.*/, '') || userActor}
                                    </td>
                                    <td className="gemini-action" title={sameActionText(log)}>
                                      {sameActionText(log)}
                                    </td>
                                    <td className="gemini-patient" title={actionTarget(log)}>
                                      {actionTarget(log)}
                                    </td>
                                    <td className="gemini-uhid" title={log.uhid || ''}>
                                      {geminiValue(log.uhid)}
                                    </td>
                                    <td className="gemini-type">
                                      <span className={`log-event-badge ${category}`}>
                                        {category}
                                      </span>
                                    </td>
                                    <td className="gemini-doctor" title={logDoctorCredential(log, userProfiles)}>
                                      {logDoctorCredential(log, userProfiles)}
                                    </td>
                                    <td className="gemini-page">{geminiValue(log.page)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}
