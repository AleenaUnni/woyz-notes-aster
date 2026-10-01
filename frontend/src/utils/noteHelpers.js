import { auth, db, addDoc, collection, serverTimestamp } from '../firebase.js';

export const DEFAULT_PRESCRIPTION_LAYOUT = {
  includeMalayalam: true,
  header: { text: '', enabled: true, bold: false, italic: false, size: 'medium' },
  footer: { text: '', enabled: true, bold: false, italic: false, size: 'small' },
  signature: { text: '', enabled: true, bold: false, italic: false, size: 'small' }
};

export function cleanLogValue(value, maxLength = 160) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function noteLogPayload(note = {}) {
  const patient = note.data?.patientData || {};
  return {
    noteId: cleanLogValue(note.id || '', 120),
    noteOwnerUid: cleanLogValue(note.userId || '', 120),
    noteType: cleanLogValue(noteDocumentMode(note) || note.data?.heading || '', 120),
    patientName: cleanLogValue(patient.name || '', 160),
    uhid: cleanLogValue(patient.uhid || note.data?.uhid || '', 80),
    visitDate: cleanLogValue(note.data?.visitDate || '', 20),
    visitType: cleanLogValue(note.data?.visitType || '', 20)
  };
}

export function safeLogActivity(action, info = {}) {
  const user = auth.currentUser;
  if (!user) return;
  const payload = {
    action: cleanLogValue(action, 80),
    page: 'index',
    userId: user.uid,
    email: cleanLogValue(user.email || '', 160),
    createdAt: serverTimestamp()
  };
  const logFieldLimits = { noteId: 120, noteOwnerUid: 120, noteType: 120, patientName: 160, uhid: 80, visitDate: 20, visitType: 20 };
  Object.entries(logFieldLimits).forEach(([key, maxLength]) => {
    const value = cleanLogValue(info[key] || '', maxLength);
    if (value) payload[key] = value;
  });
  addDoc(collection(db, 'activityLogs'), payload).catch(error => console.warn('Activity log failed:', error));
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

export function compactNoteText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/^(Patient Name:\s*[^\n]+)\n(Age:\s*[^\n]+)\n(UHID:\s*[^\n]+)\n(Sex:\s*[^\n]+)/im, '$1 · $2 · $3 · $4')
    .split(/\n{2,}/)
    .map(block => {
      const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
      if (!lines.length) return '';
      if (lines.length > 1 && /:$/.test(lines[0])) return `${lines[0]} ${lines.slice(1).join(' ')}`;
      return lines.join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

export const NOTE_SECTION_LOOKAHEAD = '(?:Patient Name|Age|UHID|Sex|Chief complaints|Allergies|History|Previous treatment|Examination|Nutritional status|Plan of care|Provisional diagnosis|Final diagnosis|Presenting Complaint|History of Present Illness|Past Medical or Surgical History|Family History|Personal History|Examination Findings|Review of Investigations|Current Medications|Diagnosis|Treatment Plan|Advice|Instructions?|Follow[- ]?up|Prescription|Review Note(?:\\s*\\([^)]*\\))?)';
export const DISCHARGE_SUMMARY_HEADINGS = [
  'Patient Name','Discharge Summary Name','Name','Age/Gender','Age','UHID','UHCID','Sex','Gender','IP No.','IP No','Address','Consultant','DOA','DOD',
  'DIAGNOSIS','PROCEDURE DONE','DRUG ALLERGY','HISTORY','CLINICAL EXAMINATION',
  'INVESTIGATIONS','LAB','RADIOLOGY','PROCEDURE / OPERATION NOTES','PROCEDURE/OPERATION NOTES',
  'OTHERS','GENERAL INSTRUCTIONS','REASON FOR ADMISSION','COURSE IN HOSPITAL',
  'MEDICATIONS ADMINISTERED','CONDITION AT DISCHARGE','ADVICE ON DISCHARGE',
  'MEDICATIONS','HOME MEDICATIONS','DIET ADVICE','FOLLOW UP DATE','REVIEW','WHEN TO OBTAIN URGENT CARE'
];
export const DISCHARGE_INLINE_LABELS = [
  'Airway','Breathing','Circulation','Disability','Exposure','Secondary survey','Secondary Survey',
  'C SPINE','C-SPINE','CCT','C-CT','PCT','P-CT','LOG roll','EFAST','E-FAST',
  'Head','Face','Eyes','Oral Cavity','Oral cavity','Ear','Nose','Chest','Abdomen',
  'Musculoskeletal System','Right upper limb','Right lower limb','Local examination'
];
export const DISCHARGE_DEMOGRAPHIC_LABELS = ['Patient Name','Age','UHID','Sex'];
export const DISCHARGE_COPY_HEADINGS = [
  'DIAGNOSIS','PROCEDURE DONE','DRUG ALLERGY','HISTORY','CLINICAL EXAMINATION',
  'INVESTIGATIONS','LAB','RADIOLOGY','PROCEDURE / OPERATION NOTES','OTHERS',
  'GENERAL INSTRUCTIONS','REASON FOR ADMISSION','COURSE IN HOSPITAL',
  'MEDICATIONS ADMINISTERED','CONDITION AT DISCHARGE','ADVICE ON DISCHARGE',
  'MEDICATIONS','HOME MEDICATIONS','DIET ADVICE','FOLLOW UP DATE','REVIEW',
  'WHEN TO OBTAIN URGENT CARE'
];

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isDischargeSummaryNote(note) {
  const mode = String(note?.data?.selectedMode || note?.data?.heading || '').trim();
  return /discharge summary/i.test(mode);
}

export function addStandardBloodUnit(line) {
  const cleaned = String(line || '')
    .replace(/\s*[.]$/, '')
    .replace(/\b(\d+)\.\s+(\d+)\b/g, '$1.$2')
    .replace(/\blakhs\b/gi, 'lakh')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || /(?:g\/dL|mg\/dL|mmol\/L|mEq\/L|cells\/cumm|\/cu\.?mm|\/cumm|lakh\/cumm|U\/L|mm\/hr|mg\/L|%|µmol\/L|umol\/L|µIU\/mL|mcIU\/mL)/i.test(cleaned)) return cleaned;
  const unitRules = [
    [/^(Hemoglobin|Hb)\s*:\s*([\d.]+)\s*$/i, '$1: $2 g/dL'],
    [/^(Total count|TC)\s*:\s*([\d.]+)\s*$/i, '$1: $2 cells/cumm'],
    [/^(Platelet count|Platelets?)\s*:\s*([\d.]+(?:\s*lakh)?)\s*$/i, '$1: $2/cumm'],
    [/^(Creatinine|Urea|RBS|FBS|PPBS)\s*:\s*([\d.]+)\s*$/i, '$1: $2 mg/dL'],
    [/^(HbA1c)\s*:\s*([\d.]+)\s*$/i, '$1: $2%'],
    [/^(Sodium|Potassium|Chloride)\s*:\s*([\d.]+)\s*$/i, '$1: $2 mmol/L'],
    [/^(SGOT|SGPT|ALT|AST)\s*:\s*([\d.]+)\s*$/i, '$1: $2 U/L'],
    [/^(ESR)\s*:\s*([\d.]+)\s*$/i, '$1: $2 mm/hr'],
    [/^(CRP)\s*:\s*([\d.]+)\s*$/i, '$1: $2 mg/L'],
    [/^(Total cholesterol|Triglycerides|HDL|LDL)\s*:\s*([\d.]+)\s*$/i, '$1: $2 mg/dL'],
    [/^(Homocysteine)\s*:\s*([\d.]+)\s*$/i, '$1: $2 µmol/L']
  ];
  for (const [pattern, replacement] of unitRules) {
    if (pattern.test(cleaned)) return cleaned.replace(pattern, replacement);
  }
  return cleaned;
}

export function isDischargeSectionHeadingLine(line) {
  return new RegExp(`^(?:${DISCHARGE_SUMMARY_HEADINGS.map(escapeRegExp).join('|')})\\s*:`, 'i').test(String(line || '').trim());
}

export function normalizeDischargeLabValues(text) {
  const labLabelPattern = /^(Hemoglobin|Hb|ESR|CRP|Total count|TC|Platelet count|Platelets?|Creatinine|Urea|RBS|FBS|PPBS|HbA1c|Sodium|Potassium|Chloride|SGOT|SGPT|ALT|AST|Bilirubin|Total bilirubin|Direct bilirubin|Indirect bilirubin|Total cholesterol|Triglycerides|HDL|LDL|Homocysteine)\s*:\s*(.*)$/i;
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const result = [];
  let inLab = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (/^LAB\s*:/i.test(trimmed)) {
      inLab = true;
      result.push(line);
      continue;
    }
    if (inLab && trimmed && isDischargeSectionHeadingLine(trimmed) && !/^LAB\s*:/i.test(trimmed)) {
      inLab = false;
    }
    if (inLab) {
      const match = trimmed.match(labLabelPattern);
      if (match && !match[2].trim()) {
        const next = lines[index + 1]?.trim() || '';
        if (next && !labLabelPattern.test(next) && !isDischargeSectionHeadingLine(next)) {
          result.push(addStandardBloodUnit(`${match[1]}: ${next}`));
          index += 1;
          continue;
        }
      }
      if (match && match[2].trim()) {
        result.push(addStandardBloodUnit(trimmed));
        continue;
      }
    }
    result.push(line);
  }
  return result.join('\n');
}

