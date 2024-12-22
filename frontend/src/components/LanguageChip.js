import React from 'react';
import { Chip } from '@mui/material';

const languageColors = {
  javascript: '#f1e05a',
  typescript: '#2b7489',
  python: '#3572A5',
  java: '#b07219',
  go: '#00ADD8',
  rust: '#dea584',
  shell: '#89e051',
  html: '#e34c26',
  css: '#563d7c',
  // Add more language colors as needed
};

function LanguageChip({ language }) {
  const color = languageColors[language.toLowerCase()] || '#8f8f8f';
  
  return (
    <Chip
      size="small"
      label={language}
      className="language-chip"
      icon={
        <span 
          style={{ 
            width: 8, 
            height: 8, 
            borderRadius: '50%', 
            backgroundColor: color,
            marginLeft: 8
          }} 
        />
      }
    />
  );
}

export default LanguageChip; 