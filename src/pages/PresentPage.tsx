import { ArrowLeft, Maximize2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Link, useParams } from "react-router-dom";
import { useAppState } from "../state/AppState";

export function PresentPage() {
  const { classId = "", boardId = "" } = useParams();
  const { classes, boards, posts } = useAppState();
  const board = boards.find((item) => item.id === boardId);
  const classroom = classes.find((item) => item.id === classId);
  const boardPosts = posts.filter((post) => post.boardId === boardId);
  const url = `${window.location.origin}${window.location.pathname}#/c/${classId}/b/${boardId}`;

  if (!board || !classroom) return null;

  return (
    <main className="present-page">
      <div className="present-nav">
        <Link to={`/c/${classId}/b/${boardId}`}><ArrowLeft /> Back to board</Link>
        <button className="icon-button light" aria-label="Enter full screen" onClick={() => void document.documentElement.requestFullscreen?.()}><Maximize2 /></button>
      </div>
      <section className="present-card">
        <div className="present-copy">
          <p className="present-class">{classroom.name}</p>
          <h1>{board.title}</h1>
          <p>{board.description}</p>
          <div className="present-status">
            <span className={board.allowPosting ? "is-open" : "is-closed"}>{board.allowPosting ? "Posting open" : "Posting closed"}</span>
            <span>{board.allowComments ? "Comments open" : "Comments closed"}</span>
          </div>
          <div className="present-stats">
            <div><strong>{boardPosts.length}</strong><span>posts</span></div>
            <div><strong>{new Set(boardPosts.map((post) => post.authorUid)).size}</strong><span>contributors</span></div>
            <div><strong>{boardPosts.reduce((total, post) => total + post.commentCount, 0)}</strong><span>comments</span></div>
          </div>
        </div>
        <div className="qr-panel">
          <div className="qr-frame"><QRCodeSVG value={url} size={270} bgColor="#ffffff" fgColor="#173b31" level="M" /></div>
          <strong>Scan to open the board</strong>
          <small>{url}</small>
        </div>
      </section>
    </main>
  );
}