export function isNilLike(value) {
  return /^(nil|none|no|not applicable|n\/a|na|negative)$/i.test(String(value || '').trim());
}

export function compactDischargeDemographicHeader(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const values = new Map();
  const consumed = new Set();
  const demoPattern = /^(Patient Name|Discharge Summary Name|Name|Age\/Gender|Age|UHID|UHCID|Sex|Gender|IP No\.?|Address|Consultant|DOA|DOD):\s*(.*)$/i;
  const sectionPattern = /^(?:DIAGNOSIS|PROCEDURE DONE|DRUG ALLERGY|HISTORY|CLINICAL EXAMINATION|INVESTIGATIONS|LAB|RADIOLOGY|PROCEDURE\s*\/\s*OPERATION NOTES|OTHERS|GENERAL INSTRUCTIONS|REASON FOR ADMISSION|COURSE IN HOSPITAL|MEDICATIONS ADMINISTERED|CONDITION AT DISCHARGE|ADVICE ON DISCHARGE|MEDICATIONS|HOME MEDICATIONS|DIET ADVICE|FOLLOW UP DATE|REVIEW|WHEN TO OBTAIN URGENT CARE):/i;
  const setValue = (label, rawValue) => {
    const value = String(rawValue || '').trim() || 'NIL';
    const normalized = String(label || '').trim().toLowerCase();
    const setIfUseful = (key, nextValue) => {
      const cleaned = String(nextValue || '').trim();
      if (!cleaned) return;
      if (!values.has(key) || isNilLike(values.get(key))) values.set(key, cleaned);
    };
    if (normalized === 'patient name' || normalized === 'discharge summary name' || normalized === 'name') {
      setIfUseful('Patient Name', value);
      return;
    }
    if (normalized === 'age/gender') {
      const parts = value.split('/').map(item => item.trim()).filter(Boolean);
      setIfUseful('Age', parts[0] || value);
      if (parts[1]) setIfUseful('Sex', parts[1]);
      return;
    }
    if (normalized === 'age') {
      setIfUseful('Age', value);
      return;
    }
    if (normalized === 'uhid' || normalized === 'uhcid') {
      setIfUseful('UHID', value);
      return;
    }
    if (normalized === 'sex' || normalized === 'gender') {
      setIfUseful('Sex', value);
    }
  };
  for (let index = 0; index < lines.length; index += 1) {
    if (sectionPattern.test(lines[index].trim())) break;
    const match = lines[index].trim().match(demoPattern);
    if (!match) continue;
    const label = match[1].trim();
    let value = match[2].trim();
    consumed.add(index);
    let cursor = index + 1;
    while (!value && cursor < lines.length && !demoPattern.test(lines[cursor].trim()) && !sectionPattern.test(lines[cursor].trim())) {
      const candidate = lines[cursor].trim();
      consumed.add(cursor);
      if (candidate) value = candidate;
      cursor += 1;
    }
    setValue(label, value);
  }
  if (!DISCHARGE_DEMOGRAPHIC_LABELS.some(label => values.has(label))) return text;
  const keepLines = lines.filter((line, index) => !consumed.has(index));
  while (keepLines.length && !keepLines[0].trim()) keepLines.shift();
  const valueFor = label => values.get(label) || 'NIL';
  const header = [
    `Patient Name: ${valueFor('Patient Name')}`,
    `Age: ${valueFor('Age')}`,
    `UHID: ${valueFor('UHID')}`,
    `Sex: ${valueFor('Sex')}`
  ].join('\n');
  return `${header}\n\n${keepLines.join('\n')}`.trim();
}

