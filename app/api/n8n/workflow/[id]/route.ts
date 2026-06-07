import { NextRequest } from 'next/server';

const N8N_BASE_URL = process.env.N8N_BASE_URL;
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!N8N_BASE_URL) console.warn('[n8n] N8N_BASE_URL is not set');
if (!N8N_API_KEY) console.warn('[n8n] N8N_API_KEY is not set');

function n8nHeaders() {
  return {
    'X-N8N-API-KEY': N8N_API_KEY!,
    'Content-Type': 'application/json',
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  if (!N8N_BASE_URL || !N8N_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'n8n API env vars not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const url = `${N8N_BASE_URL.replace(/\/$/, '')}/api/v1/workflows/${id}`;
  console.log('[n8n] GET workflow', { id, url });

  try {
    const res = await fetch(url, { method: 'GET', headers: n8nHeaders() });
    const text = await res.text();
    console.log('[n8n] GET response', res.status, text.slice(0, 300));

    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[n8n] GET error', err);
    return new Response(
      JSON.stringify({ error: 'Internal error fetching n8n workflow' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  if (!N8N_BASE_URL || !N8N_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'n8n API env vars not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: string;
  try {
    const json = await req.json();
    body = JSON.stringify(json);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const url = `${N8N_BASE_URL.replace(/\/$/, '')}/api/v1/workflows/${id}`;
  console.log('[n8n] PUT workflow', { id, url });

  try {
    const res = await fetch(url, { method: 'PUT', headers: n8nHeaders(), body });
    const text = await res.text();
    console.log('[n8n] PUT response', res.status, text.slice(0, 300));

    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[n8n] PUT error', err);
    return new Response(
      JSON.stringify({ error: 'Internal error updating n8n workflow' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
