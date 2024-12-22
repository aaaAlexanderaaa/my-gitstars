import React, { useState, useRef, useEffect } from 'react';
import { TextField, IconButton, ClickAwayListener, Paper } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import axios from 'axios';
import './CustomTagInput.css';
import { useTagSuggestions } from '../hooks/useTagSuggestions';
import TagSuggestions from './TagSuggestions';

function CustomTagInput({ repo, onTagsUpdated }) {
  const [isInputVisible, setInputVisible] = useState(false);
  const [newTag, setNewTag] = useState('');
  const { suggestions: tagSuggestions, updateSuggestions, fetchTagCounts } = useTagSuggestions();
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const [alignLeft, setAlignLeft] = useState(false);

  const checkPosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceOnRight = window.innerWidth - rect.right;
      setAlignLeft(spaceOnRight < 200); // 200px is min-width of input
    }
  };

  useEffect(() => {
    if (isInputVisible) {
      checkPosition();
      window.addEventListener('resize', checkPosition);
      return () => window.removeEventListener('resize', checkPosition);
    }
  }, [isInputVisible]);

  const handleAddClick = (e) => {
    e.stopPropagation();
    setInputVisible(true);
    fetchTagCounts();
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!newTag.trim()) {
      setInputVisible(false);
      return;
    }

    try {
      const response = await axios.post(`/api/repos/${repo.id}/tags`, {
        tags: newTag,
        action: 'add'
      }, { withCredentials: true });
      
      onTagsUpdated(response.data.tags);
      setNewTag('');
      setInputVisible(false);
    } catch (error) {
      console.error('Error adding tag:', error);
    }
  };

  const handleClickAway = () => {
    setInputVisible(false);
  };

  return (
    <div className="tag-input-container">
      {isInputVisible ? (
        <ClickAwayListener onClickAway={handleClickAway}>
          <div 
            className="tag-input-popup"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleSubmit}>
              <TextField
                ref={inputRef}
                size="small"
                value={newTag}
                onChange={(e) => {
                  e.stopPropagation();
                  setNewTag(e.target.value);
                  updateSuggestions(e.target.value);
                }}
                placeholder="Enter new tag..."
                autoFocus
                className="tag-input-field"
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Escape') setInputVisible(false);
                  if (e.key === 'Enter') handleSubmit(e);
                }}
                onClick={(e) => e.stopPropagation()}
                fullWidth
              />
              <TagSuggestions 
                suggestions={tagSuggestions}
                onSelect={(tag) => {
                  setNewTag(tag);
                  updateSuggestions(tag);
                  inputRef.current?.focus();
                }}
              />
            </form>
          </div>
        </ClickAwayListener>
      ) : (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            if (isInputVisible) {
              setInputVisible(false);
            } else {
              handleAddClick(e);
            }
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="add-tag-button"
        >
          <AddIcon fontSize="small" />
        </IconButton>
      )}
    </div>
  );
}

export default CustomTagInput; 