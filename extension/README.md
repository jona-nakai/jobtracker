# Job Tracker Collector Extension

Browser extension for collecting LinkedIn and Indeed job postings into Job Tracker.

The extension uses job-board-specific content scripts. It does not run on every website, and it only collects data after you click `Collect Job`.

## Setup

Create a local config file:

```bash
cp extension/config.example.js extension/config.js
```

Fill in:

```js
window.JOB_TRACKER_CONFIG = {
  supabaseUrl: "https://your-project-ref.supabase.co",
  supabasePublishableKey: "sb_publishable_..."
};
```

Do not commit `extension/config.js`.

## Chrome Testing

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `extension/` folder.
5. Open a LinkedIn or Indeed job posting.
6. Click the Job Tracker extension icon.
7. Sign in with the same email/password as the website.
8. Click Collect Job.
9. Review/edit the form.
10. Click Save.

## Firefox Testing

1. Open `about:debugging#/runtime/this-firefox`.
2. Click Load Temporary Add-on.
3. Select `extension/manifest.json`.
4. Open a LinkedIn or Indeed job posting.
5. Use the popup the same way as Chrome.

## Notes

- The collector is intentionally review-first. It never saves until you click Save.
- Job page parsing is best-effort because job-board markup changes.
- LinkedIn search result URLs with `currentJobId` are saved as canonical `/jobs/view/{id}/` links.
- Indeed URLs with `jk` or `vjk` are saved as canonical `/viewjob?jk={id}` links. Indeed homepage selections without an id leave the external link blank.
- The extension saves a role and an initial status event to Supabase.
