import {
  ArrowLeft,
  ArrowRight,
  ChevronsLeftRight,
  ChevronsUpDown,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface ViewerMediaItem {
  id: string;
  src: string;
  alt: string;
  label: string;
}

type MediaView = { mode: "width" | "height" | "zoom"; scale: number };

export function FullscreenMediaViewer({
  media,
  initialIndex,
  postTitle,
  postPosition,
  postCount,
  onClose,
  onPreviousPost,
  onNextPost,
}: {
  media: ViewerMediaItem[];
  initialIndex: number;
  postTitle: string;
  postPosition: number;
  postCount: number;
  onClose: () => void;
  onPreviousPost?: () => void;
  onNextPost?: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [view, setView] = useState<MediaView>({ mode: "width", scale: 1 });
  const scrollArea = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    setActiveIndex(Math.min(initialIndex, Math.max(0, media.length - 1)));
    setView({ mode: "width", scale: 1 });
    window.setTimeout(() => itemRefs.current[media[initialIndex]?.id]?.scrollIntoView({ block: "start" }), 0);
  }, [initialIndex, media]);

  useEffect(() => {
    const root = scrollArea.current;
    if (!root) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const next = media.findIndex((item) => item.id === visible.target.getAttribute("data-media-id"));
      if (next >= 0) setActiveIndex(next);
    }, { root, threshold: [0.35, 0.6, 0.85] });
    Object.values(itemRefs.current).forEach((item) => { if (item) observer.observe(item); });
    return () => observer.disconnect();
  }, [media]);

  useEffect(() => {
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && onPreviousPost) onPreviousPost();
      if (event.key === "ArrowRight" && onNextPost) onNextPost();
    };
    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  }, [onClose, onNextPost, onPreviousPost]);

  const imageStyle = useMemo(() => () => {
    if (view.mode === "height") return { height: "calc(100vh - 190px)", width: "auto", maxWidth: "none" };
    if (view.mode === "zoom") return { width: `${Math.round(view.scale * 100)}%`, height: "auto", maxWidth: "none" };
    return { width: "100%", height: "auto", maxWidth: "none" };
  }, [view]);

  return <div className="fullscreen-gallery" role="dialog" aria-modal="true" aria-label="Post photo gallery">
    <header className="fullscreen-gallery-toolbar">
      <div className="gallery-post-navigation">
        <button onClick={onPreviousPost} disabled={!onPreviousPost} aria-label="Previous post"><ArrowLeft /></button>
        <span><strong>{postTitle}</strong><small>Post {postPosition} of {postCount}</small></span>
        <button onClick={onNextPost} disabled={!onNextPost} aria-label="Next post"><ArrowRight /></button>
      </div>
      <div className="gallery-zoom-controls" aria-label="Image zoom controls">
        <span>{activeIndex + 1}/{media.length}</span>
        <button title="Zoom out all photos" onClick={() => setView({ mode: "zoom", scale: Math.max(.25, view.scale - .25) })}><ZoomOut /></button>
        <button title="Zoom in all photos" onClick={() => setView({ mode: "zoom", scale: Math.min(4, view.scale + .25) })}><ZoomIn /></button>
        <button title="Fit all photos to width" onClick={() => setView({ mode: "width", scale: 1 })}><ChevronsLeftRight /></button>
        <button title="Fit all photos to height" onClick={() => setView({ mode: "height", scale: 1 })}><ChevronsUpDown /></button>
        <button className="gallery-close" onClick={onClose} aria-label="Close gallery"><X /></button>
      </div>
    </header>
    <div className="fullscreen-media-scroll" ref={scrollArea}>
      {media.map((item, index) => <section
        className={`fullscreen-media-item ${index === activeIndex ? "is-active" : ""}`}
        data-media-id={item.id}
        key={item.id}
        ref={(element) => { itemRefs.current[item.id] = element; }}
        onClick={() => setActiveIndex(index)}
      >
        <div className="fullscreen-media-label"><span>{index + 1}</span><strong>{item.label}</strong></div>
        <div className="fullscreen-media-canvas"><img src={item.src} alt={item.alt} style={imageStyle()} /></div>
      </section>)}
    </div>
  </div>;
}
