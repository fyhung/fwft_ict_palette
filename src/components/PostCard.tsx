import { MessageCircle, Pencil } from "lucide-react";
import type { BoardPost, PostDisplayColumns, ThumbnailMode } from "../types";

export function PostCard({ post, displayColumns, thumbnailMode, onOpen, onEdit }: { post: BoardPost; displayColumns: PostDisplayColumns; thumbnailMode: ThumbnailMode; onOpen?: () => void; onEdit?: () => void }) {
  const resolvedThumbnailMode = thumbnailMode === "original" && post.imageUrl ? "original" : "crop";
  return (
    <article className={`post-card post-card-size-${displayColumns}`} tabIndex={0} role="button" onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen?.(); }}>
      <div className={`post-image post-image-${resolvedThumbnailMode} ${post.visual}`}>
        {post.imageUrl ? (
          <img src={post.imageUrl} alt={post.caption} />
        ) : (
          <span className="visual-label" aria-hidden="true" />
        )}
        {onEdit && <button className="post-card-edit" type="button" aria-label={`Edit ${post.caption}`} onClick={(event) => { event.stopPropagation(); onEdit(); }}><Pencil size={15} /> Edit</button>}
      </div>
      <div className="post-body">
        <p>{post.caption}</p>
        <div className="post-meta">
          <span className="avatar avatar-small">{post.authorInitials}</span>
          <span>
            <strong>{post.authorName}</strong>
            <small>{post.createdLabel}</small>
          </span>
          <span className="comment-count" aria-label={`${post.commentCount} comments`}>
            <MessageCircle size={15} /> {post.commentCount}
          </span>
        </div>
      </div>
    </article>
  );
}
