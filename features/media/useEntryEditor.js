// @ts-check
import { useRef, useState } from 'react';

/** @typedef {import('./libraryService').EntryFields} EntryFields */

/**
 * The open add/edit form, kept as one object rather than a state variable
 * per field. `videoId` and `thumbnailUrl` identify the video being added;
 * `editingId` is the doc being edited (null in add mode).
 * @typedef {object} EntryForm
 * @property {'add' | 'edit'} mode
 * @property {string | null} editingId
 * @property {string} videoId
 * @property {string} thumbnailUrl
 * @property {EntryFields} fields
 */

/**
 * State for a library screen's add/edit modal. The screen supplies the
 * validation and the write; this owns visibility, the saving spinner, the
 * error line and the per-form add attempt (see AddAttempt in
 * libraryService.js).
 * @param {object} options
 * @param {string} options.logTag
 */
export default function useEntryEditor({ logTag }) {
  const [form, setForm] = useState(/** @type {EntryForm | null} */ (null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef({ sent: false });

  /**
   * @param {{ videoId: string, thumbnailUrl: string }} video
   * @param {EntryFields} fields
   */
  function openAdd(video, fields) {
    attempt.current = { sent: false };
    setError('');
    setForm({ mode: 'add', editingId: null, ...video, fields });
  }

  /**
   * @param {{ id: string, videoId: string, thumbnailUrl: string }} entry
   * @param {EntryFields} fields
   */
  function openEdit({ id, videoId, thumbnailUrl }, fields) {
    setError('');
    setForm({ mode: 'edit', editingId: id, videoId, thumbnailUrl, fields });
  }

  /** @param {Partial<EntryFields>} patch */
  function setFields(patch) {
    setForm((prev) => (prev ? { ...prev, fields: { ...prev.fields, ...patch } } : prev));
  }

  /**
   * Runs `save` with the spinner shown. `save` returns true to close the
   * form, or false after setting its own error (e.g. a duplicate).
   * @param {(form: EntryForm, attempt: import('./libraryService').AddAttempt) => Promise<boolean>} save
   */
  async function submit(save) {
    if (!form) return;
    setSaving(true);
    setError('');
    try {
      if (await save(form, attempt.current)) setForm(null);
    } catch (e) {
      console.error(`${logTag} failed to save entry:`, e.code, e.message, e);
      setError('Could not save this entry. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return {
    form,
    saving,
    error,
    setError,
    openAdd,
    openEdit,
    setFields,
    close: () => setForm(null),
    submit,
  };
}
