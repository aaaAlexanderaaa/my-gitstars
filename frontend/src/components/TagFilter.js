import React, { useState } from 'react';
import {
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
  TextField,
  InputAdornment,
  Button
} from '@mui/material';
import {
  Search as SearchIcon,
  Language as LanguageIcon,
  Tag as TagIcon,
  Bookmark as BookmarkIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import './TagFilter.css';

function TagFilter({ repos, selectedTags, onTagSelect }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    customTags: false,
    languages: false,
    topics: false
  });

  const filterItems = (items) => {
    return items
      .filter(([name]) => 
        name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };

  // Get all unique tags with counts
  const getTagCounts = (type) => {
    const counts = new Map();
    // First, filter repos based on selected tags (except for the current type)
    const filteredRepos = repos.filter(repo => {
      return selectedTags.every(tag => {
        // Skip checking tags of current type to avoid affecting its own counts
        if ((type === 'languages' && repo.language === tag) ||
            (type === 'topics' && repo.topics?.includes(tag)) ||
            (type === 'customTags' && repo.customTags?.includes(tag))) {
          return true;
        }
        return repo.language === tag ||
               repo.topics?.includes(tag) ||
               repo.customTags?.includes(tag);
      });
    });

    filteredRepos.forEach(repo => {
      switch (type) {
        case 'languages':
          if (repo.language) {
            counts.set(repo.language, (counts.get(repo.language) || 0) + 1);
          }
          break;
        case 'topics':
          repo.topics?.forEach(topic => {
            counts.set(topic, (counts.get(topic) || 0) + 1);
          });
          break;
        case 'customTags':
          repo.customTags?.forEach(tag => {
            counts.set(tag, (counts.get(tag) || 0) + 1);
          });
          break;
      }
    });
    return Array.from(counts.entries());
  };

  const renderSection = (title, items, icon, sectionKey) => {
    const filteredItems = filterItems(items);
    const showExpand = !searchTerm && filteredItems.length > 10;
    const displayedItems = showExpand && !expandedSections[sectionKey] 
      ? filteredItems.slice(0, 10) 
      : filteredItems;

    return (
      <div className={`filter-section ${sectionKey}-section`}>
        <ListItem 
          className={`filter-section-header ${sectionKey}-header`}
        >
          <ListItemIcon>
            {icon}
          </ListItemIcon>
          <ListItemText 
            primary={
              <Typography 
                variant="subtitle2" 
                className={`${sectionKey}-text`}
              >
                {title}
              </Typography>
            } 
          />
        </ListItem>
        {displayedItems.map(([name, count]) => (
          <ListItem
            button
            key={name}
            selected={selectedTags.includes(name)}
            onClick={() => onTagSelect(name)}
            disabled={selectedTags.includes(name)}
            className="tag-item"
          >
            <ListItemIcon>
              {sectionKey === 'languages' ? <LanguageIcon fontSize="small" /> :
               sectionKey === 'topics' ? <TagIcon fontSize="small" /> :
               <BookmarkIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText 
              primary={
                <span className="tag-with-count">
                  <span>{name}</span>
                  <span className="count">{count}</span>
                </span>
              }
            />
          </ListItem>
        ))}
        {showExpand && (
          <Button
            className="expand-button"
            onClick={() => setExpandedSections(prev => ({
              ...prev,
              [sectionKey]: !prev[sectionKey]
            }))}
            startIcon={expandedSections[sectionKey] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          >
            {expandedSections[sectionKey] ? 'Show less' : 'Show more'}
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="tag-filter">
      <div className="search-box">
        <TextField
          size="small"
          fullWidth
          placeholder="Filter tags..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </div>
      <List>
        {/* Custom Tags Section */}
        {renderSection(
          'Custom Tags',
          getTagCounts('customTags'),
          <BookmarkIcon />,
          'customTags'
        )}
        
        {/* Languages Section */}
        {renderSection(
          'Languages',
          getTagCounts('languages'),
          <LanguageIcon />,
          'languages'
        )}
        
        {/* Topics Section */}
        {renderSection(
          'Topics',
          getTagCounts('topics'),
          <TagIcon />,
          'topics'
        )}
      </List>
    </div>
  );
}

export default TagFilter; 