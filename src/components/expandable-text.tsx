import { useCallback, useEffect, useRef, useState } from "react";

type ExpandableTextProps = {
  text: string;
  maxLines: number;
  className?: string;
  buttonClassName?: string;
};

export function ExpandableText({
  text,
  maxLines,
  className,
  buttonClassName,
}: ExpandableTextProps) {
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const measureOverflow = useCallback(() => {
    const el = textRef.current;
    if (!el) return;

    const previous = el.style.webkitLineClamp;
    const previousDisplay = el.style.display;
    const previousOrient = el.style.webkitBoxOrient;
    const previousOverflow = el.style.overflow;
    const previousOverflowWrap = el.style.overflowWrap;
    const previousWordBreak = el.style.wordBreak;

    el.style.display = "-webkit-box";
    el.style.webkitBoxOrient = "vertical";
    el.style.webkitLineClamp = String(maxLines);
    el.style.overflow = "hidden";
    el.style.overflowWrap = "anywhere";
    el.style.wordBreak = "break-word";

    const isVerticalOverflow = el.scrollHeight > el.clientHeight + 1;
    const isHorizontalOverflow = el.scrollWidth > el.clientWidth + 1;
    setIsOverflowing(isVerticalOverflow || isHorizontalOverflow);

    el.style.webkitLineClamp = previous;
    el.style.display = previousDisplay;
    el.style.webkitBoxOrient = previousOrient;
    el.style.overflow = previousOverflow;
    el.style.overflowWrap = previousOverflowWrap;
    el.style.wordBreak = previousWordBreak;
  }, [maxLines]);

  useEffect(() => {
    setExpanded(false);
  }, [text, maxLines]);

  useEffect(() => {
    measureOverflow();
    const el = textRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      measureOverflow();
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, [measureOverflow, text, maxLines]);

  return (
    <div>
      <p
        ref={textRef}
        className={className}
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: String(maxLines),
                overflow: "hidden",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }
        }
      >
        {text}
      </p>
      {isOverflowing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={buttonClassName ?? "mt-1 text-xs font-bold text-primary hover:underline"}
        >
          {expanded ? "Read less" : "Read more"}
        </button>
      )}
    </div>
  );
}
