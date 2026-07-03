import { put } from '@vercel/blob';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file     = formData.get('file');
    const leadId   = formData.get('leadId') || 'general';

    if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });

    const filename  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const pathname  = `seqs/${leadId}/${Date.now()}_${filename}`;

    const blob = await put(pathname, file, { access: 'public' });

    return Response.json({ url: blob.url, name: file.name });
  } catch (e) {
    console.error('Upload error:', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
