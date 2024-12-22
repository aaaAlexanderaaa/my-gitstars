import { useState, useEffect } from 'react';

function useInfiniteScroll(callback, deps = []) {
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    function handleScroll() {
      if (window.innerHeight + document.documentElement.scrollTop
        !== document.documentElement.offsetHeight) return;
      setIsFetching(true);
    }

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!isFetching) return;
    
    callback().finally(() => {
      setIsFetching(false);
    });
  }, [isFetching, callback]);

  return [isFetching, setIsFetching];
}

export default useInfiniteScroll; 