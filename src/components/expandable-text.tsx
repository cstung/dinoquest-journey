import { useEffect, useRef, useState } from "react";

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

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    setExpanded(false);
    const previous = el.style.webkitLineClamp;
    const previousDisplay = el.style.display;
    const previousOrient = el.style.webkitBoxOrient;
    const previousOverflow = el.style.overflow;
    el.style.display = "-webkit-box";
    el.style.webkitBoxOrient = "vertical";
    el.style.webkitLineClamp = String(maxLines);
    el.style.overflow = "hidden";
    setIsOverflowing(el.scrollHeight > el.clientHeight + 1);
    el.style.webkitLineClamp = previous;
    el.style.display = previousDisplay;
    el.style.webkitBoxOrient = previousOrient;
    el.style.overflow = previousOverflow;
  }, [text, maxLines]);

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
