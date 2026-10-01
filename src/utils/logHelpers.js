export const LOG_ADMIN_EMAIL = 'aster-admin@woyz.in';

export function titleCaseAction(action) {
  return String(action || 'activity')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

export function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateFromInputValue(value) {
  const parts = String(value || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return new Date();
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function logDate(log) {
  return log?.createdAt?.toDate?.() || (log?.createdAt ? new Date(log.createdAt) : null);
}

export function dateKey(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date ? dateInputValue(date) : '';
}

export function prettyDate(value) {
  return dateFromInputValue(value).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function timeText(date) {
  if (!date) return '--';
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).replace('am', 'AM').replace('pm', 'PM');
}

export function hourKey(date) {
  if (!date) return '';
  return date.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    hour12: true
  }).replace('am', 'AM').replace('pm', 'PM');
}

export function initials(value) {
  const source = String(value || 'User').replace(/@.*/, '').replace(/[^a-z0-9 ]/gi, ' ').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  return parts.slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

export function logCredentialName(log, userProfiles = new Map()) {
  return log?.credentialName || userProfiles.get(log?.userId)?.credentialName || '';
}

export function logDoctorCredential(log, userProfiles = new Map()) {
  const profile = userProfiles.get(log?.userId) || {};
  const name = profile.doctorCredentialName || log?.doctorCredentialName || '';
  const employeeId = profile.doctorCredentialEmployeeId || log?.doctorCredentialEmployeeId || '';
  return name && employeeId ? `${name} (${employeeId})` : 'NIL';
}

export function logHaystack(log, userProfiles = new Map()) {
  return [
    log.action,
    log.page,
    log.email,
    logCredentialName(log, userProfiles),
    logDoctorCredential(log, userProfiles),
    log.userId,
    log.noteId,
    log.noteOwnerUid,
    log.noteType,
    log.patientName,
    log.uhid,
    log.visitDate,
    log.visitType,
    log.geminiModel,
    log.recordingDuration,
    log.geminiAttempts
  ].filter(Boolean).join(' ').toLowerCase();
}

export function logActor(log, userProfiles = new Map()) {
  return logCredentialName(log, userProfiles) || log.email || log.userId || 'Unknown user';
}

export function logActorDetail(log, userProfiles = new Map()) {
  const items = [];
  const credentialName = logCredentialName(log, userProfiles);
  if (credentialName) items.push(`credential: ${credentialName}`);
  if (log.email) items.push(log.email);
  if (log.page) items.push(`page: ${log.page}`);
  items.push(`doctor: ${logDoctorCredential(log, userProfiles)}`);
  return items.join(' / ') || 'activity stream';
}

export function categoryForLog(log) {
  const action = String(log.action || '').toLowerCase();
  const page = String(log.page || '').toLowerCase();
  if (page === 'master-admin' || page === 'master' || action.includes('master') || action.includes('mapped') || action.includes('group')) return 'master';
  if (page === 'index' || action.startsWith('admin') || action.includes('emr') || action.includes('ip_')) return 'admin';
  if (/note|draft|add_on|addon|discharge|copied|printed|saved|deleted|template/.test(action)) return 'notes';
  if (page === 'user' || action.includes('signed_in') || action.includes('signed_out')) return 'users';
  return 'admin';
}

export function isGeminiApiLog(log) {
  const haystack = [
    log.action,
    log.page,
    log.email,
    log.noteType,
    log.geminiModel,
    log.recordingDuration,
    log.geminiAttempts
  ].filter(Boolean).join(' ').toLowerCase();
  return /gemini|generativelanguage|google ai|api use|api_usage|generatecontent|voice_note_generated|discharge_summary_generated|add_on_completed/.test(haystack);
}

export function noteActivityType(log) {
  const action = String(log.action || '').toLowerCase();
  const noteType = String(log.noteType || '').toLowerCase();
  const haystack = `${action} ${noteType}`;
  if (/add_on|addon/.test(action) || /add on/.test(haystack)) return 'addon';
  if (action.includes('discharge_summary') || noteType.includes('discharge') || haystack.includes('discharge summary')) return 'discharge';
  return 'visit';
}

export function geminiValue(value) {
  const cleaned = String(value ?? '').replace(/\s+/g, ' ').trim();
  return cleaned || '--';
}

export function geminiDuration(log) {
  const value = log?.recordingDuration;
  if (typeof value === 'number') return `${value}s`;
  return geminiValue(value);
}

export function geminiAttempts(log) {
  const value = log?.geminiAttempts;
  if (value === 0) return '0';
  return geminiValue(value);
}

export function logMatchesRange(log, selectedRange, selectedDate) {
  const date = logDate(log);
  if (!date) return false;
  if (selectedRange === '7days') {
    const end = new Date(dateFromInputValue(selectedDate));
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return date >= start && date <= end;
  }
  return dateKey(log.createdAt) === selectedDate;
}

export function logMatchesQuickFilter(log, selectedQuickFilter) {
  if (!selectedQuickFilter) return true;
  const action = String(log.action || '').toLowerCase();
  if (selectedQuickFilter === 'signins') return action.includes('signed_in') || action.includes('sign');
  if (selectedQuickFilter === 'failed') return action.includes('failed') || action.includes('denied') || action.includes('error');
  if (selectedQuickFilter === 'last60') {
    const date = logDate(log);
    return date && Date.now() - date.getTime() <= 60 * 60 * 1000;
  }
  return true;
}

export function sameActionText(log) {
  const action = titleCaseAction(log.action);
  if (String(log.action || '').toLowerCase().includes('signed_in')) return 'Signed in';
  if (String(log.action || '').toLowerCase().includes('signed_out')) return 'Signed out';
  return action;
}

export function actionTarget(log) {
  if (log.patientName) return log.patientName;
  return log.page ? `${log.page} console` : 'activity stream';
}
