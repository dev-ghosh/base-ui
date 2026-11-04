// Edge-function caller. Port of callEdgeFunction in rie-dashboard2/js/contacts.js
// (also the shape used inline by events.js, tasks.js). The old code sends the
// anon key as the bearer on purpose; the five Claude functions enforce auth via
// RLS and `device-pair` verifies JWTs itself.
import { sbUrl, sbKey } from './config.js';

export async function callEdgeFunction(fnName, body) {
  const url = sbUrl();
  const key = sbKey();
  const res = await fetch(`${url}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.text(); throw new Error(`${fnName} failed: ${e}`); }
  return res.json();
}
