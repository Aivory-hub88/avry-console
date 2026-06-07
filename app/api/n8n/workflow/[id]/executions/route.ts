import { NextRequest } from 'next/server';

const N8N_BASE_URL = process.env.N8N_BASE_URL;
const N8N_API_KEY = process.env.N8N_API_KEY;

export async function GET(
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

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const url = `${N8N_BASE_URL.replace(/\/$/, '')}/api/v1/executions?workflowId=${id}&limit=${limit}`;

  console.log('[n8n] Fetch executions', { id, url });

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' },
    });

    const text = await res.text();
    console.log('[n8n] Executions response', res.status, text.slice(0, 200));

    if (!res.ok) {
      return new Response(
        text || JSON.stringify({ error: 'Failed to fetch executions' }),
        { status: res.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(text, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[n8n] Executions error', err);
    return new Response(
      JSON.stringify({ error: 'Internal error fetching executions' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
