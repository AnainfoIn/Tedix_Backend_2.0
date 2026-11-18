import { Card, CardContent, Grid, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Title } from 'react-admin';
import { apiFetch } from './api';
import { refreshProfile } from './authProvider';

interface Summary {
  adminUsers: number;
  roles: number;
  appAccounts: number;
}

export function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshProfile().catch(() => undefined);
    apiFetch<{ data: Summary }>('/dashboard')
      .then((r) => setSummary(r.data))
      .catch((e: Error) => setError(e.message));
  }, []);

  const tiles: [string, number | undefined][] = [
    ['App accounts', summary?.appAccounts],
    ['Admin users', summary?.adminUsers],
    ['Roles', summary?.roles],
  ];

  return (
    <>
      <Title title="Dashboard" />
      <Grid container spacing={2} sx={{ mt: 1 }}>
        {tiles.map(([label, value]) => (
          <Grid key={label} size={{ xs: 12, sm: 4 }}>
            <Card>
              <CardContent>
                <Typography color="text.secondary">{label}</Typography>
                <Typography variant="h4">{value ?? (error ? '–' : '…')}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      {error && (
        <Typography color="error" sx={{ mt: 2 }}>
          {error}
        </Typography>
      )}
    </>
  );
}