export function formatDischargeSummaryText(text) {
  let normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  normalized = normalized
    .replace(/(^|\n)\s*Discharge Summary(?:\s*[-–—]\s*[^\n]*)?\s*(?=\n|$)/gi, '\n')
    .replace(/^Discharge Summary\s+(?=(?:Patient Name|Name)\s*:)/i, '')
    .replace(/(^|\s+)Discharge Summary\s+(?=(?:Patient Name|Discharge Summary Name|Name|Age\/Gender|Age|UHID|UHCID|Sex|Gender|IP No\.?|Address|Consultant|DOA|DOD|DIAGNOSIS)\s*:)/gi, '\n\n');
  const headingTokens = [];
  DISCHARGE_SUMMARY_HEADINGS
    .sort((a,b) => b.length - a.length)
    .forEach(label => {
      const canonical = label === 'IP No' ? 'IP No.' : label === 'PROCEDURE/OPERATION NOTES' ? 'PROCEDURE / OPERATION NOTES' : label;
      const token = `__DS_HEADING_${headingTokens.length}__`;
      headingTokens.push([token, canonical]);
      normalized = normalized.replace(new RegExp(`(^|\\s+)(${escapeRegExp(label)})\\s*:\\s*`, 'gi'), `\n\n${token}:\n`);
    });
  headingTokens.forEach(([token, canonical]) => {
    normalized = normalized.split(`${token}:`).join(`${canonical}:`);
  });
  normalized = compactDischargeDemographicHeader(normalized);
  normalized = normalizeDischargeLabValues(normalized);
  DISCHARGE_INLINE_LABELS
    .sort((a,b) => b.length - a.length)
    .forEach(label => {
      const canonical = label
        .replace(/^secondary survey$/i, 'Secondary survey')
        .replace(/^oral cavity$/i, 'Oral cavity')
        .replace(/^right upper limb$/i, 'Right upper limb')
        .replace(/^right lower limb$/i, 'Right lower limb')
        .replace(/^local examination$/i, 'Local examination');
      normalized = normalized.replace(new RegExp(`(^|[\\s.])(${escapeRegExp(label)})\\s*[:;-]\\s*`, 'gi'), (match, leading) => {
        const prefix = leading && leading.trim() === '.' ? '.\n' : '\n';
        return `${prefix}${canonical}: `;
      });
    });
  normalized = normalized
    .replace(/\s+(\d+[.)])\s*/g, '\n$1 ')
    .replace(/^Discharge Summary\s*/i, '')
    .replace(/(^|\n)\s*Discharge Summary\s*(?=\n|$)/gi, '\n')
    .replace(/^(?:\n\s*)+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized;
}

