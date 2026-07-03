# Saif Elite QS — CRM

Custom CRM for Saif Elite QS (Quantity Surveyor & Cost Consultant)

## Users
- **Saif** — CEO (full access)
- **Nouman** — Marketing (full access)
- **Zafar** — Operations (full access)

## Deployment Steps

### 1. GitHub
- Repo banao: `saif-elite-qs-crm`
- Sab files upload karo

### 2. Vercel Deploy
- vercel.com → Add New Project → GitHub repo import → Deploy

### 3. Vercel KV Database (Storage → Create Database → KV)
- Naam: `seqs-db`
- Project se connect karo

### 4. Vercel Blob Storage (Storage → Create Database → Blob)
- Naam: `seqs-files`
- Access: **Public**
- Project se connect karo

### 5. Environment Variables (Settings → Environment Variables)
Add these 3 passwords:
```
PASSWORD_SAIF     = (saif ka password)
PASSWORD_NOUMAN   = (nouman ka password)
PASSWORD_ZAFAR    = (zafar ka password)
```

### 6. Redeploy
Deployments tab → latest → ... → Redeploy

## Tech Stack
- Next.js 14
- Vercel KV (database)
- Vercel Blob (file storage)
- Deployed on Vercel
