# Together — group action items

A real shared website based on the Together design. Host the frontend on **GitHub Pages**, store shared progress in **Supabase**, and optionally embed it in a **Microsoft Teams channel tab**. No frontend build or npm installation is needed to deploy it.

**GitHub Pages alone cannot store everybody’s clicks. You must complete the Supabase setup below.** This download is source code ready to configure; it is not already connected to a database or published.

## What it does

- Create a group with everyone’s email address, including people who have not registered yet.
- Every member signs in to their own account with that listed email address.
- Create action items with a title, details, and an optional due date.
- Each person can mark only their own part done, or undo their own completion.
- An item stays Active until **every person in the group** is done. It then moves to Completed.
- Undoing completion reopens an item. Completed items remain available as history.
- Everyone sees the same database-backed progress. Other people’s changes appear within about 15 seconds, or immediately when you click Refresh.
- A member can belong to multiple separate groups. Access to each group is enforced in the database.

Group rosters are fixed in this first version. Create a new group if membership changes. There is no automatic sync with Teams channel membership, Microsoft single sign-on, or task deletion/editing. Use the account’s listed email consistently; changing account email does not migrate old assignments.

## 1. Create the database

1. Create a project at [Supabase](https://supabase.com/dashboard).
2. Open the project’s **SQL Editor**.
3. Paste the complete contents of `supabase.sql` and run it **once** in a new project. It creates the tables, row access rules, and checked write functions in one transaction.
4. In Authentication settings, enable **Email/password** and keep **Confirm email** enabled. Accounts must have a verified email to access group data.
5. Configure **custom SMTP** for confirmation and reset emails to your group. Supabase’s default email sender is restricted and is not suitable for ordinary group signups. See [Supabase SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp). Alternatively, for a small pilot, the project administrator can create each user with a password through the Authentication dashboard and mark their email confirmed; users can then sign in directly. Never put admin credentials in this website.
6. Find the project URL and the **publishable** API key in your project’s API settings. A legacy **anon** key also works. Do **not** use a secret key or a `service_role` key.
7. Edit `config.js`:

   ```js
   window.TOGETHER_CONFIG = {
     supabaseUrl: "https://YOUR_REAL_PROJECT.supabase.co",
     supabasePublishableKey: "sb_publishable_YOUR_REAL_KEY"
   };
   ```

These two values are intended for public browser use. Database row access rules protect the private group data. Member emails, passwords, and task content do not go into the GitHub repository.

## 2. Host the website on GitHub Pages

1. Create a GitHub repository, for example `together`.
2. Unzip the download. Upload the **contents of `together-site`** to the repository root. `index.html` must be directly at the root, not inside an extra folder. Include the `teams` directory, its PNG files, and `.nojekyll`.
3. Commit the files to the `main` branch.
4. Open **Settings → Pages**.
5. Select **Deploy from a branch**, choose **main**, and choose **/(root)**. Save.
6. GitHub will display your published URL, for example:

   ```text
   https://YOUR_GITHUB_USERNAME.github.io/together/
   ```

7. Open the published site. If it says “Let’s get connected,” replace the placeholders in `config.js` and commit the change.
8. Update `privacy.html` and `terms.html` with your deployment’s operator/contact details and any organisation-specific policies. The included pages describe the implementation and are templates for your deployment.

You can upload all files; `tests`, the SQL script, and this README are source/documentation rather than private data. No database credentials or private group data are included in them. CDN access to jsDelivr and Microsoft’s Teams SDK is required by clients using this site.

## 3. Set up sign-in URLs and create your group

In Supabase, open **Authentication → URL Configuration**:

- Set **Site URL** to your published URL, including the repository path.
- Add the exact `index.html` URL to **Redirect URLs**, for example `https://YOUR_GITHUB_USERNAME.github.io/together/index.html`.
- Keep the default email confirmation/recovery templates using the provider’s confirmation links; do not replace them with a server-only `/auth/confirm` route. This static site handles the browser session returned by Supabase.

Then:

1. Open the site, choose **Create an account**, and confirm your email. Or sign in with an account created and confirmed by your project administrator.
2. Choose **Create a group**. Enter its name and everyone’s email, separated by lines or commas. Your email is added automatically. Double-check the roster; it is fixed after creation.
3. Create your first action item.
4. Share the page’s URL with the group. It contains the group ID; that ID identifies the group but does not grant access. Each person must sign in with an email already listed in the group.
5. Each member signs up, confirms their email, and signs in. If the group is not visible, check that their sign-in email matches the roster.

## 4. Put it in your Teams channel

### A link from the channel

You can post the published group URL in a channel or add it with the Website app if your Teams environment offers it. Microsoft’s Website tab opens websites in a separate browser in the new Teams client; it does not reliably embed them inside the channel.

### An embedded channel tab

This project includes a **custom Teams app** configuration page and a package generator:

1. Open `teams-package.html` on your published website:

   ```text
   https://YOUR_GITHUB_USERNAME.github.io/together/teams-package.html
   ```

2. Confirm the published website’s **base URL** with its repository path and trailing slash. Do not paste an individual group URL or `index.html` here.
3. Enter your developer/team name and click **Download Teams app ZIP**.
4. In Teams, use **Apps → Manage your apps → Upload an app → Upload a custom app**, or ask your Teams administrator to upload the ZIP to your organisation’s app catalog. The exact option depends on your organisation’s permissions.
5. Add **Together** to the intended team. In the channel, add a tab and select the Together app.
6. The tab configuration asks you to sign in and choose an existing group. Choose the group, then click **Save in Teams**.
7. Members sign in to their own Together accounts inside the tab. Their identity is checked by Supabase; a Teams display name does not authorise a “Done” click.

The app package generator writes the HTTPS configuration URL and correct GitHub Pages host into the Teams manifest. Its ZIP contains exactly `manifest.json`, `color.png`, and `outline.png`. It has a stable app ID; keep that ID when updating your own deployment. Change the ID in `zip.js` to a fresh UUID if you create a separate app deployment. Increment the manifest version when publishing updates to an existing Teams app.

If custom apps are disabled, your administrator must enable/approve the app before you can embed it. You can still share the browser link. If a client blocks session storage, the site uses an in-memory session; you may need to sign in again when the tab reloads.

## Verification

Optional developer checks (Node 20+; no dependencies):

```sh
npm test
```

The tests cover partial and final completion, reopening, failed backend writes, roster validation, escaped task text, GitHub repository paths, and ZIP generation. The app tests run the actual frontend script against a DOM adapter and a **simulated** backend. They do not verify a live Supabase deployment, browser layout, or a real Teams tenant.

After configuring your actual project, do this small acceptance check:

1. Create a group with three listed email addresses.
2. Use separate browser profiles/devices for the different accounts.
3. Create an action item. Sign in as the first person and mark it done. It should show **1 of 3 done** and remain Active for all members.
4. Mark it done as the second person. It should remain Active at **2 of 3 done**.
5. Mark it done as the third person. It should move to Completed for everybody after Refresh or within 15 seconds.
6. Undo completion as one person from Completed. It should return to Active.
7. Sign in with a fourth, unlisted email. That account must not see this group, even if given its URL.
8. Create another group including an email that has not registered. Its tasks must wait for that person’s completion too.
9. Try it in your real Teams channel after installing the generated app package.

## Implementation notes

- Tables are read-only for browser users. All writes go through database functions that check the signed-in user’s verified email and group membership.
- `tg_set_done` obtains a lock on the task row before recording completion and counting all participants. Concurrent clicks are processed in order and completion is decided in the database.
- Each task contains a snapshot of every group member. A missing registration cannot reduce the number of required completions.
- Completion is never saved only in browser storage. Browser storage is used for the authentication session; task data lives in Supabase.
- Keep Supabase’s email confirmation enabled and avoid granting browser roles direct insert/update/delete access to these tables.
- The project administrator is responsible for their database, email provider, backups, retention, and account/data removal. Deleting a Supabase user referenced by a group/task may require cleaning up those references first.
- The first version loads all tasks in the selected group. Add pagination before using it for very large histories.

## Official references

- [GitHub Pages publishing configuration](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Microsoft’s Website tab change](https://devblogs.microsoft.com/microsoft365dev/upcoming-updates-to-loading-websites-in-teams-tabs/)
- [Teams tab requirements](https://learn.microsoft.com/en-us/microsoftteams/platform/tabs/how-to/tab-requirements)
- [Teams configuration pages](https://learn.microsoft.com/en-us/microsoftteams/platform/tabs/how-to/create-tab-pages/configuration-page)
- [Upload a custom Teams app](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/apps-upload)