export function normalizeNumberedSectionHeadings(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/(^|\n)\s*\d+[.)]\s*(Review Note(?:\s*\([^)]*\))?|Review of Investigations|Current Medications|Medications|Prescription|Rx|R\/x|Advice|Instructions?|Treatment Plan|Follow[- ]?up):\s*/gi, (match, leadingBreak, label) => {
      const normalizedLabel = /^(?:Rx|R\/x)$/i.test(label.trim()) ? 'Prescription' : label.trim();
      return `${leadingBreak}${leadingBreak ? '\n' : ''}${normalizedLabel}:\n`;
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function reviewNoteTimestampValue(heading) {
  const match = String(heading || '').match(/^Review Note\s*\(([^)]*)\):$/i);
  if (!match) return null;
  const parts = match[1].match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:,\s*)?(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!parts) return null;
  let [, day, month, year, hour, minute, meridiem] = parts;
  year = Number(year);
  if (year < 100) year += 2000;
  hour = Number(hour);
  minute = Number(minute);
  if (meridiem) {
    const period = meridiem.toUpperCase();
    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
  }
  const timestamp = new Date(year, Number(month) - 1, Number(day), hour, minute).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function organizeIpReviewNotes(text) {
  const normalized = normalizeNumberedSectionHeadings(text).replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  const lines = normalized.split('\n');
  const introLines = [];
  const reviewBlocks = [];
  let currentBlock = null;
  lines.forEach(line => {
    if (/^Review Note(?:\s*\([^)]*\))?:$/i.test(line.trim())) {
      if (currentBlock) reviewBlocks.push(currentBlock);
      currentBlock = [line];
      return;
    }
    if (currentBlock) currentBlock.push(line);
    else if (!/^Review Notes:$/i.test(line.trim())) introLines.push(line);
  });
  if (currentBlock) reviewBlocks.push(currentBlock);
  if (!reviewBlocks.length) return normalized;
  const indexedBlocks = reviewBlocks.map((block, index) => ({
    block,
    index,
    timestamp: reviewNoteTimestampValue(block[0])
  }));
  const allTimestamped = indexedBlocks.every(item => item.timestamp !== null);
  const orderedBlocks = allTimestamped
    ? indexedBlocks.sort((a, b) => b.timestamp - a.timestamp || b.index - a.index)
    : indexedBlocks.reverse();
  const intro = introLines.join('\n').trim();
  const reviews = orderedBlocks
    .map(item => item.block.join('\n').trim())
    .filter(Boolean)
    .join('\n\n');
  return [intro, 'Review Notes:', reviews].filter(Boolean).join('\n\n');
}

export function noteVisitType(note) {
  return note.data?.visitType === 'IP' ? 'IP' : 'OP';
}

export function displayNoteTextForNote(note, text) {
  if (isDischargeSummaryNote(note)) return formatDischargeSummaryText(text);
  const normalized = normalizeNumberedSectionHeadings(text);
  return noteVisitType(note) === 'IP' ? organizeIpReviewNotes(normalized) : normalized;
}

