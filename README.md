# Does It Fly? — Dare Edition App

A multiplayer dare / party-game app: players join a room and play
"Does It Fly?" dare rounds together.

> Draft README prepared 2026-11-14 from `package.json` + repo layout only.
> The repo had no README. Confirm the gameplay description with the
> author before publishing — do not invent rules that aren't in the code.

## Stack

- **Client:** React 19, react-scripts (CRA), `react-qr-code` (join by QR),
  `socket.io-client` (live rooms), `simple-peer` (WebRTC peer connections)
- **Mobile:** Capacitor 7 (Android build in `android/`)
- **Server:** `server/` + `src/` — dev proxy is `http://localhost:4000`
  (see `package.json` `"proxy"`)
- **Styling:** Tailwind CSS, PostCSS

## Run it

```bash
# client
npm install
npm start          # http://localhost:3000

# server (in server/)
npm install
npm start          # http://localhost:4000
```

Android (Capacitor):

```bash
npx cap sync android
npx cap open android
```

## Structure

- `src/` — React app
- `client/` — client code (see package.json at repo root)
- `server/` — Socket.io server
- `android/` — Capacitor Android project
- `public/` — static assets
