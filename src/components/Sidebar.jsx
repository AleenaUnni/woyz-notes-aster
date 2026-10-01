import React from 'react';
import {
  notePatientName,
  noteMeta,
  noteSubMeta,
  noteOwnerCode,
  userLabel,
  isSavedNote,
  isReviewedNote
} from '../utils/noteHelpers.js';

export default function Sidebar({
  filteredNotes,
  totalNotesCount,
  selectedVisitType,
  setSelectedVisitType,
  searchTerm,
  setSearchTerm,
  selectedNoteId,
  onSelectEntry,
  userProfiles
}) {
  return (
    <aside className="sidebar">
      <div className="admin-brand">
        <span className="admin-brand-pill">
          <span className="admin-brand-dot"></span>
          <span>WOYZ</span>
        </span>
        <span className="admin-brand-word">Notes</span>
      </div>

      <div className="visit-toggle" id="adminVisitToggle" aria-label="Visit type">
        <button
          className={`visit-toggle-btn ${selectedVisitType === 'OP' ? 'active' : ''}`}
          onClick={() => setSelectedVisitType('OP')}
          data-admin-visit-type="OP"
        >
          OP
        </button>
        <button
          className={`visit-toggle-btn ${selectedVisitType === 'IP' ? 'active' : ''}`}
          onClick={() => setSelectedVisitType('IP')}
          data-admin-visit-type="IP"
        >
          IP
        </button>
      </div>

      <div className="admin-search">
        <input
          className="admin-search-input"
          id="adminSearchInput"
          type="search"
          autoComplete="off"
          placeholder="Search name or UHID"
          aria-label="Search notes by name or UHID"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="sidebar-section-label" id="notesLabel">
        {searchTerm.trim()
          ? `${filteredNotes.length} result${filteredNotes.length === 1 ? '' : 's'}`
          : `${totalNotesCount} note${totalNotesCount === 1 ? '' : 's'}`}
      </div>

      <div className="entry-list" id="entryList">
        {filteredNotes.map((note, index) => {
          const serialNumber = filteredNotes.length - index;
          const isUncopied = isSavedNote(note) && !isReviewedNote(note);
          const isActive = note.id === selectedNoteId;
          const ownerCode = noteOwnerCode(note, userProfiles, userLabel(note.userId, 0, userProfiles));

          return (
            <button
              key={`${note.userId}-${note.id}`}
              className={`entry ${isUncopied ? 'uncopied' : ''} ${isActive ? 'active' : ''}`}
              onClick={() => onSelectEntry(note.userId, note.id)}
            >
              <span className="entry-avatar">{serialNumber}</span>
              <span className="entry-text">
                <div className="entry-name">{notePatientName(note)}</div>
                <div className="entry-meta">{noteMeta(note, userProfiles)}</div>
                <div className="entry-submeta">{noteSubMeta(note)}</div>
              </span>
              <span className="entry-owner">{ownerCode}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