export function prescriptionRowsHtml(text, { includeMalayalam = true } = {}) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n').map(line => line.trim()).filter(Boolean);
  const rows = [];
  let pendingNumber = null;
  const medicineStartPattern = /^(?:\d+[.)]\s*)?(?:Tablet|Cap|Capsule|Syrup|Inj|Injection)\b/i;
  const dosePattern = /\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|units?|iu)\b/i;
  const instructionStartPattern = /^(?:take|inject|apply|use|instill|inhale|nebulize)\b/i;
  const isMedicineLine = line => (medicineStartPattern.test(line) || dosePattern.test(line)) && !instructionStartPattern.test(line);
  const isNumberedMedicineLine = line => {
    const match = String(line || '').match(/^\d+[.)]\s+(.+)$/);
    return Boolean(match && isMedicineLine(match[1]));
  };
  const isMalayalamLine = line => /[\u0D00-\u0D7F]/.test(line);
  const isSectionHeading = line => /^(?:Patient Name|Age|UHID|Sex|Presenting Complaint|History of Present Illness|Past Medical or Surgical History|Allergies|Family History|Personal History|Examination Findings|Review of Investigations|Current Medications|Diagnosis|Treatment Plan|Advice|Instructions?|Follow[- ]?up|Review Note(?:\s*\([^)]*\))?):$/i.test(line);
  for (let index = 0; index < lines.length; index += 1) {
    if (isSectionHeading(lines[index])) break;
    const numberOnlyMatch = lines[index].match(/^(\d+[.)])$/);
    if (numberOnlyMatch) {
      pendingNumber = numberOnlyMatch[1];
      continue;
    }
    const medicineMatch = lines[index].match(/^(\d+[.)])\s*(.+)$/);
    if (!medicineMatch && isMedicineLine(lines[index])) {
      const english = lines[index + 1] && !isNumberedMedicineLine(lines[index + 1]) && !isMedicineLine(lines[index + 1]) && !isMalayalamLine(lines[index + 1]) ? lines[index + 1] : '';
      const localIndex = english ? index + 2 : index + 1;
      const local = lines[localIndex] && !isNumberedMedicineLine(lines[localIndex]) && !isMedicineLine(lines[localIndex]) ? lines[localIndex] : '';
      rows.push({
        number: `${rows.length + 1}.`,
        medicine: lines[index],
        english,
        local
      });
      pendingNumber = null;
      if (english) index += 1;
      if (local) index += 1;
      continue;
    }
    if (!medicineMatch || !isMedicineLine(medicineMatch[2])) {
      const textVal = medicineMatch ? medicineMatch[2].trim() : lines[index];
      const row = rows[rows.length - 1];
      if (row) {
        if (!row.english && !isMalayalamLine(textVal)) row.english = textVal;
        else if (!row.local) row.local = textVal;
        else row.english = row.english ? `${row.english} ${textVal}` : textVal;
        pendingNumber = null;
        continue;
      }
      rows.push({ number: `${rows.length + 1}.`, medicine: textVal, english: '', local: '' });
      pendingNumber = null;
      continue;
    }
    const english = lines[index + 1] && !isNumberedMedicineLine(lines[index + 1]) ? lines[index + 1].replace(/^\d+[.)]\s*/, '') : '';
    const local = english && lines[index + 2] && !isNumberedMedicineLine(lines[index + 2]) ? lines[index + 2].replace(/^\d+[.)]\s*/, '') : '';
    rows.push({ number: `${rows.length + 1}.`, medicine: medicineMatch[2], english, local });
    pendingNumber = null;
    if (english) index += 1;
    if (local) index += 1;
  }
  return rows.map(row => `
    <div class="rx-row">
      <div class="rx-number">${escapeHtml(row.number)}</div>
      <div class="rx-medicine">${escapeHtml(row.medicine)}</div>
      <div class="rx-instructions">
        ${row.english ? `<div>${escapeHtml(row.english)}</div>` : ''}
        ${includeMalayalam && row.local ? `<div>${escapeHtml(row.local)}</div>` : ''}
      </div>
    </div>
  `).join('');
}

export function simpleRichNoteHtml(text) {
  return String(text || '')
    .split('\n')
    .map(line => {
      const escaped = escapeHtml(line);
      if (/^Review Notes:$/i.test(line.trim())) return `<span class="review-notes-title">${escaped}</span>`;
      const formatted = escaped.replace(/^([^:<\n]{2,90}:)(\s*)/, '<strong>$1</strong>$2');
      return /^Review Note(?:\s*\([^)]*\))?:$/i.test(line.trim()) ? `<hr class="review-note-divider">${formatted}` : formatted;
    })
    .join('<br>');
}

export function richNoteHtml(text, { includeMalayalam = true } = {}) {
  const normalized = normalizeNumberedSectionHeadings(text);
  const prescriptionPattern = new RegExp(`(^|\\n)(Prescription:)\\s*\\n([\\s\\S]*?)(?=\\n+${NOTE_SECTION_LOOKAHEAD}:|$)`, 'gi');
  let html = '';
  let lastIndex = 0;
  for (const match of normalized.matchAll(prescriptionPattern)) {
    const labelIndex = match.index + match[1].length;
    html += simpleRichNoteHtml(normalized.slice(lastIndex, labelIndex));
    html += `<strong>${escapeHtml(match[2])}</strong><br><div class="rx-table">${prescriptionRowsHtml(match[3], { includeMalayalam })}</div>`;
    lastIndex = match.index + match[0].length;
  }
  html += simpleRichNoteHtml(normalized.slice(lastIndex));
  return html;
}

export function initials(value) {
  return String(value || 'N').split(' ').filter(Boolean).slice(0,2).map(part => part[0]).join('').toUpperCase();
}

export function twoLetterCode(value, fallback) {
  const label = String(value || fallback || 'NA').trim();
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.replace(/[^a-z0-9]/gi, '').slice(0,2).toUpperCase().padEnd(2, 'N');
}

