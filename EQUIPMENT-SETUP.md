# DÙN RIGHT: Equipment Tracking Setup

Equipment check-in/out is stored in **one shared cloud database** (Azure Table Storage) and served by small Azure Functions inside the existing Static Web App. Every phone and computer sees the same live list: who has each item, since when, on which project, and the full scan history.

Phones keep a temporary copy so crews can still scan with no signal. Those scans upload automatically when signal returns.

## One-time Azure setup (about 5 minutes)

Until this is done the app runs in **demo mode** (a yellow banner on the Equipment page) and scans are not kept.

1. **Create a storage account**
   - Go to portal.azure.com, click **Create a resource**, search **Storage account**, click **Create**.
   - Resource group: the same one the Static Web App is in.
   - Storage account name: something like `kelticequipment` (lowercase letters and numbers only, must be unique).
   - Region: **Canada Central**.
   - Performance: **Standard**. Redundancy: **Locally-redundant storage (LRS)** is fine (Zone-redundant if you want extra safety).
   - Click **Review + create**, then **Create**.

2. **Copy its connection string**
   - Open the new storage account, then **Security + networking > Access keys**.
   - Next to **key1 > Connection string**, click **Show**, then copy it.

3. **Give it to the app**
   - Open the Static Web App (`witty-plant-05789e010`).
   - **Settings > Environment variables** (older portals call it **Configuration**).
   - With **Production** selected, click **+ Add**:
     - Name: `EQUIPMENT_STORAGE`
     - Value: the connection string from step 2
   - Click **Apply**, then **Apply** again to confirm.
   - To test on a pull request preview before merging, pick that preview environment in the dropdown and add the same setting there too.

That's it. The tables (`DunEquipment`, `DunEquipmentLog`, `DunSettings`) are created automatically on first use.

**Cost:** Table Storage for a company this size is well under $1 CAD a month. The Static Web App free tier includes the Functions.

### Optional: lock the API with a key

Add a second environment variable `EQUIPMENT_API_KEY` with any long random value, and put the same value in `API_KEY` at the top of `js/equipment.js`. This stops anyone who finds the URL from reading or writing the equipment list directly.

## Using it

**Supervisors** (Equipment in the More menu, or **Equipment Board** on Home)
- **+ Add equipment**: name, type, serial. A tag number (KG-0001, KG-0002 …) is assigned automatically.
- **Print QR labels**: choose items, pick the label sheet, print at **100% / Actual size**.
  - Avery **5160 / 8160** layout (30 per Letter sheet, 2-5/8" x 1") for most gear
  - Avery **5163 / 8163** layout (10 per sheet, 4" x 2") for cases and big kits
  - "Start at label position" lets you reuse a part-used sheet.
  - Use weatherproof or laminated labels on field gear.
- Tabs: **Out** (sorted longest-out first), **All**, **Service**, **Activity** (every scan, company-wide), **Mine**.
- Tap any item for its history, edit, reprint its label, mark it back in service, or retire it.
- If a phone had equipment in the old per-phone list, a banner offers a one-time import.

**Crews**
- Tap **Scan equipment** on Home, point at the label, then one tap:
  - **Check out to me** (pick the project), or
  - **Check in** (mark **Working fine** or **Needs service** with a note; supervisors see it on the Service tab).
- Tick **Several items** to scan a whole pickup in a row.
- No signal? Scan anyway. It's saved on the phone and syncs on its own.
- On a DWR, **Fill from my gear** adds everything currently checked out to you into Equipment Used.
- The phone's own camera app also works: the label opens DÙN RIGHT in the browser at that item (sign in if asked). Scanning from inside the app is faster.

## How it's built

| Piece | Where |
|---|---|
| API (Azure Functions, Node 20) | `api/src/functions/equipment.js`, rules in `api/src/equipment.js` |
| Storage | `api/src/store.js` (Table Storage, or in-memory demo mode) |
| Screens, scanner, labels | `js/equipment.js`, styles at the end of `css/app.css` |
| QR libraries (bundled for offline) | `js/vendor/` (jsQR, qrcode-generator) |
| Tests | `cd api && npm install && npm test` |
| Local test server | `cd api && node dev-server.js` then open http://localhost:8080 |

Endpoints: `GET/POST /api/equipment`, `PUT /api/equipment/{tag}`, `POST /api/equipment/{tag}/scan`, `GET /api/equipment/{tag}/history`, `GET /api/equipment-activity`.

Offline scans carry a unique ID and the time they happened, so a scan that syncs twice is only counted once, and a late scan never overwrites a newer one (it still shows in history, marked "synced late").
