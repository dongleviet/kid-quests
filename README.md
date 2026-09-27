# Kids Quest 🌈

A small kid-friendly task and reward tracker built with plain HTML, CSS and JavaScript.

## Features

- Multiple kid profiles per parent
- Optional password per kid profile
- Kid dashboard
- Daily tasks
- Task completion → parent approval
- Points
- Reward shop
- Parent task management (per kid)
- Parent reward management (per kid)
- Parent point adjustment (per kid)
- Server persistence via `kids-quest-data.json` (GET on load, PUT/POST on save)
- `localStorage` fallback when the server can't write the file
- Responsive mobile/tablet/desktop UI

## Run locally

The app must be served over HTTP so it can fetch `kids-quest-data.json`:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## How data is stored

All data lives in `kids-quest-data.json`:

- On load, the app fetches the file (`GET kids-quest-data.json`).
- On every change, it saves the full state back with `PUT` (falls back to `POST`).
- `localStorage` is used as a cache/fallback if the server can't write the file.

**Note:** static hosts (GitHub Pages, `python -m http.server`) can serve the file but cannot accept PUT/POST writes. To have the server actually update `kids-quest-data.json`, serve the folder with a tiny write-capable endpoint, or edit the JSON file manually and reload the page.

## Parent mode

The default parent code is `1234` (stored in `kids-quest-data.json` under `parent.code`). Change it in **Parent HQ → Kids → Parent code**.

## Kid profiles

- Add/edit/delete kid profiles in **Parent HQ → Kids**.
- Each profile has a name, avatar emoji, and optional password.
- On the home screen, tapping a profile asks for its password if one is set (empty = open access).

## GitHub Pages

GitHub Pages is read-only for files, so quest progress will only persist in the browser's `localStorage` fallback there — the `kids-quest-data.json` file itself cannot be written by the browser.

1. Create a GitHub repository.
2. Upload all files.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select the `main` branch and `/ (root)`.
6. Save.

Your app will be available at:

`https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/`

## Shared data across devices (JSONBin)

To share quest data between devices while hosted on GitHub Pages, use a free remote JSON store:

1. Create an account at [jsonbin.io](https://jsonbin.io).
2. Create a bin and paste the contents of `kids-quest-data.json` into it.
3. In `app.js`, set:
   - `REMOTE_URL` = `https://api.jsonbin.io/v3/b/YOUR_BIN_ID`
   - `REMOTE_KEY` = your X-Master-Key (use an X-Access-Key with read/write on that bin for better security)
4. Commit and push.

The app will then load from and save to the remote bin. `kids-quest-data.json` and `localStorage` remain fallbacks.

**Note:** the key is visible in the public repo — anyone with it can read/write that bin. Fine for a family app; don't reuse a master key that protects other bins.

## Important limitation

The browser cannot write files on a static host. Without a remote store (above), each device keeps its own copy in `localStorage`.
