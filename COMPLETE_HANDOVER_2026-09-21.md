# WOYZ Notes Complete Handover - 21 Sept 2026

This handover captures the current working WOYZ Notes app so a new Codex chat can continue from the exact same state.

Current repository:

- Local folder: `/Users/gigy/Documents/Codex/2026-08-07/extract-the-attached-woyz-notes-handover/work/woyz-notes-standalone/woyz-notes-handover`
- GitHub remote: `https://github.com/drgigy/woyz-notes.git`
- Branch: `main`
- Latest pushed commit at handover time: `326c51f5a44b047cbb3a263686bc20b9d9ef275d`
- Latest commit message: `Add admin patient timeline view`

## Files In This App

Core app files:

- `index.html` - main WOYZ Notes app used for OP/IP voice notes, templates, editing, timeline, print, email, mobile layout, and PWA shell.
- `admin.html` - admin notes review page with mapped-user access, editable all-entry patient timeline, print controls, and user rail.
- `master-admin.html` - master admin page for groups/user mapping.
- `firebase-config.js` - Firebase web config for the current app.
- `firestore.rules` - Firestore security rules.
- `sw.js` - service worker and cache version.

Supporting files:

- `manifest.webmanifest`
- `firebase.json`
- `CNAME`
- `README.md`
- `HANDOVER.md`
- `CODEX_HANDOFF_PROMPT.md`
- `setup-new-project.sh`
- `demo.html`
- `icons/icon-192.png`
- `icons/icon-512.png`
- `icons/maskable-512.png`
- `icons/apple-touch-icon.png`
- `icons/woyz-icon.svg`

## Main App: `index.html`

Purpose:

- Doctor-facing notes app.
- Supports OP and IP sections.
- Uses Firebase Authentication and Firestore.
- Stores each user's notes under `users/{uid}/notes/{noteId}`.
- Works as a static web app/PWA.
- Mobile compatibility is implemented in this file with responsive CSS and touch-friendly controls.

Important behavior:

- OP/IP toggle switches note lists.
- Date navigation supports previous day, next day, and date picker.
- Search can find previous patients and add them to today.
- Big WOYZ voice button creates a fresh `Visit Note draft` and should immediately select that draft.
- Generated voice note output should go into the newly selected draft, not overwrite the previously selected note.
- Review note appending preserves the original note owner. This matters when a mapped user adds review notes to a patient originally created by another user.
- Timeline button opens the patient timeline.
- Default patient view is all entries.
- The first visit note remains at the top, followed by newer entries below it.
- Review notes, prescription review notes, certificates, letters, and related generated documents are also treated as timeline entries.
- All entries view is editable and scrollable.
- Single timeline entries can still be selected separately from the timeline dropdown.
- Patient credentials should appear at the first/top visit note and should not be unnecessarily repeated inside later review notes.

Print/email behavior:

- Print dropdown has Prescription and Visit Note options.
- Prescription print uses the configured prescription layout.
- Visit Note print should use the same rich note formatting logic.
- Email uses a similar report-type dropdown logic as print.
- Email sends a formatted PDF attachment and includes plain text in the email body.
- Email button is in the top bar after Print.
- Email modal includes receiver email input, `Remember this email`, remembered local emails, Cancel, and Send.
- Remembered emails are stored only in localStorage for that browser/device.
- Device approval is required before sending email.
- Approved devices can send PDFs to any valid email address.

Email backend:

- The app expects an email API endpoint/permission flow already configured.
- Recent UI errors were about device approval, not Resend account access itself.
- Do not hard-code secret API keys in frontend files.

## Admin Page: `admin.html`

Purpose:

- Admin review page for notes from mapped users/groups.
- Uses Firebase Authentication and Firestore.
- Displays notes by user, OP/IP, and date.
- Allows admin/mapped accounts to read, copy, edit, save, print, and mark IP discharge.

Latest important fix:

- Admin page now has a Timeline button.
- When a patient/note is selected, admin defaults to `All Entries`.
- Admin all-entry view is editable and scrollable.
- Admin timeline groups the same patient across all admin-accessible mapped users, not only the selected owner.
- This fixes the case where a patient had an earlier note created by one person and a review note dictated by Gigi, but admin showed only today's dictated note.
- Timeline entry keys use Firestore document paths, so notes from different users cannot collide if IDs overlap.
- Timeline item metadata shows OP/IP, owner label, UHID, sex, age, and date.
- Save in all-entry mode saves each visible editable entry back to its own Firestore document.
- Print in all-entry mode prints visible all-entry text.
- Copy in all-entry mode copies all visible editable entries.

Admin date behavior:

- Previous/next/date controls remain date-based by default.
- The sidebar/user rail is still scoped to the chosen admin date and OP/IP section.
- Once a patient is selected from that date, the main pane shows the patient's full timeline as all entries by default.
- A specific entry can be selected from Timeline if needed.

Mapped-user behavior:

- The admin page must consider notes across all accessible owners.
- A review note added by a mapped user must remain visible in admin when viewing that patient.
- Recent related commit before this handover: `a93fdf5 Preserve owner when appending review notes`.

## Master Admin Page: `master-admin.html`

