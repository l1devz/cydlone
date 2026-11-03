<div align="center">

# 💬 Cydlone

### Open-source, self-hosted, Discord-style chat app

**Servers · Roles · Voice & Video · Custom Emojis · Bots with Slash Commands**

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-4-010101?logo=socketdotio&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-8b5cf6)
![Languages](https://img.shields.io/badge/languages-TR%20%7C%20EN%20%7C%20FR%20%7C%20DE-a78bfa)

[Features](#-features) •
[Quick Start](#-quick-start) •
[Configuration](#%EF%B8%8F-configuration) •
[Bots](#-building-bots) •
[Admin Scripts](#%EF%B8%8F-admin-scripts) •
[Project Structure](#-project-structure)

</div>

---

## 📖 About

**Cydlone** is a real-time chat platform you can run on your own machine or server. If you have used Discord, you will feel right at home: create servers, organize channels into categories, give people roles and permissions, hang out in voice channels, and build your own bots.

> [!NOTE]
> Cydlone needs **no external database**. Everything is stored in plain JSON files, so you can start it with a single command.

---

## ✨ Features

### 🏠 Servers & Channels
- Create your own **servers** with a custom icon
- **Text** and **voice** channels, grouped into **categories**
- **Private channels** with per-role permission overrides
- **Invite links**, plus custom **vanity links** (`/invite/your-server`) for verified servers
- Invite previews with **Open Graph** cards

### 🛡️ Roles & Moderation
- Colored **roles** you can reorder by dragging
- Fine-grained **permissions**: Administrator, Manage Server, Manage Roles, Manage Channels, Manage Messages, Kick, Ban and more
- Discord-style **role hierarchy**: nobody can edit roles above their own
- **Kick** and **ban** members, with an optional ban reason and message cleanup
- A **ban list** where bans can be revoked

### 💬 Messaging
- Real-time messages with **Socket.io**
- **Replies**, **edits** and **deletes**
- **@user**, **@role**, **@everyone** and **@here** mentions with notifications
- `Inline code` and code blocks
- **File uploads** (up to 25 MB, 10 files per message) with a custom video player
- Automatic **link previews**
- **Direct messages**

### 😄 Emojis
- Full **standard emoji** picker with search
- Up to **50 static + 50 animated** custom emojis per server
- Type `:name:` anywhere, even right after text like `hi:wave:`

### 🎙️ Voice & Video
- **Voice channels** with WebRTC
- **Camera** and **screen sharing** (with audio)
- **Noise suppression** and **echo cancellation**
- Mic and camera test in settings

### 👤 Profiles & Social
- **Friends**, friend requests and **blocking**
- Display name, **About Me**, pronouns, **avatar** and **profile banner**
- Online, Idle, Do Not Disturb and Invisible **statuses**
- **Badges** such as Early Supporter, Bug Hunter and Staff
- **Spotify** integration that shows what you are listening to

### 🤖 Bots & Developers
- Create **applications**, each with its own **bot account**
- **REST API** plus **live events** over Socket.io
- **Slash commands** with typed options (text, number, yes/no, user, role, channel)
- **Rich embeds**, **ephemeral** replies and **deferred** ("thinking...") responses
- An **authorize page** to add bots to servers with chosen permissions
- Built-in **developer docs** at `/developers`

### 🌍 Languages
The interface is available in **Türkçe**, **English**, **Français** and **Deutsch**. The language is picked from the browser by default and can be changed under **Settings → Language** or on the login page.

---

## 🚀 Quick Start

### Requirements

| Tool | Version |
| :--- | :--- |
| [Node.js](https://nodejs.org/) | **18** or newer |
| npm | comes with Node.js |

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/l1devz/cydlone.git
cd cydlone
```

**2. Install dependencies**

```bash
npm install
```

**3. Start the server**

```bash
npm start
```

**4. Open your browser**

Go to **http://localhost:3000**, create an account and start chatting! 🎉

> [!TIP]
> During development, use `npm run dev`. The server restarts automatically whenever you change a file.

---

## ⚙️ Configuration

All settings live in **`config.json`** in the project root:

```json
{
  "port": 3000,
  "jwtSecret": "",
  "secureCookies": false,
  "spotify": {
    "clientId": "",
    "clientSecret": "",
    "redirectUri": ""
  }
}
```

| Key | Description | Default |
| :--- | :--- | :--- |
| `port` | Port the server listens on | `3000` |
| `jwtSecret` | Secret used to sign login sessions. If empty, a random one is generated on first start and stored in `database/` | *auto* |
| `secureCookies` | Set to `true` when serving over **HTTPS** | `false` |
| `spotify.clientId` | Client ID of your Spotify app | *empty* |
| `spotify.clientSecret` | Client Secret of your Spotify app | *empty* |
| `spotify.redirectUri` | Callback URL registered in Spotify | `<your-site>/connections/spotify/callback` |

> [!IMPORTANT]
> **Never commit real secrets.** If you fill in `jwtSecret` or your Spotify keys, keep that `config.json` out of public repositories.

### Environment variables

Every setting can also be overridden with an environment variable:

| Variable | Overrides |
| :--- | :--- |
| `PORT` | `port` |
| `JWT_SECRET` | `jwtSecret` |
| `NODE_ENV=production` | turns on `secureCookies` |
| `SPOTIFY_CLIENT_ID` | `spotify.clientId` |
| `SPOTIFY_CLIENT_SECRET` | `spotify.clientSecret` |
| `SPOTIFY_REDIRECT_URI` | `spotify.redirectUri` |

### 🎵 Setting up Spotify (optional)

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create an app with **Web API** enabled.
2. Under **Redirect URIs**, add:
   ```
   http://127.0.0.1:3000/connections/spotify/callback
   ```
   *(Spotify does not accept `localhost`, so use `127.0.0.1`.)*
3. Copy the **Client ID** and **Client Secret** into `config.json`.
4. Restart the server. Users can now connect Spotify under **Settings → Connections**.

> [!NOTE]
> While a Spotify app is in development mode, only accounts added under **User Management** in the dashboard can connect.

---

## 🤖 Building Bots

Cydlone has a Discord-like bot API. The full guide, with Python and Node.js examples, is built into the app at **`/developers`**.

### In short

1. Go to **Settings → Applications** and create an application. A bot account is created with it.
2. Copy the **bot token**. It is shown only once, so keep it safe!
3. Use the **invite link** on the application page to add the bot to your server.
4. Connect with the token:

**REST**

```http
POST /api/channels/{channelId}/messages
Authorization: Bot <token>
Content-Type: application/json

{ "content": "Hello world!" }
```

**Live events (Node.js)**

```js
const { io } = require('socket.io-client');

const socket = io('http://localhost:3000', { auth: { token: `Bot ${process.env.CYDLONE_TOKEN}` } });

socket.on('message:new', ({ message }) => {
  if (message.content === '!ping') {
    // reply with the REST API
  }
});
```

### Limits

| What | Limit |
| :--- | :--- |
| Applications per account | **10** |
| Slash commands per bot | **100** |
| Message length | **2000** characters |
| Embeds per message | **10** (6000 characters in total) |
| Response time for a command | **3 seconds** (use `defer` for longer work) |

> [!CAUTION]
> Anyone who has your bot token can act as your bot. Read it from an environment variable and **never** put it in your code.

---

## 🛠️ Admin Scripts

Some actions are only available from the command line, for the person running the server.

### 🏅 Badges

```bash
npm run badge -- list                       # list all badges
npm run badge -- show <username>            # show a user's badges
npm run badge -- give <username> <badge>    # give a badge
npm run badge -- take <username> <badge>    # take a badge away
```

Available badges: `staff`, `partner`, `moderator`, `events`, `bug_hunter`, `bug_hunter_gold`, `bot_dev`, `plus`, `early`.

### ✅ Verified servers

```bash
npm run server -- list                  # list all servers
npm run server -- verify <name|id>      # verify a server
npm run server -- unverify <name|id>    # remove verification
```

Verified servers get a ✔ badge and can set a custom **vanity invite link**.

---

## 📁 Project Structure

```
cydlone/
├── 📄 server.js            # Entry point: Express + Socket.io
├── ⚙️ config.json          # Your settings
├── 📂 src/                 # Backend
│   ├── auth.js             # Register, login, sessions
│   ├── servers.js          # Servers, channels, roles, bans
│   ├── messages.js         # Messages and replies
│   ├── realtime.js         # Socket.io events
│   ├── applications.js     # Bot applications and tokens
│   ├── interactions.js     # Slash commands
│   ├── permissions.js      # Permission system
│   ├── spotify.js          # Spotify integration
│   └── db.js               # JSON file database
├── 📂 public/              # Frontend
│   ├── app.html            # Main app
│   ├── developers.html     # Developer docs
│   ├── 📂 js/
│   │   ├── app.js          # App logic
│   │   ├── voice.js        # Voice, camera, screen share
│   │   ├── i18n.js         # Translation engine
│   │   └── 📂 locales/     # en.js, fr.js, de.js
│   └── 📂 css/
├── 📂 scripts/             # Admin command-line tools
├── 📂 database/            # Created on first start (git-ignored)
├── 📂 uploads/             # Avatars, banners, icons, emojis (git-ignored)
└── 📂 attachments/         # Message attachments (git-ignored)
```

---

## 🌐 Adding a Language

1. Copy `public/js/locales/en.js` to a new file, for example `es.js`.
2. Change the first line to `I18N.add('es', { ... })` and translate the values. **Don't change the keys** (the Turkish text on the left).
3. Add the language to the `LANGS` list in `public/js/i18n.js`:
   ```js
   es: { name: 'Español', locale: 'es-ES' },
   ```

That's it, the new language shows up in the language picker. 🎉

---

## 🤝 Contributing

Contributions are welcome!

1. **Fork** the repository
2. Create a branch: `git checkout -b my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push the branch: `git push origin my-feature`
5. Open a **Pull Request**

Found a bug or have an idea? [Open an issue](https://github.com/l1devz/cydlone/issues).

---

## 📜 License

Cydlone is released under the **[MIT License](LICENSE)**. You are free to use, modify and share it.

<div align="center">

---

Made with 💜 by **[l1devz](https://github.com/l1devz)**

⭐ **If you like Cydlone, give it a star!** ⭐

</div>
