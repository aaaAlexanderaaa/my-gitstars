import { useState, useCallback } from 'react';
import axios from 'axios';

export const useReleases = () => {
  const [releasesCache, setReleasesCache] = useState(new Map());
  const [loadingStates, setLoadingStates] = useState(new Map());

  const fetchReleases = useCallback(async (repoId, forceRefresh = false) => {
    const cacheKey = repoId.toString();
    
    // Return cached data if available and not forcing refresh
    if (!forceRefresh && releasesCache.has(cacheKey)) {
      return releasesCache.get(cacheKey);
    }

    setLoadingStates(prev => new Map(prev).set(cacheKey, true));

    try {
      const response = await axios.get(`/api/releases/repo/${repoId}`, {
        params: { refresh: forceRefresh }
      });

      const releases = response.data.releases;
      setReleasesCache(prev => new Map(prev).set(cacheKey, releases));
      
      return releases;
    } catch (error) {
      console.error('Error fetching releases:', error);
      throw error;
    } finally {
      setLoadingStates(prev => {
        const newState = new Map(prev);
        newState.delete(cacheKey);
        return newState;
      });
    }
  }, [releasesCache]);

  const updateCurrentlyUsedVersion = useCallback(async (repoId, currentlyUsedVersion) => {
    try {
      const response = await axios.patch(`/api/releases/repo/${repoId}/version`, {
        currentlyUsedVersion: currentlyUsedVersion || null
      });

      return response.data.repo;
    } catch (error) {
      console.error('Error updating currently used version:', error);
      throw error;
    }
  }, []);

  const bulkFetchReleases = useCallback(async (limit = 20, repoIds = null) => {
    try {
              const response = await axios.post('/api/releases/bulk-fetch', { limit, repoIds });
      return response.data.results;
    } catch (error) {
      console.error('Error in bulk release fetch:', error);
      throw error;
    }
  }, []);

  const getCachedReleases = useCallback((repoId) => {
    return releasesCache.get(repoId.toString()) || null;
  }, [releasesCache]);

  const isLoading = useCallback((repoId) => {
    return loadingStates.get(repoId.toString()) || false;
  }, [loadingStates]);

  const clearCache = useCallback((repoId = null) => {
    if (repoId) {
      setReleasesCache(prev => {
        const newCache = new Map(prev);
        newCache.delete(repoId.toString());
        return newCache;
      });
    } else {
      setReleasesCache(new Map());
    }
  }, []);

  return {
    fetchReleases,
    updateCurrentlyUsedVersion,
    bulkFetchReleases,
    getCachedReleases,
    isLoading,
    clearCache
  };
}; 