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

    // Extract fields from Zapier payload
    const name         = body.name || body.full_name || 'Unknown';
    const phone        = body.phone || body.phone_number || '';
    const email        = body.email || '';
    const service      = body.service || 'Quantity Surveying';
    const scope        = body.scope || body.project_type || '';
    const projectStage = body.projectStage || body.project_stage || '';
    const communication= body.communication || '';
    const source       = body.source || 'Facebook Ads';

    // Build scope text
    const scopeText = [
      scope        && `Project Type: ${scope}`,
      projectStage && `Project Stage: ${projectStage}`,
      communication&& `Preferred Contact: ${communication}`,
    ].filter(Boolean).join('\n');

    // Get existing leads
    const leads = await kv.get(LEADS_KEY) || [];

    // Check duplicate by phone
    const isDuplicate = phone && leads.some(l => l.phone === phone);
    if (isDuplicate) {
      return Response.json({ ok: true, message: 'Duplicate lead skipped', duplicate: true });
    }

    const leadId = generateLeadId(leads);
    const now    = new Date().toISOString();

    const newLead = {
      id:        `lead_zapier_${Date.now()}`,
      leadId,
      name,
      phone,
      email,
      service,
      scope:     scopeText,
      source,
      stage:     'new',
      createdAt: now,
      updatedAt: now,
      createdBy: 'zapier',
      activities: [{
        id:   `act_zapier_${Date.now()}`,
        type: 'note',
        note: `🤖 Auto-imported from Facebook Lead Ad via Zapier\n${scopeText}`,
        by:   'zapier',
        at:   now,
      }],
      files: [],
    };

    // Add to top of leads array
    leads.unshift(newLead);
    await kv.set(LEADS_KEY, leads);

    console.log(`New Zapier lead saved: ${name} (${leadId})`);
    return Response.json({ ok: true, leadId, name });

  } catch (err) {
    console.error('Zapier webhook error:', err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
