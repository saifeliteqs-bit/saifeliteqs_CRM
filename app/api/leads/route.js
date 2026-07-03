import { kv } from '@vercel/kv';

const KEY = 'seqs:leads';

export async function GET() {
  try {
    const leads = await kv.get(KEY) || [];
    return Response.json(leads);
  } catch (e) {
    return Response.json([], { status: 200 });
  }
}

export async function POST(req) {
  try {
    const lead = await req.json();
    const leads = await kv.get(KEY) || [];
    const idx = leads.findIndex(l => l.id === lead.id);
    if (idx >= 0) leads[idx] = lead;
    else leads.unshift(lead);
    await kv.set(KEY, leads);
    return Response.json({ ok: true, lead });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const leads = await kv.get(KEY) || [];
    await kv.set(KEY, leads.filter(l => l.id !== id));
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