Purpose:

- Maintains user/group mapping.
- Used to define which admin/mapped accounts can see which doctors/users.
- Works with Firestore `users/{uid}` profile mapping fields and `groups/{groupId}` documents.

Important fields:

- User profile mapping fields include `groupIds`, `adminGroupIds`, `adminSharedWith`, `sharedWith`, `mappingUpdatedAt`, and `mappingUpdatedBy`.
- Group documents include `name`, `memberUids`, `adminEmails`, and mapping metadata.

## Firestore Structure

Primary note path:

```text
users/{userId}/notes/{noteId}
```

Common note fields:

- `visitDate`
- `visitType` - `OP` or `IP`
- `isDraft`
- `everSaved`
- `transcription`
- `selectedMode` or `heading`
- `patientData`
- `createdAt`
- `createdAtValue`
- `createdAtLabel`
- `updatedAt`
- `ownerUid` or owner-related fields when preserving ownership
- `adminCopiedAt`
- `adminCopiedBy`
- `adminEditedAt`
- `adminEditedBy`
- `deleted`

User profile path:

```text
users/{userId}
```

Group path:

```text
groups/{groupId}
```

## Firestore Rules Summary

Rules file: `firestore.rules`

Access model:

- A signed-in user can access their own `users/{uid}` profile and notes.
- The master admin can read all notes by collection group query.
- A mapped user/admin can access users they are mapped to.
- Admin mapping fields can only be changed by master admin.
- Notes require `visitDate`, `isDraft`, and `transcription` fields for create/update.
- Admin/mapped accounts can update admin copy/edit metadata.
- Deletes are disabled for master admin and allowed only for signed-in/mapped non-admin users where the rules permit it.

Master admin identity currently in rules:

- UID: `Umb3lIKZfbXlLHth7OwDNFRvmUD3`
- Email: `drgigy@gmail.com`

## Cache And Deployment

Service worker file: `sw.js`

Current cache version:

```text
woyz-notes-v167
```

Current app registration versions:

- `index.html` registers `./sw.js?v=167`
- `admin.html` registers `./sw.js?v=167`

When making frontend changes:

1. Update the changed HTML/CSS/JS.
2. Bump `CACHE_NAME` in `sw.js`.
3. Bump service worker query strings in `index.html` and `admin.html`.
4. Run syntax checks.
5. Commit and push.
6. Hard refresh/reopen the app if the old version remains cached.

## Validation Commands

From the app folder:

```bash
python3 - <<'PY'
from pathlib import Path
for name,out in [('admin.html','/tmp/woyz-admin-module.js'),('index.html','/tmp/woyz-index-module.js')]:
    html = Path(name).read_text()
    start = html.index('<script type="module">') + len('<script type="module">')
    end = html.index('</script>', start)
    Path(out).write_text(html[start:end])
PY
node --check /tmp/woyz-admin-module.js
node --check /tmp/woyz-index-module.js
node --check sw.js
git diff --check
```

For deployment/state:

```bash
git status --short
git log --oneline -8
git push
```

## Recent Commit History

Recent commits at handover time:

```text
326c51f Add admin patient timeline view
a93fdf5 Preserve owner when appending review notes
17c66e7 Add email report dropdown
710a7d7 Apply layout to visit note email and print
c4822ee Clarify email device approval message
109dfe0 Handle new email device registration
f7c4970 Fix email device approval request
6c20d52 Add email modal for generated notes
```

## New Chat Prompt

Use this prompt in a new Codex chat:

```text
Please continue work on WOYZ Notes from this handover.

Use the local project folder:
/Users/gigy/Documents/Codex/2026-08-07/extract-the-attached-woyz-notes-handover/work/woyz-notes-standalone/woyz-notes-handover

First read COMPLETE_HANDOVER_2026-09-21.md, then inspect:
- index.html
- admin.html
- master-admin.html
- firestore.rules
- firebase-config.js
- sw.js

The latest pushed commit at handover time is:
326c51f5a44b047cbb3a263686bc20b9d9ef275d

Important behavior to preserve:
- Main notes app is mobile-compatible.
- Patient default view should be all entries.
- First visit note stays on top; newer entries follow below.
- Review notes/prescriptions/certificates/letters are timeline entries.
- Admin page also defaults to all entries.
- Admin timeline must include the same patient across all mapped users.
- Review notes added by mapped users must not disappear due to owner mismatch.
- Firestore rules and cache versioning must be kept consistent.

Before changing code, check git status. After changes, run the syntax checks from the handover and bump sw.js cache if frontend files changed.
```

## Notes For Future Work

- If admin timeline misses a patient entry, first check patient identity matching in `patientTimelineKey()` and owner/mapping access in Firestore rules.
- If a note disappears after a few seconds, suspect Firestore listener reconciliation or ownership/path mismatch.
- If a new voice draft is created but not selected, inspect the draft creation/selection path in `index.html`.
- If a generated review note overwrites the wrong entry, inspect selected note state and owner-preserving append behavior.
- If email fails with approval errors, inspect the device approval flow and backend endpoint permissions.
- If UI changes do not appear, suspect service worker cache and bump `v167` upward.
