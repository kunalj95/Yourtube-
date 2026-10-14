# YourTube --- Full-Stack YouTube Clone

YourTube is a full-stack video-sharing application built as a learning
and internship project. It combines a Next.js/React frontend with an
Express backend and includes video browsing and playback alongside
account, engagement, moderation, subscription, and meeting features.

> **Project status:** Feature availability and setup can vary with the
> current code in this repository. Review the code and environment
> configuration before deploying publicly.

## Features

### Video platform

-   Browse videos and open individual watch pages.
-   Video player and related-video section.
-   Channel pages and channel tabs.
-   Like videos, save videos to Watch Later, and view watch history.
-   Search and navigation UI.

### Accounts and security

-   Firebase-based authentication integration.
-   Authentication/session-related backend middleware and routes.
-   OTP verification and login/security-related features.
-   Trusted-device and session-related models/routes.

### Comments and moderation

-   View and interact with comments.
-   Comment reactions.
-   Report comments for reasons such as spam, harassment, offensive
    content, malicious links, or other concerns.
-   Moderation workflow for reviewing reports and applying moderation
    actions.
-   Comment-related history/security support.

### Meetings

-   Meeting rooms identified by a room ID.
-   Real-time signaling through Socket.IO.
-   WebRTC peer connections for audio/video communication.
-   Meeting controls including microphone, camera, screen sharing, raise
    hand, participant list, chat, device selection, meeting lock, and
    leave meeting.
-   Reconnection and participant/host handling in the meeting flow.

### Additional modules

-   Subscription and invoice-related pages and backend routes.
-   Video download and download-quota-related modules.
-   Language preference and translation integration using
    LibreTranslate.
-   Theme preferences and UI components.

Feature availability may depend on configuration, browser permissions,
and external services.

## Technology stack

**Frontend** - Next.js - React - TypeScript and JavaScript - Axios -
shadcn UI components and Lucide icons (where used in the project)

**Backend** - Node.js - Express - MongoDB/Mongoose (for database-backed
models) - Socket.IO - Firebase authentication integration - WebRTC for
real-time media connections

**External integrations** - Firebase - LibreTranslate (local development
setup uses port `5001`) - Other service credentials may be required for
enabled modules.

## Repository structure

``` text
Youtube/
├── server/                 # Express backend, routes, controllers, models, sockets
│   ├── Modals/             # Database models (folder name used in this project)
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── socket/
│   ├── index.js
│   ├── package.json
│   └── .env                # Local only; do not commit
├── yourtube/               # Next.js frontend
│   ├── src/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── pages/
│   │   └── styles/
│   ├── package.json
│   └── .env.local           # Local only; do not commit
├── .gitignore
└── README.md
```

## Prerequisites

Install the following before running the project: - Node.js and npm -
Git - MongoDB, configured for your environment - Firebase project
credentials/configuration for authentication - LibreTranslate, if you
want translation features

Check your versions:

``` bash
node --version
npm --version
```

## Getting started

Open a terminal at the repository root (the `Youtube` folder).

### 1. Install backend dependencies

``` bash
cd server
npm install
```

Create `server/.env` locally and add the configuration required by your
backend. See [Environment variables](#environment-variables).

### 2. Start the backend

From the `server` directory, use the script defined in
`server/package.json`. If a `start` script exists:

``` bash
npm start
```

If the project uses a development script instead:

``` bash
npm run dev
```

The backend has been used on:

``` text
http://localhost:5000
```

Return to the repository root:

``` bash
cd ..
```

### 3. Install frontend dependencies

``` bash
cd yourtube
npm install
```

Create `yourtube/.env.local` if your frontend configuration requires
environment variables.

### 4. Start the frontend

``` bash
npm run dev
```

Open:

``` text
http://localhost:3000
```

Use the scripts defined in each `package.json` as the source of truth if
commands differ.

### 5. Start LibreTranslate (optional)

If LibreTranslate is installed in your Python environment, run this in a
separate terminal:

``` bash
libretranslate --port 5001
```

Local service URL:

``` text
http://localhost:5001
```

Keep that terminal open while using translation features. Ensure the
application is configured to use the correct LibreTranslate URL.

## Environment variables

Exact variable names depend on the current code and enabled features.
Check the existing code/configuration for the names your setup requires.

### Backend (`server/.env`)

Possible configuration categories: - Database connection string. -
Firebase Admin/service-account configuration, if used by the backend. -
Authentication/session secrets. - Payment-provider keys and webhook
secrets, if subscription payments are enabled. - Frontend origin/CORS
configuration. - Other backend API keys.

### Frontend (`yourtube/.env.local`)

Possible configuration categories: - Backend API base URL (typically
`http://localhost:5000` in local development). - Firebase client
configuration. - CAPTCHA site key, if CAPTCHA protection is enabled. -
Other `NEXT_PUBLIC_...` variables referenced by the frontend.

Use placeholder values in documentation or an `.env.example` file. Never
include real keys, passwords, tokens, or service-account files. If a
secret has been pushed to a public repository, revoke or rotate it.

## Useful notes

-   **Camera and microphone:** The browser will request permission. Test
    meetings with a second browser or device for a realistic
    multi-participant test.
-   **Screen sharing:** Browser support and permissions apply.
-   **Translation:** LibreTranslate must be running and reachable at the
    configured URL.
-   **Database and authentication:** Features requiring MongoDB or
    Firebase need those services configured.
-   **Uploads:** Check backend upload configuration and avoid committing
    large or private media files.
-   **Local development:** Run the frontend and backend in separate
    terminal windows.

## Security

-   Keep `.env`, `.env.local`, credentials, private keys, and
    service-account files out of Git.
-   Never paste secrets into issues, screenshots, README files, or
    public commits.
-   Ensure environment files are ignored by the root `.gitignore`.
-   Removing a secret from the latest commit does not remove it from
    earlier Git history. Rotate exposed credentials and clean repository
    history if necessary.
-   Review authentication, authorization, upload validation, and
    production CORS settings before deployment.

## Author

**Kunal Joshi**

GitHub: [kunalj95](https://github.com/kunalj95)

Repository: [Yourtube-](https://github.com/kunalj95/Yourtube-)
