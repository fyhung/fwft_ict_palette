import { Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { BoardSummary } from "../types";
import { useAppState } from "../state/AppState";

export function BoardSettingsDialog({ board, open, onClose, onDeleted }: {
  board: BoardSummary;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { updateBoard, deleteBoard } = useAppState();
  const [title, setTitle] = useState(board.title);
  const [description, setDescription] = useState(board.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setTitle(board.title); setDescription(board.description); }, [board]);
  if (!open) return null;

  async function save() {
    if (!title.trim()) return setError("Board title is required.");
    setBusy(true); setError("");
    try { await updateBoard(board.id, { title: title.trim(), description: description.trim() }); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the board."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm(`Delete “${board.title}” and all posts, comments and images? This cannot be undone.`)) return;
    setBusy(true); setError("");
    try { await deleteBoard(board.id); onDeleted(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete the board."); setBusy(false); }
  }

  return <div className="dialog-backdrop" onMouseDown={onClose}>
    <section className="dialog compact-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
      <div className="dialog-header"><div><span className="eyebrow">Board management</span><h2>Board settings</h2></div><button className="icon-button" onClick={onClose}><X /></button></div>
      <label className="field"><span>Board title</span><input maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="field"><span>Description</span><textarea maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="danger-zone"><button className="button button-danger" disabled={busy} onClick={() => void remove()}><Trash2 size={17} /> Delete board</button></div>
      <div className="dialog-actions"><button className="button button-ghost" disabled={busy} onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save changes"}</button></div>
    </section>
  </div>;
}
