import React, { useState, useEffect, useRef } from 'react';
import {
  dateInputValue,
  noteTimelineTitle,
  noteMeta,
  timelineEntryKey,
  prescriptionTextFromNote,
  createPrintWindow,
  richNoteHtml,
  prescriptionLayoutForNote,
  safeLogActivity,
  noteLogPayload
} from '../utils/noteHelpers.js';
import { auth, signOut } from '../firebase.js';

export default function Topbar({
  totalVisibleNotes,
  totalUsers,
  userEmail,
  selectedVisitDate,
  onMoveDate,
  onSelectDateValue,
  onTodayClick,
  hasText,
  isReviewed,
  onReviewClick,
  isReviewing,
  canDischarge,
  isDischarged,
  onDischargeClick,
  onCopyClick,
  copyStatus,
  selectedTimelineNote,
  timelineNotes,
  selectedTimelineEntryId,
  onSelectTimelineEntry,
  userProfiles,
  allEditorsTextGetter
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [showTimelineMenu, setShowTimelineMenu] = useState(false);
  const [emrMessageVisible, setEmrMessageVisible] = useState(false);

  const printTimerRef = useRef(null);
  const timelineTimerRef = useRef(null);
  const emrTimerRef = useRef(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.admin-settings')) setShowSettings(false);
      if (!e.target.closest('.print-wrap')) setShowPrintMenu(false);
      if (!e.target.closest('.timeline-wrap')) setShowTimelineMenu(false);
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  const todayDayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  // Handle Send to EMR
  const handleSendEmr = () => {
    clearTimeout(emrTimerRef.current);
    setEmrMessageVisible(true);
    if (selectedTimelineNote) {
      safeLogActivity('send_to_emr_clicked', noteLogPayload(selectedTimelineNote));
    }
    emrTimerRef.current = setTimeout(() => setEmrMessageVisible(false), 1600);
  };

  // Prescription print text check
  const rxText = selectedTimelineNote ? prescriptionTextFromNote(allEditorsTextGetter() || selectedTimelineNote.data?.transcription || '') : '';
  const rxDisabled = !rxText;

  // Print Handlers
  const handlePrintVisitNote = () => {
    setShowPrintMenu(false);
    const text = allEditorsTextGetter() || selectedTimelineNote?.data?.transcription || '';
    if (!text) return;
    const printWindow = createPrintWindow();
    if (!printWindow) {
      window.print();
      return;
    }
    const layout = prescriptionLayoutForNote(selectedTimelineNote, userProfiles);
    printWindow.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>WOYZ Notes Print</title>
<style>
  @page{ margin:8mm; }
  *{ box-sizing:border-box; }
  body{
    margin:0;
    color:#111;
    font-family:Arial, Helvetica, sans-serif;
    font-size:12pt;
    line-height:1.35;
  }
  .note{
    width:100%;
    max-width:none;
    min-height:100vh;
    padding:8mm 9mm;
    white-space:pre-wrap;
  }
  .rx-table{
    display:grid;
    gap:4mm;
    margin:3mm 0 5mm;
    white-space:normal;
  }
  .rx-row{
    display:grid;
    grid-template-columns:9mm minmax(44mm, 34%) minmax(0,1fr);
    column-gap:4mm;
    align-items:start;
    break-inside:avoid;
  }
  .rx-number,
  .rx-medicine{
    font-weight:700;
  }
  .rx-instructions{
    display:grid;
    gap:1mm;
    min-width:0;
  }
  .review-note-divider{
    width:50%;
    height:1px;
    border:0;
    border-top:1.5px solid #999;
    margin:7mm 0 4mm;
  }
  .review-notes-title{
    display:block;
    margin:0 0 5mm;
    font-size:18pt;
    font-weight:700;
    line-height:1.15;
  }
  h1{
    margin:0 0 10px;
    font-size:18pt;
    line-height:1.15;
  }
  strong{ font-weight:700; }
  @media print{
    body{ print-color-adjust:exact; -webkit-print-color-adjust:exact; }
  }
</style>
</head>
<body><main class="note">${richNoteHtml(text, { includeMalayalam: layout.includeMalayalam !== false })}</main></body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    if (selectedTimelineNote) safeLogActivity('admin_note_printed', noteLogPayload(selectedTimelineNote));
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 150);
  };

  const handlePrintPrescription = () => {
    setShowPrintMenu(false);
    if (!selectedTimelineNote || !rxText) return;
    const patient = selectedTimelineNote.data.patientData || {};
    const age = patient.age || 'NIL';
    const ageLabel = /^nil$/i.test(age) ? 'NIL' : `${age} years`;
    const patientLine = [
      `Age: ${ageLabel}`,
      `Sex: ${patient.sex || selectedTimelineNote.data.patientSex || 'NIL'}`,
      `UHID: ${patient.uhid || 'NIL'}`,
      selectedTimelineNote.data.visitDate || dateInputValue(selectedVisitDate)
    ].join(' | ');
    const layout = prescriptionLayoutForNote(selectedTimelineNote, userProfiles);
    const printWindow = createPrintWindow();
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>WOYZ Prescription Print</title>
<style>
  @page{ margin:8mm; }
  *{ box-sizing:border-box; }
  body{
    margin:0;
    color:#111;
    font-family:Arial, Helvetica, sans-serif;
    font-size:10.5pt;
    line-height:1.35;
  }
  .page{
    min-height:100vh;
    display:flex;
    flex-direction:column;
  }
  .rx-print-header{
    background:#EEF4F6;
    padding:12mm 12mm 10mm;
    min-height:31mm;
  }
  .rx-print-content{
    padding:9mm 12mm 36mm;
  }
  .rx{
    width:100%;
    max-width:none;
  }
  .patient-line{
    display:flex;
    flex-wrap:wrap;
    gap:8px 14px;
    margin:0 0 18px;
    font-size:9.5pt;
  }
  h1{
    margin:0 0 8px;
    font-size:16pt;
    line-height:1.15;
    text-transform:uppercase;
  }
  .rx-heading{
    color:#00395F;
    font-size:12pt;
    font-weight:700;
    margin:0 0 13px;
  }
  .rx-table{
    display:grid;
    gap:11px;
  }
  .rx-row{
    display:grid;
    grid-template-columns:28px minmax(170px, 34%) 1fr;
    column-gap:10px;
    align-items:start;
    break-inside:avoid;
  }
  .rx-number,
  .rx-medicine{
    font-weight:700;
  }
  .rx-instructions{
    display:grid;
    gap:2px;
    white-space:normal;
  }
  .rx-print-footer{
    position:fixed;
    left:12mm;
    right:12mm;
    bottom:10mm;
    margin-top:0;
    border-top:1px solid #999;
    padding-top:4mm;
    font-size:8pt;
    line-height:1.28;
  }
  .rx-print-footer-line{
    display:block;
    max-width:100%;
    overflow-wrap:normal;
    white-space:normal;
  }
  .rx-print-signature{
    margin-top:14mm;
    padding:0;
  }
  .layout-small{ font-size:8.5pt; }
  .layout-medium{ font-size:10.5pt; }
  .layout-large{ font-size:14pt; }
  .layout-bold{ font-weight:700; }
  .layout-italic{ font-style:italic; }
  .rx-print-footer.layout-small,
  .rx-print-footer.layout-medium,
  .rx-print-footer.layout-large{ font-size:8pt; }
  strong{ font-weight:700; }
  @media print{
    body{ print-color-adjust:exact; -webkit-print-color-adjust:exact; }
  }
</style>
</head>
<body>
  <main class="page">
    <section class="rx-print-content">
      <div class="rx">
        <h1>${selectedTimelineNote.data.patientData?.name || 'Untitled note'}</h1>
        <div class="patient-line">${patientLine}</div>
        <div class="rx-heading">Rx / ADVICE</div>
        <div class="rx-table">${rxText}</div>
      </div>
    </section>
  </main>
</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    safeLogActivity('admin_prescription_printed', noteLogPayload(selectedTimelineNote));
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 150);
  };

  return (
    <div className="main-topbar">
      <div className="topbar-summary">
        <div className="topbar-title" id="topbarTitle">Admin notes</div>
        <div className="topbar-meta" id="topbarMeta">
          {`${totalVisibleNotes} note${totalVisibleNotes === 1 ? '' : 's'} · ${totalUsers} mapped user${totalUsers === 1 ? '' : 's'}`}
        </div>
      </div>

      <div className="spacer"></div>
      <div className="user-email" id="userEmail">{userEmail}</div>

      <div className="date-nav" id="adminDateNav" aria-label="Visit date navigation">
        <button className="date-step" id="adminPreviousDateBtn" aria-label="Previous day" onClick={() => onMoveDate(-1)}>
          &lsaquo;
        </button>
        <input
          className="date-input"
          id="adminVisitDateInput"
          type="date"
          aria-label="Visit date"
          value={dateInputValue(selectedVisitDate)}
          onChange={(e) => onSelectDateValue(e.target.value)}
        />
        <button className="date-step" id="adminNextDateBtn" aria-label="Next day" onClick={() => onMoveDate(1)}>
          &rsaquo;
        </button>
        <button className="date-today" id="adminTodayBtn" title="Jump to today" onClick={onTodayClick}>
          {todayDayName}
        </button>
      </div>

      {hasText && (
        <button
          className={`btn copy-btn ${isReviewed ? 'copied' : ''}`}
          id="saveNoteBtn"
          onClick={onReviewClick}
          disabled={isReviewing}
        >
          {isReviewing ? 'Reviewing...' : isReviewed ? 'Reviewed' : 'Review'}
        </button>
      )}

      {canDischarge && (
        <button
          className={`btn discharge-btn ${isDischarged ? 'discharged' : ''}`}
          id="dischargeBtn"
          onClick={onDischargeClick}
          aria-label={isDischarged ? 'Revert IP discharge' : 'Discharge IP patient'}
          title={isDischarged ? 'Revert IP discharge' : 'Discharge IP patient'}
        >
          {isDischarged ? 'Discharged' : 'Discharge'}
        </button>
      )}

      {hasText && (
        <button
          className="btn copy-btn"
          id="sendEmrBtn"
          onClick={handleSendEmr}
        >
          Send to EMR
        </button>
      )}

      <span className={`emr-status ${emrMessageVisible ? 'visible' : ''}`} id="emrStatus" aria-live="polite">
        Coming soon
      </span>

      {hasText && (
        <button
          className={`btn copy-btn ${copyStatus === 'Copied' ? 'copied' : ''}`}
          id="copyBtn"
          onClick={onCopyClick}
        >
          {copyStatus}
        </button>
      )}

      {/* Print dropdown */}
      {hasText && (
        <div
          className={`print-wrap ${hasText ? 'visible' : ''}`}
          id="adminPrintWrap"
          onPointerEnter={() => {
            clearTimeout(printTimerRef.current);
            setShowPrintMenu(true);
          }}
          onPointerLeave={() => {
            clearTimeout(printTimerRef.current);
            printTimerRef.current = setTimeout(() => setShowPrintMenu(false), 900);
          }}
        >
          <button
            className={`btn print-menu-btn ${showPrintMenu ? 'open' : ''}`}
            id="adminPrintMenuBtn"
            type="button"
            aria-label="Print options"
            aria-haspopup="true"
            aria-expanded={showPrintMenu}
            onClick={() => setShowPrintMenu(!showPrintMenu)}
          >
            Print
          </button>
          <div className={`print-menu ${showPrintMenu ? 'open' : ''}`} id="adminPrintMenu">
            <button
              className="btn rx-print-btn"
              id="rxPrintBtn"
              type="button"
              aria-label="Print prescription"
              title={rxDisabled ? 'No prescription found in this note' : 'Print Prescription'}
              disabled={rxDisabled}
              onClick={handlePrintPrescription}
            >
              Prescription
            </button>
            <button
              className="btn print-btn"
              id="printBtn"
              type="button"
              aria-label="Print visit note"
              title="Print visit note"
              onClick={handlePrintVisitNote}
            >
              Visit Note
            </button>
          </div>
        </div>
      )}

      {/* Timeline dropdown */}
      {timelineNotes.length > 1 && (
        <div
          className="timeline-wrap visible"
          id="adminTimelineWrap"
          onPointerEnter={() => {
            clearTimeout(timelineTimerRef.current);
            setShowTimelineMenu(true);
          }}
          onPointerLeave={() => {
            clearTimeout(timelineTimerRef.current);
            timelineTimerRef.current = setTimeout(() => setShowTimelineMenu(false), 900);
          }}
        >
          <button
            className={`btn timeline-btn ${showTimelineMenu ? 'open' : ''}`}
            id="adminTimelineBtn"
            type="button"
            aria-label="Patient timeline"
            aria-haspopup="true"
            aria-expanded={showTimelineMenu}
            onClick={() => setShowTimelineMenu(!showTimelineMenu)}
          >
            Timeline
          </button>
          <div className={`timeline-menu ${showTimelineMenu ? 'open' : ''}`} id="adminTimelineMenu">
            <button
              className={`timeline-item ${selectedTimelineEntryId === 'all' ? 'active' : ''}`}
              type="button"
              onClick={() => {
                onSelectTimelineEntry('all');
                setShowTimelineMenu(false);
              }}
            >
              All Entries
              <span className="timeline-item-meta">{timelineNotes.length} {timelineNotes.length === 1 ? 'entry' : 'entries'}</span>
            </button>
            {timelineNotes.map(noteItem => (
              <button
                key={timelineEntryKey(noteItem)}
                className={`timeline-item ${selectedTimelineEntryId === timelineEntryKey(noteItem) ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  onSelectTimelineEntry(timelineEntryKey(noteItem));
                  setShowTimelineMenu(false);
                }}
              >
                {noteTimelineTitle(noteItem, selectedVisitDate)}
                <span className="timeline-item-meta">{noteMeta(noteItem, userProfiles)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Settings dropdown */}
      <div className="admin-settings">
        <button
          className="btn"
          id="adminSettingsBtn"
          aria-expanded={showSettings}
          onClick={(e) => {
            e.stopPropagation();
            setShowSettings(!showSettings);
          }}
        >
          Settings
        </button>
        <div className={`settings-menu ${showSettings ? 'open' : ''}`} id="adminSettingsMenu">
          <button className="settings-item" id="signoutBtn" type="button" onClick={() => signOut(auth)}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