export function notePatientName(note) {
  const name = note.data?.patientData?.name;
  return name && name !== 'NIL' ? name : 'Untitled note';
}

export function noteOwnerCode(note, userProfiles, fallback) {
  const credential = userProfiles[note.userId]?.credentialName || fallback || '';
  return twoLetterCode(credential, initials(notePatientName(note)));
}

export function cleanAge(value) {
  const text = String(value || '').trim();
  if (!text || /^nil$/i.test(text)) return 'NIL';
  const number = text.match(/\d+(?:\.\d+)?/)?.[0];
  return number || text.replace(/\b(years?|yrs?|old)\b/gi, '').trim() || 'NIL';
}

export function extractPatientFromNote(text, fallback = {}) {
  const source = String(text || '').replace(/\r\n/g, '\n');
  const stopLabels = 'Patient\\s+Name|Discharge\\s+Summary\\s+Name|Name|Age\\/Gender|Age|UHID|UHCID|Sex|Gender|IP\\s+No\\.?|Address|Consultant|DOA|DOD|Date';
  const findField = labelPattern => {
    const match = source.match(new RegExp(`(?:^|\\n|\\s)(?:${labelPattern}):\\s*([\\s\\S]*?)(?=\\s+(?:${stopLabels}):|\\n|$)`, 'i'));
    return match?.[1]?.trim();
  };
  const ageGender = findField('Age\\/Gender');
  const ageFromCombined = ageGender?.split('/')[0]?.trim();
  const sexFromCombined = ageGender?.split('/').slice(1).join('/').trim();
  return {
    name: findField('Patient\\s+Name|Discharge\\s+Summary\\s+Name|Name') || fallback?.name || 'NIL',
    age: findField('Age') || ageFromCombined || fallback?.age || 'NIL',
    uhid: findField('UHID|UHCID') || fallback?.uhid || 'NIL',
    sex: findField('Sex|Gender') || sexFromCombined || fallback?.sex || 'NIL'
  };
}

