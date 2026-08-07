import { X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppState } from "../state/AppState";

export function NewBoardDialog({
  classId,
  open,
  onClose,
}: {
  classId: string;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { createBoard } = useAppState();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      const boardId = await createBoard(classId, {
        title: title.trim(),
        description: description.trim(),
      });
      setTitle("");
      setDescription("");
      onClose();
      navigate(`/c/${classId}/b/${boardId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the board.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="new-board-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <div><p className="eyebrow">Lesson activity</p><h2 id="new-board-title">Create a board</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span>Board title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="Forces experiment" required autoFocus />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="What should students photograph and explain?" />
            <small>{description.length}/500</small>
          </label>
          <p className="muted-copy">The board starts with one section named <strong>Section 1</strong>. Posting and comments are open by default.</p>
          {error && <div className="probe-error" role="alert"><strong>Could not create board.</strong> {error}</div>}
          <div className="dialog-actions">
            <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Creating..." : "Create board"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
