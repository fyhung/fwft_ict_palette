import { ImagePlus, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { sections } from "../demoData";
import { useAppState } from "../state/AppState";

interface PostDialogProps {
  boardId: string;
  open: boolean;
  onClose: () => void;
}

export function PostDialog({ boardId, open, onClose }: PostDialogProps) {
  const { addPost } = useAppState();
  const [caption, setCaption] = useState("");
  const [sectionId, setSectionId] = useState(sections[0].id);
  const [preview, setPreview] = useState<string>();

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!caption.trim() || !preview) return;
    addPost({ boardId, sectionId, caption: caption.trim(), imageUrl: preview });
    setCaption("");
    setPreview(undefined);
    onClose();
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">New submission</p>
            <h2 id="post-dialog-title">Add a photo</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit}>
          <label className={`image-drop ${preview ? "has-preview" : ""}`}>
            {preview ? (
              <img src={preview} alt="Selected upload preview" />
            ) : (
              <>
                <span className="upload-icon"><ImagePlus size={26} /></span>
                <strong>Choose or take a photo</strong>
                <small>JPEG, PNG or WebP · up to 10 MB</small>
              </>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setPreview(URL.createObjectURL(file));
              }}
            />
          </label>
          <label className="field">
            <span>Caption</span>
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={500}
              placeholder="What force can we see here?"
              required
            />
            <small>{caption.length}/500</small>
          </label>
          <label className="field">
            <span>Section</span>
            <select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>{section.title}</option>
              ))}
            </select>
          </label>
          <div className="dialog-actions">
            <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
            <button className="button button-primary" type="submit">Post photo</button>
          </div>
        </form>
      </section>
    </div>
  );
}