export function fullVisitDateLabel(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return value || 'Undated';
  const date = new Date(year, month - 1, day);
  return `${date.toLocaleDateString('en-US', { weekday: 'long' })}, ${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
}

export function compactSex(value) {
  const text = String(value || '').trim() || 'NIL';
  if (/^f(emale)?\b/i.test(text)) return 'F';
  if (/^m(ale)?\b/i.test(text)) return 'M';
  return text;
}

export function compactPatientMetaText(value) {
  return String(value || '')
    .replace(/\bFemale\b/gi, 'F')
    .replace(/\bMale\b/gi, 'M')
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:years?|yrs?|old)\b/gi, '$1');
}

export function removeNilSectionsForCopy(text) {
  const protectedInlineLabels = new Set(['patient name', 'age', 'uhid']);
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(block => block.trim())
    .map(block => {
      const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
      if (!lines.length) return '';
      if (lines.length === 1) {
        const inlineMatch = lines[0].match(/^([^:]+):\s*(.*)$/);
        if (!inlineMatch) return lines[0];
        const label = inlineMatch[1].trim().toLowerCase();
        return protectedInlineLabels.has(label) || !isNilLike(inlineMatch[2]) ? lines[0] : '';
      }
      if (/:$/.test(lines[0]) && isNilLike(lines.slice(1).join(' '))) return '';
      return lines.filter(line => {
        const inlineMatch = line.match(/^([^:]+):\s*(.*)$/);
        if (!inlineMatch) return true;
        const label = inlineMatch[1].trim().toLowerCase();
        return protectedInlineLabels.has(label) || !isNilLike(inlineMatch[2]);
      }).join('\n');
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

export function canonicalDischargeCopyHeading(label) {
  const normalized = String(label || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (normalized === 'PROCEDURE/OPERATION NOTES') return 'PROCEDURE / OPERATION NOTES';
  if (normalized === 'IP NO') return 'IP No.';
  return normalized;
}

export function isDischargeDemographicLine(line) {
  return /^(Patient Name|Discharge Summary Name|Name|Age\/Gender|Age|UHID|UHCID|Sex|Gender|IP No\.?|Address|Consultant|DOA|DOD)\s*:/i.test(String(line || '').trim());
}

export function dischargeCopySections(text) {
  const sectionMap = new Map(DISCHARGE_COPY_HEADINGS.map(heading => [heading, []]));
  const headingPattern = new RegExp(`^(${DISCHARGE_COPY_HEADINGS.map(escapeRegExp).join('|')}|PROCEDURE/OPERATION NOTES)\\s*:\\s*(.*)$`, 'i');
  const optionalHeadingPattern = /^([A-Z][A-Z\s/&()-]{2,}CONSULTATION)\s*:\s*(.*)$/i;
  const optionalHeadings = [];
  const lines = formatDischargeSummaryText(text).replace(/\r\n/g, '\n').split('\n');
  let currentHeading = null;
  lines.forEach(rawLine => {
    const line = rawLine.trim();
    if (!line) {
      if (currentHeading) sectionMap.get(currentHeading).push('');
      return;
    }
    if (isDischargeDemographicLine(line)) return;
    const headingMatch = line.match(headingPattern);
    if (headingMatch) {
      currentHeading = canonicalDischargeCopyHeading(headingMatch[1]);
      const inlineValue = headingMatch[2].trim();
      if (inlineValue) sectionMap.get(currentHeading).push(inlineValue);
      return;
    }
    const optionalHeadingMatch = line.match(optionalHeadingPattern);
    if (optionalHeadingMatch) {
      currentHeading = optionalHeadingMatch[1].trim().toUpperCase().replace(/\s+/g, ' ');
      if (!sectionMap.has(currentHeading)) {
        sectionMap.set(currentHeading, []);
        optionalHeadings.push(currentHeading);
      }
      const inlineValue = optionalHeadingMatch[2].trim();
      if (inlineValue) sectionMap.get(currentHeading).push(inlineValue);
      return;
    }
    if (currentHeading) sectionMap.get(currentHeading).push(rawLine.trimEnd());
  });
  const courseIndex = DISCHARGE_COPY_HEADINGS.indexOf('COURSE IN HOSPITAL');
  const orderedHeadings = [
    ...DISCHARGE_COPY_HEADINGS.slice(0, courseIndex + 1),
    ...optionalHeadings,
    ...DISCHARGE_COPY_HEADINGS.slice(courseIndex + 1)
  ];
  return orderedHeadings.map(heading => {
    const content = (sectionMap.get(heading) || []).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return { heading, content: content || 'Nil' };
  });
}

export function dischargeCopyPlainText(text) {
  return dischargeCopySections(text)
    .map(({ heading, content }) => `${heading} :\n${content}`)
    .join('\n\n')
    .trim();
}

export function dischargeCopyHtml(text) {
  const sections = dischargeCopySections(text)
    .map(({ heading, content }) => {
      const contentHtml = escapeHtml(content).replace(/\n/g, '<br>');
      return `<p style="margin:0 0 14px 0;"><strong>${escapeHtml(heading)}</strong> :<br>${contentHtml}</p>`;
    })
    .join('');
  return `<div style="font-family:Candara, Arial, sans-serif;font-size:14px;line-height:1.35;color:#000;">${sections}</div>`;
}

export function adminClipboardPayloadForNote(note, text) {
  if (isDischargeSummaryNote(note)) {
    return {
      text: dischargeCopyPlainText(text),
      html: dischargeCopyHtml(text)
    };
  }
  return { text: removeNilSectionsForCopy(text), html: '' };
}

export function patientTimelineKey(note) {
  const patient = note?.data?.patientData || {};
  const uhid = String(patient.uhid || '').trim().toLowerCase();
  if (uhid && uhid !== 'nil') return `uhid:${uhid}`;
  return [
    patient.name,
    cleanAge(patient.age),
    compactSex(patient.sex)
  ].map(value => String(value || '').trim().toLowerCase()).join('|');
}

export function noteDocumentMode(note) {
  return String(note?.data?.selectedMode || note?.data?.heading || '').trim();
}

export function isStandaloneDocumentNote(note) {
  return /^(?:Reply letter|Medical certificate|Discharge summary)(?: draft)?$/i.test(noteDocumentMode(note));
}

export function timelineEntryKey(note) {
  return note?.path || `${note?.userId || ''}:${note?.id || ''}`;
}

export function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function noteTimelineTitle(note, selectedVisitDate) {
  const mode = note.data?.selectedMode || note.data?.heading || 'Visit Note';
  const dateText = fullVisitDateLabel(note.data?.visitDate || dateInputValue(selectedVisitDate)).replace(/^[^,]+,\s*/, '');
  const timeText = note.data?.createdAtLabel ? String(note.data.createdAtLabel).split(',').slice(1).join(',').trim() : '';
  return `${mode} - ${dateText}${timeText ? `, ${timeText}` : ''}`;
}

export function prescriptionTextFromNote(text) {
  const normalized = normalizeNumberedSectionHeadings(text);
  const sections = [];
  const pattern = /(?:^|\n)Prescription:[ \t]*\n([\s\S]*?)(?=\n+(?:Patient Name|Age|UHID|Sex|Presenting Complaint|History of Present Illness|Past Medical or Surgical History|Allergies|Family History|Personal History|Examination Findings|Review of Investigations|Current Medications|Diagnosis|Treatment Plan|Advice|Instructions?|Follow[- ]?up|Review Note(?:\s*\([^)]*\))?):|$)/gi;
  for (const match of normalized.matchAll(pattern)) {
    const prescription = String(match[1] || '').trim();
    if (prescription && !isNilLike(prescription)) sections.push(prescription);
  }
  return sections.join('\n');
}

export function normalizedLayoutBlock(block, defaults) {
  const size = ['small','medium','large'].includes(block?.size) ? block.size : defaults.size;
  return {
    text: String(block?.text ?? defaults.text ?? ''),
    enabled: block?.enabled === undefined ? defaults.enabled !== false : block.enabled !== false,
    bold: Boolean(block?.bold),
    italic: Boolean(block?.italic),
    size
  };
}

export function prescriptionLayoutForNote(note, userProfiles) {
  const saved = userProfiles[note?.userId]?.prescriptionLayout;
  return {
    includeMalayalam: saved?.includeMalayalam !== false,
    header: normalizedLayoutBlock(saved?.header, DEFAULT_PRESCRIPTION_LAYOUT.header),
    footer: normalizedLayoutBlock(saved?.footer, DEFAULT_PRESCRIPTION_LAYOUT.footer),
    signature: normalizedLayoutBlock(saved?.signature, DEFAULT_PRESCRIPTION_LAYOUT.signature)
  };
}

export function layoutBlockClass(block) {
  return [
    `layout-${block.size || 'medium'}`,
    block.bold ? 'layout-bold' : '',
    block.italic ? 'layout-italic' : ''
  ].filter(Boolean).join(' ');
}

export function printBlockHtml(block, { firstLineStrong = false } = {}) {
  const lines = String(block?.text || '').replace(/\r\n/g, '\n').split('\n');
  return lines.map((line, index) => {
    const escaped = escapeHtml(line);
    return firstLineStrong && index === 0 ? `<strong>${escaped}</strong>` : escaped;
  }).join('<br>');
}

export function footerBlockHtml(block) {
  const rawText = String(block?.text || '').replace(/\r\n/g, '\n').trim();
  const text = rawText.split(/\n+/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
  if (!text) return '';
  const emergencyIndex = text.search(/\bEmergency\s+Contact\b/i);
  const displayLines = emergencyIndex > 0
    ? [text.slice(0, emergencyIndex).trim(), text.slice(emergencyIndex).trim()]
    : text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  return displayLines.map(line => `<span class="rx-print-footer-line">${escapeHtml(line)}</span>`).join('');
}

export function createPrintWindow() {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.style.opacity = '0';
  document.body.appendChild(frame);
  const frameWindow = frame.contentWindow;
  if (!frameWindow) return window.open('', '_blank');
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    setTimeout(() => frame.remove(), 500);
  };
  frameWindow.addEventListener('afterprint', cleanup, { once: true });
  return {
    document: frameWindow.document,
    focus: () => frameWindow.focus(),
    print: () => {
      frameWindow.focus();
      frameWindow.print();
    },
    close: () => setTimeout(cleanup, 2500)
  };
}

export function compactVisitDateTime(note) {
  const date = note.data?.visitDate ? note.data.visitDate.split('-').reverse().join('/') : '';
  const labelTime = String(note.data?.createdAtLabel || '').split(',').slice(1).join(',').trim();
  if (date && labelTime) return `${date} ${labelTime}`;
  return date || labelTime || '';
}

export function userLabel(userId, index, userProfiles) {
  return userProfiles[userId]?.credentialName || `User ${index + 1}`;
}

export function noteMeta(note, userProfiles) {
  const patient = note.data?.patientData || {};
  const pieces = [];
  const dateTime = compactVisitDateTime(note);
  if (dateTime) pieces.push(dateTime);
  if (patient.uhid) pieces.push(`UHID ${patient.uhid}`);
  if (patient.age) pieces.push(cleanAge(patient.age));
  if (patient.sex) pieces.push(compactSex(patient.sex));
  return compactPatientMetaText(pieces.join(' · ') || note.userLabel);
}

export function noteSubMeta(note) {
  const mode = note.data?.selectedMode || note.data?.heading || 'Saved note';
  return compactPatientMetaText(mode);
}

export function noteTime(note) {
  return note.data?.updatedAt?.toMillis?.()
    || note.data?.createdAt?.toMillis?.()
    || note.data?.createdAtValue?.toMillis?.()
    || 0;
}

export function noteCreatedTime(note) {
  return note.data?.createdAt?.toMillis?.()
    || note.data?.createdAtValue?.toMillis?.()
    || noteTime(note);
}

export function isSavedNote(note) {
  return note.data?.isDraft === false || note.data?.everSaved === true;
}

export function isReviewedNote(note) {
  return Boolean(note?.data?.adminCopiedAt);
}

export function reviewedHeadingValue(value) {
  return String(value || '').replace(/\s+draft$/i, '').trim();
}

export function reviewedStatusPatch(note, currentAdminUid) {
  const patch = {
    isDraft: false,
    everSaved: true,
    adminCopiedAt: serverTimestamp(),
    adminCopiedBy: currentAdminUid || ''
  };
  const selectedMode = reviewedHeadingValue(note?.data?.selectedMode);
  const heading = reviewedHeadingValue(note?.data?.heading);
  if (selectedMode) patch.selectedMode = selectedMode;
  if (heading) patch.heading = heading;
  return patch;
}
