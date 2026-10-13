// Server-side "Login with CabalSpy ID" with nothing but node:http.
//
//   CSID_CLIENT_ID=csid_... CSID_CLIENT_SECRET=csid_sk_... node examples/login-server.mjs
//
// Register http://localhost:3000/callback as a redirect URI of your instance
// (https://apidashboard.cabalspy.xyz, tab "CabalSpy ID").
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { CabalSpyIDAuth, isLimited } from 'cabalspy-id';

const auth = new CabalSpyIDAuth({
  clientId: process.env.CSID_CLIENT_ID,
  clientSecret: process.env.CSID_CLIENT_SECRET,
  redirectUri: 'http://localhost:3000/callback',
});

// Demo storage. Use your session store (or a signed, http-only cookie) in production.
const pending = new Map(); // login id -> { state, nonce, codeVerifier }
const sessions = new Map(); // session id -> claims

const cookies = (req) => Object.fromEntries((req.headers.cookie ?? '').split(';').filter(Boolean).map((c) => c.trim().split('=')));
const page = (res, html) => res.writeHead(200, { 'Content-Type': 'text/html' }).end(html);

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000');
  try {
    if (url.pathname === '/login') {
      const login = await auth.createAuthorizationUrl({ scope: ['openid', 'profile', 'wallets'] });
      const id = randomBytes(16).toString('hex');
      pending.set(id, login);
      res.writeHead(302, { Location: login.url, 'Set-Cookie': `csid_login=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600` }).end();
      return;
    }
    if (url.pathname === '/callback') {
      const stored = pending.get(cookies(req).csid_login);
      pending.delete(cookies(req).csid_login);
      if (!stored) return page(res, 'Login expired, <a href="/login">try again</a>.');
      const { tokens, claims } = await auth.handleCallback(url, stored);
      // userinfo has the verified wallets (the ID token carries only the profile)
      const user = isLimited(claims) ? claims : await auth.userinfo(tokens.access_token);
      const sid = randomBytes(16).toString('hex');
      sessions.set(sid, user);
      res.writeHead(302, { Location: '/', 'Set-Cookie': `sid=${sid}; HttpOnly; SameSite=Lax; Path=/` }).end();
      return;
    }
    if (url.pathname === '/logout') {
      sessions.delete(cookies(req).sid);
      res.writeHead(302, { Location: '/', 'Set-Cookie': 'sid=; Max-Age=0; Path=/' }).end();
      return;
    }
    const user = sessions.get(cookies(req).sid);
    const button = `
      <div data-csid-login data-client-id="${auth.clientId}" data-href="/login"
           ${user ? `data-user="${user.sub}" data-logout-href="/logout"` : ''}></div>
      <script src="https://id.cabalspy.xyz/widget.js" async></script>`;
    if (!user) return page(res, `<h1>Demo</h1>${button}`);
    if (isLimited(user)) return page(res, `<h1>Signed in</h1><p>This platform is over its plan's user limit.</p>${button}`);
    page(res, `<h1>Hi @${user.preferred_username}</h1>${button}<pre>${JSON.stringify(user.wallets ?? [], null, 2)}</pre>`);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end(`${err.name}: ${err.message}`);
  }
}).listen(3000, () => console.log('http://localhost:3000'));
