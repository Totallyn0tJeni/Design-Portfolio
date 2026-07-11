import { useState, useRef, useEffect } from "react";

export default function LazyImage({ src, alt, className, aspectRatio, testid }) {
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { rootMargin: "200px" });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={`blur-load ${loaded ? "loaded" : ""} ${className || ""}`}
         style={{ aspectRatio: aspectRatio || "auto", backgroundColor: "#f3f4f6" }}
         data-testid={testid}>
      {visible && src && (
        <img src={src} alt={alt || ""} loading="lazy"
             className="w-full h-full object-cover"
             onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} />
      )}
    </div>
  );
}
