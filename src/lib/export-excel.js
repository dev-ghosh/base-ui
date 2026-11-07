/* export-excel.js — "Export to Excel" (top bar > account menu > Data). Port of
 * rie-dashboard2/js/export.js. SheetJS is not an npm dependency: the same CDN build the old index.html
 * loaded in a <script> tag is loaded here, on demand, the first time someone exports.
 *
 * buildExportSheets() is pure (data in, sheets out) so it is tested without a browser.
 */
import { store } from '../store/store.js';
import { setStatus } from './status.js';

export const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.mini.min.js';
export const LOAD_FAILED_MSG = 'Export library not loaded — try refreshing the page';

const CONTACT_HEADERS = [
  'ID', 'Name', 'Organisation', 'Designation', 'Category', 'ABC', 'ABC Full',
  'Location', 'Email', 'Phone', 'LinkedIn', 'Source',
  '2nd POC Email', '2nd POC Phone', 'Assigned To', 'Project',
  'Intro', 'Intro Date', 'Last Meeting', 'Last Agenda', 'Next Follow-up',
  'Next Step', 'Key Inputs', 'Action Item', 'Current Status', 'Work Status',
  'Remarks', 'Remarks 2', 'Birthday', 'Interests',
  'Created By', 'Updated By', 'Created At', 'Updated At',
];
const TASK_HEADERS = [
  'ID', 'Task', 'Project', 'Category', 'Status', 'Priority', 'Assigned To',
  'Contact Name', 'Contact Org', 'Contact ID',
  'Next Follow-up', 'Last Meeting', 'Start Date', 'End Date',
  'Action Item', 'Key Inputs',
  'Created By', 'Updated By', 'Updated At',
];
const LEAD_HEADERS = [
  'ID', 'Title', 'Type', 'Stage', 'Organisation', 'Contact', 'Contact ID',
  'Amount', 'Deadline', 'Next Step', 'Next Follow-up', 'Assigned To', 'Priority',
  'Outcome', 'Notes', 'Source Task ID', 'Stage Since',
  'Created By', 'Created At', 'Updated By', 'Updated At',
];
const EVENT_HEADERS = ['ID', 'Title', 'Type', 'Date', 'Time', 'Venue', 'Description', 'Status', 'Created By', 'Created At'];
const GUEST_HEADERS = ['ID', 'Event ID', 'Event Title', 'Contact ID', 'Name', 'Email', 'Phone', 'RSVP', '+1s', 'Invite Sent', 'RSVP Updated', 'Notes'];

/**
 * The sheets of the workbook, in order: Contacts and Tasks always, Leads / Events / Event Guests only
 * when there is something in them. @returns {{name: string, headers: string[], rows: any[][]}[]}
 */
export function buildExportSheets({ contacts = [], tasks = [], leads = [], events = [], guests = [] } = {}) {
  const sheets = [
    {
      name: 'Contacts', headers: CONTACT_HEADERS,
      rows: contacts.map((c) => [
        c.id, c.name, c.org, c.designation, c.category, c.priority, c.priorityFull,
        c.location, c.email, c.phone, c.linkedin, c.source,
        c.poc2Email, c.poc2Phone, c.assignedTo, c.project,
        c.intro, c.introDate, c.lastMtg, c.lastAgenda, c.nextFollowUp,
        c.nextStep, c.keyInputs, c.actionItem, c.status, c.workStatus,
        c.remarks, c.remarks2, c.birthday, c.interests,
        c.createdBy, c.updatedBy, c.createdAt, c.updatedAt,
      ]),
    },
    {
      name: 'Tasks', headers: TASK_HEADERS,
      rows: tasks.map((t) => [
        t.id, t.task, t.project, t.category, t.status, t.priority || '', t.assignedTo || '',
        t.contactName, t.contactOrg, t.contactId || '',
        t.nextFollowUp, t.lastMtg, t.startDate, t.endDate,
        t.actionItem, t.keyInputs,
        t.createdBy, t.updatedBy, t.updatedAt,
      ]),
    },
  ];
  if (leads.length) {
    sheets.push({
      name: 'Leads', headers: LEAD_HEADERS,
      rows: leads.map((l) => [
        l.id, l.title, l.type, l.stage, l.org, l.contactName, l.contactId || '',
        l.amount ?? '', l.deadline, l.nextStep, l.nextFollowUp, l.assignedTo, l.priority || '',
        l.outcome, l.notes, l.sourceTaskId || '', l.stageChangedAt,
        l.createdBy, l.createdAt, l.updatedBy, l.updatedAt,
      ]),
    });
  }
  if (events.length) {
    sheets.push({
      name: 'Events', headers: EVENT_HEADERS,
      rows: events.map((e) => [e.id, e.title, e.type, e.date, e.time, e.venue, e.description, e.status, e.createdBy, e.createdAt]),
    });
  }
  if (guests.length) {
    sheets.push({
      name: 'Event Guests', headers: GUEST_HEADERS,
      rows: guests.map((g) => {
        const ev = events.find((e) => e.id === g.eventId);
        return [g.id, g.eventId, ev ? ev.title : '', g.contactId || '', g.name, g.email, g.phone, g.rsvp, g.plusOne, g.inviteSentAt, g.rsvpUpdatedAt, g.notes];
      }),
    });
  }
  return sheets;
}

export const exportFileName = (now = new Date()) => `BASE_Export_${now.toISOString().slice(0, 10)}.xlsx`;

let loading = null;

/**
 * Load SheetJS once, on demand: a <script> tag for SHEETJS_URL, resolved with window.XLSX. A failed
 * load is forgotten so the next export tries again. Nothing is loaded until this is called.
 */
export function loadSheetJS() {
  if (typeof window === 'undefined') return Promise.reject(new Error(LOAD_FAILED_MSG));
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SHEETJS_URL;
    el.async = true;
    el.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error(LOAD_FAILED_MSG)));
    el.onerror = () => reject(new Error(LOAD_FAILED_MSG));
    document.head.appendChild(el);
  }).then((x) => { loading = null; return x; }, (e) => { loading = null; throw e; });
  return loading;
}

/** Build the workbook from the store and save it as BASE_Export_<date>.xlsx. */
export async function exportToExcel() {
  let XLSX;
  try {
    XLSX = await loadSheetJS();
  } catch {
    setStatus('error', LOAD_FAILED_MSG);
    return;
  }
  setStatus('syncing', 'Preparing export…');
  const s = store.getState();
  const wb = XLSX.utils.book_new();
  for (const sheet of buildExportSheets(s)) {
    const ws = XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows]);
    ws['!cols'] = Array(sheet.headers.length).fill({ wch: 20 });
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  XLSX.writeFile(wb, exportFileName());
  setStatus('online', `Export complete — ${s.contacts.length} contacts, ${s.tasks.length} tasks`);
}
