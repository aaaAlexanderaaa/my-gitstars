import React, { useState, useEffect } from 'react';
import {
  MenuItem,
  Chip,
  IconButton,
  Tooltip,
  Typography,
  Box,
  CircularProgress,
  Menu,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button
} from '@mui/material';
import { Refresh as RefreshIcon, Info as InfoIcon, Visibility as ViewIcon } from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import axios from 'axios';

const VersionSelector = ({ repo, onVersionChange }) => {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentlyUsedVersion, setCurrentlyUsedVersion] = useState(repo.currentlyUsedVersion || '');
  const [anchorEl, setAnchorEl] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newerReleases, setNewerReleases] = useState([]);
  const [loadingReleaseNotes, setLoadingReleaseNotes] = useState(false);
  const open = Boolean(anchorEl);

  useEffect(() => {
    if (repo.hasReleases) {
      fetchReleases();
    }
  }, [repo.id, repo.hasReleases]);

  const fetchReleases = async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`/api/releases/repo/${repo.id}`, {
        params: { refresh: forceRefresh }
      });
      setReleases(response.data.releases);
    } catch (err) {
      setError('Failed to fetch releases');
      console.error('Error fetching releases:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVersionChange = async (newVersion) => {
    setCurrentlyUsedVersion(newVersion);
    
    try {
      await axios.patch(`/api/releases/repo/${repo.id}/version`, {
        currentlyUsedVersion: newVersion || null
      });
      
      if (onVersionChange) {
        onVersionChange(repo.id, newVersion);
      }
    } catch (err) {
      console.error('Error updating version:', err);
      // Revert on error
      setCurrentlyUsedVersion(repo.currentlyUsedVersion || '');
    }
  };

  const getVersionLabel = (release) => {
    let label = release.tagName;
    if (release.name && release.name !== release.tagName) {
      label += ` (${release.name})`;
    }
    return label;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getDisplayText = () => {
    if (loading) return 'Loading...';
    if (repo.effectiveVersion) {
      return `Using: ${repo.effectiveVersion}`;
    }
    return 'Using: null';
  };

  const handleClick = (event) => {
    if (!repo.hasReleases && !loading) {
      // If no releases, try to fetch them first
      fetchReleases(true);
      return;
    }
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleMenuItemClick = (version) => {
    handleVersionChange(version);
    handleClose();
  };

  const handleViewUpdates = async () => {
    setLoadingReleaseNotes(true);
    try {
      const response = await axios.get(`/api/releases/repo/${repo.id}/newer-versions`);
      setNewerReleases(response.data.releases);
      setDialogOpen(true);
    } catch (error) {
      console.error('Error fetching release notes:', error);
    } finally {
      setLoadingReleaseNotes(false);
    }
  };

  // Don't render if repo has no releases
  if (!repo.hasReleases && !loading) {
    return null;
  }

  // Determine chip color based on update availability
  const getChipColor = () => {
    if (repo.updateAvailable) return "warning"; // Orange for updates available
    if (repo.effectiveVersion) return "primary"; // Blue for specific version
    return "default"; // Default for no version/latest
  };

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Chip
          size="small"
          label={getDisplayText()}
          onClick={handleClick}
          color={getChipColor()}
          variant="outlined"
          disabled={loading}
          icon={loading ? <CircularProgress size={12} /> : undefined}
          sx={{
            cursor: 'pointer',
            '&:hover': {
              backgroundColor: 'action.hover'
            },
            minWidth: '100px',
            fontSize: '0.75rem'
          }}
        />
        
        {repo.updateAvailable && (
          <Tooltip title="View release notes for newer versions">
            <IconButton
              size="small"
              onClick={handleViewUpdates}
              disabled={loadingReleaseNotes}
              sx={{ 
                color: 'warning.main',
                padding: '2px',
                '&:hover': {
                  backgroundColor: 'warning.light',
                  color: 'warning.dark'
                }
              }}
            >
              {loadingReleaseNotes ? (
                <CircularProgress size={14} color="warning" />
              ) : (
                <ViewIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: { minWidth: 250, maxWidth: 350 }
        }}
      >
        <MenuItem 
          onClick={() => handleMenuItemClick('')}
          selected={!currentlyUsedVersion}
          sx={{ minHeight: 48 }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <span style={{ fontWeight: 'bold' }}>Use Latest Version</span>
              <Tooltip title={`Always use the most recent version: ${repo.latestVersion || 'Unknown'}`}>
                <InfoIcon fontSize="small" color="action" />
              </Tooltip>
            </Box>
            {repo.latestVersion && (
              <Typography variant="caption" color="text.secondary">
                Currently: {repo.latestVersion}
              </Typography>
            )}
          </Box>
        </MenuItem>
        
        {releases.map((release) => (
          <MenuItem 
            key={release.id} 
            onClick={() => handleMenuItemClick(release.tagName)}
            selected={currentlyUsedVersion === release.tagName}
            sx={{ minHeight: 48 }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span style={{ fontWeight: currentlyUsedVersion === release.tagName ? 'bold' : 'normal' }}>
                  {getVersionLabel(release)}
                </span>
                {release.isPrerelease && (
                  <Chip 
                    label="Pre" 
                    size="small" 
                    color="warning" 
                    variant="outlined"
                    sx={{ height: 16, fontSize: '0.65em' }}
                  />
                )}
              </Box>
              {release.publishedAt && (
                <Typography variant="caption" color="text.secondary">
                  {formatDate(release.publishedAt)}
                </Typography>
              )}
            </Box>
          </MenuItem>
        ))}

        {releases.length > 0 && (
          <MenuItem disabled sx={{ justifyContent: 'center', minHeight: 40 }}>
            <Tooltip title="Refresh releases">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  fetchReleases(true);
                }}
                disabled={loading}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </MenuItem>
        )}
      </Menu>

      {error && (
        <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
          {error}
        </Typography>
      )}

      {/* Release Notes Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth={false}
        sx={{
          '& .MuiDialog-paper': {
            width: '50vw',
            height: '75vh',
            maxWidth: 'none',
            maxHeight: 'none'
          }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6">
              Release Notes - Updates Available
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Current: {repo.currentlyUsedVersion || 'None'}
            </Typography>
          </Box>
        </DialogTitle>
        
        <DialogContent dividers sx={{ padding: 0 }}>
          <Box sx={{ padding: 3, maxHeight: '100%', overflow: 'auto' }}>
            {newerReleases.length === 0 ? (
              <Typography variant="body1" color="text.secondary">
                No newer versions available or release notes not found.
              </Typography>
            ) : (
              newerReleases.map((release) => (
                <Box key={release.id} sx={{ marginBottom: 4 }}>
                  <Typography 
                    variant="h4" 
                    component="h1" 
                    sx={{ 
                      marginBottom: 2,
                      color: 'primary.main',
                      fontWeight: 'bold'
                    }}
                  >
                    # {release.tagName}
                  </Typography>
                  
                  {release.name && release.name !== release.tagName && (
                    <Typography 
                      variant="h6" 
                      sx={{ marginBottom: 1, color: 'text.secondary' }}
                    >
                      {release.name}
                    </Typography>
                  )}
                  
                  {release.publishedAt && (
                    <Typography 
                      variant="caption" 
                      sx={{ marginBottom: 2, display: 'block', color: 'text.secondary' }}
                    >
                      Released: {new Date(release.publishedAt).toLocaleDateString()}
                    </Typography>
                  )}
                  
                  <Box sx={{ 
                    '& p': { marginBottom: 1 },
                    '& h1, & h2, & h3, & h4, & h5, & h6': { 
                      marginTop: 2, 
                      marginBottom: 1,
                      color: 'text.primary'
                    },
                    '& code': {
                      backgroundColor: 'grey.100',
                      padding: '2px 4px',
                      borderRadius: 1,
                      fontSize: '0.875rem'
                    },
                    '& pre': {
                      backgroundColor: 'grey.100',
                      padding: 2,
                      borderRadius: 1,
                      overflow: 'auto'
                    },
                    '& ul, & ol': { paddingLeft: 3 },
                    '& li': { marginBottom: 0.5 }
                  }}>
                    <ReactMarkdown>
                      {release.body || 'No release notes available.'}
                    </ReactMarkdown>
                  </Box>
                </Box>
              ))
            )}
          </Box>
        </DialogContent>
        
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default VersionSelector; 