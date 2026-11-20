# Table Night

A small, mobile-friendly group calendar for the current month and the next. Mark available, maybe or unavailable, clear a vote, view a date's guest list, and confirm or move a game night as the host. A fresh calendar opens each month. Dates are local calendar days. All players use the same invite link, and anyone holding it can join and see the roster.

## Try it

Run `python3 -m http.server 8000 --directory docs` from this directory and visit http://localhost:8000. With the default config, the app runs a local preview with two fictional players and keeps edits on that device. No dependencies or build step.

## Enable shared calendars

1. Create a dedicated Firebase project on the free Spark plan. Add a Web app and copy its public web configuration object.
2. Enable Authentication → Sign-in method → Anonymous. Under Authentication → Settings → Authorized domains, add your GitHub Pages hostname and localhost if needed for local development. Keep anonymous-account auto-cleanup off for recurring groups.
3. Create the default Cloud Firestore database in production mode. Open its Rules tab, replace the default rules with the contents of `firestore.rules`, and publish them. Alternatively, from this checkout and with an authenticated Firebase CLI, run `firebase deploy --only firestore:rules --project YOUR_PROJECT_ID`.
4. Replace `null` in `docs/config.js` with the public web configuration object. Commit that file. Keep the generated key restricted to Firebase-related APIs. Never add a service-account JSON, private key, OAuth token, or GitHub token.
5. Publish the repository to GitHub and select Settings → Pages → Deploy from a branch → main → /docs → Save. GitHub Free supports Pages for public repositories. To create the repo from this checkout with an authenticated GitHub CLI, run `gh repo create game-night --public --source=. --remote=origin --push`.
6. Open the Pages site, enter your name and choose **Create table** after listing your players. Invite holders can select any roster name. The browser remembers the selection locally for each table. Select a status above the calendar, then tap dates to save it directly. The selected date’s roster and host controls appear below the calendar. **Invite friends** copies a random room link. Open that link in another browser to join with a second name and verify that votes sync in both directions.

## Access and storage

* The repo contains the static front end and the Firestore rules. The Firebase browser key identifies the project and is visible in the published website. Firestore requires an anonymous session and validates the table and roster slot for each vote.
* The room link functions as an invitation. Its random ID is in the URL fragment. Room enumeration is denied. Signed-in anonymous users can create tables, and knowing an invite is sufficient to join. Use a dedicated project and monitor its free quota.
* The browser keeps its anonymous identity. Reloads preserve it. Clearing browser data, private browsing expiry, or switching devices requires selecting a name again. In roster-based tables, anyone with the invite can select any player and edit their saved votes, including the host. Share it only with people you trust. A project administrator can reassign the room's host UID in the Firebase console if needed.
* Each vote has its own document. Different roster spots have separate votes. Browsers selecting the same player share that player’s votes. For roster-based tables, anyone with the invite can read and edit votes and use the host controls. Votes use roster slots as identifiers, independent of the browser. Roster selection is stored locally and requires no database write.
