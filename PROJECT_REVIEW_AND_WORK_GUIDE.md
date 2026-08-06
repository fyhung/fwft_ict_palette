# Classroom Image Board — Architecture Review and Work Guide

Reviewed: 2026-08-06

## 1. Verdict

The project is feasible for a classroom-scale pilot, but the two specifications should not be implemented unchanged.

The product model is sound:

`Teacher → Class → Board → Sections → Image posts → Comments`

The risky part is the media path:

`Browser → Apps Script → Google Drive`

Apps Script and Drive are being used as a zero-billing substitute for application storage and a media CDN. They can work at modest scale, but Google does not promise the same browser-upload, concurrency, transactional, or media-delivery behavior that a purpose-built object store provides. The project must therefore begin with a production-shaped technical spike.

Do not begin the full React interface until Milestone 0 passes.

## 2. Required corrections before development

### Blocker A — Student photos must not be public by default

The original design makes the Firestore board publicly readable and the Drive media root available to “Anyone with the link.” That exposes captions, Google display names, avatars, and possibly identifiable student photographs outside the class.

For a Hong Kong school deployment, this is a release blocker unless the school explicitly approves the collection, audience, purpose, and retention policy. The Privacy Commissioner recommends informing parents and students before collection, limiting collection to teaching purposes, controlling access, and regularly removing material that is no longer required.

Required MVP policy:

- Require Google sign-in to view and contribute to a board.
- Prefer school-domain accounts only when the school uses Google Workspace.
- Prefer a Drive media folder shared to the school domain or a school Google Group as Viewer.
- Allow “Anyone with the link” only as an explicit per-deployment decision after school approval.
- Display a short collection notice before the first upload.
- Add a retention date to every board and a teacher archive/delete workflow.
- Tell students not to upload faces, identity documents, addresses, or other sensitive material unless the lesson and school policy specifically require it.

If the school blocks domain/link sharing and no approved private media delivery path works, stop: this architecture is not suitable for production.

References:

