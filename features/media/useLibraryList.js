// @ts-check
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { getCurrentUserFacilityId } from '../../utils/musicLibraryQuery';
import { removeLibraryEntry } from './libraryService';

/** @typedef {import('./libraryService').LibraryEntry} LibraryEntry */

/**
 * Loads a staff library screen's entries on every focus (e.g. after backing
 * out of another screen), and runs the remove-with-confirmation flow.
 *
 * `facilityId` is undefined while loading, then the caregiver's own org id
 * or null (no org). New entries are stamped with it; entries whose
 * facilityId is "global" or another org are read-only, which
 * firestore.rules enforce server-side too.
 *
 * @param {object} options
 * @param {import('./libraryService').LibraryCollection} options.collectionName
 * @param {(facilityId: string | null) => Promise<LibraryEntry[]>} options.load
 * @param {string} options.logTag Prefix for console errors, e.g. '[MusicLibrary]'.
 * @param {string} options.loadErrorMessage
 */
export default function useLibraryList({ collectionName, load, logTag, loadErrorMessage }) {
  const [library, setLibrary] = useState(/** @type {LibraryEntry[]} */ ([]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [facilityId, setFacilityId] = useState(
    /** @type {string | null | undefined} */ (undefined)
  );
  const [confirmTarget, setConfirmTarget] = useState(/** @type {LibraryEntry | null} */ (null));
  const [removing, setRemoving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const currentFacilityId = await getCurrentUserFacilityId();
      setFacilityId(currentFacilityId);
      setLibrary(await load(currentFacilityId));
    } catch (e) {
      console.error(`${logTag} failed to load library:`, e.code, e.message, e);
      setError(loadErrorMessage);
    } finally {
      setLoading(false);
    }
  }, [load, logTag, loadErrorMessage]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function confirmRemove() {
    const target = confirmTarget;
    if (!target) return;
    setRemoving(true);
    try {
      await removeLibraryEntry(collectionName, target.id);
      setLibrary((prev) => prev.filter((e) => e.id !== target.id));
    } catch (e) {
      console.error(`${logTag} failed to remove entry:`, e.code, e.message, e);
      setError('Could not remove this entry. Please try again.');
    } finally {
      setConfirmTarget(null);
      setRemoving(false);
    }
  }

  // Lets search results and the pasted-link preview show "In library"
  // instead of Add. Saving re-checks with the server, since someone else may
  // have added the video since this list loaded.
  const videoIds = useMemo(() => new Set(library.map((entry) => entry.videoId)), [library]);
  const isInLibrary = useCallback((/** @type {string} */ videoId) => videoIds.has(videoId), [
    videoIds,
  ]);

  return {
    library,
    loading,
    error,
    facilityId,
    reload,
    isInLibrary,
    confirmTarget,
    setConfirmTarget,
    removing,
    confirmRemove,
  };
}
