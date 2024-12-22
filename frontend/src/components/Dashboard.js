import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  AppBar, 
  Toolbar, 
  Typography, 
  Avatar, 
  IconButton,
  Box,
  Menu,
  MenuItem,
  Tooltip,
  Divider,
  Button
} from '@mui/material';
import { Sync as SyncIcon, Logout as LogoutIcon, GitHub as GitHubIcon, Settings as SettingsIcon } from '@mui/icons-material';
import RepoList from './RepoList';
import TagFilter from './TagFilter';
import RepoPreview from './RepoPreview';
import './Dashboard.css';

function Dashboard({ user }) {
  const [repos, setRepos] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [readme, setReadme] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);

  useEffect(() => {
    console.log('Fetching repos with tags:', selectedTags);
    fetchRepos();
  }, [selectedTags]);

  const fetchRepos = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedTags.length > 0) {
        params.append('tags', selectedTags.join(','));
      }
      
      const response = await axios.get(
        `/api/repos?${params}`,
        { withCredentials: true }
      );
      
      console.log('Received repos:', response.data);
      const reposData = response.data.repos || [];
      const followedRepos = reposData.filter(repo => repo.isFollowed !== false);
      console.log('Filtered followed repos:', followedRepos);
      setRepos(followedRepos);
      
      // Extract unique languages and topics
      const uniqueLanguages = [...new Set(followedRepos.map(repo => repo.language).filter(Boolean))];
      const uniqueTopics = [...new Set(followedRepos.flatMap(repo => repo.topics || []))];
      
      setLanguages(uniqueLanguages);
      setTopics(uniqueTopics);
      setError(null);
    } catch (err) {
      console.error('Error fetching repos:', err);
      setError('Failed to fetch repositories');
    } finally {
      setLoading(false);
    }
  };

  const handleTagSelect = (tag) => {
    setSelectedTags(prev => {
      if (prev.includes(tag)) {
        return prev.filter(t => t !== tag);
      }
      return [...prev, tag];
    });
  };

  const handleRemoveTag = (tag) => {
    setSelectedTags(prev => prev.filter(t => t !== tag));
  };

  const handleSync = async () => {
    try {
      await axios.post(
        '/api/sync',
        {},
        { withCredentials: true }
      );
      fetchRepos();
    } catch (err) {
      setError('Failed to sync with GitHub');
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(
        '/auth/logout',
        {},
        { withCredentials: true }
      );
      window.location.href = '/';
    } catch (err) {
      console.error('Failed to logout:', err);
    }
  };

  const handleRepoSelect = async (repo) => {
    if (selectedRepo?.id === repo.id || repo._noRefresh) {
      if (repo._noRefresh) {
        setSelectedRepo(prev => ({
          ...prev,
          customTags: repo.customTags,
          _preserveReadme: true
        }));
      }
      return;
    }

    try {
      setLoading(true);
      
      // First get the repo details
      const repoDetailsResponse = await axios.get(
        `/api/repos/${repo.owner}/${repo.name}`,
        { withCredentials: true }
      );
      
      // Set the complete repo data including defaultBranch
      setSelectedRepo({ 
        ...repo, 
        defaultBranch: repoDetailsResponse.data.defaultBranch || 'main'
      });

      // Only get README if not preserving
      if (!repo._preserveReadme) {
        const readmeResponse = await axios.get(
          `/api/repos/${repo.owner}/${repo.name}/readme`,
          { withCredentials: true }
        );
        setReadme(readmeResponse.data);
      }
    } catch (err) {
      console.error('Failed to load repo details or README:', err);
      if (!repo._preserveReadme) {
        setReadme('No README found');
      }
      setSelectedRepo({ ...repo, defaultBranch: 'main' });
    } finally {
      setLoading(false);
    }
  };

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  return (
    <div className="dashboard">
      <AppBar position="static" elevation={1} className="app-bar">
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <GitHubIcon sx={{ fontSize: 28, color: '#ffffff' }} />
            <Typography variant="h6" component="div" sx={{ color: '#ffffff' }}>
              GitStars
            </Typography>
          </Box>

          <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center' }}>
            <Button 
              color="inherit" 
              startIcon={<SyncIcon />}
              onClick={handleSync}
              className="sync-button"
            >
              Sync Repositories
            </Button>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Tooltip title="Account settings">
              <IconButton 
                onClick={handleMenuOpen}
                size="small"
                sx={{ padding: 0.5 }}
              >
                <Avatar 
                  src={user.avatarUrl} 
                  alt={user.username}
                  sx={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.2)' }}
                />
              </IconButton>
            </Tooltip>

            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              PaperProps={{
                sx: { minWidth: 200 }
              }}
            >
              <MenuItem sx={{ pointerEvents: 'none' }}>
                <Typography variant="body2" color="textSecondary">
                  Signed in as <strong>{user.username}</strong>
                </Typography>
              </MenuItem>
              <Divider />
              <MenuItem onClick={handleLogout}>
                <LogoutIcon fontSize="small" sx={{ mr: 2 }} />
                Sign out
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {error && (
        <Typography color="error" sx={{ p: 2 }}>
          {error}
        </Typography>
      )}

      <div className="dashboard-content">
        <div className="sidebar">
          <TagFilter
            languages={languages}
            topics={topics}
            selectedTags={selectedTags}
            onTagSelect={handleTagSelect}
            repos={repos}
          />
        </div>

        <div className="repo-list-section">
          <RepoList
            repos={repos}
            loading={loading}
            onRepoSelect={handleRepoSelect}
            selectedRepo={selectedRepo}
            selectedTags={selectedTags}
            onRemoveTag={handleRemoveTag}
            onReposUpdate={setRepos}
            onTagSelect={handleTagSelect}
          />
        </div>

        <div className="preview-section">
          <RepoPreview repo={selectedRepo} readme={readme} loading={loading} />
        </div>
      </div>
    </div>
  );
}

export default Dashboard; 