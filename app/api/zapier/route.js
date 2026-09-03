// app/api/zapier/route.js
// Dedicated endpoint for Zapier → CRM integration

import { kv } from '@vercel/kv';

const LEADS_KEY = 'seqs:leads';

function generateLeadId(leads) {
  const nums = leads
    .map(l => l.leadId)
    .filter(Boolean)
    .map(id => parseInt(id.replace('SEQS-', '')) || 0);
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return 'SEQS-' + String(next).padStart(4, '0');
}

export async function POST(req) {
  try {
    const body = await req.json();

    const name          = body.name || body.full_name || 'Unknown';
    const phone         = body.phone || body.phone_number || '';
    const email         = body.email || '';
    const service       = body.service || 'Quantity Surveying';
    const scope         = body.scope || body.project_type || '';
    const projectStage  = body.projectStage || body.project_stage || '';
    const communication = body.communication || '';
    const source        = 'Facebook Ads';

    const scopeText = [
      scope         && `Project Type: ${scope}`,
      projectStage  && `Project Stage: ${projectStage}`,
      communication && `Preferred Contact: ${communication}`,
    ].filter(Boolean).join('\n');

    const leads = await kv.get(LEADS_KEY) || [];

    // Check duplicate by phone
    const isDuplicate = phone && leads.some(l => l.phone === phone);
    if (isDuplicate) {
      return Response.json({ ok: true, message: 'Duplicate lead skipped', duplicate: true });
    }

    const leadId = generateLeadId(leads);
    const now    = new Date().toISOString();

    const newLead = {
      id:         `lead_zapier_${Date.now()}`,
      leadId,
      name,
      phone,
      email,
      service,
      scope:      scopeText,
      source,
      stage:      'new',        // HARDCODED lowercase — never from Zapier
      createdAt:  now,
      updatedAt:  now,
      createdBy:  'zapier',
      activities: [{
        id:   `act_zapier_${Date.now()}`,
        type: 'note',
        note: `🤖 Auto-imported from Facebook Lead Ad\nProject Type: ${scope}\nProject Stage: ${projectStage}\nPreferred Contact: ${communication}`,
        by:   'zapier',
        at:   now,
      }],
      files: [],
    };

    leads.unshift(newLead);
    await kv.set(LEADS_KEY, leads);

    return Response.json({ ok: true, leadId, name, stage: newLead.stage });

  } catch (err) {
    console.error('Zapier webhook error:', err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
