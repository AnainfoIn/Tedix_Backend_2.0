import { defaultTheme, RaThemeOptions } from 'react-admin';

/** White admin from the workspace designs: light grey page, white panels, one blue accent, Inter. */
export const C = {
  page: '#F6F7F9', panel: '#FFFFFF', line: '#E3E6EB', text: '#1A1D23', muted: '#5B6270', faint: '#9AA1AD',
  blue: '#1F5FD1', blueDark: '#174AA6', blueSoft: '#EAF1FD', chip: '#E8EBF0',
  warnLine: '#F3D2A6', warnBg: '#FFF8EF', warnText: '#8A4B00',
};

export const lightTheme: RaThemeOptions = {
  ...defaultTheme,
  palette: {
    mode: 'light',
    primary: { main: C.blue, dark: C.blueDark, light: C.blueSoft, contrastText: '#fff' },
    secondary: { main: C.blue },
    background: { default: C.page, paper: C.panel },
    text: { primary: C.text, secondary: C.muted },
    divider: C.line,
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    button: { textTransform: 'none', fontWeight: 600 },
    h1: { fontWeight: 700 }, h2: { fontWeight: 700 }, h3: { fontWeight: 700 }, h4: { fontWeight: 700 }, h5: { fontWeight: 700 }, h6: { fontWeight: 600 },
  },
  sidebar: { width: 230, closedWidth: 56 },
  components: {
    ...defaultTheme.components,
    MuiAppBar: { styleOverrides: { root: { backgroundColor: C.panel, color: C.text, boxShadow: 'none', borderBottom: `1px solid ${C.line}` } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard: { defaultProps: { variant: 'outlined' }, styleOverrides: { root: { borderColor: C.line, borderRadius: 12 } } },
    MuiButton: { defaultProps: { disableElevation: true } },
    RaLayout: { styleOverrides: { root: { minWidth: 0, '& .RaLayout-appFrame': { backgroundColor: C.page }, '& .RaLayout-contentWithSidebar, & .RaLayout-content': { minWidth: 0 } } } },
    RaSidebar: {
      styleOverrides: {
        root: {
          '& .RaSidebar-fixed': { backgroundColor: C.panel, borderRight: `1px solid ${C.line}` },
          '& .MuiPaper-root': { backgroundColor: C.panel },
        },
      },
    },
    RaMenuItemLink: {
      styleOverrides: {
        root: {
          borderRadius: 8, margin: '1px 10px', paddingTop: 7, paddingBottom: 7, fontSize: 14, color: C.text,
          '&.RaMenuItemLink-active': { backgroundColor: C.blueSoft, color: C.blueDark, fontWeight: 600, '& .MuiListItemIcon-root': { color: C.blueDark } },
        },
      },
    },
  } as RaThemeOptions['components'],
};
