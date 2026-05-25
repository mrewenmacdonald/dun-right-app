# DÙN RIGHT — Setup Guide & Cost Analysis

## Cost Analysis: 10-Person Operation

### Microsoft 365 Licensing

| User | Current Plan | Recommended | Monthly Cost |
|------|-------------|-------------|-------------|
| Ewen (Supervisor) | M365 Business | Keep as-is | ~$22 |
| Ivy (Supervisor) | M365 Business | Keep as-is | ~$22 |
| 8 × Field Staff | None / paying $15.99? | **M365 Business Basic** | $6/user = **$48** |
| **Total M365** | | | **~$92/month** |

**vs. paying $15.99/month per field staff:** 8 × $15.99 = $127.92 + your two = $172 total  
**Savings: ~$80/month ($960/year)** by switching field staff to Business Basic

**M365 Business Basic ($6/user/month) gives field staff:**
- Outlook email
- OneDrive (1TB per user) 
- Teams (messaging/calls)
- Web versions of Word/Excel
- Everything the DÙN RIGHT app needs to sync files

---

### App Hosting

| Option | Cost | Best For | Notes |
|--------|------|----------|-------|
| **Azure Static Web Apps (Free)** | $0/month | ✅ Recommended | 100GB bandwidth, integrates with M365/OneDrive |
| Azure Static Web Apps (Standard) | $9/month | If you need custom auth | Adds Azure AD login |
| Netlify (Free) | $0/month | Simple alternative | Easy deploy, global CDN |
| Your own domain | ~$15/year | Professional URL | e.g. app.kelticgeo.com |

**Recommendation: Azure Static Web Apps (Free tier) + your own domain**
- Ties into your existing Microsoft ecosystem
- Deploys straight from a GitHub repository
- Global CDN means fast loads even in remote areas
- Custom domain (e.g. `field.kelticgeo.com`) looks professional

---

### Total Monthly Cost Summary

| Item | Monthly |
|------|---------|
| M365 for Ewen + Ivy (existing) | ~$44 |
| M365 Business Basic × 8 field staff | $48 |
| Azure Static Web Apps hosting | $0 |
| Domain renewal (amortized) | ~$1 |
| **TOTAL** | **~$93/month** |

---

## Deployment Steps (How to Get This Live)

### Step 1 — Create a GitHub Repository
1. Go to github.com and create a free account (or use existing)
2. Create a new repository called `dun-right-app`
3. Upload all files from this `DUN-RIGHT-APP` folder

### Step 2 — Deploy to Azure Static Web Apps
1. Go to portal.azure.com (log in with your Microsoft account)
2. Search for "Static Web Apps" → Create
3. Connect to your GitHub repository
4. Azure will generate a URL like `https://lively-stone-abc123.azurestaticapps.net`
5. Add your custom domain in the Azure portal settings

### Step 3 — Microsoft Graph API Setup (for OneDrive + Outlook)
This allows the app to save files to OneDrive and send emails from Outlook.

1. Go to portal.azure.com → "App Registrations" → New Registration
2. Name: "DÙN RIGHT App"
3. Supported account types: "Accounts in this organizational directory only"
4. Redirect URI: `https://your-app-url.com` (your Azure Static Web App URL)
5. After creation, note the **Client ID** and **Tenant ID**
6. Under "API Permissions" add:
   - `Files.ReadWrite` (OneDrive)
   - `Mail.Send` (Outlook email)
   - `User.Read` (profile)
7. Grant admin consent

8. Add these values to a file called `js/config.js` in your app:
```javascript
export const MSAL_CONFIG = {
  clientId: 'YOUR_CLIENT_ID_HERE',
  tenantId: 'YOUR_TENANT_ID_HERE',
  redirectUri: 'https://your-app-url.com'
};
```

### Step 4 — Add MSAL Authentication (Supervisor Login with Microsoft)
Install the MSAL library by adding this to index.html before the other scripts:
```html
<script src="https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js"></script>
```

Then in `js/auth.js`, initialize MSAL and call `setAccessToken()` from sync.js with the token after Microsoft login.

### Step 5 — Install on Phones

**iPhone:**
1. Open Safari, go to your app URL
2. Tap the Share button (box with arrow)
3. Scroll down → "Add to Home Screen"
4. Tap Add → app icon appears on home screen

**Android:**
1. Open Chrome, go to your app URL
2. Tap the three-dot menu → "Add to Home Screen" (or a banner may appear automatically)
3. Tap Add → app icon appears on home screen

The app will work offline once installed. All data is stored on-device and syncs to OneDrive when connected.

---

## OneDrive Folder Structure

The app automatically creates these folders in the supervisor's OneDrive:

```
00 - DÙN RIGHT APP/
  02 - TIMESHEETS/
    2026-05 May/
      WO-0001_ProjectName_StaffName_2026-05-23.pdf
  03 - SAFETY/
    2026-05 May/
      FLHA_StaffName_2026-05-23.pdf
  04 - INVOICES/
    2026-05 May/
      INV-0001_ProjectName_2026-05-23.pdf
  05 - RECEIPTS AND INVOICES/
    2026-05 May/
      REC-0001_StaffName_2026-05-23.jpg
  06 - PHOTOS/
    2026-05 May/
      ProjectName/
        StaffName_2026-05-23_001.jpg
```

---

## Default Login Credentials (Change Immediately!)

| Username | Password | Role |
|----------|----------|------|
| ewen | password | Supervisor |
| ivy | password | Supervisor |
| field1 | password | Field Staff |

**⚠️ Change all passwords immediately after first login via the Staff Management page.**

---

## Adding More Staff

1. Log in as a supervisor
2. Tap the nav → Staff (or via More menu)
3. Tap "+ Add" and fill in name, username, password, email, and role
4. The field staff member installs the app on their phone using the URL
5. They log in with their username and password — no Microsoft account needed

---

## Offline Capability

The app stores everything locally on each device using IndexedDB (browser database). When connectivity is restored:
- PDFs queue to upload to OneDrive automatically
- Notifications sync between devices
- Background sync runs in the service worker

**Known limitation:** Real-time push notifications between devices require internet. In remote areas without service, local reminder notifications (timed alerts) still work for the individual user's phone.

---

## Future Additions (Phase 2)

- [ ] PO (Purchase Order) system for approved purchases
- [ ] Equipment tracking per project
- [ ] Mileage log with GPS distance calculation
- [ ] Weekly payroll summary reports
- [ ] Client portal (read-only view of their project timesheets)
- [ ] More safety form types (SIMOPS, environmental)
- [ ] Photo annotation / markup tool
- [ ] Signature from client on invoices

---

*DÙN RIGHT v1.0 — Built for Keltic Geo field operations*
