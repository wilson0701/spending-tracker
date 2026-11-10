SnagPad v1.1 — Offline snag / punch list
=========================================

QUICK START (laptop)
  Unzip, then open index.html in Chrome or Edge. That's it.
  (In this mode the "Install app" and offline cache features need hosting, see below.)

INSTALL ON IPHONE / ANDROID (recommended, free)
  The app needs to be served from a web address once so your phone can install it:
  Option A - Netlify Drop (no account needed to try): go to app.netlify.com/drop and drag the
             unzipped "SnagPad" folder onto the page. Open the link it gives you on your phone.
  Option B - GitHub Pages: create a free repository, upload these files, then go to
             Settings -> Pages -> Deploy from branch.
  Then:
    iPhone: open the link in Safari -> Share -> Add to Home Screen.
    Android: open in Chrome -> menu -> Install app.
  After the first visit it works fully offline.

YOUR DATA
  Everything is stored only in the browser on that device (IndexedDB). Nothing is uploaded.
  - Settings -> "Back up all (JSON)" saves everything including photos. Do this regularly.
  - Settings -> "Restore from backup" loads it on another device.
  - Clearing the browser's website data, or uninstalling the Home Screen app, deletes the data.
  - On iPhone, the Home Screen app and Safari keep SEPARATE storage.

WORKING WITH YOUR TEAM (sharing, free, no server)
  SnagPad has no cloud and NO LIVE SYNC. You send each other copies, and SnagPad merges them.
  1. Each person sets "My name" (Settings). Every add / edit records it, and each snag shows
     "Last updated by <name>, dd/mm/yyyy hh:mm".
  2. Tap Share (top right):
     - "Share file (with photos)" makes a .snagpad file. On iPhone it opens the share sheet,
       so you can send it straight to WhatsApp, Mail or AirDrop. Elsewhere it downloads the file.
     - "Share as link (no photos)" makes a link that carries the snag list inside it (compressed,
       in the part after #, so it never goes to any server). Good for a quick status update.
       Long lists make long links; SnagPad warns you, and then you should send the file instead.
  3. The worker opens the link, or saves the file (iPhone: tap the file in WhatsApp -> Share ->
     Save to Files) and opens it via Share -> "Open .snagpad file". A preview shows what will change.
  4. The worker updates statuses / adds snags, then shares back the same way. You import it.
  MERGE RULES: same project = merge. For each snag, the newest edit wins. New snags are added.
  Nothing is ever deleted by an import (a snag deleted on one phone stays on the other).
  Photos travel only in the file, not in links; a link never removes photos already on a phone.
  If two people create a new snag with the same number, the incoming one gets the next number.
  "Assigned to me" (list filter) shows snags whose "Assigned to" contains your name.
  iPhone note: Safari and the Home Screen app keep SEPARATE data. A link opens in Safari; if you
  use the Home Screen app, copy the link and paste it into Share -> "paste a SnagPad link".

TIPS
  - "Save & add next" keeps location / trade / assignee, so walking a unit is fast.
  - Tap a photo thumbnail in a snag to mark it up (arrow, circle, pen). Undo is supported,
    and the original photo is kept, so you can re-edit later.
  - Report tab -> tick statuses -> Print / Save PDF.  CSV opens in Excel.

LICENCE
  Personal and single-company internal use. Please don't resell or redistribute the files.
