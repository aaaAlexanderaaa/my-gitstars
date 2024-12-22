import React, { useState, useEffect } from 'react';
import { 
  List, 
  ListItem,
  Typography,
  Chip,
  CircularProgress,
  Box,
  Stack,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip
} from '@mui/material';
import { 
  Star, 
  Schedule, 
  Search as SearchIcon,
  SortByAlpha,
  StarOutline,
  AccessTime,
  Add,
  LocalOffer as TagIcon,
  ForkRight as GitFork
} from '@mui/icons-material';
import './RepoList.css';
import LanguageChip from './LanguageChip';
import CustomTagInput from './CustomTagInput';
import axios from 'axios';
import { useTagSuggestions } from '../hooks/useTagSuggestions';
import TagSuggestions from './TagSuggestions';

function RepoList({ 
  repos, 
  loading, 
  onRepoSelect, 
  selectedRepo, 
  selectedTags, 
  onRemoveTag, 
  onReposUpdate,
  onTagSelect 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date'); // 'date', 'stars', 'name'
  const [showBatchTagInput, setShowBatchTagInput] = useState(false);
  const [batchTag, setBatchTag] = useState('');
  const { suggestions: tagSuggestions, updateSuggestions, fetchTagCounts } = useTagSuggestions();

  const handleTagClick = (e, tag) => {
    e.stopPropagation(); // Prevent repo selection
    onTagSelect(tag); // Use the same handler as sidebar filters
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleDeleteTag = (repoId, tag) => {
    axios.post(`/api/repos/${repoId}/tags`, {
      tags: tag,
      action: 'delete'
    }, { withCredentials: true })
    .then(response => {
      if (response.data && response.data.tags) {
        const updatedRepos = repos.map(r => 
          r.id === repoId ? { ...r, customTags: response.data.tags, _noRefresh: true } : r
        );
        onReposUpdate(updatedRepos);
      }
    })
    .catch(error => {
      console.error('Failed to delete tag:', error);
    });
  };

  const handleBatchAddTags = async () => {
    if (!batchTag.trim()) {
      setShowBatchTagInput(false);
      return;
    }

    try {
      // Add the tag to all currently filtered repos
      for (const repo of filteredAndSortedRepos) {
        await axios.post(`/api/repos/${repo.id}/tags`, {
          tags: batchTag,
          action: 'add'
        }, { withCredentials: true });
      }

      // Refresh the repos list
      const updatedRepos = await axios.get('/api/repos', { withCredentials: true });
      onReposUpdate(updatedRepos.data.repos);
      
      setBatchTag('');
      setShowBatchTagInput(false);
    } catch (error) {
      console.error('Failed to add batch tags:', error);
    }
  };

  const filteredAndSortedRepos = repos
    .filter(repo => {
      // Search filter
      const searchMatch = 
        repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        repo.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Tags filter (AND logic)
      const tagsMatch = selectedTags.length === 0 || selectedTags.every(tag => {
        const tagLower = tag.toLowerCase();
        return (
          repo.language?.toLowerCase() === tagLower ||
          repo.topics?.includes(tagLower) ||
          repo.customTags?.includes(tagLower)
        );
      });

      return searchMatch && tagsMatch;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'stars':
          return b.stargazersCount - a.stargazersCount;
        case 'name':
          return a.name.localeCompare(b.name);
        case 'date':
        default:
          return new Date(b.starredAt) - new Date(a.starredAt);
      }
    });

  const handleItemClick = (repo, event) => {
    // Don't trigger repo selection if clicking on a link or tag
    if (event.target.tagName.toLowerCase() === 'a' || 
        event.target.closest('.MuiChip-root')) {
      return;
    }
    onRepoSelect(repo);
  };

  return (
    <div className="repo-list">
      <div className="repo-list-header">
        <div className="search-sort-container">
          <TextField
            size="small"
            placeholder="Search repositories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            className="repo-search"
          />
          <div className="sort-buttons">
            <Tooltip title="Sort by date">
              <IconButton 
                size="small" 
                onClick={() => setSortBy('date')}
                color={sortBy === 'date' ? 'primary' : 'default'}
              >
                <AccessTime fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Sort by stars">
              <IconButton 
                size="small" 
                onClick={() => setSortBy('stars')}
                color={sortBy === 'stars' ? 'primary' : 'default'}
              >
                <StarOutline fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Sort by name">
              <IconButton 
                size="small" 
                onClick={() => setSortBy('name')}
                color={sortBy === 'name' ? 'primary' : 'default'}
              >
                <SortByAlpha fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Batch add tags">
              <IconButton
                size="small"
                onClick={() => {
                  const newValue = !showBatchTagInput;
                  setShowBatchTagInput(newValue);
                  if (newValue) {
                    fetchTagCounts(); // Fetch latest counts when opening
                  }
                }}
                color={showBatchTagInput ? 'primary' : 'default'}
                className="sort-button"
              >
                <TagIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </div>
        </div>
        {showBatchTagInput && (
          <div className="batch-tag-input">
            <TextField
              size="small"
              value={batchTag}
              onChange={(e) => {
                setBatchTag(e.target.value);
                updateSuggestions(e.target.value);
              }}
              placeholder="Add tags to all filtered repos..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleBatchAddTags();
                if (e.key === 'Escape') setShowBatchTagInput(false);
              }}
              autoFocus
              fullWidth
            />
            <TagSuggestions 
              suggestions={tagSuggestions}
              onSelect={(tag) => {
                setBatchTag(tag);
                setSuggestions([]);  // Clear suggestions after selection
                handleBatchAddTags();
              }}
            />
          </div>
        )}
        {selectedTags.length > 0 && (
          <Box className="active-filters">
            {selectedTags.map(tag => {
              const filterType = repos.some(r => r.language === tag) ? 'language-filter' :
                                repos.some(r => r.topics?.includes(tag)) ? 'topic-filter' :
                                'custom-tag-filter';
              return (
                <Chip
                  key={tag}
                  label={tag}
                  onDelete={() => onRemoveTag(tag)}
                  size="small"
                  className={`filter-chip ${filterType}`}
                />
              );
            })}
          </Box>
        )}
      </div>

      <List className="repo-list-items">
        {filteredAndSortedRepos.map(repo => (
          <ListItem
            key={repo.id}
            onClick={(e) => handleItemClick(repo, e)}
            className={`repo-item ${selectedRepo?.id === repo.id ? 'selected' : ''}`}
          >
            <div className="repo-item-content">
              <div className="repo-header">
                <a 
                  href={`https://github.com/${repo.owner}/${repo.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="repo-title-link"
                >
                  {repo.owner}/{repo.name}
                </a>
                {repo.description && (
                  <Typography variant="body2" className="repo-description">
                    {repo.description}
                  </Typography>
                )}
              </div>
              
              <div className="tags-container">
                {repo.topics?.map(topic => (
                  <Chip
                    key={topic}
                    size="small"
                    label={topic}
                    className="topic-chip"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTagClick(e, topic);
                    }}
                  />
                ))}
                {repo.customTags?.map(tag => (
                  <Chip
                    key={tag}
                    size="small"
                    label={tag}
                    className="custom-tag-chip"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTagClick(e, tag);
                    }}
                    onDelete={(e) => {
                      e.stopPropagation();
                      handleDeleteTag(repo.id, tag);
                    }}
                  />
                ))}
                <CustomTagInput 
                  repo={repo}
                  onTagsUpdated={(newTags) => {
                    const updatedRepos = repos.map(r => 
                      r.id === repo.id ? { ...r, customTags: newTags, _noRefresh: true } : r
                    );
                    onReposUpdate(updatedRepos);
                  }}
                />
              </div>
              
              <div className="repo-footer">
                <div className="stats">
                  <Star sx={{ fontSize: '0.8rem' }} />
                  {repo.stargazersCount.toLocaleString()}
                  <GitFork sx={{ fontSize: '0.8rem' }} />
                  {repo.forksCount.toLocaleString()}
                </div>
                {repo.language && (
                  <Chip
                    size="small"
                    label={repo.language}
                    className="language-chip"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTagClick(e, repo.language);
                    }}
                  />
                )}
              </div>
            </div>
          </ListItem>
        ))}
      </List>
      {loading && (
        <div className="loading-more">
          <CircularProgress size={24} />
        </div>
      )}
    </div>
  );
}

export default RepoList; 