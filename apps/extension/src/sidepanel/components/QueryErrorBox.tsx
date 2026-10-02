import type { SqlValidation } from '@x3i/shared';
import { ApiError, errorMessage } from '../../lib/companionClient';
import { Message } from './ui';

/** Readable error for a failed /query or /record call (rejected SQL lists the validator reasons). */
export function QueryErrorBox({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.code === 'sql-rejected') {
    const v = error.details as SqlValidation | undefined;
    return (
      <Message kind="error">
        Query rejected (read-only mode): {error.message}
        {v?.errors?.length ? (
          <ul>
            {v.errors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        ) : null}
      </Message>
    );
  }
  if (error instanceof ApiError && error.code === 'query-disabled') {
    return <Message kind="warn">Query execution is disabled for this environment (offline metadata only). {error.message}</Message>;
  }
  return <Message kind="error">{errorMessage(error)}</Message>;
}
