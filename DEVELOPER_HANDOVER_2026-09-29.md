# WOYZ Notes Developer Handover

Generated: 2026-09-29 12:55 IST
Repository state packaged: base commit `db1ef3c` (`Restrict log page to activity admin`) plus local `user.html` mobile template-preview guard.

This handover package contains the static web app source, Firebase configuration, Firestore security rules, Gemini prompt code, activity log page, QR generator, and existing project documentation.

## Project Shape

This is a static Firebase/GitHub Pages style app. There is no build step and no server-side application code in this repository. Pages import Firebase SDK modules directly from Google CDN.

Main files:

- `user.html` - doctor/user note-taking page. Handles voice recording, Gemini note generation, templates, mobile UI, patient OCR text paste flow, doctor credential QR scanning, local draft workflows, add-on notes, discharge summary generation, and save/delete.
- `index.html` - admin review page. Shows notes by assigned user/group, supports copy/print/prescription/timeline/discharge actions. The top `Review` button now saves edits and clears the red/unreviewed state; `Copy note` only copies.
- `log.html` - activity log page restricted to `aster-admin@woyz.in`. Shows activity streams and Gemini API use in table form.
- `master-admin.html` - master admin group/access assignment page.
- `qr-generator.html` - standalone QR generator restricted to `aster-admin@woyz.in`. It generates text QR codes in this format: `Aster@doc1,Doctor Name,Employee ID`.
- `firebase-config.js` - Firebase web app config for the active Firebase project.
- `firestore.rules` - current Firestore security rules.
- `firebase.json` and `.firebaserc` - Firebase deploy configuration.
- `setup-new-project.sh` - guarded helper for creating a separate new GitHub/Firebase project.
- `manifest.webmanifest`, `sw.js`, `icons/` - PWA-related files and icons.

Older documentation is also included:

- `README.md`
- `HANDOVER.md`
- `COMPLETE_HANDOVER_2026-09-21.md`
- `CODEX_HANDOFF_PROMPT.md`

## Current Firebase Target

`.firebaserc` points to:

```json
{
  "projects": {
    "default": "stroke-code-demo-1"
  }
}
```

`firebase-config.js` also points to project `stroke-code-demo-1`.

Important: Firebase web config is not a server secret. Access control depends on Firebase Authentication plus deployed `firestore.rules`.

## Firestore Data Model

Primary note path:

```text
users/{firebaseAuthUid}/notes/{noteId}
```

Other collections:

- `users/{uid}` - user profile/settings, group mapping metadata, doctor credential fields.
- `groups/{groupId}` - master-admin-managed groups.
- `activityLogs/{logId}` - append-only activity logs used by `log.html`.

Important note fields:

- `transcription` - generated/edited note text.
- `patientData` - patient identity object, usually name/age/UHID/sex.
- `visitDate`, `visitType`, `admissionDate`, `dischargeDate`.
- `isDraft`, `everSaved`.
- `adminCopiedAt`, `adminCopiedBy` - historical field name, now used by `index.html` as the admin-reviewed marker.
- `adminEditedAt`, `adminEditedBy`.
- `doctorCredentialName`, `doctorCredentialEmployeeId` live on `users/{uid}`.

## Firestore Rules

Rules are in `firestore.rules`.

Current master admin identity:

- UID: `kzlnh5rBzpTlYEqF7Ou35F1YWaa2`
- Email: `drgigy@gmail.com`

The QR generator and activity log login are restricted in page code to:

- `aster-admin@woyz.in`

High-level behavior:

- Users can read/write their own `users/{uid}/notes`.
- Mapped admins can read assigned users via group mappings.
- Master admin can manage groups and access.
- `activityLogs` can be created by signed-in users and read by master admin.
- `doctorCredentialName` and `doctorCredentialEmployeeId` are allowed profile fields.

If new admin-review fields are added later, update `firestore.rules` before deploying, otherwise production writes may fail.

## Gemini Integration

Gemini integration lives in `user.html`.

Key locations:

- `GEMINI_KEY_STORAGE` - browser localStorage key for user-provided Gemini authorization key.
- `GEMINI_MODELS` - retry model list:
  - `gemini-3.6-flash`
  - `gemini-flash-latest`
  - `gemini-2.5-flash`
