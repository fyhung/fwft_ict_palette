import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import type { Classroom } from "../types";
import { useAppState } from "../state/AppState";

export function DeleteClassDialog({
  classroom,
  onClose,
}: {
  classroom: Classroom | null;
  onClose: () => void;
}) {
  const { deleteClass } = useAppState();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();

  if (!classroom) return null;

  const remove = async () => {
    setDeleting(true);
    setError(undefined);
    try {
      await deleteClass(classroom.id);
      onClose();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "DELETE_FAILED";
      setError(message === "CLASS_NOT_EMPTY"
        ? "This class contains boards and cannot be permanently deleted from this cleanup tool."
        : message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-class-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <div><p className="eyebrow danger-eyebrow"><AlertTriangle size={16} /> Permanent action</p><h2 id="delete-class-title">Delete empty class?</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
        </div>
        <p><strong>{classroom.name}</strong> has {classroom.boardCount} boards and {classroom.postCount} posts.</p>
        <p className="muted-copy">This removes the class document and all teacher membership records. It cannot be undone.</p>
        <code className="class-id-code">Class ID: {classroom.id}</code>
        {error && <div className="probe-error" role="alert"><strong>Could not delete class.</strong> {error}</div>}
        <div className="dialog-actions">
          <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-danger" type="button" disabled={deleting || classroom.boardCount > 0} onClick={() => void remove()}>
            {deleting ? "Deleting..." : "Delete empty class"}
          </button>
        </div>
      </section>
    </div>
  );
}
