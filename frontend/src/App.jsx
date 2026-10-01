import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  auth,
  db,
  onAuthStateChanged,
  setDoc,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  collection,
  collectionGroup,
  MASTER_ADMIN_UID,
  MASTER_ADMIN_EMAIL
} from './firebase.js';

import {
  dateInputValue,
  noteVisitType,
  notePatientName,
  userLabel,
  noteOwnerCode,
  isSavedNote,
  isReviewedNote,
  patientTimelineKey,
  isStandaloneDocumentNote,
  timelineEntryKey,
  extractPatientFromNote,
  reviewedStatusPatch,
  safeLogActivity,
  noteLogPayload,
  adminClipboardPayloadForNote
} from './utils/noteHelpers.js';

import LoginScreen from './components/LoginScreen.jsx';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import NoteEditor from './components/NoteEditor.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [currentAdminUid, setCurrentAdminUid] = useState(null);
  const [blockedMessage, setBlockedMessage] = useState('');
  
  const [allNotes, setAllNotes] = useState([]);
  const [userProfiles, setUserProfiles] = useState({});
  const [scopedOwnerIds, setScopedOwnerIds] = useState([]);
  const [emptyStateInfo, setEmptyStateInfo] = useState({ title: '', message: '' });

  const [selectedVisitDate, setSelectedVisitDate] = useState(new Date());
  const [selectedVisitType, setSelectedVisitType] = useState('OP');
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [selectedTimelineEntryId, setSelectedTimelineEntryId] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [copyStatus, setCopyStatus] = useState('Copy note');
  const [isReviewing, setIsReviewing] = useState(false);

  // Authentication & Data Subscription Effect
  useEffect(() => {
    let notesUnsub = null;
    let profilesUnsub = null;
    let profileUnsubs = [];
    let noteUnsubs = [];

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      // Clean up previous listeners
      if (notesUnsub) notesUnsub();
      if (profilesUnsub) profilesUnsub();
      profileUnsubs.forEach(u => u());
      noteUnsubs.forEach(u => u());
      profileUnsubs = [];
      noteUnsubs = [];

      setAllNotes([]);
      setUserProfiles({});
      setSelectedUserId(null);
      setSelectedNoteId(null);
      setEmptyStateInfo({ title: '', message: '' });
      setBlockedMessage('');

      setUser(currentUser);
      setCurrentAdminUid(currentUser?.uid || null);

      if (!currentUser) return;

      const isMaster = currentUser.uid === MASTER_ADMIN_UID || String(currentUser.email || '').toLowerCase() === MASTER_ADMIN_EMAIL;

      if (isMaster) {
        setDoc(doc(db, 'users', currentUser.uid), {
          email: currentUser.email || '',
          emailUpdatedAt: serverTimestamp()
        }, { merge: true }).catch(err => console.warn('Unable to update admin email:', err));

        safeLogActivity('admin_signed_in');

        // Master admin: subscribe to all profiles & all notes
        profilesUnsub = onSnapshot(collection(db, 'users'), (snapshot) => {
          const profiles = Object.fromEntries(snapshot.docs.map(d => [d.id, d.data()]));
          setUserProfiles(profiles);
        }, err => console.error(err));

        notesUnsub = onSnapshot(collectionGroup(db, 'notes'), (snapshot) => {
          const fetchedNotes = snapshot.docs.map(d => {
            const userId = d.ref.parent.parent?.id || 'unknown';
            return {
              id: d.id,
              path: d.ref.path,
              userId,
              userLabel: '',
              data: d.data()
            };
          });
          setAllNotes(fetchedNotes);
        }, err => {
          console.error(err);
          setEmptyStateInfo({ title: 'Unable to load notes', message: err.message || 'Check admin permissions and Firestore rules.' });
        });
      } else {
        // Scoped admin
        const profileRef = doc(db, 'users', currentUser.uid);
        try {
          await setDoc(profileRef, {
            email: currentUser.email || '',
            emailUpdatedAt: serverTimestamp()
          }, { merge: true });

          const snapshot = await getDoc(profileRef);
          const profile = snapshot.data() || {};
          const ownerIds = Array.from(new Set([...(profile.sharedWith || []), ...(profile.adminSharedWith || [])]));
          const adminGroupIds = Array.isArray(profile.adminGroupIds) ? profile.adminGroupIds : [];

          if (!ownerIds.length && !adminGroupIds.length) {
            setUser(null);
            setBlockedMessage('This account is not assigned to any admin group. Please add it in Master Admin.');
            return;
          }

          safeLogActivity('admin_signed_in');
          setScopedOwnerIds(ownerIds);

          const notesByOwner = new Map();
          ownerIds.forEach(ownerId => {
            profileUnsubs.push(onSnapshot(doc(db, 'users', ownerId), (pSnap) => {
              setUserProfiles(prev => ({ ...prev, [ownerId]: pSnap.data() || {} }));
            }, err => console.error(err)));

            noteUnsubs.push(onSnapshot(collection(db, 'users', ownerId, 'notes'), (nSnap) => {
              notesByOwner.set(ownerId, nSnap.docs.map(noteDoc => ({
                id: noteDoc.id,
                path: noteDoc.ref.path,
                userId: ownerId,
                userLabel: '',
                data: noteDoc.data()
              })));
              setAllNotes(Array.from(notesByOwner.values()).flat());
            }, err => {
              console.error(err);
              notesByOwner.set(ownerId, []);
              setAllNotes(Array.from(notesByOwner.values()).flat());
            }));
          });
        } catch (error) {
          console.error(error);
          setUser(null);
          setBlockedMessage('Unable to check admin access. Please try again.');
        }
      }
    });

    return () => {
      unsubscribeAuth();
      if (notesUnsub) notesUnsub();
      if (profilesUnsub) profilesUnsub();
      profileUnsubs.forEach(u => u());
      noteUnsubs.forEach(u => u());
    };
  }, []);

  // Filter notes by visit date & non-deleted
  const visibleNotes = useMemo(() => {
    const dateStr = dateInputValue(selectedVisitDate);
    return allNotes
      .filter(note => note.data?.deleted !== true)
      .filter(note => noteVisitType(note) === 'OP' && note.data?.visitDate === dateStr);
  }, [allNotes, selectedVisitDate]);

  // Filter notes by search query
  const filteredNotes = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return visibleNotes;
    return visibleNotes.filter(note => {
      const patient = note.data?.patientData || {};
      const haystack = [
        notePatientName(note),
        patient.uhid,
        note.data?.uhid,
        patient.age,
        patient.sex,
        userLabel(note.userId, 0, userProfiles),
        noteOwnerCode(note, userProfiles, userLabel(note.userId, 0, userProfiles))
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [visibleNotes, searchTerm, userProfiles]);

  // Total unique mapped users
  const totalUsersCount = useMemo(() => {
    const ids = new Set(visibleNotes.map(n => n.userId));
    return ids.size;
  }, [visibleNotes]);

  // Keep selectedUserId & selectedNoteId in sync with filtered notes
  useEffect(() => {
    if (!filteredNotes.length) {
      setSelectedUserId(null);
      setSelectedNoteId(null);
      return;
    }
    const exists = filteredNotes.some(n => n.id === selectedNoteId && n.userId === selectedUserId);
    if (!exists) {
      setSelectedUserId(filteredNotes[0].userId);
      setSelectedNoteId(filteredNotes[0].id);
      setSelectedTimelineEntryId('all');
    }
  }, [filteredNotes, selectedUserId, selectedNoteId]);

  // Selected note object
  const selectedAdminNote = useMemo(() => {
    return allNotes.find(item => item.id === selectedNoteId && item.userId === selectedUserId) || null;
  }, [allNotes, selectedNoteId, selectedUserId]);

  // Timeline notes for the patient
  const timelineNotes = useMemo(() => {
    if (!selectedAdminNote) return [];
    const key = patientTimelineKey(selectedAdminNote);
    const notes = allNotes
      .filter(note => note.data?.deleted !== true)
      .filter(note => noteVisitType(note) === noteVisitType(selectedAdminNote))
      .filter(note => patientTimelineKey(note) === key)
      .filter(note => !isStandaloneDocumentNote(note) || timelineEntryKey(note) === timelineEntryKey(selectedAdminNote));

    if (notes.length <= 1) return notes;
    const first = notes[0];
    const rest = notes.slice(1).sort((a, b) => {
      const tA = b.data?.updatedAt?.toMillis?.() || 0;
      const tB = a.data?.updatedAt?.toMillis?.() || 0;
      return tA - tB;
    });
    return [first, ...rest];
  }, [allNotes, selectedAdminNote]);

  // Active note in single-entry view
  const selectedTimelineNote = useMemo(() => {
    if (selectedTimelineEntryId === 'all') return selectedAdminNote;
    return allNotes.find(n => timelineEntryKey(n) === selectedTimelineEntryId) || selectedAdminNote;
  }, [allNotes, selectedTimelineEntryId, selectedAdminNote]);

  // Handle Date Navigation
  const handleMoveDate = (days) => {
    const next = new Date(selectedVisitDate);
    next.setDate(next.getDate() + days);
    setSelectedVisitDate(next);
    setSelectedUserId(null);
    setSelectedNoteId(null);
    setSelectedTimelineEntryId('all');
  };

  const handleSelectDateValue = (val) => {
    const [year, month, day] = String(val || '').split('-').map(Number);
    if (year && month && day) {
      setSelectedVisitDate(new Date(year, month - 1, day));
      setSelectedUserId(null);
      setSelectedNoteId(null);
      setSelectedTimelineEntryId('all');
    }
  };

  const handleTodayClick = () => {
    setSelectedVisitDate(new Date());
    setSelectedUserId(null);
    setSelectedNoteId(null);
    setSelectedTimelineEntryId('all');
  };

  // Helper to get text from all DOM editor instances
  const getAllEditorsText = useCallback(() => {
    const editors = Array.from(document.querySelectorAll('.note-editor'));
    if (!editors.length) return '';
    return editors.map(el => el.innerText || el.textContent || '').join('\n\n');
  }, []);

  // Handle Copy Note Action
  const handleCopyNote = async () => {
    let payloadText = '';
    let payloadHtml = '';

    if (selectedTimelineEntryId === 'all') {
      const editors = Array.from(document.querySelectorAll('[data-admin-all-entry-id][data-admin-all-entry-user]'));
      if (editors.length) {
        const payloads = editors.map(ed => {
          const id = ed.dataset.adminAllEntryId;
          const uid = ed.dataset.adminAllEntryUser;
          const n = allNotes.find(item => item.id === id && item.userId === uid);
          return adminClipboardPayloadForNote(n, ed.innerText || '');
        }).filter(p => p.text);

        payloadText = payloads.map(p => p.text).join('\n\n');
        payloadHtml = payloads.some(p => p.html)
          ? payloads.map(p => p.html || `<div>${p.text.replace(/\n/g, '<br>')}</div>`).join('<br><br>')
          : '';
      } else {
        const payload = adminClipboardPayloadForNote(selectedAdminNote, selectedAdminNote?.data?.transcription || '');
        payloadText = payload.text;
        payloadHtml = payload.html;
      }
    } else {
      const ed = document.getElementById('adminNoteEditor');
      const text = ed ? ed.innerText : selectedTimelineNote?.data?.transcription || '';
      const payload = adminClipboardPayloadForNote(selectedTimelineNote, text);
      payloadText = payload.text;
      payloadHtml = payload.html;
    }

    if (!payloadText) return;

    try {
      if (payloadHtml && navigator.clipboard?.write && window.ClipboardItem) {
        const item = new ClipboardItem({
          'text/html': new Blob([payloadHtml], { type: 'text/html' }),
          'text/plain': new Blob([payloadText], { type: 'text/plain' })
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(payloadText);
      }
    } catch (err) {
      await navigator.clipboard.writeText(payloadText);
    }

    setCopyStatus('Copied');
    if (selectedTimelineNote) safeLogActivity('admin_note_copied', noteLogPayload(selectedTimelineNote));
    setTimeout(() => setCopyStatus('Copy note'), 1500);
  };

  // Handle Review / Save Note Action
  const handleReviewNote = async () => {
    setIsReviewing(true);
    try {
      if (selectedTimelineEntryId === 'all') {
        const editors = Array.from(document.querySelectorAll('[data-admin-all-entry-id][data-admin-all-entry-user]'));
        await Promise.all(editors.map(item => {
          const id = item.dataset.adminAllEntryId;
          const uid = item.dataset.adminAllEntryUser;
          const entryNote = allNotes.find(n => n.id === id && n.userId === uid);
          if (!entryNote) return Promise.resolve();

          const transcription = item.innerText || '';
          const patientData = extractPatientFromNote(transcription, entryNote.data.patientData);

          return updateDoc(doc(db, entryNote.path), {
            transcription,
            patientData,
            adminEditedAt: serverTimestamp(),
            adminEditedBy: currentAdminUid || '',
            ...reviewedStatusPatch(entryNote, currentAdminUid)
          }).then(() => {
            safeLogActivity('admin_note_edited', noteLogPayload(entryNote));
            safeLogActivity('admin_note_reviewed', noteLogPayload(entryNote));
          });
        }));
      } else {
        const editor = document.getElementById('adminNoteEditor');
        if (selectedTimelineNote && editor) {
          const transcription = editor.innerText || '';
          const patientData = extractPatientFromNote(transcription, selectedTimelineNote.data.patientData);

          await updateDoc(doc(db, selectedTimelineNote.path), {
            transcription,
            patientData,
            adminEditedAt: serverTimestamp(),
            adminEditedBy: currentAdminUid || '',
            ...reviewedStatusPatch(selectedTimelineNote, currentAdminUid)
          });
          safeLogActivity('admin_note_edited', noteLogPayload(selectedTimelineNote));
          safeLogActivity('admin_note_reviewed', noteLogPayload(selectedTimelineNote));
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsReviewing(false);
    }
  };

  // Handle IP Discharge Toggle
  const handleDischargeToggle = async () => {
    const note = selectedTimelineNote;
    if (!note || !note.path || noteVisitType(note) !== 'IP') return;
    const selectedDateString = dateInputValue(selectedVisitDate);
    const patientName = notePatientName(note);
    const wasDischarged = Boolean(note.data?.dischargeDate);
    const message = wasDischarged
      ? `Revert discharge for ${patientName}? This IP patient will carry forward again.`
      : `Discharge ${patientName}? This IP patient will not carry forward after ${selectedDateString}.`;

    if (!window.confirm(message)) return;

    try {
      const changes = wasDischarged
        ? { dischargeDate: null, dischargedBy: null, dischargedAt: null, updatedAt: serverTimestamp() }
        : { dischargeDate: selectedDateString, dischargedBy: currentAdminUid || '', dischargedAt: serverTimestamp(), updatedAt: serverTimestamp() };

      await updateDoc(doc(db, note.path), changes);
      safeLogActivity(wasDischarged ? 'ip_discharge_reverted' : 'ip_patient_discharged', noteLogPayload(note));
    } catch (error) {
      console.error(error);
      alert(wasDischarged ? 'Unable to revert this discharge.' : 'Unable to discharge this IP patient.');
    }
  };

  const hasText = Boolean(selectedAdminNote?.data?.transcription || (selectedTimelineEntryId === 'all' && timelineNotes.some(n => n.data?.transcription)));
  const reviewTargets = selectedTimelineEntryId === 'all' ? timelineNotes : [selectedTimelineNote];
  const allReviewed = reviewTargets.length > 0 && reviewTargets.every(isReviewedNote);
  const canDischarge = Boolean(selectedTimelineNote?.path && noteVisitType(selectedTimelineNote) === 'IP');
  const isDischarged = Boolean(selectedTimelineNote?.data?.dischargeDate);

  // Compute Empty State Titles
  let emptyTitle = emptyStateInfo.title;
  let emptyMessage = emptyStateInfo.message;

  if (!emptyTitle) {
    if (!visibleNotes.length) {
      emptyTitle = 'No notes';
      emptyMessage = 'Notes from mapped users will appear here after they save them.';
    } else if (!filteredNotes.length) {
      emptyTitle = 'No matches';
      emptyMessage = 'No notes match this name or UHID search.';
    }
  }

  return (
    <>
      <LoginScreen hidden={Boolean(user)} blockedMessage={blockedMessage} />

      <div className={`app ${user ? 'authenticated' : ''}`} id="appShell">
        <Sidebar
          filteredNotes={filteredNotes}
          totalNotesCount={visibleNotes.length}
          selectedVisitType={selectedVisitType}
          setSelectedVisitType={setSelectedVisitType}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          selectedNoteId={selectedNoteId}
          onSelectEntry={(uid, nid) => {
            setSelectedUserId(uid);
            setSelectedNoteId(nid);
            setSelectedTimelineEntryId('all');
          }}
          userProfiles={userProfiles}
        />

        <main className="main">
          <Topbar
            totalVisibleNotes={visibleNotes.length}
            totalUsers={totalUsersCount}
            userEmail={user?.email || ''}
            selectedVisitDate={selectedVisitDate}
            onMoveDate={handleMoveDate}
            onSelectDateValue={handleSelectDateValue}
            onTodayClick={handleTodayClick}
            hasText={hasText}
            isReviewed={allReviewed}
            onReviewClick={handleReviewNote}
            isReviewing={isReviewing}
            canDischarge={canDischarge}
            isDischarged={isDischarged}
            onDischargeClick={handleDischargeToggle}
            onCopyClick={handleCopyNote}
            copyStatus={copyStatus}
            selectedTimelineNote={selectedTimelineNote}
            timelineNotes={timelineNotes}
            selectedTimelineEntryId={selectedTimelineEntryId}
            onSelectTimelineEntry={setSelectedTimelineEntryId}
            userProfiles={userProfiles}
            allEditorsTextGetter={getAllEditorsText}
          />

          <NoteEditor
            selectedTimelineEntryId={selectedTimelineEntryId}
            selectedAdminNote={selectedAdminNote}
            timelineNotes={timelineNotes}
            selectedTimelineNote={selectedTimelineNote}
            userProfiles={userProfiles}
            selectedVisitDate={selectedVisitDate}
            emptyTitle={emptyTitle}
            emptyMessage={emptyMessage}
            onEditorInput={() => {}}
          />
        </main>
      </div>
    </>
  );
}
