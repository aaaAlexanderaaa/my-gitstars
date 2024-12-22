import React from 'react';
import { List, ListItem, ListItemText, ListItemButton } from '@mui/material';
import './TagSuggestions.css';

function TagSuggestions({ suggestions, onSelect }) {
  if (!suggestions.length) return null;

  return (
    <List 
      className="tag-suggestions"
      onClick={(e) => e.stopPropagation()}
    >
      {suggestions.map(({ tag, count }) => (
        <ListItemButton
          key={tag} 
          onClick={(e) => {
            e.stopPropagation();
            onSelect(tag);
          }}
          className="suggestion-item"
        >
          <ListItemText 
            primary={tag}
            secondary={`${count} uses`}
            primaryTypographyProps={{ className: 'suggestion-text' }}
            secondaryTypographyProps={{ className: 'suggestion-count' }}
          />
        </ListItemButton>
      ))}
    </List>
  );
}

export default TagSuggestions; 