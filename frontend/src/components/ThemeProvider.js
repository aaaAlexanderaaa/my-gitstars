import { useEffect } from 'react';
import { tagTheme } from '../config/theme';

function TagThemeProvider({ children }) {
  useEffect(() => {
    // Apply theme colors to CSS variables
    Object.entries(tagTheme).forEach(([category, config]) => {
      Object.entries(config.colors).forEach(([property, value]) => {
        const cssVarName = `--theme-${category}-${property}`;
        document.documentElement.style.setProperty(cssVarName, value);
      });
    });
  }, []);

  return children;
}

export default TagThemeProvider; 