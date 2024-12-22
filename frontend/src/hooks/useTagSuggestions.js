import { useState } from 'react';
import axios from 'axios';

export function useTagSuggestions() {
  const [suggestions, setSuggestions] = useState([]);
  const [tagCounts, setTagCounts] = useState([]);

  const fetchTagCounts = async () => {
    try {
      const response = await axios.get('/api/tags/counts', { withCredentials: true });
      setTagCounts(response.data);
    } catch (error) {
      console.error('Failed to fetch tag counts:', error);
    }
  };

  const updateSuggestions = (input) => {
    if (!input.trim()) {
      setSuggestions([]);
      return;
    }
    
    const filtered = tagCounts
      .filter(({ tag }) => 
        tag.toLowerCase().includes(input.toLowerCase())
      )
      .slice(0, 5);
    
    setSuggestions(filtered);
  };

  return { suggestions, updateSuggestions, fetchTagCounts };
} 