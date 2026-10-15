// Pending join requests for the admin's organization, with Approve / Deny.
// Everything goes through the same Cloud Functions as the app's Manage
// Users screen (listOrgMembers, approveOrgMember, denyOrgMember): the rules
// only let people read their own profile, and the functions check that the
// caller owns the organization.
// TODO(follow-up): these functions are owner-only, so other Administrators
// see an explanation instead of the list (see gap 1 in firestore.rules).
import { httpsCallable } from 'firebase/functions';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { functions } from '../firebase';

type Pending = { uid: string; name: string; role: string; requestedAt: number | null };

const listOrgMembers = httpsCallable<{ orgId: string }, { pending: Pending[] }>(functions, 'listOrgMembers');
const approveOrgMember = httpsCallable(functions, 'approveOrgMember');
const denyOrgMember = httpsCallable(functions, 'denyOrgMember');

// The functions' own messages are written for people ("That request is no
// longer waiting…"), so they're shown as-is; anything else gets a generic one.
function messageFor(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (err.code === 'functions/permission-denied')
    return 'Only the person who created this organization can approve join requests.';
  if (err.code?.startsWith('functions/') && err.code !== 'functions/internal' && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}

export default function ApprovalsPage() {
  const orgId = useAuth().profile?.orgId ?? '';
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busyUid, setBusyUid] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setPending((await listOrgMembers({ orgId })).data.pending);
    } catch (e) {
      setError(messageFor(e));
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(person: Pending, approve: boolean) {
    setBusyUid(person.uid);
    setStatus('');
    setError('');
    try {
      await (approve ? approveOrgMember : denyOrgMember)({ orgId, memberUid: person.uid });
      setStatus(`${person.name} was ${approve ? 'approved' : 'declined'}.`);
      await load();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusyUid('');
    }
  }

  return (
    <>
      <h1>Join requests</h1>
      {/* Announced to screen readers after each approve/deny. */}
      <p role="status">{status}</p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {pending === null && !error && <p>Loading requests…</p>}
      {pending?.length === 0 && <p>No one is waiting for approval.</p>}
      {!!pending?.length && (
        <div className="table-scroll">
          <table>
            <caption className="visually-hidden">People waiting to join your organization</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Requested</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.uid}>
                  <td>{p.name}</td>
                  <td>{p.role}</td>
                  <td>{p.requestedAt ? new Date(p.requestedAt).toLocaleDateString() : '—'}</td>
                  <td className="actions">
                    <button
                      type="button"
                      disabled={!!busyUid}
                      onClick={() => decide(p, true)}
                      aria-label={`Approve ${p.name}`}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={!!busyUid}
                      onClick={() => decide(p, false)}
                      aria-label={`Deny ${p.name}`}
                    >
                      Deny
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
