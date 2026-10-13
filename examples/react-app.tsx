// Browser app (public client): the widget runs PKCE itself. Send the ID token to
// your backend and verify it there with CabalSpyIDAuth.verifyIdToken().
import { CabalSpyLogin, useCabalSpyID } from 'cabalspy-id/react';

const CLIENT_ID = 'csid_your_client_id';

export function Header() {
  const { user, limited } = useCabalSpyID({ clientId: CLIENT_ID });
  const handle = user && ('preferred_username' in user ? user.preferred_username : user.username);
  return (
    <header>
      <CabalSpyLogin
        clientId={CLIENT_ID}
        scope={['openid', 'profile', 'wallets']}
        theme="dark"
        shape="pill"
        onLogin={async ({ idToken }) => {
          await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          });
        }}
        onLogout={() => fetch('/api/session', { method: 'DELETE' })}
      />
      {user && !limited && <span>gm @{String(handle)}</span>}
    </header>
  );
}

// Backend (e.g. a Next.js route handler):
//
//   import { CabalSpyIDAuth } from 'cabalspy-id';
//   const auth = new CabalSpyIDAuth({ clientId: CLIENT_ID });
//
//   export async function POST(req: Request) {
//     const { idToken } = await req.json();
//     const claims = await auth.verifyIdToken(idToken); // throws TokenVerificationError
//     // claims.sub is the user's CabalSpy ID; claims.limited = over the plan's user limit
//     // ...create your session...
//   }
