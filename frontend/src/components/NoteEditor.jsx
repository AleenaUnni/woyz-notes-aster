import React, { useEffect, useRef } from 'react';
import {
  displayNoteTextForNote,
  richNoteHtml,
  prescriptionLayoutForNote,
  noteTimelineTitle,
  escapeHtml
} from '../utils/noteHelpers.js';

export default function NoteEditor({
  selectedTimelineEntryId,
  selectedAdminNote,
  timelineNotes,
  selectedTimelineNote,
  userProfiles,
  selectedVisitDate,
  emptyTitle,
  emptyMessage,
  onEditorInput
}) {
  const singleEditorRef = useRef(null);

  // Sync initial innerHTML for single editor
  useEffect(() => {
    if (singleEditorRef.current && selectedTimelineNote) {
      const text = displayNoteTextForNote(selectedTimelineNote, selectedTimelineNote.data?.transcription || '');
      const layout = prescriptionLayoutForNote(selectedTimelineNote, userProfiles);
      const html = richNoteHtml(text, { includeMalayalam: layout.includeMalayalam !== false });
      if (singleEditorRef.current.innerHTML !== html) {
        singleEditorRef.current.innerHTML = html;
      }
    }
  }, [selectedTimelineNote, userProfiles]);

  if (emptyTitle) {
    return (
      <div className="main-scroll" id="mainScroll">
        <div className="empty-state">
          <div className="empty-title">{emptyTitle}</div>
          <div>{emptyMessage}</div>
        </div>
      </div>
    );
  }

  if (selectedTimelineEntryId === 'all' && timelineNotes.length > 0) {
    return (
      <div className="main-scroll" id="mainScroll">
        <div className="admin-all-entries">
          {timelineNotes.map((noteItem) => {
            const text = displayNoteTextForNote(noteItem, noteItem.data?.transcription || '');
            const layout = prescriptionLayoutForNote(noteItem, userProfiles);
            const html = richNoteHtml(text, { includeMalayalam: layout.includeMalayalam !== false });
            return (
              <article key={noteItem.id} className="admin-all-entry">
                <h2 className="admin-all-entry-title">
                  {noteTimelineTitle(noteItem, selectedVisitDate)}
                </h2>
                <div
                  className="note-editor"
                  data-admin-all-entry-id={noteItem.id}
                  data-admin-all-entry-user={noteItem.userId}
                  contentEditable="true"
                  role="textbox"
                  aria-label={`Editable ${noteTimelineTitle(noteItem, selectedVisitDate)}`}
                  dangerouslySetInnerHTML={{ __html: html }}
                  onInput={onEditorInput}
                />
              </article>
            );
          })}
        </div>
      </div>
    );
  }

  if (selectedTimelineNote) {
    const title = selectedTimelineNote.data?.selectedMode || selectedTimelineNote.data?.heading || 'Saved note';
    return (
      <div className="main-scroll" id="mainScroll">
        <h1 className="note-title">{escapeHtml(title)}</h1>
        <div
          ref={singleEditorRef}
          className="note-editor"
          id="adminNoteEditor"
          contentEditable="true"
          role="textbox"
          aria-label="Editable admin note"
          onInput={onEditorInput}
        />
      </div>
    );
  }

  return (
    <div className="main-scroll" id="mainScroll">
      <div className="empty-state">
        <div className="empty-title">Select a note</div>
        <div>Choose a patient note from the sidebar.</div>
      </div>
    </div>
  );
}