- [PCPD guidance for schools using online learning technology](https://www.pcpd.org.hk/english/news_events/media_statements/press_20200402.html)
- [PCPD recommendations to control access to student photos and remove old content](https://www.pcpd.org.hk/english/news_events/media_statements/press_20251217.html)

### Blocker B — The two specifications conflict on teacher authorization

The first document uses a global `teachers/{uid}` collection. The revision correctly changes this to class-specific membership.

The revision wins. Do not implement global teacher power.

Use:

```text
classes/{classId}
classes/{classId}/teachers/{uid}
classes/{classId}/boards/{boardId}
```

A person may manage Class A without receiving access to Class B.

### Blocker C — Teacher dashboard discovery is underspecified

The dashboard cannot simply “show every class where a nested teacher document exists” without an explicit query design.

Use a collection-group query:

```text
collectionGroup("teachers")
where("uid", "==", currentUser.uid)
```

Each membership document must duplicate its `uid` field. Use Firestore rules version 2 and a collection-group index/rule that only lets a user query membership documents whose `uid` equals their authenticated UID. Then fetch the parent class documents.

This follows Firestore’s supported collection-group query model. Security Rules are not filters, so the client query must include the same UID constraint enforced by the rule.

Reference: [Firestore collection-group queries and rules](https://firebase.google.com/docs/firestore/security/rules-query)

### Blocker D — “Find a teacher by email” is not safely designed

The browser must not receive permission to search the entire `users` collection by email; that would expose a student/teacher directory.

Use invite links in v1:

1. Class owner creates a random, single-use teacher invite.
2. Owner sends the invite URL to the co-teacher.
3. Co-teacher signs in with Google and accepts it.
4. One atomic Firestore batch creates `classes/{classId}/teachers/{uid}` and marks the invite used.
5. Rules require the invite to be valid, unexpired, and unused.

Email lookup can be added later through a trusted directory service. It is not needed for the MVP.

### Blocker E — Cross-origin Apps Script responses are not guaranteed by the spec

Apps Script Content Service redirects responses to a one-time `script.googleusercontent.com` URL. The specification assumes that a GitHub Pages `fetch()` can POST a large JSON body and read the resulting JSON response. This must be proven in the target browsers; Apps Script does not provide normal application-server control over CORS response headers.

The Milestone 0 spike must test:

- GitHub Pages or the chosen production host to the `/exec` deployment URL.
- A simple POST with `Content-Type: text/plain`.
- Redirect following.
- Reading success and error JSON.
- Android Chrome, iOS Safari, and school-managed Chrome/Chromebooks.

If the browser cannot read the response reliably, use an asynchronous command pattern:

1. Client creates an `operationId` and listens to a private Firestore operation document.
2. Client sends a simple/opaque POST to Apps Script.
3. Apps Script performs the Drive work and writes operation success/failure to Firestore using the caller’s Firebase ID token.
4. The UI completes when the Firestore listener receives the result.

Do not ship a `mode: "no-cors"` request while pretending it succeeded; an opaque response contains no usable result or error.

Reference: [Apps Script Content Service redirects](https://developers.google.com/apps-script/guides/content)

### Blocker F — Classroom upload bursts can hit Apps Script concurrency limits

An execute-as-deployer web app concentrates Drive work under one Google account. Apps Script currently limits simultaneous executions to 30 per user and execution time to six minutes. A class of 30–40 students submitting at once can therefore produce quota failures.

Required controls:

- Keep one upload request short: validate, create two files, write metadata, finish.
- Avoid locks around the whole upload.
- Add idempotency using `operationId`.
- Retry quota/transient failures with exponential backoff and jitter.
- Limit each client to one active upload.
- Show “Waiting to upload” rather than encouraging repeated taps.
- Load-test at least 35 near-simultaneous uploads before the pilot.
- Treat unacceptable failure/latency in that test as an architecture stop condition.

Reference: [Apps Script quotas and limits](https://developers.google.com/apps-script/guides/services/quotas)

### Blocker G — Drive is not a guaranteed image CDN

Do not construct ad-hoc `uc?id=...` URLs and assume they are permanent. Use the Drive API/Advanced Drive Service to return and store:

- `fileId`
- `resourceKey`, when present
- `webContentLink`
- byte size
- MIME type

Link-shared files may require resource keys. Drive-generated `thumbnailLink` is short-lived and not intended for direct web-app use, so the decision to create a separate thumbnail file is correct.

The Milestone 0 spike must verify that main images and thumbnails render repeatedly:

- in normal and private browsing;
- with a school-domain viewer account;
- on mobile networks;
- after at least 24 hours;
- with 30 clients loading the same board.

If images intermittently show a Drive viewer, permission page, rate-limit page, or broken image, stop and choose another media-delivery design.

References:

- [Drive file download links](https://developers.google.com/workspace/drive/api/guides/manage-downloads)
- [Drive link-shared file resource keys](https://developers.google.com/workspace/drive/api/guides/resource-keys)
- [Drive file resource fields](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)

### Blocker H — Drive and Firestore cannot be one transaction

The original frontend-controlled delete sequence can leave orphan files, orphan comments, or broken posts after a network failure. Retrying it can also delete only half of the data.

Use idempotent state machines:

```text
upload:   pending → processing → active | failed
delete:   active → deleting → deleted | delete_failed
export:   queued → processing → ready | failed
```

Rules and UI must hide non-active posts from students. Every Apps Script operation accepts a unique `operationId` and returns the same stored result when retried. Teacher cleanup handles old failed operations.

Never trust a client-supplied Drive file ID for deletion. Derive expected folders from class/board/content IDs, verify ancestry under the configured root, and verify application metadata and ownership before trashing anything.

### Blocker I — One deploying account is an operational single point of failure

All media actions execute with the authority of the account that deployed Apps Script. If that account is suspended, leaves the school, loses the Drive folder, or has its deployment revoked, every teacher loses upload/delete/export capability.

Use a durable school-controlled Google Workspace account for deployment, not a teacher’s personal account. Prefer a school Shared Drive for the media root if Apps Script’s Drive operations and the school’s sharing policy pass the spike. Record a recovery owner and redeployment procedure.

### Important correction J — GitHub Pages and mobile Firebase redirect sign-in

Firebase documents that `signInWithRedirect()` needs additional work when the application is hosted outside Firebase because modern browsers block the cross-origin storage mechanism. Popup sign-in is simpler but can be blocked or awkward on phones.

Recommended hosting decision:

- Keep source code, reviews, and automation in GitHub.
- Deploy the React build to Firebase Hosting on Spark.
- Do not use Firebase Cloud Storage.

Firebase Hosting has a no-billing Spark quota and GitHub Actions integration. This removes the redirect-auth mismatch while preserving a GitHub-based development workflow.

If GitHub Pages remains mandatory, Milestone 0 must prove the chosen Firebase Google sign-in flow on the target phones and managed browsers. Do not assume redirect sign-in works.

References:

- [Firebase redirect sign-in requirements](https://firebase.google.com/docs/auth/web/redirect-best-practices)
- [Firebase Hosting no-cost quota](https://firebase.google.com/docs/hosting/usage-quotas-pricing)
- [Firebase Hosting GitHub integration](https://firebase.google.com/docs/hosting/github-integration)

## 3. Corrected MVP architecture

```text
GitHub repository
  └─ GitHub Actions
       └─ Firebase Hosting (recommended) or proven GitHub Pages setup
            ├─ Firebase Authentication (Google)
            ├─ Cloud Firestore (Spark)
            └─ Apps Script web app
                 └─ school-controlled Google Drive / Shared Drive
```

Apps Script does only trusted media operations. Firestore remains the application database.

Firebase ID tokens may be sent to Apps Script and used for authenticated Firestore REST calls; Firestore applies Security Rules to requests authenticated with a Firebase ID token.

Reference: [Firestore REST authentication](https://firebase.google.com/docs/firestore/use-rest-api)

## 4. Corrected data model

```text
users/{uid}
  displayName
  photoURL
  email                 // private: self only
  createdAt
  lastLoginAt

classes/{classId}
  name
  description
  ownerUid
  status                // active | archived
  createdAt
  updatedAt

classes/{classId}/teachers/{uid}
  uid                   // required for collection-group query
  role                  // owner | teacher
  displayName
  addedAt
  addedBy

classes/{classId}/teacherInvites/{inviteId}
  createdBy
  expiresAt
  usedAt
  usedBy

classes/{classId}/boards/{boardId}
  title
  description
  status                // active | archived
  visibility            // domain | authenticated | link (only if approved)
  allowPosting
  allowComments
  retentionAt
  createdBy
  createdAt
  updatedAt

classes/{classId}/boards/{boardId}/sections/{sectionId}
  title
  sortOrder
  createdAt
  updatedAt

classes/{classId}/boards/{boardId}/posts/{postId}
  sectionId
  authorUid
  authorDisplayName
  caption
  media                 // ids, resource keys, links, MIME, bytes
  status                // pending | active | deleting | failed
  sortOrder
  createdAt
  updatedAt

classes/{classId}/boards/{boardId}/comments/{commentId}
  postId
  authorUid
  authorDisplayName
  text
  media                 // nullable
  status
  createdAt

users/{uid}/operations/{operationId}
  type
  classId
  boardId
  contentId
  status
  result
  errorCode
  createdAt
  updatedAt
```

Do not store public email addresses in membership, post, or comment documents. Do not persist arbitrary client-provided image URLs.

## 5. Scope corrections

Keep in MVP:

- Multiple classes.
- Multiple boards per class.
- Multiple class-specific teachers.
- Board QR/presentation mode.
- Google sign-in.
- One image plus caption per post.
- Text and optional image comments.
- Teacher section/post organization.
- Teacher moderation and posting/comment locks.
- On-demand statistics.
- Export and archive.

Defer until after the first pilot:

- “Students connected” presence counter. Firestore post/comment listeners do not provide reliable presence.
- Full user-by-email directory search.
- Automatic scheduled cleanup.
- Large-board single-file export; split by section first if necessary.
- Search, notifications, grading, enrollment, due dates, reactions, and AI.

## 6. Working agreement

Use short milestones. A milestone is complete only when its acceptance tests pass on deployed infrastructure, not when the local UI looks finished.

Roles:

- Teacher/product owner: confirms school policy, tests real lesson workflow, supplies Firebase/Workspace configuration, and accepts each milestone.
- Developer/Codex: implements code, rules, tests, deployment automation, and documentation.
- School IT/Workspace admin: confirms external/domain sharing, durable deployment account, OAuth/auth domain policy, and data retention requirements.

Recommended cadence: one milestone review each week. For one developer working part-time, allow approximately 7–8 weeks. For focused full-time work, expect approximately 3–4 weeks, subject to the platform spike.

## 7. Work schedule

### Milestone 0 — Feasibility and policy gate (2–3 working days)

Tasks:

1. Decide production host: Firebase Hosting recommended; otherwise GitHub Pages.
2. Confirm school-approved audience and Drive sharing mode.
3. Create a throwaway Firebase project/configuration and Apps Script deployment.
4. Prove Firebase Google sign-in on Android Chrome, iOS Safari, and a managed school browser.
5. Send an authenticated, compressed main image plus thumbnail to Apps Script.
6. Validate the Firebase ID token and reject invalid/expired tokens.
7. Create Drive files with application metadata.
8. Return/read the response or prove the Firestore operation fallback.
9. Render the stored images through their Drive-provided links after 24 hours.
10. Run a 35-client burst test and record success rate and p95 completion time.

Exit criteria:

- No public student data without explicit school approval.
- Authentication works on all target devices.
- At least 34 of 35 burst uploads complete automatically; the remaining request succeeds through retry.
- No unrelated Drive file can be deleted using a forged file ID.
- Repeated image loads do not show permission/viewer/rate-limit pages.
- Teacher accepts observed latency.

Stop condition: if these tests fail after one focused remediation pass, change the storage/hosting architecture before proceeding.

### Milestone 1 — Repository, deployment, and test foundation (2 working days)

Tasks:

- Initialize Git, React, Vite, and TypeScript.
- Add linting, formatting, unit tests, and environment validation.
- Configure Firebase Emulator Suite for Auth/Firestore rules tests.
- Add CI for build, tests, and rule tests.
- Add preview and production deployment workflow.
- Create a development Firebase project separate from production if the project quota allows it.

Deliverables:

- Deployed blank application.
- Passing CI.
- `.env.example` with no secrets.
- Setup/recovery notes.

### Milestone 2 — Identity, classes, co-teachers, and boards (3–4 working days)

Tasks:

- Implement Google sign-in and sign-out.
- Create private user profiles.
- Implement class create/read/update/archive.
- Implement collection-group teacher membership discovery.
- Implement owner/teacher roles.
- Implement single-use co-teacher invite links.
- Implement board creation with one default section.
- Implement board route, copy link, QR, and presentation view.

Acceptance tests:

- Teacher sees only classes they manage.
- Co-teacher can accept an invite but cannot manage teacher membership.
- A student cannot create, remove, or upgrade a teacher membership.
- Class owner cannot remove themselves without a future ownership-transfer flow.
- QR returns the student to the same board after sign-in.

### Milestone 3 — Sections and read-only board (2–3 working days)

Tasks:

- Implement board/section realtime listeners.
- Render responsive section grids and empty states.
- Add teacher section create/rename/delete.
- Add posting/comment status display.
- Enforce board visibility in Firestore rules.

Acceptance tests:

- Students cannot see teacher controls or call the underlying writes.
- Archived/unauthorized boards are handled intentionally.
- Listener subscriptions are released on navigation.
- A non-empty section cannot be accidentally deleted.

### Milestone 4 — Image post pipeline (4–5 working days)

Tasks:

- Validate 10 MB source limit and supported formats.
- Correct orientation, resize main image, create thumbnail, and compress.
- Strip unnecessary metadata where the chosen browser library permits it.
- Implement idempotent upload operations and retry/backoff.
- Store Drive API links/resource keys/metadata.
- Create Firestore post only through the approved operation flow.
- Show processing, queued, upload, retry, and failure states.

Acceptance tests:

- A common phone photo becomes a main image at or below 1.5 MB and a thumbnail at or below 300 KB.
- Double tap does not create duplicate posts.
- Refreshing during upload produces a recoverable operation.
- A failed Firestore write does not leave an invisible permanent Drive file.
- Grids load thumbnails only; main images load on demand.

### Milestone 5 — Comments and deletion state machines (3–4 working days)

Tasks:

- Implement text/image comments.
- Implement student deletion of their own post.
- Implement teacher deletion of any post/comment.
- Cascade comment/media cleanup through idempotent operations.
- Add tombstone and cleanup-failed states visible to teachers.

Acceptance tests:

- Student cannot delete another student’s post or media.
- Student post deletion removes/hides the post immediately and eventually removes all related media/comments.
- Retrying a deletion is safe.
- Forged Drive IDs cannot escape the configured media root.
- Comment creation is rejected when comments are closed.

### Milestone 6 — Teacher organization and live lesson controls (3–4 working days)

Tasks:

- Add dnd-kit section reorder.
- Add post reorder and move between sections.
- Add accessible “Move to section” fallback.
- Normalize integer order with bounded Firestore batches.
- Add posting/comments on/off controls and present mode live counts.

Acceptance tests:

- Students cannot change `sectionId` or `sortOrder` through DevTools.
- Two teachers moving content concurrently do not corrupt or duplicate cards.
- Board updates on student devices without refresh.
- Presentation counts show posts/comments/contributors, not unsupported online presence.

### Milestone 7 — Statistics, export, archive, and cleanup (3–5 working days)

Tasks:

- Compute board statistics from already loaded/queryable data.
- Avoid reading every post in every class on every dashboard load.
- Add board/class summaries only where read cost is acceptable.
- Build teacher-only export by section.
- Validate every exported Drive file against class/board metadata.
- Add archive/restore and retention display.
- Add explicit orphan scan limited to the configured root/board.

Acceptance tests:

- Export contains sections, posts, captions, authors, comments, dates, and media.
- Export failure does not leave the UI claiming success.
- A board too large for one Apps Script execution is split by section or rejected with a useful message before timeout.
- Cleanup never scans or deletes outside the configured application root.

### Milestone 8 — Security, accessibility, and classroom pilot (4–5 working days)

Tasks:

- Complete Firestore emulator rules tests.
- Test malformed fields, fake UIDs, fake teacher roles, disabled boards, oversized files, and invalid MIME types.
- Run keyboard, focus, modal, contrast, alt-text, and touch-target checks.
- Test slow network, offline/reconnect, double submit, stale tab, and two-teacher conflicts.
- Run a rehearsal with 5 accounts, then a single-class pilot.
- Monitor Firestore usage and Apps Script executions.
- Document incident, rollback, export, retention, and account-recovery procedures.

Release criteria:

- No critical/high security test failures.
- School policy/privacy approval recorded.
- Target mobile and managed devices pass.
- Full lesson rehearsal works: select class → select board → present QR → sign in → post → comment → organize → close → export.
- Teacher can recover from a failed upload without developer intervention.

## 8. Security rules test matrix

At minimum, automate these cases:

| Actor | Operation | Expected |
|---|---|---|
| Anonymous | Read authenticated/domain board | Denied |
| Student | Create own post when open | Allowed |
| Student | Create post with another UID | Denied |
| Student | Post when closed/archived | Denied |
| Student | Change sort order/section | Denied |
| Student | Delete own post | Allowed through approved workflow |
| Student | Delete another post/comment | Denied |
| Student | Add self as teacher | Denied |
| Invited teacher | Redeem valid unused invite | Allowed once |
| Non-invited user | Redeem/forge invite | Denied |
| Teacher | Manage board content in assigned class | Allowed |
| Teacher | Manage a different class | Denied |
| Class teacher | Add/remove teachers | Denied |
| Class owner | Add/remove other teachers | Allowed |
| Any caller | Delete unrelated Drive file ID | Denied |
| Invalid token | Any Apps Script mutation | Denied |

Firestore rules have limited document access calls per operation/batch, so test the real batch shapes rather than only single writes.

Reference: [Firestore rules conditions and access-call limits](https://firebase.google.com/docs/firestore/security/rules-conditions)

## 9. Operating limits and monitoring

Track during every pilot:

- Apps Script execution failures, duration, and simultaneous executions.
- Firestore reads/writes/deletes per day.
- Average main and thumbnail byte size.
- Upload completion and retry rate.
- Broken image rate.
- Export size and duration.
- Orphan file count.

Spark includes no-cost Firestore quotas, but realtime listeners and dashboard-wide scans can consume reads quickly. Prefer listeners only for the current board and compute teacher dashboard summaries on demand.

Reference: [Firebase pricing plans and Firestore no-cost quota](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)

## 10. First implementation checklist

Start here, in order:

1. Obtain school privacy/Workspace decisions.
2. Choose the durable deployment account and Drive root.
3. Decide Firebase Hosting versus GitHub Pages.
4. Build only the Milestone 0 spike.
5. Record actual device, concurrency, CORS, and Drive-link results.
6. Approve or reject the architecture.
7. Only then initialize the full application and begin Milestone 1.

The project should not be described as “free and unlimited.” It is a no-billing, quota-limited classroom application with a deliberate small-scale operating envelope. That envelope must be measured in the pilot and documented for teachers.
