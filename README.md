# Classroom Image Board

A teacher-controlled classroom photo board built with React, Firebase Authentication, Cloud Firestore, Google Apps Script, and Google Drive.

The repository currently contains the first product foundation and the mandatory media feasibility spike. It runs with realistic prototype data until Firebase environment values are supplied.

## Local development

```powershell
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and add the Firebase web configuration when available.

GitHub Actions verifies every push and deploys `main` to Firebase Hosting after the repository configuration below is added.

In GitHub, open **Settings → Secrets and variables → Actions**.

Create these repository **Variables**:

- `FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_APPS_SCRIPT_URL`
- `VITE_ALLOWED_EMAIL_DOMAIN` (optional; leave unset to allow any Google account)

Create this repository **Secret** containing the complete Firebase service-account JSON:

- `FIREBASE_SERVICE_ACCOUNT_CLASSROOM_IMAGE_BOARD`

The `VITE_` values are browser configuration and are included in the built application. The service-account JSON is privileged and must only be stored as an encrypted GitHub secret.

## Current routes

- `/#/owner/teachers` — application-owner teacher approval

- `/#/teacher` — teacher class dashboard
- `/#/c/4a-physics` — class board list
- `/#/c/4a-physics/b/forces-in-action` — responsive image board
- `/#/c/4a-physics/b/forces-in-action/present` — classroom QR presentation mode

## Roles

- Application owner: `fyhung@twghfwfts.edu.hk`. The verified Google account may view and manage every class and approve teachers.
- Approved teacher: may create classes and view all classes, but may manage only classes where `ownerUid` is their Firebase UID.
- Student: cannot list or create classes. A signed-in student may open a class/board through its URL, contribute when posting/comments are open, and delete only their own post.

To approve a teacher, ask them to sign in once so their `users/{uid}` profile exists. The application owner then opens `/#/owner/teachers`, searches for the account, and selects **Approve**. Revoking approval prevents future class creation and management but does not delete classes that teacher already owns.

The application-owner email is enforced in both the frontend role display and `firestore.rules`. Changing ownership requires a reviewed code and rules deployment.

## Firebase setup

1. Enable Google Authentication.
2. Create a Firestore database on Spark.
3. Add the web configuration to `.env.local`.
4. Deploy `firestore.rules` and `firestore.indexes.json` only after emulator tests pass.
5. Do not enable Firebase Cloud Storage for this project.

### Firestore Security Rules tests

The rule suite uses the local Firestore emulator and never contacts production data.

Prerequisites:

- Java JDK 11 or newer (Temurin 21 is used on the development machine)
- project dependencies installed with `npm install`

Run:

```powershell
npm run test:rules
```

Deploy `firestore.rules` and `firestore.indexes.json` only after this suite passes.

## Apps Script feasibility spike

1. Create a durable school-owned Drive folder for application media.
2. Create a standalone Apps Script project and copy the files in `apps-script/`.
3. Enable the Advanced Drive service.
4. Add Script Properties:
   - `FIREBASE_WEB_API_KEY`
   - `FIREBASE_PROJECT_ID`
   - `DRIVE_ROOT_FOLDER_ID`
5. Deploy as a web app that executes as the deploying school account.
6. Set the deployment URL as `VITE_APPS_SCRIPT_URL`.
7. Test `?action=healthCheck`, authenticated upload, invalid-token rejection, image rendering, safe deletion, and a 35-client submission burst.

Do not proceed to production media uploads until the feasibility gate in `PROJECT_REVIEW_AND_WORK_GUIDE.md` passes.

## Privacy default

Boards require sign-in in the supplied Firestore rules. Prefer domain- or Google-Group-restricted Drive viewing. “Anyone with the link” media must be an explicit school-approved deployment decision.