- `GEMINI_FIDELITY_RULE` - global strict no-hallucination instruction.
- `GEMINI_PROMPTS` - mode-specific prompts:
  - `ambient` / Visit note
  - `Review dictation`
  - `Reply letter`
  - `Medical certificate`
  - `Discharge summary`
- `sendAudioToGemini(...)` - builds system/task prompts and response schema.
- `generateContentWithRetry(...)` - sends requests to `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
- `sendContinuationAudioToGemini(...)` - add-on/continuation note generation prompt.

The Gemini API key is not bundled in the repo. It is entered through Settings on `user.html` and stored in the browser localStorage for that device.

Recent prompt behavior:

- Visit note preserves dictated clinical facts and uses labeled examination lines.
- Discharge summary top credentials are now:
  - `Patient Name`
  - `Age`
  - `UHID`
  - `Sex`
- Discharge summary history must be a continuous paragraph.
- Discharge summary copy behavior in admin starts from `DIAGNOSIS` through `WHEN TO OBTAIN URGENT CARE`.
- Standard units are added for common blood values only when units are missing.

## Important Workflow Decisions

User page:

- Home date defaults to today.
- New entries can be created only for today.
- Add-on notes can be added to previous-day notes.
- Mobile `Scan QR` is an optional OCR-text prefill flow, not a real QR dependency. It shows a focused text box with a Clear button.
- Mobile Home template selection now protects an active new voice draft/template preview from being overwritten by a late "No notes" empty-state refresh.
- Doctor credential is optional per signed-in user and does not sync across users.
- Doctor credential QR text format: `Aster@doc1,Dr. Varghese,102345`.
- If no doctor credential is set, workflow continues normally.
- Mobile home shows selected doctor name/employee ID, or `Not selected`.
- The mobile settings item formerly called `Select credential` is now labeled `Device Name`.

Admin page:

- `Copy note` only copies and does not alter note color/status.
- `Review` saves edits, marks the note reviewed, clears draft wording, and removes the red/light-red unreviewed state.
- Existing field `adminCopiedAt` remains the reviewed marker for backward compatibility.

Log page:

- `log.html` is restricted to `aster-admin@woyz.in`; Firestore rules allow that account to read `activityLogs` and user profile labels for the log UI.
- It includes streams for all activity, users, notes, admin, master, and Gemini API use.
- Gemini API use table includes recording duration/model/attempt when available.
- Notes stream has subfilters for all notes, visit note, discharge, and add-on.

QR generator:

- `qr-generator.html` is standalone except Firebase login access control.
- It is not linked to the note workflow.
- It supports Download and Print for generated QR codes.

## Deployment

Current Firebase deploy config:

```bash
firebase deploy --only firestore:rules
firebase deploy --only hosting
```

Static files can also be served via GitHub Pages. Make sure Firebase Authentication authorized domains include the production hostname.

## Recommended Developer Checks

Before making changes:

```bash
git status --short
```

After editing:

```bash
git diff --check
node --experimental-vm-modules --input-type=module -e "import fs from 'fs'; import vm from 'vm'; for (const file of ['user.html','index.html','log.html','master-admin.html','qr-generator.html']) { const html=fs.readFileSync(file,'utf8'); const scripts=[...html.matchAll(/<script(?![^>]*\\bsrc=)[^>]*>([\\s\\S]*?)<\\/script>/gi)]; for (let i=0;i<scripts.length;i++){ const code=scripts[i][1]; if (/^\\s*import\\s/m.test(code)) new vm.SourceTextModule(code, {identifier:file+':script'+i}); else new vm.Script(code, {filename:file+':script'+i}); } console.log(file, scripts.length, 'inline scripts parsed'); }"
```

Then deploy rules/hosting only after confirming the app still works on a test login.

## Files Included In The ZIP

The handover zip should include all project files except `.git`, local OS metadata, and previously generated zip files. It intentionally includes:

- `.firebaserc`
- `.firebaserc.example`
- `.nojekyll`
- HTML pages
- Firestore rules
- Firebase hosting config
- icons
- documentation
- setup script

## Caution

This app is actively used. Do not make broad refactors on `user.html` or `index.html` without testing the live workflows:

- mobile visit note generation
- discharge summary generation
- add-on notes
- admin Review behavior
- admin Copy note behavior
- master admin group filtering
- log page access
- QR generator access and QR scan text
