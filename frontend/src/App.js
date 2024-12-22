import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import LoadingScreen from './components/LoadingScreen';
import './App.css';
import TagThemeProvider from './components/ThemeProvider';

axios.defaults.withCredentials = true;

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#1a1b1e',
      paper: '#ffffff',
    },
    primary: {
      main: '#228be6',
    },
    text: {
      primary: '#24292f',
      secondary: '#57606a',
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          '&.repo-list-section, &.preview-section': {
            backgroundColor: '#ffffff',
          },
        },
      },
    },
  },
});

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await axios.get('/auth/user');
      setUser(response.data);
    } catch (err) {
      console.error('Not authenticated:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <TagThemeProvider>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <Router>
          <div className="app">
            <Routes>
              <Route path="/" element={
                user ? <Navigate to="/dashboard" replace /> : <Login />
              } />
              <Route path="/dashboard" element={
                user ? <Dashboard user={user} /> : <Navigate to="/" replace />
              } />
            </Routes>
          </div>
        </Router>
      </ThemeProvider>
    </TagThemeProvider>
  );
}

export default App; 