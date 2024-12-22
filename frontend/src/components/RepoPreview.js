import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { CircularProgress } from '@mui/material';
import './RepoPreview.css';

function RepoPreview({ repo, readme, loading }) {
  if (!repo) {
    return <div className="empty">Select a repository to view details</div>;
  }

  if (loading) {
    return (
      <div className="preview-section">
        <div className="loading">
          <CircularProgress size={24} />
        </div>
      </div>
    );
  }

  // Helper function to convert relative image URLs to absolute GitHub URLs
  const getAbsoluteImageUrl = (src) => {
    // If the URL is already absolute, return it as-is
    if (src.startsWith('http://') || src.startsWith('https://')) {
      return src;
    }

    // Remove leading slash if present
    const cleanPath = src.startsWith('/') ? src.slice(1) : src;

    // Use the repo's defaultBranch or fall back to 'main'
    const branch = repo.defaultBranch || 'main';
    console.log('Using branch:', branch, 'for repo:', repo.name); // Debug log
    return `https://github.com/${repo.owner}/${repo.name}/raw/${branch}/${cleanPath}`;
  };

  return (
    <div className="preview-section">
      <article className="preview-content">
        <ReactMarkdown
          children={readme}
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            img: ({node, src, ...props}) => {
              const absoluteSrc = getAbsoluteImageUrl(src);
              return (
                <img 
                  {...props} 
                  src={absoluteSrc} 
                  loading="lazy"
                  style={{ maxWidth: '100%' }}
                />
              );
            },
            a: ({node, children, href, ...props}) => {
              // Also handle relative URLs in links
              const absoluteHref = href?.startsWith('/') || href?.startsWith('./') 
                ? `https://github.com/${repo.owner}/${repo.name}/blob/${repo.defaultBranch || 'main'}/${href.replace(/^[./]+/, '')}`
                : href;
              return (
                <a 
                  {...props} 
                  href={absoluteHref} 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              );
            },
          }}
        />
      </article>
    </div>
  );
}

export default RepoPreview; 