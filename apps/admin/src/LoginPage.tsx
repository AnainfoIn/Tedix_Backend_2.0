import { Alert, Box, Button, Card, CardContent, CircularProgress, TextField, Typography } from '@mui/material';
import { FormEvent, useState } from 'react';
import { useLogin } from 'react-admin';
import { apiFetch, Session } from './api';

type LoginResponse =
  | { data: { otpRequired: true; challengeToken: string } }
  | { data: { otpRequired: false } & Session };

/** Two-step sign-in: email + password, then the authenticator code when 2FA is on. */
export function LoginPage() {
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function finish(response: LoginResponse) {
    if (response.data.otpRequired) {
      setChallengeToken(response.data.challengeToken);
      return;
    }
    const { token, expiresAt, admin } = response.data;
    await login({ session: { token, expiresAt, admin } });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const response = challengeToken
        ? await apiFetch<LoginResponse>('/auth/verify-otp', {
            method: 'POST',
            body: JSON.stringify({ challengeToken, otp }),
          })
        : await apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      await finish(response);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sign-in failed';
      setError(message);
      if (challengeToken && /expired/i.test(message)) setChallengeToken(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'grey.100', px: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 380 }}>
        <CardContent component="form" onSubmit={submit} sx={{ display: 'grid', gap: 2, p: 3 }}>
          <Typography variant="h5" component="h1">
            Tedix Admin
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {challengeToken ? (
            <>
              <Typography variant="body2" color="text.secondary">
                Enter the 6-digit code from your authenticator app.
              </Typography>
              <TextField
                label="Authentication code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputProps={{ inputMode: 'numeric', autoComplete: 'one-time-code' }}
                autoFocus
                required
              />
              <Button onClick={() => { setChallengeToken(null); setOtp(''); }} disabled={busy}>
                Back
              </Button>
            </>
          ) : (
            <>
              <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required />
              <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </>
          )}
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? <CircularProgress size={22} /> : challengeToken ? 'Verify' : 'Sign in'}
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
