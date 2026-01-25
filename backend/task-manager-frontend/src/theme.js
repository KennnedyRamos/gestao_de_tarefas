import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#d06a3a',
      contrastText: '#ffffff'
    },
    secondary: {
      main: '#2f6b8f'
    },
    background: {
      default: '#f4efe8',
      paper: '#ffffff'
    },
    text: {
      primary: '#2a241f',
      secondary: '#6f675f'
    },
    divider: '#e3d9cd'
  },
  typography: {
    fontFamily: "'Sora', 'Space Grotesk', sans-serif",
    h5: {
      fontFamily: "'Space Grotesk', sans-serif",
      fontWeight: 600
    },
    h6: {
      fontFamily: "'Space Grotesk', sans-serif",
      fontWeight: 600
    },
    subtitle1: {
      fontFamily: "'Space Grotesk', sans-serif",
      fontWeight: 600
    },
    button: {
      textTransform: 'none',
      fontWeight: 600
    }
  },
  shape: {
    borderRadius: 14
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: 'linear-gradient(140deg, var(--bg-top) 0%, var(--bg-bottom) 100%)',
          color: 'var(--ink)'
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: 'none'
        },
        contained: {
          boxShadow: 'none'
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16
        }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12
        },
        notchedOutline: {
          borderColor: '#e3d9cd'
        }
      }
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          borderRadius: 999
        }
      }
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600
        }
      }
    }
  }
});

export default theme;
